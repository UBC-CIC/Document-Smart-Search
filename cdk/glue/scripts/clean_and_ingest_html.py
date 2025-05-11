#!/usr/bin/env python
# coding: utf-8

from io import BytesIO
import os
import sys
import asyncio
import re
from typing import Union, Dict, Any, Tuple, List, Optional
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import boto3
from opensearchpy import OpenSearch
from opensearchpy.helpers import bulk
import aiohttp
from bs4 import BeautifulSoup
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
# from awsglue.utils import getResolvedOptions
import src.aws_utils as aws
import src.opensearch as op

# Constants
# Index Names
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"

# Get job parameters
# args = getResolvedOptions(sys.argv, [
#     'JOB_NAME',
#     'html_urls_path',
#     'batch_id',
#     'region_name',
#     'embedding_model',
#     'opensearch_secret',
#     'opensearch_host'
# ])

# mock args dictionary
args = {
    'JOB_NAME': 'clean_and_ingest_html',
    'html_urls_path': 's3://dfo-test-datapipeline/batches/2025-05-07/html_data/CSASDocuments.xlsx',
    'bucket_name': 'dfo-test-datapipeline',
    'batch_id': '2025-05-07',
    'region_name': 'us-west-2',
    'embedding_model': 'amazon.titan-embed-text-v2:0',
    'opensearch_secret': 'opensearch-masteruser-test-glue',
    'opensearch_host': 'opensearch-host-test-glue'
}

# Paths
HTML_URLS_PATH = args['html_urls_path']
BATCH_ID = args['batch_id']
BUCKET_NAME = args['bucket_name']
# AWS Configuration
REGION_NAME = args['region_name']
EMBEDDING_MODEL = args['embedding_model']

# OpenSearch Configuration
OPENSEARCH_SEC = args['opensearch_secret']
OPENSEARCH_HOST = args['opensearch_host']

# Runtime Variables
CURRENT_DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")

session = aws.session

secrets = aws.get_secret(secret_name=OPENSEARCH_SEC,region_name=REGION_NAME)
opensearch_host = aws.get_parameter_ssm(
    parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME
)
# Connect to OpenSearch
auth = (secrets['username'], secrets['password'])

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


def load_html_data_from_s3(s3_path: str, sheet_name: str = 0) -> pd.DataFrame:
    """
    Load HTML data from an Excel file in S3.
    
    Args:
        s3_path: S3 path to the Excel file (e.g., 's3://bucket/path/to/file.xlsx')
        sheet_name: Name or index of the sheet to read (default: 0, which is the first sheet)
        
    Returns:
        df: DataFrame containing the HTML data
    """
    s3 = session.client('s3')
    bucket, key = s3_path.replace('s3://', '').split('/', 1)
    
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        excel_data = response['Body'].read()
        df = pd.read_excel(BytesIO(excel_data), sheet_name=sheet_name)
        return df
    except Exception as e:
        print(f"Error loading HTML data from S3: {e}")
        raise


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
      - The subject from the first h2 header within the main content section.
      - The authors from the h3 tag that follows the subject h2.

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
          - "subject": The subject from the first h2 header in main content.
          - "cleaned_authors": List of author names.
    """
    # --- Extract Main Text ---
    sections = page.find_all("section")
    if len(sections) < 3:
        raise ValueError("Not enough <section> elements found in the page to extract main text.")

    main_text = sections[2].get_text()
    # Replace multiple spaces with a newline for better readability.
    
    main_text = re.sub(r'(\s\s)+', '\n', main_text)
    # Remove the Accessibility Notice text (case-insensitive)
    main_text = re.sub(r'((Accessibility Notice)|(Avis d\'accessibilité))\s.*', '', main_text, flags=re.IGNORECASE)
    # Replace non-breaking spaces with a regular space.
    main_text = main_text.replace(u'\xa0', u' ')

    # --- Extract Subject and Authors ---
    main_content = page.find('main', {'property': 'mainContentOfPage'})
    subject = None
    authors = []
    if main_content:
        # Find the section after BEGIN MAIN CONTENT comment
        main_section = None
        for comment in main_content.find_all(string=lambda text: isinstance(text, str) and "BEGIN MAIN CONTENT" in text):
            main_section = comment.find_next('section')
            if main_section:
                break
        
        if main_section:
            # Extract subject
            first_h2 = main_section.find('h2')
            if first_h2:
                # Remove em tags and get plain text
                for em in first_h2.find_all('em'):
                    em.replace_with(em.get_text())
                subject = first_h2.get_text().strip()
                # Clean up the subject text
                subject = re.sub(r'\s\s+', ' ', subject)
                subject = subject.replace(u'\xa0', u' ')
            
            # Extract authors
            cleaned_authors = []
            authors_h3 = main_section.find('h3')
            if authors_h3 and authors_h3.get_text().strip().startswith('By'):
                # Get the text and remove 'By' prefix
                authors_text = authors_h3.get_text().strip()[3:].strip()
                # Replace &nbsp; with space and clean up
                authors_text = authors_text.replace(u'\xa0', u' ')
                # Split by comma and clean up each author name
                authors = []
                for author in authors_text.split(','):
                    author = author.strip()
                    # Remove 'and' from the beginning of the last author
                    if author.startswith('and '):
                        author = author[4:]
                    authors.append(author)
                # Remove any empty strings
                authors = [author for author in authors if author]
                # Note: The cleaning process above splits names into pairs (e.g., "John Doe" becomes ["John", "Doe"])
                # Therefore, the list will always have an even length, with each author's first and last name as separate elements
                # Thus 4 unique authors will produce a list of 8 elements
                # Now, we need to recombine every two elements into one name
                cleaned_authors = []
                for i in range(0, len(authors), 2):
                    if i + 1 < len(authors):
                        cleaned_authors.append(f"{authors[i]}, {authors[i+1]}")
                    else:
                        cleaned_authors.append(authors[i])
                

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
        "language": language,
        "subject": subject,
        "authors": cleaned_authors
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
        return "Science Response"
    elif html_page_title.startswith("Other Publication") or html_page_title.startswith("Autre publication"):
        return "Other Publication"

    return "Unknown"

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
def process_and_ingest_html_documents(
    client: OpenSearch, index_name: str, documents: list[Document], embedder, failed_embeddings_metadata, dryrun
) -> int:
    # Compute embeddings for the documents, obtaining only the valid ones.
    valid_docs, html_embeddings = get_embeddings_for_documents(documents, embedder, failed_embeddings_metadata)

    if not valid_docs:
        # print("No documents to ingest after embedding failures.")
        return 0

    # Bulk insert the documents and embeddings into OpenSearch.
    if not dryrun:
        op.bulk_insert_html_documents(client, index_name=index_name, documents=valid_docs, vectors=html_embeddings.tolist())

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

async def process_html_docs(html_docs, enable_override=False, dryrun=False):
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
    urls = []
    for doc in docs_to_process:
        # Exclude documents with URLs ending in -inu-eng.html or -inu-fra.html
        if doc["Document URL"].endswith("-inu-eng.html") or doc["Document URL"].endswith("-inu-fra.html"):
            continue
        # Only include English documents
        urls.append(doc["Document URL"])
    pages = await asyncio.gather(*(download_html(u, error_dump) for u in urls))
    
    # Extract document information from the downloaded HTML.
    docs, unloaded_docs, extraction_incompletes, mismatched_years = extract_doc_information(docs_to_process, pages)
    failed_html_pages = list(unloaded_docs)
    
    # Process and ingest the documents (only those with successful embeddings).
    failed_embeddings_metadata = []
    ingested_count = process_and_ingest_html_documents(client, DFO_HTML_FULL_INDEX_NAME, docs, embedder, failed_embeddings_metadata, dryrun=dryrun)
    
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

async def process_events(html_event_to_html_documents, enable_override=False, dryrun=False):
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
        stats = await process_html_docs(
            html_docs, 
            enable_override=enable_override,
            dryrun=dryrun
        )

        overall_stats["total_docs_processed"] += stats["ingested_count"]
        overall_stats["total_docs_failed"] += stats["docs_failed"]
        overall_stats["total_docs_already_processed"] += stats["docs_already_processed"]
        overall_stats["error_dump"].extend(stats["error_dump"])
        overall_stats["failed_html_pages"].extend(stats["failed_html_pages"])
        overall_stats["failed_embeddings_metadata"].extend(stats["failed_embeddings_metadata"])
        overall_stats["extraction_incompletes"].extend(stats["extraction_incompletes"])
        overall_stats["mismatched_years"].extend(stats["mismatched_years"])

    return overall_stats


def upload_to_s3(bucket: str, key: str, df: pd.DataFrame):
    """Upload a DataFrame as CSV to S3."""
    s3 = session.client('s3')
    csv_buffer = BytesIO()
    df.to_csv(csv_buffer, index=False)
    s3.put_object(Bucket=bucket, Key=key, Body=csv_buffer.getvalue())
    
html_url_to_content = {} # not sure why this is needed
async def main(dryrun=False):
    # Load HTML data from S3
    html_data = load_html_data_from_s3(HTML_URLS_PATH, sheet_name="CSAS HTML URLs")
    # TODO: Remove this once when ready to ingest all data
    html_data = html_data.query("`Year` == 2017.0")
    html_data = html_data.to_dict(orient='index')
    
    # Get the url to content
    for _, value in html_data.items():
        html_url_to_content[value['Document URL']] = value
        
    html_event_to_html_documents = get_html_event_to_html_documents(html_data)
    
    # Process events
    overall_stats = await process_events(html_event_to_html_documents, enable_override=False, dryrun=dryrun)

    # Print processing results
    print("Documents successfully processed:", overall_stats["total_docs_processed"], 
          f" - {overall_stats['total_docs_processed']}/{overall_stats['total_docs_processed'] + overall_stats['total_docs_failed']}")
    print("Documents failed to be processed:", overall_stats["total_docs_failed"])
    print("Documents already processed:", overall_stats["total_docs_already_processed"])
    print("Documents that failed embedding:", len(overall_stats["failed_embeddings_metadata"]))

    # Upload logs to S3
    upload_to_s3(BUCKET_NAME, f"batches/{BATCH_ID}/logs/html_fail_error_dump_docs.csv", pd.DataFrame(overall_stats["error_dump"]))
    upload_to_s3(BUCKET_NAME, f"batches/{BATCH_ID}/logs/html_fail_docs.csv", pd.DataFrame(overall_stats["failed_html_pages"]))
    upload_to_s3(BUCKET_NAME, f"batches/{BATCH_ID}/logs/too_long_docs.csv", pd.DataFrame(overall_stats["failed_embeddings_metadata"]))
    
    # Save overall stats as CSV and upload to S3
    stats_df = pd.DataFrame([{
        'total_events': overall_stats['total_events'],
        'total_docs_processed': overall_stats['total_docs_processed'],
        'total_docs_failed': overall_stats['total_docs_failed'],
        'total_docs_already_processed': overall_stats['total_docs_already_processed'],
        'failed_embeddings_count': len(overall_stats['failed_embeddings_metadata']),
        'extraction_incompletes_count': len(overall_stats['extraction_incompletes']),
        'mismatched_years_count': len(overall_stats['mismatched_years'])
    }])
    print(stats_df.squeeze())
    upload_to_s3(BUCKET_NAME, f"batches/{BATCH_ID}/logs/overall_stats.csv", stats_df)

if __name__ == "__main__":
    asyncio.run(main(dryrun=True))