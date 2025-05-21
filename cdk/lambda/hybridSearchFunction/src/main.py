import json
import boto3
import logging
from typing import Dict
from langchain_aws.embeddings import BedrockEmbeddings
from opensearchpy import OpenSearch

import helpers.aws_utils as aws
import helpers.opensearch_utils as op

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Hardcoded constants (for now)
OPENSEARCH_SEC = "opensearch-masteruser-test-glue"
OPENSEARCH_HOST = "opensearch-host-test-glue"
REGION_NAME = "us-west-2"
INDEX_NAME = "dfo-html-full-index"
EMBEDDING_MODEL_PARAM = "amazon.titan-embed-text-v2:0"

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION_NAME)
ssm_client = boto3.client("ssm", region_name=REGION_NAME)

def get_parameter(param_name: str):
    """Get parameter from SSM parameter store with caching."""
    try:
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except Exception as e:
        logger.error(f"Error fetching parameter {param_name}: {e}")
        raise

def get_secret(secret_name: str) -> Dict:
    try:
        response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
        return json.loads(response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
        raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
    except Exception as e:
        logger.error(f"Error fetching secret {secret_name}: {e}")
        raise

def handler(event, context):
    try:
        body = {} if event.get("body") is None else json.loads(event.get("body"))
        query = body.get("user_query", "")
        filters = body.get("filters", {})

        secrets = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)
        opensearch_host = aws.get_parameter_ssm(parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME)
        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )

        # Create pipeline if it doesn't exist
        op.create_hybrid_search_pipeline(
            client=op_client,
            pipeline_name="html_hybrid_search",
            keyword_weight=0.3,
            vector_weight=0.7,
            overwrite=False
        )

        if not query:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing search query."}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }

        # Configure bedrock for embeddings
        bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
        embedder = BedrockEmbeddings(
            client=bedrock_client,
            model_id=EMBEDDING_MODEL_PARAM
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
                "html_language",
                "html_doc_type",
                "html_year",
                "html_subject",
            ]
        }

        # Perform search
        results = op.hybrid_similarity_search_with_score(
            query=query,
            embedding_function=embedder,
            client=op_client,
            index_name=INDEX_NAME,
            k=50,
            search_pipeline="html_hybrid_search",
            post_filter=filters,
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

