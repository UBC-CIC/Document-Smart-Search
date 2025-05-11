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
from opensearchpy import OpenSearch
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
from awsglue.utils import getResolvedOptions

import src.aws_utils as aws
import src.opensearch as op

# Constants
# Index Names
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"

# Get job parameters
args = getResolvedOptions(sys.argv, [
    'JOB_NAME',
    'topics_path',
    'mandates_path',
    'subcategories_path',
    'batch_id',
    'region_name',
    'embedding_model',
    'opensearch_secret',
    'opensearch_host'
])

# Paths
TOPICS_PATH = args['topics_path']
MANDATES_PATH = args['mandates_path']
SUBCATEGORIES_PATH = args['subcategories_path']
BATCH_ID = args['batch_id']

# AWS Configuration
REGION_NAME = args['region_name']
EMBEDDING_MODEL = args['embedding_model']

# OpenSearch Configuration
OPENSEARCH_SEC = args['opensearch_secret']
OPENSEARCH_HOST = args['opensearch_host']

# Runtime Variables
CURRENT_DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")

session = aws.session

def load_csv_from_s3(s3_path: str) -> pd.DataFrame:
    """
    Load CSV data from S3.
    
    Args:
        s3_path: S3 path to the CSV file (e.g., 's3://bucket/path/to/file.csv')
        
    Returns:
        pd.DataFrame: DataFrame containing the CSV data
    """
    s3 = boto3.client('s3')
    bucket, key = s3_path.replace('s3://', '').split('/', 1)
    
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        csv_data = response['Body'].read()
        return pd.read_csv(BytesIO(csv_data))
    except Exception as e:
        print(f"Error loading CSV data from S3: {e}")
        raise

def fetch_mandates():
    """
    Fetch mandates from S3 CSV.
    
    Returns:
        dict: Dictionary containing mandate data
    """
    df = load_csv_from_s3(MANDATES_PATH)
    return df.to_dict('records')

def fetch_parent_topics():
    """
    Fetch parent topics from S3 CSV.
    
    Returns:
        dict: Dictionary containing parent topic data
    """
    df = load_csv_from_s3(SUBCATEGORIES_PATH)
    return df.to_dict('records')

def fetch_child_topics():
    """
    Fetch child topics from S3 CSV.
    
    Returns:
        dict: Dictionary containing child topic data
    """
    df = load_csv_from_s3(TOPICS_PATH)
    return df.to_dict('records')

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


topics_vector_store = OpenSearchVectorSearch(
    index_name=DFO_TOPIC_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url="https://search-dfo-test-domain-7q7o6yzv2fgbsul7sbijedtltu.us-west-2.es.amazonaws.com",
    http_compress=True,
    http_auth = auth,
    use_ssl = True,
    verify_certs=True,
)

mandates_vector_store = OpenSearchVectorSearch(
    index_name=DFO_MANDATE_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url="https://search-dfo-test-domain-7q7o6yzv2fgbsul7sbijedtltu.us-west-2.es.amazonaws.com",
    http_compress=True,
    http_auth = auth,
    use_ssl = True,
    verify_certs=True,
)


def mandates_to_langchain_docs(dfo_mandates_dict: Dict[str, Any]) -> List[Document]:
    """
    Convert the mandates DataFrame to LangChain documents.
    
    Args:
        dfo_mandates_dict (Dict[str, Any]): Dictionary representation of the mandates DataFrame.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    df_mandates_docs = []

    for key, value in dfo_mandates_dict.items():
        value = value.copy()
        tag = value['tag']
        name = value['name']
        descriptions = value['description']
        
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
def parent_topics_to_langchain_docs(dfo_parent_topics_dict: Dict[str, Any]) -> List[Document]:
    """
    Convert the parent topics DataFrame to LangChain documents.
    
    Args:
        dfo_parent_topics_dict (Dict[str, Any]): Dictionary representation of the parent topics DataFrame.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    dfo_parent_topics_docs = []

    for key, value in dfo_parent_topics_dict.items():
        value = value.copy()
        doc_type = value['type']
        tag = value['tag']
        parent_tag = value['parent']
        mandate_tag = parent_tag
        name = value['name']
        descriptions = value['description']
        
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

def child_topics_to_langchain_docs(dfo_child_topics_dict: Dict[str, Any]) -> List[Document]:
    """
    Convert the child topics DataFrame to LangChain documents.
    
    Args:
        dfo_child_topics_dict (Dict[str, Any]): Dictionary representation of the child topics DataFrame.
        
    Returns:
        List[Document]: List of LangChain Document objects.
    """
    # Initialize an empty list to hold the documents
    dfo_child_topics_docs = []

    for key, value in dfo_child_topics_dict.items():
        value = value.copy()
        doc_type = value['type']
        tag = value['tag']
        parent_tag = value['parent']
        mandate_tag = parent_tag.split('.')[0]
        name = value['name']
        descriptions = value['description']
        
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
    # Fetch data
    dfo_mandates_dict = fetch_mandates()
    dfo_parent_topics_dict = fetch_parent_topics()
    dfo_child_topics_dict = fetch_child_topics()
    
    # Convert to LangChain documents
    df_mandates_docs = mandates_to_langchain_docs(dfo_mandates_dict)
    dfo_parent_topics_docs = parent_topics_to_langchain_docs(dfo_parent_topics_dict)
    dfo_child_topics_docs = child_topics_to_langchain_docs(dfo_child_topics_dict)
    
    # Process and ingest
    process_and_ingest(dfo_parent_topics_docs + dfo_child_topics_docs, df_mandates_docs, dryrun)

if __name__ == "__main__":
    main()
