import logging
from opensearchpy import OpenSearch, NotFoundError
from typing import Dict, Tuple, Any, List, Optional
from langchain_aws import BedrockEmbeddings
import json
import boto3

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
    semantic_weight: float,
    overwrite: bool = False
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
        if not overwrite:
            # If the pipeline exists and overwrite is False, skip creation
            logger.info(f'Search pipeline "{pipeline_name}" already exists! Skipping creation.')
            return  # Pipeline exists, no need to recreate it
        else:
            # If overwrite is True, delete the existing pipeline
            client.transport.perform_request("DELETE", path)
            logger.info(f'Search pipeline "{pipeline_name}" already exists! Removing existing pipeline.')
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

        # Create the pipeline
        client.transport.perform_request("PUT", path, body=payload)
        logger.info(f'Search pipeline "{pipeline_name}" created successfully!')

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

def get_secret(secret_name: str, secrets_manager_client=None, expect_json=True) -> Dict:
    """
    Fetch a secret from AWS Secrets Manager.
    
    Parameters:
    -----------
    secret_name : str
        The name/ARN of the secret to retrieve
    secrets_manager_client : boto3.client, optional
        The boto3 client for Secrets Manager
    expect_json : bool, default=True
        Whether to parse the secret as JSON
        
    Returns:
    --------
    dict
        The parsed secret value
    """
    if secrets_manager_client is None:
        secrets_manager_client = boto3.client("secretsmanager")
        
    try:
        response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
        return json.loads(response) if expect_json else response
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
        raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
    except Exception as e:
        logger.error(f"Error fetching secret {secret_name}: {e}")
        raise

def initialize_opensearch(
    os_secret_name: str, 
    opensearch_host: str, 
    opensearch_port: int,
    search_pipeline: str,
    keyword_weight: float, 
    semantic_weight: float,
    secrets_client
) -> OpenSearch:
    """
    Initialize OpenSearch client.
    
    Parameters:
    -----------
    os_secret_name : str
        Name of the secret containing OpenSearch credentials
    opensearch_host : str
        OpenSearch host URL
    opensearch_port : int
        OpenSearch port
    search_pipeline : str
        Name of the search pipeline
    keyword_weight : float
        Weight for keyword search (0-1)
    semantic_weight : float
        Weight for semantic search (0-1)
    secrets_client : boto3.client
        Secrets manager client
        
    Returns:
    --------
    OpenSearch
        Initialized OpenSearch client
    """
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
    
    return opensearch_client

def hybrid_similarity_search_with_score(
    query: str,
    embedding_function,
    client,
    index_name: str,
    k: int = 10,
    search_pipeline: str = None,
    post_filter: dict = None,
    text_field: str = "page_content",
    vector_field: str = "chunk_embedding",
    source: dict = None,
    highlight: dict = None
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Perform a hybrid search (combining keyword and semantic search) in OpenSearch.
    
    Parameters:
    -----------
    query : str
        The search query
    embedding_function : Embeddings
        The embedding function to use for generating query embeddings
    client : OpenSearch
        The OpenSearch client
    index_name : str
        The name of the index to search
    k : int, default=10
        The number of results to return
    search_pipeline : str, optional
        The name of the search pipeline to use
    post_filter : dict, optional
        A filter to apply to the search results
    text_field : str, default="page_content"
        The name of the text field in the index
    vector_field : str, default="chunk_embedding"
        The name of the vector field in the index
    source : dict, optional
        Configuration for _source field in the response
    highlight : dict, optional
        Configuration for highlighting in the response
        
    Returns:
    --------
    List[Tuple[Dict[str, Any], float]]
        A list of tuples containing the documents and their scores
    """
    # Generate embeddings for the query
    query_embedding = embedding_function.embed_query(query)
    
    # Build the search query
    search_query = {
        "size": k,
        "query": {
            "hybrid": {
                "queries": [
                    {
                        # Text query (BM25)
                        "match": {
                            text_field: {
                                "query": query
                            }
                        }
                    },
                    {
                        # Vector query (kNN)
                        "knn": {
                            vector_field: {
                                "vector": query_embedding,
                                "k": k
                            }
                        }
                    }
                ]
            }
        }
    }
    
    # Add source configuration if provided
    if source:
        search_query["_source"] = source
    
    # Add post filter if provided
    if post_filter:
        search_query["post_filter"] = post_filter
    
    # Add highlight configuration if provided
    if highlight:
        search_query["highlight"] = highlight
    
    # Add search pipeline if provided
    params = {}
    if search_pipeline:
        params["search_pipeline"] = search_pipeline
    
    # Execute the search
    response = client.search(
        index=index_name,
        body=search_query,
        params=params
    )
    
    # Process the results
    results = []
    for hit in response["hits"]["hits"]:
        source = hit["_source"]
        score = hit["_score"]
        
        # Add highlight if available
        if "highlight" in hit:
            source["highlight"] = hit["highlight"]
        
        results.append((source, score))
    
    return results

def get_document_by_url(
    client,
    index_name: str,
    document_url: str,
    fields: List[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Retrieve a document from OpenSearch by its URL.
    
    Parameters:
    -----------
    client : OpenSearch
        The OpenSearch client
    index_name : str
        The name of the index to search
    document_url : str
        The URL of the document to retrieve
    fields : List[str], optional
        List of fields to include in the response
        
    Returns:
    --------
    Optional[Dict[str, Any]]
        The document if found, None otherwise
    """
    # Set up source fields
    source = fields if fields else True
    
    # Build the query
    query = {
        "size": 1,
        "_source": source,
        "query": {
            "bool": {
                "must": [
                    {"match_phrase": {"html_url": document_url}}
                ]
            }
        }
    }
    
    # Execute the search
    response = client.search(
        index=index_name,
        body=query
    )
    
    # Check if any document was found
    if len(response["hits"]["hits"]) > 0:
        return response["hits"]["hits"][0]["_source"]
    
    return None