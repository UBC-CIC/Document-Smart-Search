from io import BytesIO
import os
import sys
import re
from typing import Union, Dict, Any, Tuple, List, Optional
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
from opensearchpy import OpenSearch
from langchain_core.documents import Document
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch

sys.path.append("..")
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


def fetch_mandates():
    usecols = ["tag", "name", "description"]
    dfo_mandates_df = pd.read_csv(
        Path("..", "export", "new_mandates.csv"), usecols=usecols, dtype=str
    )
    
    dfo_mandates_dict = dfo_mandates_df.to_dict(orient="index")

    return dfo_mandates_dict

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
def fetch_parent_topics():
    usecols = ["type", "tag", "parent", "name", "description"]
    dfo_ptopics_df = pd.read_csv(
        Path("..", "export", "new_subcategories.csv"), usecols=usecols, dtype=str
    )
    
    dfo_ptopics_dict = dfo_ptopics_df.to_dict(orient="index")

    return dfo_ptopics_dict

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

def fetch_child_topics():
    usecols = ["type", "tag", "parent", "name", "description"]
    dfo_child_topics_df = pd.read_csv(
        Path("..", "export", "new_topics.csv"), usecols=usecols, dtype=str
    )
    
    dfo_child_topics_dict = dfo_child_topics_df.to_dict(orient="index")

    return dfo_child_topics_dict


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
    # Fetch and process mandates
    dfo_mandates_dict = fetch_mandates()
    df_mandates_docs = mandates_to_langchain_docs(dfo_mandates_dict)

    # Fetch and process parent topics
    dfo_parent_topics_dict = fetch_parent_topics()
    dfo_parent_topics_docs = parent_topics_to_langchain_docs(dfo_parent_topics_dict)

    # Fetch and process child topics
    dfo_child_topics_dict = fetch_child_topics()
    dfo_child_topics_docs = child_topics_to_langchain_docs(dfo_child_topics_dict)

    # Combine all topic documents
    dfo_topics_docs = dfo_parent_topics_docs + dfo_child_topics_docs

    # Process and ingest the data into OpenSearch
    process_and_ingest(
        dfo_topics_docs=dfo_topics_docs, 
        df_mandates_docs=df_mandates_docs, 
        dryrun=dryrun
    )
    print("Data ingestion completed successfully.")

if __name__ == "__main__":
    main(dryrun=False)
