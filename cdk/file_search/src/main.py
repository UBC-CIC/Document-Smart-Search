import json
import boto3
import logging
import uuid
import datetime

# Import helpers
from helpers.vectorstore import (
    initialize_embeddings, 
    initialize_opensearch,  # Renamed function
    hybrid_similarity_search_with_score,
    get_document_by_url,
    get_secret
)
from helpers.llm import get_bedrock_llm, analyze_document_relevance

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Constants
REGION = "us-west-2"

## OpenSearch
OPENSEARCH_HOST_SSM = "/dfo/opensearch/host"
OPENSEARCH_PORT = 443
OPENSEARCH_SEC = "opensearch/masteruser"

DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
SEARCH_PIPELINE_NAME = "html_hybrid_search"
KEYWORD_RATIO_OS_P = 0.3
SEMANTIC_RATIO_OS_P = 0.7

## SQL (PostgreSQL) - Kept for parameter consistency, not used
RDS_PROXY_PORT = 5432
RDS_PROXY_DB_NAME = "postgres"
RDS_PROXY_HOST = "/dfo/rds/host_url"
RDS_PROXY_SEC_SSM = "/dfo/rds/secretname"

## Bedrock LLM
BEDROCK_INFERENCE_PROFILE = "us.meta.llama3-3-70b-instruct-v1:0"
EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBEDDING_DIM = 1024

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION)
ssm_client = boto3.client("ssm", region_name=REGION)
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)

def get_parameter(param_name: str):
    """Get parameter from SSM parameter store with caching."""
    try:
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except Exception as e:
        logger.error(f"Error fetching parameter {param_name}: {e}")
        raise

def handler(event, context):
    """Lambda handler function"""
    logger.info("Search Lambda function is called!")
    
    # Get the HTTP method and path
    http_method = event.get('httpMethod', 'GET')
    path = event.get('path', '')
    query_params = event.get("queryStringParameters", {})
    
    # Route the request based on path or parameters
    if path.endswith('/search') or 'search_query' in query_params:
        return handle_search_request(event, context)
    elif path.endswith('/analyze') or 'document_url' in query_params:
        return handle_document_analysis_request(event, context)
    else:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Invalid request. Use /search endpoint with search_query parameter or /analyze endpoint with document_url parameter.')
        }

def handle_search_request(event, context):
    """Handle a hybrid search request"""
    query_params = event.get("queryStringParameters", {})
    search_query = query_params.get("search_query", "")
    language = query_params.get("language", "English")
    years_str = query_params.get("years", "")
    doc_type_exclude = query_params.get("exclude_doc_type", "")
    doc_type_include = query_params.get("include_doc_type", "")
    k = int(query_params.get("k", "5"))
    
    if not search_query:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: search_query')
        }
    
    try:
        # Initialize OpenSearch and get configuration values
        opensearch_host: str = get_parameter(OPENSEARCH_HOST_SSM)
        opensearch_client = initialize_opensearch(
            os_secret_name=OPENSEARCH_SEC,
            opensearch_host=opensearch_host,
            opensearch_port=OPENSEARCH_PORT,
            search_pipeline=SEARCH_PIPELINE_NAME,
            keyword_weight=KEYWORD_RATIO_OS_P,
            semantic_weight=SEMANTIC_RATIO_OS_P,
            secrets_client=secrets_manager_client
        )
        
        # Initialize embeddings
        embedder = initialize_embeddings(
            model_id=EMBEDDING_MODEL_ID,
            client=bedrock_runtime,
            region=REGION
        )
        
        # Prepare filter
        post_filter = {"bool": {"must": [], "must_not": [], "filter": []}}
        
        # Add language filter
        if language:
            post_filter["bool"]["must"].append({"term": {"language": language}})
        
        # Add doc type exclusion filter
        if doc_type_exclude:
            exclude_types = doc_type_exclude.split(",")
            for doc_type in exclude_types:
                post_filter["bool"]["must_not"].append({"term": {"html_doc_type": doc_type.strip()}})
        
        # Add doc type inclusion filter
        if doc_type_include:
            include_types = doc_type_include.split(",")
            post_filter["bool"]["must"].append({"terms": {"html_doc_type": include_types}})
        
        # Add years filter
        if years_str:
            try:
                years_list = [int(year.strip()) for year in years_str.split(",")]
                post_filter["bool"]["filter"].append({"terms": {"csas_html_year": years_list}})
            except ValueError:
                logger.warning(f"Invalid years parameter: {years_str}")
        
        # Set up highlight configuration
        highlight_config = {
            "fields": {
                "page_content": {}
            },
            "pre_tags": ["<em>"],
            "post_tags": ["</em>"]
        }
        
        # Set up source fields
        source_fields = {
            "include": [
                "csas_html_title",
                "csas_html_year",
                "csas_event",
                "html_url",
                "language",
                "html_doc_type",
                "html_year"
            ]
        }
        
        # Perform search
        search_results = hybrid_similarity_search_with_score(
            query=search_query,
            embedding_function=embedder,
            client=opensearch_client,
            index_name=DFO_HTML_FULL_INDEX_NAME,
            k=k,
            search_pipeline=SEARCH_PIPELINE_NAME,
            post_filter=post_filter,
            text_field="page_content",
            vector_field="chunk_embedding",
            source=source_fields,
            highlight=highlight_config
        )
        
        # Process results
        processed_results = []
        for source, score in search_results:
            processed_result = {
                "score": score,
                "source": source
            }
            processed_results.append(processed_result)
        
        # Return response
        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(processed_results)
        }
    
    except Exception as e:
        logger.error(f"Error processing search request: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(f'Error processing search request: {str(e)}')
        }

def handle_document_analysis_request(event, context):
    """Handle a document analysis request"""
    query_params = event.get("queryStringParameters", {})
    document_url = query_params.get("document_url", "")
    search_query = query_params.get("search_query", "")
    
    # Check for required parameters
    if not document_url:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: document_url')
        }
    
    if not search_query:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: search_query')
        }
    
    try:
        # Initialize OpenSearch and get configuration values
        opensearch_host: str = get_parameter(OPENSEARCH_HOST_SSM)
        opensearch_client = initialize_opensearch(
            os_secret_name=OPENSEARCH_SEC,
            opensearch_host=opensearch_host,
            opensearch_port=OPENSEARCH_PORT,
            search_pipeline=SEARCH_PIPELINE_NAME,
            keyword_weight=KEYWORD_RATIO_OS_P,
            semantic_weight=SEMANTIC_RATIO_OS_P,
            secrets_client=secrets_manager_client
        )
        
        # Get the document by URL
        document = get_document_by_url(
            client=opensearch_client,
            index_name=DFO_HTML_FULL_INDEX_NAME,
            document_url=document_url,
            fields=["csas_html_title", "page_content"]
        )
        
        if not document:
            return {
                'statusCode': 404,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f'Document not found with URL: {document_url}')
            }
        
        # Initialize LLM
        llm = get_bedrock_llm(
            model_id=BEDROCK_INFERENCE_PROFILE,
            region=REGION
        )
        
        # Analyze document relevance
        analysis = analyze_document_relevance(
            llm=llm,
            user_query=search_query,
            document=document
        )
        
        # Return response
        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps({
                "document_title": document.get("csas_html_title", "Unknown"),
                "document_url": document_url,
                "search_query": search_query,
                "analysis": analysis
            })
        }
    
    except Exception as e:
        logger.error(f"Error processing document analysis request: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(f'Error processing document analysis request: {str(e)}')
        }
