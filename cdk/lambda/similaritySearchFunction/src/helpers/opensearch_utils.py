import logging
from typing import List, Dict, Optional, Tuple
from opensearchpy import OpenSearch, NotFoundError

logger = logging.getLogger()

def create_hybrid_search_pipeline(
    client: OpenSearch,
    pipeline_name: str,
    keyword_weight: float,
    semantic_weight: float,
    overwrite: bool = False
) -> None:
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

    # Create or update the pipeline
    client.transport.perform_request("PUT", path, body=payload)
    logger.info(f'Search pipeline "{pipeline_name}" created or updated successfully!')

def _default_hybrid_search_query(
    query_text: str,
    query_vector: List[float],
    k: int = 4,
    text_field: str = "page_content",
    vector_field: str = "chunk_embedding",
    source: Optional[Dict] = None,
    highlight: Optional[Dict] = None,
    post_filter: Optional[Dict] = None,
) -> Dict:
    if source is None:
        source = {"exclude": [vector_field]}
    
    payload = {
        "_source": source,
        "query": {
            "hybrid": {
                "queries": [
                    {"match": {text_field: {"query": query_text}}},
                    {"knn": {vector_field: {"vector": query_vector, "k": k}}},
                ]
            }
        },
        "size": k,
    }
    if highlight:
        payload["highlight"] = highlight
    if post_filter:
        payload["post_filter"] = post_filter
    return payload

def hybrid_similarity_search_with_score(
    query: str,
    embedding_function,  # Expected to be an instance of Embeddings.
    client,             # OpenSearch client instance.
    index_name: str,
    k: int = 4,
    search_pipeline: str = "hybrid_pipeline",
    post_filter: Optional[Dict] = None,
    text_field: str = "page_content",
    vector_field: str = "chunk_embedding",
    source: Optional[Dict] = None,
    highlight: Optional[Dict] = None,
) -> List[Tuple[Dict, float]]:
    # 1. Compute the vector representation for the query.
    query_vector = embedding_function.embed_query(query)

    # 2. Build the query payload (includes post_filter and highlight if provided).
    payload = _default_hybrid_search_query(
        query_text=query,
        query_vector=query_vector,
        k=k,
        text_field=text_field,
        vector_field=vector_field,
        source=source,
        highlight=highlight,
        post_filter=post_filter,
    )

    # 3. Define the endpoint path with the search pipeline.
    path = f"/{index_name}/_search?search_pipeline={search_pipeline}"

    # 4. Execute the search request.
    response = client.transport.perform_request(method="GET", url=path, body=payload)

    # 5. Parse the response hits and return tuples (result, score).
    print(response.get("hits", {}).get("hits", []))
    results = []
    for hit in response.get("hits", {}).get("hits", []):
        source_data = hit["_source"]
        source_data["id"] = hit["_id"]
        if "highlight" in hit:
            # Collect all highlight snippets from all fields into one list
            all_highlights = []
            for field_highlights in hit["highlight"].values():
                all_highlights.extend(field_highlights)
            source_data["highlight"] = all_highlights
        score = hit.get("_score", 0)
        results.append((source_data, score))
    
    return results