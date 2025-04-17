import logging
from opensearchpy import OpenSearch, NotFoundError
from typing import Dict, Tuple, Any
from langchain_aws import BedrockEmbeddings

logger = logging.getLogger()

def get_opensearch_client(
    opensearch_auth: tuple, 
    opensearch_host: str, 
    opensearch_port: int
) -> OpenSearch:
    """
    Create and return an OpenSearch client.
    
    Parameters:
    -----------
    opensearch_auth : tuple
        Tuple containing (username, password)
    opensearch_host : str
        OpenSearch host URL
    opensearch_port : int, default=443
        OpenSearch port
        
    Returns:
    --------
    OpenSearch
        An initialized OpenSearch client
    """
    return OpenSearch(
        hosts=[{'host': opensearch_host, 'port': opensearch_port}],
        http_compress=True,
        http_auth=opensearch_auth,
        use_ssl=True,
        verify_certs=True
    )

def create_hybrid_search_pipeline(
    client: OpenSearch,
    pipeline_name: str,
    keyword_weight: float,
    semantic_weight: float
) -> None:
    """
    Create or update a hybrid search pipeline in OpenSearch.
    
    Parameters:
    -----------
    client : OpenSearch
        The OpenSearch client
    pipeline_name : str
        The name of the pipeline to create or update
    keyword_weight : float
        The weight for keyword-based search (0-1)
    semantic_weight : float
        The weight for semantic search (0-1)
    """
    path = f"/_search/pipeline/{pipeline_name}"

    try:
        # Check if the pipeline exists
        response = client.transport.perform_request("GET", path)
        logger.info(f'Search pipeline "{pipeline_name}" already exists!')

        # Delete the existing pipeline before recreating it
        client.transport.perform_request("DELETE", path)

    except NotFoundError:
        logger.info(f'Search pipeline "{pipeline_name}" does not exist. Creating a new one.')

    # Define the pipeline configuration
    payload = {
        "description": "Post processor for hybrid search",
        "phase_results_processors": [
            {
                "normalization-processor": {
                    "normalization": {"technique": "min_max"},
                    "combination": {
                        "technique": "arithmetic_mean",
                        "parameters": {"weights": [keyword_weight, semantic_weight]},
                    },
                }
            }
        ],
    }

    # Create or update the pipeline
    client.transport.perform_request("PUT", path, body=payload)
    logger.info(f'Search pipeline "{pipeline_name}" created or updated successfully!')

def initialize_embeddings(model_id: str, client, region: str) -> BedrockEmbeddings:
    """
    Initialize BedrockEmbeddings model.
    
    Parameters:
    -----------
    model_id : str
        The model ID to use for embeddings
    client : boto3.client
        Boto3 client for Bedrock runtime
    region : str
        AWS region
        
    Returns:
    --------
    BedrockEmbeddings
        Initialized embeddings model
    """
    return BedrockEmbeddings(
        model_id=model_id,
        client=client,
        region_name=region
    )

def initialize_opensearch_and_db(
    rds_secret_name: str,
    rds_dbname: str,
    rds_endpoint: str, 
    rds_port: int,
    os_secret_name: str, 
    opensearch_host: str, 
    opensearch_port: int,
    search_pipeline: str,
    keyword_weight: float, 
    semantic_weight: float,
    secrets_client
) -> Tuple[OpenSearch, Dict[str, Any]]:
    """
    Initialize OpenSearch client and database connection info.
    
    Parameters:
    -----------
    db_secret_name : str
        Name of the secret containing database credentials
    rds_endpoint : str
        RDS endpoint URL
    opensearch_host : str
        OpenSearch host URL
    search_pipeline : str
        Name of the search pipeline
    keyword_weight : float
        Weight for keyword search (0-1)
    semantic_weight : float
        Weight for semantic search (0-1)
    secrets_client : boto3.client, optional
        Secrets manager client
    region : str, optional
        AWS region to use (overrides default)
        
    Returns:
    --------
    Tuple containing:
    - OpenSearch client
    - Database connection info dictionary
    - Database credentials dictionary
    """
    from helpers.db import get_secret
    
    # Get secret from Secrets Manager
    os_secret = get_secret(os_secret_name, secrets_client)
    
    # Set up OpenSearch client
    opensearch_auth = (os_secret["username"], os_secret["passwords"])
    opensearch_client = get_opensearch_client(
        opensearch_auth=opensearch_auth,
        opensearch_host=opensearch_host,
        opensearch_port=opensearch_port
    )
    
    # Create hybrid search pipeline
    create_hybrid_search_pipeline(
        client=opensearch_client,
        pipeline_name=search_pipeline,
        keyword_weight=keyword_weight,
        semantic_weight=semantic_weight
    )

    # Get the rds secret from Secrets Manager
    rds_secret = get_secret(rds_secret_name, secrets_client)
    
    # Set up database connection info
    sql_conn_info = {
        "host": rds_endpoint,
        "port": rds_port,
        "dbname": rds_dbname,
        "user": rds_secret["username"],
        "password": rds_secret["password"]
    }
    
    return opensearch_client, sql_conn_info