import os
import re
import json
import torch
from pathlib import Path
from pprint import pprint
from opensearchpy import OpenSearch
from langchain_community.document_loaders import JSONLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import OpenSearchVectorSearch
from langchain_aws.embeddings import BedrockEmbeddings  # ✅ CHANGED
from langchain import __version__ as langchain_version

import src.aws_utils as aws
import src.opensearch_utils as op

with open(Path("configs.json"), "r") as f:
    configs = json.load(f)

REGION_NAME = configs['aws']['region_name']
OPENSEARCH_SEC = configs['aws']['secrets']['opensearch']
INDEX_NAME = "dfo-langchain-vector-index"
BUCKET_NAME = "dfo-documents"
FOLDER_NAME = "documents"
LOCAL_DIR = "s3_data"

def set_secrets():
    global SECRETS
    SECRETS = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)

def clean_text(text: str) -> str:
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text

def metadata_func(record: dict, metadata: dict) -> dict:
    metadata["url"] = record.get("url")
    metadata["publicationYear"] = record.get("publicationYear")
    metadata["key"] = metadata["publicationYear"] + "/" + record.get("name")
    return metadata

def get_opensearch_client():
    return OpenSearch(
        hosts=[{'host': 'search-test-dfo-yevtcwsp7i4vjzy4kdvalwpxgm.aos.ca-central-1.on.aws', 'port': 443}],
        http_compress=True,
        http_auth=(SECRETS['username'], SECRETS['passwords']),
        use_ssl=True,
        verify_certs=True
    )

def process_documents():
    loader = DirectoryLoader(
        "./s3_data/ParsedPublications/2001/", glob="*.json",
        loader_cls=JSONLoader,
        loader_kwargs={
            'jq_schema': '.',
            'content_key': 'text',
            "metadata_func": metadata_func
        },
    )
    docs = loader.load()
    for doc in docs:
        doc.page_content = clean_text(doc.page_content)
        doc.metadata.pop("source", None)
    return docs

def handler(event, context):
    try:
        set_secrets()

        # Step 1: Load & clean docs
        docs = process_documents()
        texts = [doc.page_content for doc in docs]
        metadatas = [doc.metadata for doc in docs]
        bulk_size = len(docs)

        # Step 2: Embedding setup — ✅ CHANGED TO BEDROCK
        session = aws.session
        bedrock_client = session.client("bedrock-runtime", region_name=REGION_NAME)
        embedder = BedrockEmbeddings(
            client=bedrock_client,
            model_id=configs['embeddings']['embedding_model']  # e.g., "amazon.titan-embed-text-v1"
        )
        embeddings = embedder.embed_documents(texts)

        # Step 3: VectorStore setup
        vector_store = OpenSearchVectorSearch.from_embeddings(
            embeddings=embeddings,
            texts=texts,
            embedding=embedder,
            metadatas=metadatas,
            vector_field='vector_embeddings',
            text_field="text",
            engine="nmslib",
            space_type="cosinesimil",
            index_name=INDEX_NAME,
            bulk_size=bulk_size,
            opensearch_url='https://search-test-dfo-yevtcwsp7i4vjzy4kdvalwpxgm.aos.ca-central-1.on.aws',
            port=443,
            http_auth=(SECRETS['username'], SECRETS['passwords']),
            use_ssl=True,
            verify_certs=True
        )

        # Step 4: Example query
        embedded_query = embedder.embed_query("Salmon population")
        results = vector_store.similarity_search_by_vector(
            embedding=embedded_query,
            k=3,
            vector_field="vector_embeddings",
            text_field="text"
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "query_result": results[0].metadata,
                "langchain": langchain_version
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
