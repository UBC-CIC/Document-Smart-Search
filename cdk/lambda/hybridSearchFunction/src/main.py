import os
import re
import json
import boto3
import torch
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from pathlib import Path
from pprint import pprint
from langchain_community.document_loaders import JSONLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import OpenSearchVectorSearch
from langchain_aws.embeddings import BedrockEmbeddings
from langchain import __version__ as langchain_version

import helpers.aws_utils as aws
import helpers.opensearch_utils as op


REGION_NAME = configs['aws']['region_name']
OPENSEARCH_SEC = configs['aws']['secrets']['opensearch']
INDEX_NAME = "dfo-langchain-vector-index"
BUCKET_NAME = "dfo-documents"
FOLDER_NAME = "documents"
LOCAL_DIR = "s3_data"

# ---------------------------------------------------------------------------
# Field mapping for filters
# ---------------------------------------------------------------------------
FIELD_MAP = {
    "language":        "language",                    
    "years":           "csas_html_year",
    "documentTypes":   "html_doc_type.keyword",
    "mandates":        "mandate_categorization",
    "topics":          "topic_categorization",
    "authors":         "author.keyword",
}

def set_secrets():
    global SECRETS
    SECRETS = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)

def _build_post_filter(filters):
    """Build OpenSearch post_filter from frontend filters"""
    if not filters:
        return None
        
    clauses = []
    
    # Handle year filters (convert from frontend format)
    if "years" in filters and filters["years"]:
        active_years = [year for year, is_active in filters["years"].items() if is_active]
        if active_years:
            clauses.append({"terms": {FIELD_MAP["years"]: active_years}})
            
    # Handle document type filters
    if "documentTypes" in filters and filters["documentTypes"]:
        active_types = [doc_type for doc_type, is_active in filters["documentTypes"].items() if is_active]
        if active_types:
            clauses.append({"terms": {FIELD_MAP["documentTypes"]: active_types}})
            
    # Handle topic filters
    if "topics" in filters and filters["topics"]:
        active_topics = [topic for topic, is_active in filters["topics"].items() if is_active]
        if active_topics:
            clauses.append({"terms": {FIELD_MAP["topics"]: active_topics}})
    
    # Handle mandate filters
    if "mandates" in filters and filters["mandates"]:
        active_mandates = [mandate for mandate, is_active in filters["mandates"].items() if is_active]
        if active_mandates:
            clauses.append({"terms": {FIELD_MAP["mandates"]: active_mandates}})
            
    # Handle author filters
    if "authors" in filters and filters["authors"]:
        active_authors = [author for author, is_active in filters["authors"].items() if is_active]
        if active_authors:
            clauses.append({"terms": {FIELD_MAP["authors"]: active_authors}})
    
    return {"bool": {"filter": clauses}} if clauses else None

def format_search_results(opensearch_results):
    """Format OpenSearch results for frontend consumption"""
    formatted_results = []
    
    for doc, score in opensearch_results:
        # Extract highlights if available
        highlights = []
        if "highlight" in doc and "page_content" in doc["highlight"]:
            highlights = [h.replace("\n", " ") for h in doc["highlight"]["page_content"]]
        elif "page_content" in doc:
            # If no highlights but content exists, use snippet
            content = doc.get("page_content", "")
            if content:
                highlights = [content[:150] + "..."] if len(content) > 150 else [content]
        
        # Create formatted result
        formatted_result = {
            "id": doc.get("document_id") or doc.get("html_url", "").split("/")[-1].split(".")[0],
            "title": doc.get("csas_html_title") or doc.get("document_subject", "Untitled Document"),
            "documentType": doc.get("html_doc_type") or "Unknown Type",
            "year": doc.get("html_year") or doc.get("csas_html_year", ""),
            "csasYear": doc.get("csas_html_year") or "",
            "csasEvent": doc.get("csas_event") or "",
            "topics": doc.get("topics", []),
            "mandates": doc.get("mandates", []),
            "documentUrl": doc.get("html_url") or doc.get("pdf_url", ""),
            "highlights": highlights,
            "semanticScore": score
        }
        formatted_results.append(formatted_result)
    
    return formatted_results

def handler(event, context):
    try:
        # Initialize AWS and OpenSearch connections
        with open(Path("ingestion_configs.json"), "r") as file:
            app_configs = json.load(file)

        REGION_NAME = app_configs['aws']['region_name']
        INDEX_NAME = "dfo-langchain-vector-index"
        set_secrets()

        aws_region = "us-west-2"
        session = boto3.Session()
        credentials = session.get_credentials()
        awsauth = AWSV4SignerAuth(credentials, aws_region)

        opensearch_host = "vpc-opensearchdomai-0r7i2aikcuqk-fuzzpdmexnrpq66hoze57vhqcq.us-west-2.es.amazonaws.com"
        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_auth=awsauth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            http_compress=True
        )

        # Create pipeline if it doesn't exist
        try:
            op.create_hybrid_search_pipeline(
                client=op_client,
                pipeline_name="html_hybrid_search",
                keyword_weight=0.3,
                vector_weight=0.7
            )
        except Exception as e:
            # Pipeline might already exist, that's fine
            print(f"Pipeline creation note: {str(e)}")

        # Parse request
        query = body.get("user_query", "")
        filters = body.get("filters", {})

        if not query:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing search query in 'message_content'"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }

        # Configure bedrock for embeddings
        bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
        embedder = BedrockEmbeddings(
            client=bedrock_client,
            model_id=configs['embeddings']['embedding_model']
        )

        # Configure search parameters
        highlight_cfg = {
            "fields": {"page_content": {}},
            "pre_tags": ["<em>"],
            "post_tags": ["</em>"],
        }
        
        source_cfg = {
            "include": [
                "csas_html_title",
                "csas_html_year",
                "csas_event",
                "html_url",
                "pdf_url",
                "html_language",
                "html_doc_type",
                "html_year",
                "document_subject",
                "topics",
                "mandates",
                "author"
            ]
        }
        
        # Build post filter from frontend filters
        post_filter = _build_post_filter(filters)

        # Perform search
        results = op.hybrid_similarity_search_with_score(
            query=query,
            embedding_function=embedder,
            client=op_client,
            index_name=INDEX_NAME,
            k=50,
            search_pipeline="html_hybrid_search",
            post_filter=post_filter,
            text_field="page_content",
            vector_field="chunk_embedding",
            source=source_cfg,
            highlight=highlight_cfg,
        )

        # Return formatted response
        return {
            "statusCode": 200,
            "body": json.dumps({
                "query": query,
                "results": results,
            }),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "trace": error_trace
            }),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }

