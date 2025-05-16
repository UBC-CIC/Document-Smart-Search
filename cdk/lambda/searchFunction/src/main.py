import os
import re
import json
import boto3
import torch
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
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

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    docs = text_splitter.split_documents(docs)
    return docs

def handler(event, context):
    try:
        
        with open(Path("ingestion_configs.json"), "r") as file:
            app_configs = json.load(file)

        OPENSEARCH_SEC = app_configs['aws']['secrets']['opensearch']
        OPENSEARCH_HOST = '/dfo/opensearch/host'
        REGION_NAME = app_configs['aws']['region_name']

        INDEX_NAME = "dfo-langchain-vector-index"

        set_secrets()

        inference_profile_id = "us.meta.llama3-3-70b-instruct-v1:0"
        aws_region = "us-west-2"
        current_session_id = "test-session-1"

        session = boto3.Session()
        credentials = session.get_credentials()
        awsauth = AWSV4SignerAuth(credentials, aws_region)
        secrets = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)
        opensearch_host = "vpc-opensearchdomai-0r7i2aikcuqk-fuzzpdmexnrpq66hoze57vhqcq.us-west-2.es.amazonaws.com"
        auth = (secrets['username'], secrets['passwords'])
        
        # Create OpenSearch client


        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_auth=awsauth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            http_compress=True
        )

        # 👇 CREATE THE PIPELINE ONCE
        op.create_hybrid_search_pipeline(
            client=op_client,
            pipeline_name="html_hybrid_search",
            keyword_weight=0.3,
            vector_weight=0.7
        )

        # Step 1: Parse input query
        body = json.loads(event.get("body", "{}"))
        query = body.get("query", "")
        if not query:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'query'"})
            }

        # Step 2: Embed the query using Bedrock
        bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
        embedder = BedrockEmbeddings(
            client=bedrock_client,
            model_id=configs['embeddings']['embedding_model']
        )

        # Step 3: Call OpenSearch hybrid similarity search
        opensearch_client = op_client # get_opensearch_client()

        results = op.hybrid_similarity_search_with_score(
            query=query,
            embedding_function=embedder,
            client=opensearch_client,
            index_name=INDEX_NAME,
            k=3,
            search_pipeline="html_hybrid_search",  # <- confirm this matches your pipeline name
            text_field="page_content",
            vector_field="chunk_embedding"
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "query": query,
                "results": [
                    {
                        "score": score,
                        "metadata": doc
                    }
                    for doc, score in results
                ],
                "langchain": langchain_version
            })
        }

    except Exception as e:
        import traceback
        import traceback
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc()
            })
        }

