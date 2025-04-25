#!/usr/bin/env python
# coding: utf-8

from io import BytesIO
import os
import sys
import asyncio

import requests
import re
from typing import Union, Dict, Any, Tuple, List, Optional
from itertools import islice
from collections import defaultdict
from pathlib import Path
import datetime

import numpy as np
import pandas as pd
from opensearchpy import OpenSearch
from opensearchpy.helpers import bulk
import aiohttp
from bs4 import BeautifulSoup
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch

import src.aws_utils as aws
import src.opensearch as op

from constants import (
    OPENSEARCH_SEC,
    OPENSEARCH_HOST,
    REGION_NAME,
    EMBEDDING_MODEL,
    EMBEDDING_DIM,
)

session = aws.session

# these will be environment variables
DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S") # to be replaced with environment var
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"

secrets = aws.get_secret(secret_name=OPENSEARCH_SEC,region_name=REGION_NAME)
opensearch_host = aws.get_parameter_ssm(
    parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME
)
# Connect to OpenSearch
auth = (secrets['username'], secrets['passwords'])

client = OpenSearch(
    hosts=[{'host': opensearch_host, 'port': 443}],
    http_compress=True,
    http_auth=auth,
    use_ssl=True,
    verify_certs=True
)

info = client.info()
print(f"Welcome to {info['version']['distribution']} {info['version']['number']}!")
print(op.list_indexes(client))


# Get and print all index names with sizes
indexes = client.cat.indices(format="json")
print("Indexes and Sizes:")
for index in indexes:
    print(f"- {index['index']}: {index['store.size']}")


# Set up the embedding model via LangChain (example using BedrockEmbeddings)
bedrock_client = session.client("bedrock-runtime", region_name=REGION_NAME)
embedder = BedrockEmbeddings(client=bedrock_client, model_id=EMBEDDING_MODEL)


def load_html_data_from_excel() -> dict:
  usecols = ["Year", "Document Title", "Document URL", "CSAS Event"]
  html_df = pd.read_excel(
      Path("..", "CSASDocuments.xlsx"), sheet_name="CSAS HTML URLs", usecols=usecols, dtype=str
  )

  # Trim whitespace from all string entries in the DataFrame
  html_df = html_df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

  html_subset = (
      html_df.drop_duplicates(subset="Document URL")
      .replace("", np.nan)
      .dropna()
  )

  # Convert the subset to dict
  html_dict_subset = html_subset.to_dict(orient="index")
  return html_dict_subset


def get_html_event_to_html_documents(html_dict_subset):
  # Get the mapping from events to document
  html_event_to_html_documents = {}
  for key, value in html_dict_subset.items():
      value = value.copy()  # Create a copy of the dictionary to avoid modifying the original
      event = value['CSAS Event']
      # del value['CSAS Event']
      if event not in html_event_to_html_documents:
          html_event_to_html_documents[event] = []
      html_event_to_html_documents[event].append(value)
  return html_event_to_html_documents


# # ## Ingest All Docs with CSAS Events
async def download_html(url: str, error_dump: List[dict]) -> Optional[Tuple[str, BeautifulSoup]]:
    """
    Asynchronously downloads HTML from a given URL and parses it with BeautifulSoup.
    """
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url) as response:
                status = response.status  # Get HTTP status
                html_content = await response.text()

                if status == 404 or "error 404" in html_content.lower() or "page not found" in html_content.lower():
                    error_dump.append({
                        "error": f"Page not found (HTTP {status})",
                        "file": url
                    })
                    return url, None

                doc = BeautifulSoup(html_content, "html.parser")
                return url, doc

        except aiohttp.ClientError as e:
            error_dump.append({
                "error": f"Client error: {str(e)}",
                "file": url
            })
            return url, None
        except Exception as e:
            error_dump.append({
                "error": f"Unexpected error: {str(e)}",
                "file": url
            })
            return url, None


def extract_document_info(page: BeautifulSoup) -> Dict[str, Optional[str]]:
    """
    Extracts key information from the document page:
      - The main text from the third <section> element.
      - The document download URL from an <a> tag with class 'gc-dwnld-lnk'.
      - The document title from the <title> tag.
      - The language of the document using multiple approaches.

    Language detection approaches:
      1. Check the 'lang' attribute on the <html> tag.
      2. Look for meta tags (e.g., meta[name="dcterms.language"]).
      3. Optionally, use a language detection library to analyze the main text.

    Args:
        page (BeautifulSoup): The parsed HTML page.

    Returns:
        A dictionary with the following keys:
          - "main_text": The extracted main text.
          - "download_url": The document download URL (if found).
          - "title": The document title.
          - "language": The detected language (or languages) as a string.
    """
    # --- Extract Main Text ---
    sections = page.find_all("section")
    if len(sections) < 3:
        raise ValueError("Not enough <section> elements found in the page to extract main text.")

    main_text = sections[2].get_text()
    # Replace multiple spaces with a newline for better readability.
    
    main_text = re.sub(r'(\s\s)+', '\n', main_text)
    # Remove the Accessibility Notice text (case-insensitive)
    main_text = re.sub(r'((Accessibility Notice)|(Avis d’accessibilité))\s.*', '', main_text, flags=re.IGNORECASE)
    # Replace non-breaking spaces with a regular space.
    main_text = main_text.replace(u'\xa0', u' ')

    # --- Extract Download URL ---
    download_link = page.find("a", class_="gc-dwnld-lnk")
    download_url = download_link.get("href") if download_link else None

    # --- Extract Document Title ---
    title_tag = page.find("title")
    title = title_tag.get_text().strip() if title_tag else ""

    # Title should also not have multiple consecutive "  "
    title = re.sub(r'\s\s+', ' ', title)

    # --- Identify Language of the Document ---
    language = None

    # Approach 1: Check the 'lang' attribute of the <html> tag.
    html_tag = page.find("html")
    lang_attr = html_tag.get("lang") if html_tag and html_tag.has_attr("lang") else None

    # Approach 2: Look for a meta tag that might indicate the language.
    meta_lang = None
    meta_tag = page.find("meta", attrs={"name": "dcterms.language"})
    if meta_tag and meta_tag.get("content"):
        meta_lang = meta_tag.get("content")

    # Approach 3: Optionally use a language detection library if no language is found yet.
    detected_lang = None
    if not lang_attr and not meta_lang:
        try:
            from langdetect import detect
            detected_lang = detect(main_text)
        except Exception:
            detected_lang = None

    # Choose the best available language information.
    language = meta_lang or lang_attr or detected_lang

    # For languauge instead of 'eng' and 'fra'
    # Need to spell out fully
    if language == 'eng':
        language = 'English'
    elif language == 'fra':
        language = 'French'

    return {
        "main_text": main_text,
        "download_url": download_url,
        "title": title,
        "language": language
    }

def extract_doc_type(html_page_title):
    if html_page_title.startswith("Research Document") or html_page_title.startswith("Document de recherche"):
        return "Research Document"
    elif html_page_title.startswith("Proceedings") or html_page_title.startswith("Compte rendu"):
        return "Proceedings"
    elif html_page_title.startswith("Terms of Reference") or html_page_title.startswith("Cadre de référence"):
        return "Terms of Reference"
    elif html_page_title.startswith("Science Advisory Report") or html_page_title.startswith("Avis scientifique"):
        return "Science Advisory Report"
    elif html_page_title.startswith("Science Response") or html_page_title.startswith("Réponse des Sciences"):
        return "Advice"

    return None

def extract_document_year_from_title(html_page_title):
    # Extract the year from the title
    year_match = re.search(r'\b(\d{4})\b', html_page_title)
    if year_match:
        return year_match.group(1)
    else:
        return None

def extract_doc_information(html_docs, pages):
    docs = []
    unloaded_docs = []
    metadata_extraction_incompletes = []
    mismatched_years = []

    for doc, p in zip(html_docs, pages):
        url, page = p
        if page is None:
            metadata = html_url_to_content[url]
            unloaded_docs.append(metadata)
            continue

        metadata = {}
        metadata['csas_event'] = doc['CSAS Event']
        metadata['csas_html_year'] = doc['Year']
        metadata['csas_html_title'] = doc['Document Title']
        metadata['html_url'] = doc['Document URL']

        info = extract_document_info(page)
        txt = info['main_text']
        metadata['pdf_url'] = info['download_url']
        metadata['html_language'] = info['language']
        metadata['html_page_title'] = info['title']
        metadata['html_year'] = extract_document_year_from_title(info['title'])
        metadata['html_doc_type'] = extract_doc_type(info['title'])

        doc = Document(page_content=txt, metadata=metadata)

        docs.append(doc)

        # Extraction failure (download url failure or langugue failure)
        if (metadata['html_doc_type'] == None or 
            (metadata['pdf_url'] == None and metadata['html_doc_type'] != "Terms of Reference") or 
            metadata['html_language'] == None):
            metadata_extraction_incompletes.append(metadata)

        # Print mismatch year
        if metadata['html_doc_type'] != "Terms of Reference" and (metadata['csas_html_year'] != metadata['html_year']):
            # print(metadata)
            mismatched_years.append(metadata)

    return docs, unloaded_docs, metadata_extraction_incompletes, mismatched_years


# Function to compute embeddings synchronously for each document's page_content,
# while catching and logging errors and tracking metadata of failed documents.
def get_embeddings_for_documents(documents: list[Document], embedder, failed_embeddings_metadata) -> tuple:
    valid_docs = []
    valid_embeddings = []

    for doc in documents:
        try:
            embedding = embedder.embed_query(doc.page_content)
            valid_docs.append(doc)
            valid_embeddings.append(embedding)
        except Exception as e:
            doc_url = doc.metadata.get("html_url", "N/A")
            print(f"Embedding failed for document {doc_url}: {e}")
            failed_embeddings_metadata.append(doc.metadata)

    return valid_docs, np.array(valid_embeddings)


# Process and ingest HTML documents with error handling for embedding failures.
def process_and_ingest_html_documents(client: OpenSearch, index_name: str, documents: list[Document], embedder, failed_embeddings_metadata) -> int:
    # Compute embeddings for the documents, obtaining only the valid ones.
    valid_docs, html_embeddings = get_embeddings_for_documents(documents, embedder, failed_embeddings_metadata)

    if not valid_docs:
        # print("No documents to ingest after embedding failures.")
        return 0

    # Bulk insert the documents and embeddings into OpenSearch.
    # op.bulk_insert_html_documents(client, index_name=index_name, documents=valid_docs, vectors=html_embeddings.tolist())

    return len(valid_docs)


def is_valid_document(doc):
    """
    Validates a document based on the following criteria:
    
    1. Must have an 'html_doc_type' field.
    2. If missing a 'pdf_url', then the document's type must be 'Terms of Reference'.
    3. Must have an 'html_language' field.
    4. If the document appears to be non-English/French (e.g., if 'html_url' contains "inu" 
       or 'csas_html_title' contains "Inukititut"), then the 'language' field must be 'inuktitut'.
    """
    # Ensure the document has the required fields.
    if "html_doc_type" not in doc:
        return False

    # The document should have a 'pdf_url' unless it's a 'Terms of Reference'.
    if "pdf_url" not in doc and doc.get("html_doc_type") != "Terms of Reference":
        return False

    # The document must have an 'html_language' field.
    if "html_language" not in doc:
        return False

    # Check for non-English/French documents based on heuristics in URL or title.
    html_url = doc.get("html_url", "").lower()
    csas_title = doc.get("csas_html_title", "").lower()
    if "inu" in html_url or "inukititut" in csas_title:
        if doc.get("language", "").lower() != "inuktitut":
            return False

    return True


def existing_document_is_valid(doc, client, index, enable_override):
    """
    Checks if the document already exists in the specified OpenSearch index
    and, if so, verifies that the stored document meets the validity criteria.
    
    If enable_override is True, the function will bypass these checks and return False,
    indicating that the document should be processed regardless of its existing state.
    
    Returns:
      True  - if the document exists and is valid.
      False - if the document does not exist, is invalid, or override is enabled.
    """
    if enable_override:
        # With override enabled, we want to process the document regardless.
        return False

    doc_id = doc["Document URL"]

    # Check if the document exists in the index.
    if not client.exists(index=index, id=doc_id):
        return False

    # Fetch the existing document.
    existing = client.get(index=index, id=doc_id)
    # Assume the stored document is under '_source'.
    existing_doc = existing.get("_source", {})

    # Validate the stored document.
    return is_valid_document(existing_doc)

async def process_html_docs(html_docs, enable_override=False):
    """
    Process a list of HTML documents by filtering (unless override is enabled), downloading,
    extracting information, and ingesting into the index.

    Parameters:
        html_docs (list): A list of HTML document dictionaries.
        enable_override (bool): If True, all documents are processed even if they already exist.

    Returns:
        dict: Processing statistics and error logs.
    """
    docs_to_process = []
    docs_already_processed = 0
    error_dump = []
    
    # Filter documents (unless override is enabled)
    for doc in html_docs:
        if existing_document_is_valid(doc, client, DFO_HTML_FULL_INDEX_NAME, enable_override):
            docs_already_processed += 1
        else:
            docs_to_process.append(doc)

    # If there are no new documents to process, return early.
    if not docs_to_process:
        return {
            "ingested_count": 0,
            "docs_failed": 0,
            "docs_already_processed": docs_already_processed,
            "error_dump": error_dump,
            "failed_html_pages": [],
            "failed_embeddings_metadata": [],
            "extraction_incompletes": [],
            "mismatched_years": []
        }
    
    # Download HTML pages concurrently.
    urls = [doc["Document URL"] for doc in docs_to_process]
    pages = await asyncio.gather(*(download_html(u, error_dump) for u in urls))
    
    # Extract document information from the downloaded HTML.
    docs, unloaded_docs, extraction_incompletes, mismatched_years = extract_doc_information(docs_to_process, pages)
    failed_html_pages = list(unloaded_docs)
    
    # Process and ingest the documents (only those with successful embeddings).
    failed_embeddings_metadata = []
    ingested_count = process_and_ingest_html_documents(client, DFO_HTML_FULL_INDEX_NAME, docs, embedder, failed_embeddings_metadata)
    
    # Count failures: extraction failures plus those that failed embedding.
    docs_failed = len(unloaded_docs) + (len(docs) - ingested_count)
    
    return {
        "ingested_count": ingested_count,
        "docs_failed": docs_failed,
        "docs_already_processed": docs_already_processed,
        "error_dump": error_dump,
        "failed_html_pages": failed_html_pages,
        "failed_embeddings_metadata": failed_embeddings_metadata,
        "extraction_incompletes": extraction_incompletes,
        "mismatched_years": mismatched_years
    }

async def process_events(html_event_to_html_documents, enable_override=False):
    """
    Process a dictionary of CSAS events where each event has a list of associated HTML documents.
    This function aggregates processing statistics from all events.

    Parameters:
        html_event_to_html_documents (dict): Mapping of events to lists of HTML document dictionaries.
        enable_override (bool): If True, processes all documents regardless of prior existence.

    Returns:
        dict: A summary of overall processing statistics.
    """
    total_events = len(html_event_to_html_documents)
    overall_stats = {
        "total_events": total_events,
        "total_docs_processed": 0,
        "total_docs_failed": 0,
        "total_docs_already_processed": 0,
        "error_dump": [],
        "failed_html_pages": [],
        "failed_embeddings_metadata": [],
        "extraction_incompletes": [],
        "mismatched_years": []
    }

    for i, (csas_event, html_docs) in enumerate(html_event_to_html_documents.items(), start=1):
        print(f"{i}/{total_events} Processing CSAS Event: {csas_event}")

        # Process the HTML documents for the current event.
        stats = await process_html_docs(html_docs, enable_override=enable_override)

        overall_stats["total_docs_processed"] += stats["ingested_count"]
        overall_stats["total_docs_failed"] += stats["docs_failed"]
        overall_stats["total_docs_already_processed"] += stats["docs_already_processed"]
        overall_stats["error_dump"].extend(stats["error_dump"])
        overall_stats["failed_html_pages"].extend(stats["failed_html_pages"])
        overall_stats["failed_embeddings_metadata"].extend(stats["failed_embeddings_metadata"])
        overall_stats["extraction_incompletes"].extend(stats["extraction_incompletes"])
        overall_stats["mismatched_years"].extend(stats["mismatched_years"])

    return overall_stats


async def main():
    
    # Get the url to content
    html_dict_subset = load_html_data_from_excel() # a df of pdf files
    html_url_to_content = {}
    for key, value in html_dict_subset.items():
        html_url_to_content[value['Document URL']] = value

    html_event_to_html_documents = get_html_event_to_html_documents(html_dict_subset)

    overall_stats = await process_events(html_event_to_html_documents, enable_override=False)

    total_events = overall_stats['total_events']
    ingested_count = overall_stats['total_docs_processed']
    docs_failed = overall_stats['total_docs_failed']
    docs_already_processed = overall_stats['total_docs_already_processed']
    error_dump = overall_stats['error_dump']
    failed_html_pages = overall_stats['failed_html_pages']
    failed_embeddings_metadata = overall_stats['failed_embeddings_metadata']
    extraction_incompletes = overall_stats['extraction_incompletes']
    mismatched_years = overall_stats['mismatched_years']


    # Print processing results
    print("Documents successfully processed:", ingested_count, 
            f" - {ingested_count}/{ingested_count + docs_failed}")
    print("Documents failed to be processed:", docs_failed)
    print("Documents already processed:", docs_already_processed)
    print("Documents that failed embedding:", len(failed_embeddings_metadata))

    # Export to csv/excel
    df = pd.DataFrame(error_dump)
    df.to_csv("ingestion_docs/html_fail_error_dump_docs.csv")

    # Export to csv/excel
    df = pd.DataFrame(failed_html_pages)
    df.to_csv("ingestion_docs/html_fail_docs.csv")

    # Export to csv/excel
    df = pd.DataFrame(failed_embeddings_metadata)
    df.to_csv("ingestion_docs/too_long_docs.csv")
    
if __name__ == "__main__":
    asyncio.run(main())