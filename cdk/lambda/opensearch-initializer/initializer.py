import os
import boto3
from opensearchpy.exceptions import RequestError
from opensearchpy import OpenSearch, NotFoundError
from opensearchpy.helpers import bulk
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# Environment
ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
TOPIC_IDX = os.environ.get("TOPIC_INDEX_NAME", "dfo-topic-full-index")
MANDATE_IDX = os.environ.get("MANDATE_INDEX_NAME", "dfo-mandate-full-index")
HTML_IDX  = os.environ.get("HTML_INDEX_NAME", "dfo-html-full-index")
VECTOR_DIMS = int(os.environ.get("VECTOR_DIMENSION", "1024"))

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
    connection_class=RequestsHttpConnection,
    timeout=60
)

def create_topic_index(client: OpenSearch, index_name: str, dimension: int = 1024) -> None:
    """
    Creates an OpenSearch index for DFO topics with KNN vector search and required metadata fields.
    
    Fields:
      - topic_name: text
      - topic_description: text
      - topic_name_and_description: text (used to compute vector embeddings)
      - related_themes: keyword (list of strings)
      - chunk_embedding: knn_vector field for embeddings of topic_name_and_description
    """
    if client.indices.exists(index=index_name):
        print(f"Topic index '{index_name}' already exists")
        return

    index_settings = {
        "settings": {
            "index": {
                "knn": True
            }
        },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {"ef_construction": 512, "m": 16}
                    }
                },
                "name": {"type": "text"},
                "description": {"type": "text"},
                "name_and_description": {"type": "text"},
                "type": {"type": "keyword"},
                "tag": {"type": "keyword"},
                "parent_tag": {"type": "keyword"},
                "mandate_tag": {"type": "keyword"}
            }
        }
    }

    client.indices.create(index=index_name, body=index_settings)
    print(f"Topic index '{index_name}' created.")

def create_mandate_index(client: OpenSearch, index_name: str, dimension: int = 1024) -> None:
    """
    Creates an OpenSearch index for DFO mandates with KNN vector search and required metadata fields.
    
    Fields:
      - mandate: text
      - short_description: text
      - description: text
      - mandate_and_description: text (used to compute vector embeddings)
      - chunk_embedding: knn_vector field for embeddings of mandate_and_description
    """
    if client.indices.exists(index=index_name):
        print(f"Mandate index '{index_name}' already exists")
        return

    index_settings = {
        "settings": {
            "index": {"knn": True}
        },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {"ef_construction": 512, "m": 16}
                    }
                },
                "name": {"type": "text"},
                "description": {"type": "text"},
                "name_and_description": {"type": "text"},
                "tag": {"type": "keyword"}
            }
        }
    }
    
    client.indices.create(index=index_name, body=index_settings)
    print(f"Mandate index '{index_name}' created.")

def create_html_index(client: OpenSearch, index_name: str, dimension: int = 1024) -> None:
    """
    Creates an OpenSearch index for DFO HTML documents with KNN vector search.

    This mapping includes all the original metadata fields (e.g., csas_html_year,
    csas_html_title, html_url, pdf_url, html_language, html_page_title, html_year, html_doc_type)
    and additional normalized metadata fields (year, doc_title, doc_url, download_url, language).
    """
    if client.indices.exists(index=index_name):
        print(f"Index '{index_name}' already exists")
        return

    index_settings = {
        "settings": {
            "index": {"knn": True}
        },
        "mappings": {
            "properties": {
                "chunk_embedding": {
                    "type": "knn_vector",
                    "dimension": dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {"ef_construction": 512, "m": 16}
                    }
                },
                "page_content": {"type": "text"},

                # Original metadata fields

                ## CSAS Fields
                "csas_html_year": {"type": "keyword"},
                "csas_event": {"type": "text"},
                "csas_html_title": {"type": "text"},
                "html_url": {"type": "text"},

                ## Extracted/Infered from HTML
                "pdf_url": {"type": "text"},
                "html_language": {"type": "keyword"},
                "html_page_title": {"type": "text"},
                "html_year": {"type": "keyword"},
                "html_doc_type": {"type": "keyword"},

                ## New extracted field (New)
                "document_subject": {"type": "text"},
                "authors": {"type": "keyword"}, # array of strings
                
                ## LLM categorizaton (New)
                "mandate_categorization": {"type": "keyword"}, # array of strings
                "topic_categorization": {"type": "keyword"}, # array of strings
                "derived_topic_categorization": {"type": "keyword"}, # array of strings

                # Additional normalized metadata fields
                "year": {"type": "keyword"},
                "doc_title": {"type": "text"},
                "doc_url": {"type": "text"},
                "download_url": {"type": "text"},
                "language": {"type": "keyword"}
            }
        }
    }

    client.indices.create(index=index_name, body=index_settings)
    print(f"HTML index '{index_name}' created.")

def create_hybrid_search_pipeline(
    client: OpenSearch, pipeline_name: str = "hybridsearch", keyword_weight: float = 0.3, vector_weight: float = 0.7
) -> None:
    """
    Creates or updates a hybrid search pipeline in OpenSearch.

    If the pipeline already exists, it checks whether the keyword and vector weights
    are the same. If they differ, the pipeline is updated with new weights.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    pipeline_name : str, optional
        The name of the pipeline (default is "hybridsearch").
    keyword_weight : float, optional
        The weight for keyword-based search (default is 0.3).
    vector_weight : float, optional
        The weight for vector-based search (default is 0.7).
    """
    path = f"/_search/pipeline/{pipeline_name}"

    try:
        # Check if the pipeline exists
        response = client.transport.perform_request("GET", path)
        print(f'Search pipeline "{pipeline_name}" already exists!')

        # Extract current weights
        processors = response.get(pipeline_name).get("phase_results_processors")
        for processor in processors:
            if "normalization-processor" in processor:
                weights = processor["normalization-processor"]["combination"]["parameters"]["weights"]
                current_keyword_weight, current_vector_weight = weights

                if current_keyword_weight == keyword_weight and current_vector_weight == vector_weight:
                    print("Pipeline weights are already up to date. No changes needed.")
                    return

                print("Weights have changed. Updating the pipeline...")
                break

        # Delete the existing pipeline before recreating it
        client.transport.perform_request("DELETE", path)

    except NotFoundError:
        print(f'Search pipeline "{pipeline_name}" does not exist. Creating a new one.')

    # Define the pipeline configuration
    payload = {
        "description": "Post processor for hybrid search",
        "phase_results_processors": [
            {
                "normalization-processor": {
                    "normalization": {"technique": "min_max"},
                    "combination": {
                        "technique": "arithmetic_mean",
                        "parameters": {"weights": [keyword_weight, vector_weight]},
                    },
                }
            }
        ],
    }

    # Create or update the pipeline
    response = client.transport.perform_request("PUT", path, body=payload)
    print(f'Search pipeline "{pipeline_name}" created or updated successfully!')

def handler(event, context):
    print("Initializing indices and pipeline…")
    create_topic_index(client, TOPIC_IDX, VECTOR_DIMS)
    create_mandate_index(client, MANDATE_IDX, VECTOR_DIMS)
    create_html_index(client, HTML_IDX, VECTOR_DIMS)
    create_hybrid_search_pipeline(client)
    print("Done.")
    return { "status": "initialized" }
