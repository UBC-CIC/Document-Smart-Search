#!/usr/bin/env python
# coding: utf-8

from io import BytesIO
import os
import sys
import re
import ast
from typing import Union, Dict, Any, Tuple, List, Optional
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, RequestsAWSV4SignerAuth
from requests_aws4auth import AWS4Auth
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch

sys.path.append("..")
import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql

# Constants

# Get job parameters
# from awsglue.utils import getResolvedOptions

# args = getResolvedOptions(sys.argv, [
#     'html_urls_path',
#     'bucket_name',
#     'batch_id',
#     'region_name',
#     'embedding_model',
#     'opensearch_secret',
#     'opensearch_host',
#     'rds_secret',
#     'dfo_html_full_index_name',
#     'dfo_topic_full_index_name',
#     'dfo_mandate_full_index_name',
#     'pipeline_mode'
# ])

args = {
    'html_urls_path': 's3://dfo-test-datapipeline/batches/2025-05-07/html_data/CSASDocuments.xlsx',
    'bucket_name': 'dfo-test-datapipeline',
    'batch_id': '2025-05-07',
    'region_name': 'us-west-2',
    'embedding_model': 'amazon.titan-embed-text-v2:0',
    'opensearch_secret': 'opensearch-masteruser-test-glue',
    'opensearch_host': 'opensearch-host-test-glue',
    'rds_secret': 'rds/dfo-db-glue-test',
    'dfo_html_full_index_name': 'dfo-html-full-index',
    'dfo_topic_full_index_name': 'dfo-topic-full-index',
    'dfo_mandate_full_index_name': 'dfo-mandate-full-index',
    'pipeline_mode': 'full_update', # or 'topics_only', 'html_only'
    'sm_method': 'numpy', # 'numpy', 'opensearch'
    'topic_modelling_mode': 'retrain', # or 'predict'
}

# Index Names
DFO_HTML_FULL_INDEX_NAME = args['dfo_html_full_index_name']
DFO_TOPIC_FULL_INDEX_NAME = args['dfo_topic_full_index_name']
DFO_MANDATE_FULL_INDEX_NAME = args['dfo_mandate_full_index_name']

# Paths
BUCKET_NAME = args['bucket_name']
BATCH_ID = args['batch_id']

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

session = aws.session # always use this session for boto3

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
    print(f"- {index['index']}: {index['store.size']}")
    
# Set up the embedding model via LangChain (example using BedrockEmbeddings)
bedrock_client = session.client("bedrock-runtime", region_name=REGION_NAME)
embedder = BedrockEmbeddings(client=bedrock_client, model_id=EMBEDDING_MODEL)

# Update vector stores to use the authenticated client
topics_vector_store = OpenSearchVectorSearch(
    index_name=DFO_TOPIC_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url=f"https://{opensearch_host}",
    http_auth=auth,
    use_ssl=True,
    verify_certs=True,
    connection_class=RequestsHttpConnection
)

mandates_vector_store = OpenSearchVectorSearch(
    index_name=DFO_MANDATE_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url=f"https://{opensearch_host}",
    http_auth=auth,
    use_ssl=True,
    verify_certs=True,
    connection_class=RequestsHttpConnection
)

def list_csv_files_in_s3_folder(s3_folder_path: str) -> List[str]:
    """
    List all CSV files in an S3 folder.
    
    Args:
        s3_folder_path: S3 path to the folder (e.g., 's3://bucket/path/to/folder/')
        
    Returns:
        List[str]: List of S3 paths to CSV files
    """
    s3 = session.client('s3')
    bucket, prefix = s3_folder_path.replace('s3://', '').split('/', 1)
    if not prefix.endswith('/'):
        prefix += '/'
    
    response = s3.list_objects_v2(
        Bucket=bucket,
        Prefix=prefix
    )
    
    csv_files = []
    for obj in response.get('Contents', []):
        if obj['Key'].endswith('.csv'):
            csv_files.append(f"s3://{bucket}/{obj['Key']}")
    
    return csv_files

def load_csv_from_s3(s3_path: str) -> pd.DataFrame:
    """
    Load CSV data from S3.
    
    Args:
        s3_path: S3 path to the CSV file (e.g., 's3://bucket/path/to/file.csv')
        
    Returns:
        pd.DataFrame: DataFrame containing the CSV data
    """
    s3 = session.client('s3')
    bucket, key = s3_path.replace('s3://', '').split('/', 1)
    
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        csv_data = response['Body'].read()
        return pd.read_csv(BytesIO(csv_data))
    except Exception as e:
        print(f"Error loading CSV data from S3: {e}")
        raise

def fetch_data_from_folder() -> Dict[str, pd.DataFrame]:
    """
    Fetch all CSV files from the S3 folder and return them as DataFrames.
    
    Returns:
        Dict[str, pd.DataFrame]: Dictionary mapping file types to DataFrames
    """
    topics_mandates_folder = f"s3://{BUCKET_NAME}/batches/{BATCH_ID}/topics_mandates_data/"
    csv_files = list_csv_files_in_s3_folder(topics_mandates_folder)
    data_dict = {}
    
    for file_path in csv_files:
        file_name = os.path.basename(file_path)
        if 'mandates' in file_name.lower():
            data_dict['mandates'] = load_csv_from_s3(file_path)
        elif 'topics' in file_name.lower():
            data_dict['topics'] = load_csv_from_s3(file_path)
        elif 'subcategories' in file_name.lower():
            data_dict['subcategories'] = load_csv_from_s3(file_path)
    
    return data_dict

def fetch_mandates():
    """
    Fetch mandates from S3 CSV.
    
    Returns:
        dict: Dictionary containing mandate data
    """
    data_dict = fetch_data_from_folder()
    if 'mandates' not in data_dict:
        raise ValueError("No mandates file found in the folder")
    return data_dict['mandates'].to_dict('records')

def fetch_parent_topics():
    """
    Fetch parent topics from S3 CSV.
    
    Returns:
        dict: Dictionary containing parent topic data
    """
    data_dict = fetch_data_from_folder()
    if 'subcategories' not in data_dict:
        raise ValueError("No subcategories file found in the folder")
    return data_dict['subcategories'].to_dict('records')

def fetch_child_topics():
    """
    Fetch child topics from S3 CSV.
    
    Returns:
        dict: Dictionary containing child topic data
    """
    data_dict = fetch_data_from_folder()
    if 'topics' not in data_dict:
        raise ValueError("No topics file found in the folder")
    return data_dict['topics'].to_dict('records')

def mandates_to_langchain_docs(dfo_mandates_dict: List[Dict[str, Any]]) -> List[Document]:
    """
    Convert the mandates list of dictionaries to LangChain documents.
    
    Args:
        dfo_mandates_dict (List[Dict[str, Any]]): List of dictionaries containing mandate data.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    df_mandates_docs = []

    for mandate in dfo_mandates_dict:
        tag = mandate['tag']
        name = mandate['name']
        descriptions = mandate['description']
        
        descriptions = ast.literal_eval(descriptions)
        # Ensure the result is a list; if not, wrap it in a list.
        if not isinstance(descriptions, list):
            descriptions = [descriptions]

        for description in descriptions:
            # Create the combined content and metadata for the document
            combined_content = f"{name}: {description}"
            metadata = {
                "tag": tag,
                "name": name,
                "description": description
            }
            df_mandates_docs.append(Document(page_content=combined_content, metadata=metadata))
            
    return df_mandates_docs


# ### Load Topics and Subcategories
def parent_topics_to_langchain_docs(dfo_parent_topics_dict: List[Dict[str, Any]]) -> List[Document]:
    """
    Convert the parent topics list of dictionaries to LangChain documents.
    
    Args:
        dfo_parent_topics_dict (List[Dict[str, Any]]): List of dictionaries containing parent topic data.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    dfo_parent_topics_docs = []

    for topic in dfo_parent_topics_dict:
        doc_type = topic['type']
        tag = topic['tag']
        parent_tag = topic['parent']
        mandate_tag = parent_tag
        name = topic['name']
        descriptions = topic['description']
        
        descriptions = ast.literal_eval(descriptions)
        # Ensure the result is a list; if not, wrap it in a list.
        if not isinstance(descriptions, list):
            descriptions = [descriptions]

        for description in descriptions:
            # Create the combined content and metadata for the document
            combined_content = f"{name}: {description}"
            metadata = {
                "type": doc_type,
                "tag": tag,
                "parent_tag": parent_tag,
                "mandate_tag": mandate_tag,
                "name": name,
                "description": description
            }
            dfo_parent_topics_docs.append(Document(page_content=combined_content, metadata=metadata))
            
    return dfo_parent_topics_docs

def child_topics_to_langchain_docs(dfo_child_topics_dict: List[Dict[str, Any]]) -> List[Document]:
    """
    Convert the child topics list of dictionaries to LangChain documents.
    
    Args:
        dfo_child_topics_dict (List[Dict[str, Any]]): List of dictionaries containing child topic data.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    dfo_child_topics_docs = []

    for topic in dfo_child_topics_dict:
        doc_type = topic['type']
        tag = topic['tag']
        parent_tag = str(topic['parent']) if topic['parent'] is not None else ''
        mandate_tag = parent_tag.split('.')[0] if parent_tag else ''
        name = topic['name']
        descriptions = topic['description']
        
        descriptions = ast.literal_eval(descriptions)
        # Ensure the result is a list; if not, wrap it in a list.
        if not isinstance(descriptions, list):
            descriptions = [descriptions]

        for description in descriptions:
            # Create the combined content and metadata for the document
            combined_content = f"{name}: {description}"
            metadata = {
                "type": doc_type,
                "tag": tag,
                "parent_tag": parent_tag,
                "mandate_tag": mandate_tag,
                "name": name,
                "description": description
            }
            dfo_child_topics_docs.append(Document(page_content=combined_content, metadata=metadata))
            
    return dfo_child_topics_docs


def get_embeddings_for_documents(documents: list[Document], embedder) -> np.array:
    """
    Compute vector embeddings synchronously for each document's content.

    Parameters:
      - documents: list of Document objects.
      - embedder: a LangChain embedding instance (e.g., BedrockEmbeddings).

    Returns:
      - A numpy array of embeddings.
    """
    embeddings = [embedder.embed_query(doc.page_content) for doc in documents]
    return np.array(embeddings)


def process_and_ingest(dfo_topics_docs, df_mandates_docs, dryrun: bool = False):
    # Assuming 'topic_documents' and 'mandate_documents' are defined elsewhere
    topic_embeddings = get_embeddings_for_documents(dfo_topics_docs, embedder)
    mandate_embeddings = get_embeddings_for_documents(df_mandates_docs, embedder)

    if not dryrun:
        op.bulk_insert_topic_documents(client, index_name=DFO_TOPIC_FULL_INDEX_NAME, documents=dfo_topics_docs, vectors=topic_embeddings.tolist())
        op.bulk_insert_mandate_documents(client, index_name=DFO_MANDATE_FULL_INDEX_NAME, documents=df_mandates_docs, vectors=mandate_embeddings.tolist())
    print("Inserted {} topic documents and {} mandate documents into OpenSearch.".format(len(dfo_topics_docs), len(df_mandates_docs)))

def main(dryrun: bool = False):
    """
    Main function to process and ingest topics and mandates.
    
    Args:
        dryrun (bool): If True, don't actually ingest the documents.
    """
    print(f"Dryrun: {dryrun}")
    # Check pipeline mode and exit early if html_only
    if args.get('pipeline_mode') == 'html_only':
        print("Pipeline mode is 'html_only'. Skipping topics and mandates ingestion.")
        return

    # Create indices if they don't exist
    op.create_topic_index(client, DFO_TOPIC_FULL_INDEX_NAME)
    op.create_mandate_index(client, DFO_MANDATE_FULL_INDEX_NAME)
    
    # Fetch data
    dfo_mandates_dict = fetch_mandates()
    dfo_parent_topics_dict = fetch_parent_topics()
    dfo_child_topics_dict = fetch_child_topics()

    # Convert to LangChain documents
    # if a mandate has multiple, there will be multiple documents 
    # with the same mandate name but different descriptions
    df_mandates_docs = mandates_to_langchain_docs(dfo_mandates_dict)
    dfo_parent_topics_docs = parent_topics_to_langchain_docs(dfo_parent_topics_dict)
    dfo_child_topics_docs = child_topics_to_langchain_docs(dfo_child_topics_dict)
    
    # Process and ingest
    # IMPORTANT: parent topics and child topics are in the same index
    process_and_ingest(dfo_parent_topics_docs + dfo_child_topics_docs, df_mandates_docs, dryrun)

if __name__ == "__main__":
    main(dryrun=False)
