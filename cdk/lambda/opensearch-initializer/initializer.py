import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# Environment
ENDPOINT       = os.environ["OPENSEARCH_ENDPOINT"]
TOPIC_IDX      = os.environ.get("TOPIC_INDEX_NAME", "dfo-topics")
MANDATE_IDX    = os.environ.get("MANDATE_INDEX_NAME", "dfo-mandates")
HTML_IDX       = os.environ.get("HTML_INDEX_NAME", "dfo-html-documents")
VECTOR_DIMS    = int(os.environ.get("VECTOR_DIMENSION", "1024"))

# Build SigV4 auth
session = boto3.Session()
creds   = session.get_credentials().get_frozen_credentials()
region  = session.region_name or os.environ.get("AWS_REGION", "us-west-2")
awsauth = AWS4Auth(
    creds.access_key,
    creds.secret_key,
    region,
    "es",
    session_token=creds.token
)

# OpenSearch client
client = OpenSearch(
    hosts=[{"host": ENDPOINT, "port": 443}],
    http_auth=awsauth,
    use_ssl=True,
    verify_certs=True,
    connection_class=RequestsHttpConnection
)

def create_topic_index():
    if client.indices.exists(index=TOPIC_IDX):
        print(f"→ {TOPIC_IDX} exists")
        return
    body = {
        "settings": { "index": { "knn": True } },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": VECTOR_DIMS,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": { "ef_construction": 512, "m": 16 }
                    }
                },
                "name":                { "type": "text" },
                "description":         { "type": "text" },
                "name_and_description":{ "type": "text" },
                "type":                { "type": "keyword" },
                "tag":                 { "type": "keyword" },
                "parent_tag":          { "type": "keyword" },
                "mandate_tag":         { "type": "keyword" }
            }
        }
    }
    client.indices.create(index=TOPIC_IDX, body=body)
    print(f"→ Created {TOPIC_IDX}")

def create_mandate_index():
    if client.indices.exists(index=MANDATE_IDX):
        print(f"→ {MANDATE_IDX} exists")
        return
    body = {
        "settings": { "index": { "knn": True } },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": VECTOR_DIMS,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": { "ef_construction": 512, "m": 16 }
                    }
                },
                "name":                { "type": "text" },
                "description":         { "type": "text" },
                "name_and_description":{ "type": "text" },
                "tag":                 { "type": "keyword" }
            }
        }
    }
    client.indices.create(index=MANDATE_IDX, body=body)
    print(f"→ Created {MANDATE_IDX}")

def create_html_index():
    if client.indices.exists(index=HTML_IDX):
        print(f"→ {HTML_IDX} exists")
        return
    body = {
        "settings": { "index": { "knn": True } },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": VECTOR_DIMS,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": { "ef_construction": 512, "m": 16 }
                    }
                },
                "page_content":       { "type": "text" },
                "csas_html_year":     { "type": "keyword" },
                "csas_event":         { "type": "text" },
                "csas_html_title":    { "type": "text" },
                "html_url":           { "type": "text" },
                "pdf_url":            { "type": "text" },
                "html_language":      { "type": "keyword" },
                "html_page_title":    { "type": "text" },
                "html_year":          { "type": "keyword" },
                "html_doc_type":      { "type": "keyword" },
                "year":               { "type": "keyword" },
                "doc_title":          { "type": "text" },
                "doc_url":            { "type": "text" },
                "download_url":       { "type": "text" },
                "language":           { "type": "keyword" }
            }
        }
    }
    client.indices.create(index=HTML_IDX, body=body)
    print(f"→ Created {HTML_IDX}")

def create_hybrid_pipeline():
    pipeline = "hybridsearch"
    url = f"/_search/pipeline/{pipeline}"
    # always upsert
    body = {
      "description": "Hybrid search post-processor",
      "phase_results_processors": [
        {
          "normalization-processor": {
            "normalization": { "technique": "min_max" },
            "combination": {
              "technique": "arithmetic_mean",
              "parameters": { "weights": [0.3, 0.7] }
            }
          }
        }
      ]
    }
    client.transport.perform_request("PUT", url, body=body)
    print(f"→ Pipeline {pipeline} upserted")

def handler(event, context):
    print("Initializing indices and pipeline…")
    create_topic_index()
    create_mandate_index()
    create_html_index()
    create_hybrid_pipeline()
    print("Done.")
    return { "status": "initialized" }
