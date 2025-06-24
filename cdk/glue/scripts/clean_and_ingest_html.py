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
import hashlib
import unicodedata

import numpy as np
import pandas as pd
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, RequestsAWSV4SignerAuth
from requests_aws4auth import AWS4Auth
from opensearchpy.helpers import bulk
import aiohttp
from bs4 import BeautifulSoup
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql

session = aws.session

# Constants

# Get job parameters
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, [
    'NEXT_JOB_NAME',
    'html_urls_path',
    'bucket_name',
    'batch_id',
    'region_name',
    'embedding_model',
    'opensearch_secret',
    'opensearch_host',
    'rds_secret',
    'dfo_html_full_index_name',
    'dfo_topic_full_index_name',
    'dfo_mandate_full_index_name',
    'pipeline_mode',
    'sm_method',
    'topic_modelling_mode',
    'llm_model'
])

# Index Names
DFO_HTML_FULL_INDEX_NAME = args['dfo_html_full_index_name']
DFO_TOPIC_FULL_INDEX_NAME = args['dfo_topic_full_index_name']
DFO_MANDATE_FULL_INDEX_NAME = args['dfo_mandate_full_index_name']

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

def init_opensearch_client(host: str, region: str, secret_name: str) -> Tuple[OpenSearch, Any]:
    """
    Initialize OpenSearch client with fallback authentication.
    First tries basic auth, then falls back to AWS4Auth if that fails.
    
    Parameters
    ----------
    host : str
        OpenSearch host URL
    region : str
        AWS region name
    secret_name : str
        Name of the secret containing OpenSearch credentials
        
    Returns
    -------
    Tuple[OpenSearch, Any]
        Tuple containing:
        - Initialized OpenSearch client
        - Authentication object used (either tuple of (username, password) or AWS4Auth)
    """
    secrets = aws.get_secret(secret_name=secret_name, region_name=region)
    username = secrets.get('username')
    password = secrets.get('password')
    
    # First try basic auth
    try:
        auth = (username, password)
        client = OpenSearch(
            hosts=[{'host': host, 'port': 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection
        )
        # Test connection
        client.info()
        print("Connected using basic authentication")
        return client, auth
    except Exception as e:
        if "AuthorizationException" in str(e):
            print("Basic auth failed, falling back to AWS4Auth")
            # Fall back to AWS4Auth
            credentials = session.get_credentials()
            auth = RequestsAWSV4SignerAuth(credentials, region, 'es')
            
            client = OpenSearch(
                hosts=[{'host': host, 'port': 443}],
                http_auth=auth,
                use_ssl=True,
                verify_certs=True,
                connection_class=RequestsHttpConnection,
                pool_maxsize=20
            )
            # Test connection
            client.info()
            print("Connected using AWS4Auth")
            return client, auth
        else:
            raise e

# Connect to OpenSearch
opensearch_host = aws.get_parameter_ssm(
    parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME
)

# Initialize OpenSearch client with fallback authentication
client, auth = init_opensearch_client(
    host=opensearch_host,
    region=REGION_NAME,
    secret_name=OPENSEARCH_SEC
)

info = client.info()
print(f"Welcome to {info['version']['distribution']} {info['version']['number']}!")
print(op.list_indexes(client))


# Get and print all index names with sizes
indexes = client.cat.indices(format="json")
print("Indexes and Sizes:")
for index in indexes:
    if "index" in index['index'].lower(): # only print indexes that contain "index" in the name
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
async def download_html(url: str, error_dump: List[dict], redirects: List[dict], semaphore: asyncio.Semaphore, debug: bool = False) -> Optional[Tuple[str, BeautifulSoup]]:
    """
    Asynchronously downloads HTML from a given URL and parses it with BeautifulSoup.
    If a 404 is encountered, retries with allow_redirects=True.
    On successful download, saves the HTML content to a text file if debug=True.
    
    Args:
        url: The URL to download
        error_dump: List to store any errors
        semaphore: Semaphore to control concurrent requests
        debug: If True, saves HTML content to local files
    """
    async with semaphore:  # This ensures we don't exceed our rate limit
        # just in case the server blocks us
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                # First attempt without redirects
                async with session.get(url, headers=headers) as response:
                    status = response.status
                    html_content = await response.text()
                    
                    # Check if the page is not found 404, then add to error dump
                    if status == 404 or "error 404" in html_content.lower() or "page not found" in html_content.lower() or "we couldn't find that web page" in html_content.lower():
                        error_dump.append({
                            "error": f"Page not found (HTTP {status}): {html_content}",
                            "file": url
                        })
                        return url, None
        
                    if status == 302 or 'moved temporarily' in html_content.lower():
                        redirect_url = response.headers.get('Location')
                        # print(f"The page has been moved temporarily to a new location. Redirecting to: {redirect_url}")
                        # Log the redirect
                        redirects.append({
                            'original_url': url,
                            'redirected_url': redirect_url,
                            'status_code': status
                        })
                        # Retry with redirects enabled
                        async with session.get(redirect_url, headers=headers) as retry_response:
                            retry_status = retry_response.status
                            retry_content = await retry_response.text()
                            
                            # Check if the page is not found 404 even after retry with redirects, then add to error dump
                            if retry_status == 404 or "error 404" in retry_content.lower() or "page not found" in retry_content.lower():
                                error_dump.append({
                                    "error": f"Page not found after retry with redirects (HTTP {retry_status}): {retry_content}",
                                    "file": url
                                })
                                return url, None
                            
                            doc = BeautifulSoup(retry_content, "html.parser")
                            # Save successful download if in debug mode
                            if debug:
                                save_html_content(redirect_url, retry_content)
                            return redirect_url, doc

                    doc = BeautifulSoup(html_content, "html.parser")
                    # Save successful download if in debug mode
                    if debug:
                        save_html_content(url, html_content)
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

def save_html_content(url: str, content: str) -> None:
    """
    Save HTML content to a text file.
    
    Args:
        url: The URL of the HTML content
        content: The HTML content to save
    """
    # Create html_output directory if it doesn't exist
    output_dir = Path("temp_outputs/ingestion_output/html_output")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create a safe filename from the URL
    # Remove protocol and domain, replace special characters
    filename = url.replace("https://", "").replace("http://", "")
    filename = re.sub(r'[^\w\-_\. ]', '_', filename)
    filename = f"{filename}.txt"
    
    # Save the content
    output_path = output_dir / filename
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)


def normalize_string(name: str) -> str:
    """
    Normalize string by:
    - Normalizing Unicode (e.g., é → e)
    - Removing non-breaking spaces and stripping
    - Collapsing multiple spaces
    - Fixing common OCR punctuation issues
    - Removing diacritics
    
    Args:
        name: The string to normalize
        
    Returns:
        The normalized author name
    """
    # Normalize Unicode (e.g., é → e)
    name = unicodedata.normalize("NFKC", name)
    # Remove non-breaking spaces and strip
    name = name.replace("\u00A0", " ").strip()
    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name)
    # Fix common OCR punctuation issues
    name = name.replace("“", '"').replace("”", '"').replace("’", "'")
    # Remove diacritics
    name = unicodedata.normalize("NFD", name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    return name


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
    main_text = ""
    if len(sections) >= 3:
        main_text = sections[2].get_text()
    else:
        # Try to find the main content section directly
        main_content = page.find('main', {'property': 'mainContentOfPage'})
        if main_content:
            main_section = None
            for comment in main_content.find_all(string=lambda text: isinstance(text, str) and "BEGIN MAIN CONTENT" in text):
                main_section = comment.find_next('section')
                if main_section:
                    break
            
            if main_section:
                main_text = main_section.get_text()
            else:
                # If no section found, get all text from main content
                main_text = main_content.get_text()
    
    # Replace multiple spaces with a newline for better readability.
    main_text = re.sub(r'(\s\s)+', '\n', main_text)
    # Remove the Accessibility Notice text (case-insensitive)
    main_text = re.sub(r'((Accessibility Notice)|(Avis d\'accessibilité))\s.*', '', main_text, flags=re.IGNORECASE)
    # Replace non-breaking spaces with a regular space.
    main_text = main_text.replace(u'\xa0', u' ')

    # --- Extract Subject and Authors ---
    main_content = page.find('main', {'property': 'mainContentOfPage'})
    subject = None
    cleaned_authors = []
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
                subject = normalize_string(subject)
            
            # Extract authors
            authors = []
            authors_h3 = main_section.find('h3')
            if authors_h3 and authors_h3.get_text().strip().startswith('By'):
                if authors_h3.get_text().strip().startswith('By Authors:'):
                    # Remove the 'By Author' prefix
                    authors_text = authors_h3.get_text().strip()[12:].strip()
                else:
                    # Remove the 'By' prefix
                    authors_text = authors_h3.get_text().strip()[3:].strip()
                # Get the text and remove 'By' prefix
                if " and " in authors_text: # the string ' and ' is not preceded by a comma
                    # Handle the ' and ' case by inserting a comma before it (but only when not already preceded by one)
                    authors_text = re.sub(r'(?<![,]) and ', ', ', authors_text)
                # Normalize the full author name string
                authors_text = normalize_string(authors_text)
                # Replace &nbsp; with space and clean up
                authors_text = authors_text.replace(u'\xa0', u' ')
                # Split by comma and clean up each author name
                authors = []
                for author in authors_text.split(','):
                    author = author.strip()
                    # Normalize the individual author name
                    author = normalize_string(author)
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
    language = str(language).lower()
    # For languauge instead of 'eng' and 'fra'
    # Need to spell out fully
    if 'eng' in language or 'en' in language:
        language = 'English'
    elif 'fra' in language or 'fr' in language:
        language = 'French'

    return {
        "main_text": main_text,
        "download_url": download_url,
        "title": title,
        "language": language,
        "subject": subject,
        "authors": cleaned_authors,
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
        metadata['html_subject'] = info['subject']
        metadata['html_authors'] = info['authors']
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
def get_embeddings_for_documents(documents: list[Document], embedder, failed_embeddings_metadata) -> tuple[list[Document], np.ndarray]:
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


def validate_documents_and_embeddings(documents: list[Document], embeddings: np.ndarray) -> tuple[list[Document], np.ndarray]:
    """
    Validates documents and their corresponding embeddings before bulk insertion.
    Focuses on critical fields: page_content, html_url, and embeddings.
    
    Parameters
    ----------
    documents : list[Document]
        List of Document objects to validate
    embeddings : np.ndarray
        Array of embeddings corresponding to the documents
        
    Returns
    -------
    tuple[list[Document], np.ndarray]
        Tuple of validated documents and embeddings
    """
    valid_docs = []
    valid_embeddings = []
    
    for doc, emb in zip(documents, embeddings):
        try:
            # Check if document or embedding is None
            if doc is None or emb is None:
                continue
                
            # Validate html_url
            html_url = doc.metadata.get('html_url')
            if not html_url or not isinstance(html_url, str) or not html_url.strip():
                print(f"Invalid html_url for document {doc.metadata.get('html_url', 'unknown')}")
                continue
                
            # Validate page content
            if not doc.page_content or not isinstance(doc.page_content, str) or not doc.page_content.strip():
                print(f"Invalid page content for document {doc.metadata.get('html_url', 'unknown')}")
                continue
                
            # Validate embedding
            if isinstance(emb, np.ndarray):
                emb = emb.tolist()
                
            if not isinstance(emb, list) or len(emb) != 1024 or any(x is None for x in emb):
                print(f"Invalid embedding for document {doc.metadata.get('html_url', 'unknown')}")
                continue
                
            valid_docs.append(doc)
            valid_embeddings.append(emb)
            
        except Exception as e:
            print(f"Error during validation: {str(e)}")
            continue
            
    return valid_docs, np.array(valid_embeddings)


def process_and_ingest_html_documents(
    client: OpenSearch, index_name: str, documents: list[Document], embedder, failed_embeddings_metadata, dryrun
) -> tuple[int, list[Document]]:
    # Compute embeddings for the documents, obtaining only the valid ones.
    valid_docs, html_embeddings = get_embeddings_for_documents(documents, embedder, failed_embeddings_metadata)

    if not valid_docs:
        return 0, []

    # Validate documents and embeddings before bulk insert
    valid_docs, html_embeddings = validate_documents_and_embeddings(valid_docs, html_embeddings)
    
    if not valid_docs:
        print("No valid documents after validation")
        return 0, []

    # Bulk insert the documents and embeddings into OpenSearch.
    if not dryrun:
        try:
            op.bulk_insert_html_documents(client, index_name=index_name, documents=valid_docs, vectors=html_embeddings.tolist())
        except Exception as e:
            print(f"Error during bulk insert: {str(e)}")
            return 0, []

    return len(valid_docs), valid_docs


def is_valid_document(doc, debug=False) -> bool:
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
        # if debug:
        #     print(f"Document {doc['Document URL']} does not have an 'html_doc_type' field")
        return False

    # The document should have a 'pdf_url' unless it's a 'Terms of Reference'.
    if "pdf_url" not in doc and doc.get("html_doc_type") != "Terms of Reference":
        # if debug:
        #     print(f"Document {doc['Document URL']} does not have a 'pdf_url' field")
        return False

    # The document must have an 'html_language' field.
    if "html_language" not in doc:
        # if debug:
        #     print(f"Document {doc['Document URL']} does not have an 'html_language' field")
        return False

    # Check for non-English/French documents based on heuristics in URL or title.
    html_url = doc.get("html_url", "").lower()
    csas_title = doc.get("csas_html_title", "").lower()
    if "inu" in html_url or "inukititut" in csas_title:
        if doc.get("language", "").lower() == "inuktitut":
            # if debug:
            #     print(f"Document {doc['Document URL']} is in Inuktitut")
            return False

    return True


def existing_document_is_valid(doc, client, index, enable_override=False, debug=False) -> bool:
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

    # Create a unique ID based on the document URL
    doc_id = hashlib.sha256(doc["Document URL"].encode('utf-8')).hexdigest()

    # Check if the document exists in the index.
    if not client.exists(index=index, id=doc_id):
        # if debug:
        #     print(f"Document {doc_id} does not exist in index {index}")
        return False

    # Fetch the existing document.
    existing = client.get(index=index, id=doc_id)
    # Assume the stored document is under '_source'.
    existing_doc = existing.get("_source", {})

    # Validate the stored document.
    return is_valid_document(existing_doc, debug)

def is_english_document(url: str, debug=False) -> bool:
    """
    Check if a document URL is for an English document.
    This is just a temporary solution to exclude non-English documents.
    
    Args:
        url: The document URL to check
        
    Returns:
        bool: True if the document is English, False otherwise
    """
    # List of French document extensions
    invalid_extensions = ['-fra.html', '-fra.htm', '-inu.html', '-inu.htm']
    for ext in invalid_extensions:
        if url.endswith(ext):
            # if debug:
                # print(f"Document {url} is {ext[1:3]}")
            return False
    return True

async def process_html_docs(html_docs, enable_override=False, dryrun=False, debug=False):
    """
    Process a list of HTML documents by filtering (unless override is enabled), downloading,
    extracting information, and ingesting into the index.

    Parameters:
        html_docs (list): A list of HTML document dictionaries.
        enable_override (bool): If True, all documents are processed even if they already exist.
        dryrun (bool): If True, don't actually ingest the documents.
        debug (bool): If True, save HTML content to local files.

    Returns:
        dict: Processing statistics and error logs.
    """
    docs_to_process = []
    docs_already_processed = 0
    error_dump = []
    redirects = []
    
    # Filter documents (unless override is enabled)
    for doc in html_docs:
        check = existing_document_is_valid(doc, client, DFO_HTML_FULL_INDEX_NAME, enable_override, debug)
        if check:
            docs_already_processed += 1
        elif is_english_document(doc["Document URL"], debug):
            # if debug:
                # print(f"Document {doc['Document URL']} is English")
            docs_to_process.append(doc)
        else:
            continue

    # If there are no new documents to process, return early.
    if not docs_to_process:
        return {
            "ingested_count": 0,
            "ingested_docs": [],
            "docs_failed": 0,
            "docs_already_processed": docs_already_processed,
            "error_dump": error_dump,
            "redirects": redirects,
            "failed_html_pages": [],
            "failed_embeddings_metadata": [],
            "extraction_incompletes": [],
            "mismatched_years": []
        }
    
    # Download HTML pages concurrently with rate limiting
    urls = [doc["Document URL"] for doc in docs_to_process]
    
    # Create a semaphore to limit concurrent requests
    # Adjust this number based on the server's capacity and your needs
    semaphore = asyncio.Semaphore(5)  # Allow 5 concurrent requests
    
    # Use the semaphore in the download tasks
    pages = await asyncio.gather(*(download_html(u, error_dump, redirects, semaphore, debug) for u in urls))
    
    # Extract document information from the downloaded HTML.
    docs, unloaded_docs, extraction_incompletes, mismatched_years = extract_doc_information(docs_to_process, pages)
    failed_html_pages = list(unloaded_docs)
    
    # Process and ingest the documents (only those with successful embeddings).
    failed_embeddings_metadata = []
    ingested_count, valid_docs = process_and_ingest_html_documents(client, DFO_HTML_FULL_INDEX_NAME, docs, embedder, failed_embeddings_metadata, dryrun=dryrun)
    
    # Count failures: extraction failures plus those that failed embedding.
    docs_failed = len(unloaded_docs) + (len(docs) - ingested_count)
    
    return {
        "ingested_count": ingested_count,
        "ingested_docs": valid_docs,
        "docs_failed": docs_failed,
        "docs_already_processed": docs_already_processed,
        "error_dump": error_dump,
        "redirects": redirects,
        "failed_html_pages": failed_html_pages,
        "failed_embeddings_metadata": failed_embeddings_metadata,
        "extraction_incompletes": extraction_incompletes,
        "mismatched_years": mismatched_years
    }

async def process_events(html_event_to_html_documents, enable_override=False, dryrun=False, debug=False) -> tuple[dict, list[Document]]:
    """
    Process a dictionary of CSAS events where each event has a list of associated HTML documents.
    This function aggregates processing statistics from all events.

    Parameters:
        html_event_to_html_documents (dict): Mapping of events to lists of HTML document dictionaries.
        enable_override (bool): If True, processes all documents regardless of prior existence.
        dryrun (bool): If True, don't actually ingest the documents.
        debug (bool): If True, save HTML content and logs locally.

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
        "redirects": [],
        "failed_html_pages": [],
        "failed_embeddings_metadata": [],
        "extraction_incompletes": [],
        "mismatched_years": []
    }

    ingested_docs = [] # list of all ingested documents
    for i, (csas_event, html_docs) in enumerate(html_event_to_html_documents.items(), start=1):
        # print(f"{i}/{total_events} Processing CSAS Event: {csas_event}")

        # Process the HTML documents for the current event.
        stats = await process_html_docs(
            html_docs, 
            enable_override=enable_override,
            dryrun=dryrun,
            debug=debug
        )
        ingested_docs.extend(stats["ingested_docs"])
        overall_stats["total_docs_processed"] += stats["ingested_count"]
        overall_stats["total_docs_failed"] += stats["docs_failed"]
        overall_stats["total_docs_already_processed"] += stats["docs_already_processed"]
        overall_stats["error_dump"].extend(stats["error_dump"])
        overall_stats["redirects"].extend(stats["redirects"])
        overall_stats["failed_html_pages"].extend(stats["failed_html_pages"])
        overall_stats["failed_embeddings_metadata"].extend(stats["failed_embeddings_metadata"])
        overall_stats["extraction_incompletes"].extend(stats["extraction_incompletes"])
        overall_stats["mismatched_years"].extend(stats["mismatched_years"])

    return overall_stats, ingested_docs


def upload_to_s3(bucket: str, key: str, df: pd.DataFrame, debug: bool = False):
    """Upload a DataFrame as CSV to S3 and optionally save locally if debug=True."""
    s3 = session.client('s3')
    csv_buffer = BytesIO()
    df.to_csv(csv_buffer, index=False)
    s3.put_object(Bucket=bucket, Key=key, Body=csv_buffer.getvalue())
    
    if debug:
        # Save locally in logs directory
        log_dir = Path("temp_outputs/ingestion_output/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        local_path = log_dir / key.split('/')[-1]
        with open(local_path, 'w') as f:
            f.write(csv_buffer.getvalue().decode('utf-8'))

html_url_to_content = {} # not sure why this is needed

def trigger_next_job(job_name: str, job_args: dict) -> None:
    """
    Trigger the next Glue job in the pipeline.
    
    Parameters
    ----------
    job_name : str
        Name of the Glue job to trigger
    job_args : dict
        Arguments to pass to the Glue job
    """
    glue_client = session.client('glue')
    try:
        formatted_args = {f"--{k}": v for k, v in job_args.items()}
        response = glue_client.start_job_run(
            JobName=job_name,
            Arguments=formatted_args
        )
        print(f"Successfully triggered job {job_name} with run ID: {response['JobRunId']}")
    except Exception as e:
        print(f"Error triggering job {job_name}: {str(e)}")
        raise

async def main(dryrun=False, debug=False):
    """
    Main function to process and ingest HTML documents.
    
    Args:
        dryrun (bool): If True, don't actually ingest the documents.
        debug (bool): If True, save HTML content and logs locally.
    """
    print(f"Dryrun: {dryrun}, Debug: {debug}")
    # Check pipeline mode and exit early if topics_only
    if args.get('pipeline_mode') == 'topics_only':
        print("Pipeline mode is 'topics_only'. Skipping HTML fetching, cleaning, and ingestion.")
        return

    # Create HTML index if it doesn't exist
    if not client.indices.exists(index=DFO_HTML_FULL_INDEX_NAME):
        print(f"Creating index {DFO_HTML_FULL_INDEX_NAME}...")
        op.create_html_index(client, DFO_HTML_FULL_INDEX_NAME)
    else:
        print(f"Index {DFO_HTML_FULL_INDEX_NAME} already exists")

    # Load HTML data from S3
    html_data = load_html_data_from_s3(HTML_URLS_PATH, sheet_name="CSAS HTML URLs")
    # TODO: Remove this once when ready to ingest all data
    # html_data = html_data.query("`Year` == 2017.0")
    frames = [gr_df for _, gr_df in html_data.query("Year > = 2017 and Year <= 2022").groupby("Year")]
    html_data = pd.concat(frames, ignore_index=True)
    html_data = html_data.to_dict(orient='index')
    
    # Get the url to content
    for _, value in html_data.items():
        html_url_to_content[value['Document URL']] = value
        
    html_event_to_html_documents = get_html_event_to_html_documents(html_data)
    
    # Process events
    overall_stats, ingested_docs = await process_events(html_event_to_html_documents, enable_override=False, dryrun=dryrun, debug=debug)

    # Print processing results
    print("Documents successfully processed:", overall_stats["total_docs_processed"], 
          f" - {overall_stats['total_docs_processed']}/{overall_stats['total_docs_processed'] + overall_stats['total_docs_failed']}")
    print("Documents failed to be processed:", overall_stats["total_docs_failed"])
    print("Documents already processed:", overall_stats["total_docs_already_processed"])
    print("Documents that failed embedding:", len(overall_stats["failed_embeddings_metadata"]))

    # Upload logs to S3 and optionally save locally
    ingested_docs_metadata = []
    for doc in ingested_docs:
        ingested_docs_metadata.append({
            'csas_event': doc.metadata['csas_event'],
            'csas_html_year': doc.metadata['csas_html_year'],
            'html_page_title': doc.metadata['html_page_title'],
            'html_doc_type': doc.metadata['html_doc_type'],
            'html_url': doc.metadata['html_url'],
            'html_language': doc.metadata['html_language'],
            'pdf_url': doc.metadata['pdf_url'],
            'ingestion_timestamp': CURRENT_DATETIME,
            'batch_id': BATCH_ID,
            'status': 'success'
        })
    ingested_docs_df = pd.DataFrame(ingested_docs_metadata)
    folder = f"batches/{BATCH_ID}/logs/html_ingestion"
    upload_to_s3(BUCKET_NAME, f"{folder}/processed_and_ingested_html_docs.csv", ingested_docs_df, debug)
    upload_to_s3(BUCKET_NAME, f"{folder}/html_fail_error_dump_docs.csv", pd.DataFrame(overall_stats["error_dump"]), debug)
    upload_to_s3(BUCKET_NAME, f"{folder}/url_redirects.csv", pd.DataFrame(overall_stats["redirects"]), debug)
    upload_to_s3(BUCKET_NAME, f"{folder}/html_fail_docs.csv", pd.DataFrame(overall_stats["failed_html_pages"]), debug)
    upload_to_s3(BUCKET_NAME, f"{folder}/too_long_docs.csv", pd.DataFrame(overall_stats["failed_embeddings_metadata"]), debug)
    
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
    upload_to_s3(BUCKET_NAME, f"{folder}/overall_stats.csv", stats_df, debug)

    # After successful completion, trigger the next job
    if not dryrun:
        trigger_next_job(args['NEXT_JOB_NAME'], args)

if __name__ == "__main__":
    asyncio.run(main(dryrun=False, debug=True))