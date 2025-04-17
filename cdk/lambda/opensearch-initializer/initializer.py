import os
import json
import boto3
import requests
from requests.auth import HTTPBasicAuth
import urllib3

urllib3.disable_warnings()

# Get environment variables
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT')
COMPARISON_OPENSEARCH_ENDPOINT = os.environ.get('COMPARISON_OPENSEARCH_ENDPOINT')
ADMIN_SECRET_ARN = os.environ.get('ADMIN_SECRET_ARN')
COMPARISON_ADMIN_SECRET_ARN = os.environ.get('COMPARISON_ADMIN_SECRET_ARN')
USER_SECRET_ARN = os.environ.get('USER_SECRET_ARN')
COMPARISON_USER_SECRET_ARN = os.environ.get('COMPARISON_USER_SECRET_ARN')
TOPIC_INDEX_NAME = os.environ.get('TOPIC_INDEX_NAME', 'dfo-topics')
MANDATE_INDEX_NAME = os.environ.get('MANDATE_INDEX_NAME', 'dfo-mandates')
HTML_INDEX_NAME = os.environ.get('HTML_INDEX_NAME', 'dfo-html-documents')
VECTOR_DIMENSION = int(os.environ.get('VECTOR_DIMENSION', '1024'))

# Initialize AWS clients
secretsmanager = boto3.client('secretsmanager')

def get_secret(secret_arn):
    """Retrieve a secret from AWS Secrets Manager"""
    response = secretsmanager.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])

def create_topic_index(domain_endpoint, auth, index_name, dimension=1024):
    """
    Creates an OpenSearch index for DFO topics with KNN vector search and required metadata fields.
    
    Fields:
      - topic_name: text
      - topic_description: text
      - topic_name_and_description: text (used to compute vector embeddings)
      - related_themes: keyword (list of strings)
      - chunk_embedding: knn_vector field for embeddings of topic_name_and_description
    """
    url = f"https://{domain_endpoint}/{index_name}"
    # Check if index exists
    response = requests.head(url, auth=auth, verify=False)
    if response.status_code == 200:
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

    response = requests.put(url, auth=auth, json=index_settings, verify=False)
    if response.status_code == 200:
        print(f"Topic index '{index_name}' created.")
    else:
        print(f"Failed to create topic index: {response.status_code} - {response.text}")
        raise Exception(f"Failed to create topic index: {response.text}")

def create_mandate_index(domain_endpoint, auth, index_name, dimension=1024):
    """
    Creates an OpenSearch index for DFO mandates with KNN vector search and required metadata fields.
    """
    url = f"https://{domain_endpoint}/{index_name}"
    # Check if index exists
    response = requests.head(url, auth=auth, verify=False)
    if response.status_code == 200:
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
    
    response = requests.put(url, auth=auth, json=index_settings, verify=False)
    if response.status_code == 200:
        print(f"Mandate index '{index_name}' created.")
    else:
        print(f"Failed to create mandate index: {response.status_code} - {response.text}")
        raise Exception(f"Failed to create mandate index: {response.text}")

def create_html_index(domain_endpoint, auth, index_name, dimension=1024):
    """
    Creates an OpenSearch index for DFO HTML documents with KNN vector search.
    """
    url = f"https://{domain_endpoint}/{index_name}"
    # Check if index exists
    response = requests.head(url, auth=auth, verify=False)
    if response.status_code == 200:
        print(f"HTML index '{index_name}' already exists")
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

                # Additional normalized metadata fields
                "year": {"type": "keyword"},
                "doc_title": {"type": "text"},
                "doc_url": {"type": "text"},
                "download_url": {"type": "text"},
                "language": {"type": "keyword"}
            }
        }
    }
    
    response = requests.put(url, auth=auth, json=index_settings, verify=False)
    if response.status_code == 200:
        print(f"HTML index '{index_name}' created.")
    else:
        print(f"Failed to create HTML index: {response.status_code} - {response.text}")
        raise Exception(f"Failed to create HTML index: {response.text}")

def create_hybrid_search_pipeline(domain_endpoint, auth, pipeline_name="hybridsearch", keyword_weight=0.3, vector_weight=0.7):
    """
    Creates or updates a hybrid search pipeline in OpenSearch.
    """
    url = f"https://{domain_endpoint}/_search/pipeline/{pipeline_name}"
    
    # Check if pipeline exists
    response = requests.head(url, auth=auth, verify=False)
    if response.status_code == 200:
        print(f"Search pipeline '{pipeline_name}' already exists")
        
        # Get current pipeline to check weights
        response = requests.get(url, auth=auth, verify=False)
        if response.status_code == 200:
            pipeline_config = response.json()
            processors = pipeline_config.get(pipeline_name, {}).get("phase_results_processors", [])
            
            for processor in processors:
                if "normalization-processor" in processor:
                    weights = processor["normalization-processor"]["combination"]["parameters"]["weights"]
                    current_keyword_weight, current_vector_weight = weights
                    
                    if current_keyword_weight == keyword_weight and current_vector_weight == vector_weight:
                        print("Pipeline weights are already up to date. No changes needed.")
                        return
            
            # Delete existing pipeline before recreating
            delete_response = requests.delete(url, auth=auth, verify=False)
            if delete_response.status_code != 200:
                print(f"Failed to delete existing pipeline: {delete_response.status_code} - {delete_response.text}")
    
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
    
    # Create pipeline
    response = requests.put(url, auth=auth, json=payload, verify=False)
    if response.status_code == 200:
        print(f"Search pipeline '{pipeline_name}' created or updated successfully")
    else:
        print(f"Failed to create search pipeline: {response.status_code} - {response.text}")
        raise Exception(f"Failed to create search pipeline: {response.text}")

def setup_user_role(domain_endpoint, admin_auth, user_secret):
    """Set up a limited access role for application users"""
    username = user_secret['username']
    password = user_secret['password']
    
    # Create role
    role_url = f"https://{domain_endpoint}/_plugins/_security/api/roles/dfo_user_role"
    role_payload = {
        "cluster_permissions": [
            "cluster:monitor/main",
            "cluster:monitor/health"
        ],
        "index_permissions": [
            {
                "index_patterns": [
                    f"{TOPIC_INDEX_NAME}*",
                    f"{MANDATE_INDEX_NAME}*",
                    f"{HTML_INDEX_NAME}*"
                ],
                "allowed_actions": [
                    "read",
                    "search"
                ]
            }
        ]
    }
    
    response = requests.put(role_url, auth=admin_auth, json=role_payload, verify=False)
    print(f"Create role response: {response.status_code} - {response.text}")
    
    # Create user
    user_url = f"https://{domain_endpoint}/_plugins/_security/api/internalusers/{username}"
    user_payload = {
        "password": password,
        "backend_roles": ["dfo_user_role"]
    }
    
    response = requests.put(user_url, auth=admin_auth, json=user_payload, verify=False)
    print(f"Create user response: {response.status_code} - {response.text}")
    
    # Map role to backend role
    role_mapping_url = f"https://{domain_endpoint}/_plugins/_security/api/rolesmapping/dfo_user_role"
    role_mapping_payload = {
        "backend_roles": ["dfo_user_role"]
    }
    
    response = requests.put(role_mapping_url, auth=admin_auth, json=role_mapping_payload, verify=False)
    print(f"Create role mapping response: {response.status_code} - {response.text}")

def handler(event, context):
    print("OpenSearch initializer invoked")
    
    # Get admin credentials
    admin_secret = get_secret(ADMIN_SECRET_ARN)
    comparison_admin_secret = get_secret(COMPARISON_ADMIN_SECRET_ARN)
    user_secret = get_secret(USER_SECRET_ARN)
    comparison_user_secret = get_secret(COMPARISON_USER_SECRET_ARN)
    
    admin_auth = HTTPBasicAuth(admin_secret['username'], admin_secret['password'])
    comparison_admin_auth = HTTPBasicAuth(comparison_admin_secret['username'], comparison_admin_secret['password'])
    
    # Initialize primary domain
    print(f"Initializing OpenSearch domain: {OPENSEARCH_ENDPOINT}")
    
    # Create indices
    create_topic_index(OPENSEARCH_ENDPOINT, admin_auth, TOPIC_INDEX_NAME, VECTOR_DIMENSION)
    create_mandate_index(OPENSEARCH_ENDPOINT, admin_auth, MANDATE_INDEX_NAME, VECTOR_DIMENSION)
    create_html_index(OPENSEARCH_ENDPOINT, admin_auth, HTML_INDEX_NAME, VECTOR_DIMENSION)
    
    # Create hybrid search pipeline
    create_hybrid_search_pipeline(OPENSEARCH_ENDPOINT, admin_auth)
    
    # Set up user roles and permissions
    setup_user_role(OPENSEARCH_ENDPOINT, admin_auth, user_secret)
    
    # Initialize comparison domain
    print(f"Initializing comparison OpenSearch domain: {COMPARISON_OPENSEARCH_ENDPOINT}")
    
    # Create indices on comparison domain
    create_topic_index(COMPARISON_OPENSEARCH_ENDPOINT, comparison_admin_auth, TOPIC_INDEX_NAME, VECTOR_DIMENSION)
    create_mandate_index(COMPARISON_OPENSEARCH_ENDPOINT, comparison_admin_auth, MANDATE_INDEX_NAME, VECTOR_DIMENSION)
    create_html_index(COMPARISON_OPENSEARCH_ENDPOINT, comparison_admin_auth, HTML_INDEX_NAME, VECTOR_DIMENSION)
    
    # Create hybrid search pipeline on comparison domain
    create_hybrid_search_pipeline(COMPARISON_OPENSEARCH_ENDPOINT, comparison_admin_auth)
    
    # Set up user roles and permissions on comparison domain
    setup_user_role(COMPARISON_OPENSEARCH_ENDPOINT, comparison_admin_auth, comparison_user_secret)
    
    return {
        "statusCode": 200,
        "body": "OpenSearch domains successfully initialized with required indices and search pipeline"
    }
