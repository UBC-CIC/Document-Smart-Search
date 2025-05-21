import json
from typing import List, Dict, Any, Optional, Tuple, Callable
from opensearchpy import OpenSearch
from langchain_core.documents import Document

def create_hybrid_search_pipeline(
    client: OpenSearch, 
    pipeline_name: str, 
    keyword_weight: float = 0.3, 
    vector_weight: float = 0.7
):
    """
    Create a hybrid search pipeline in OpenSearch.
    """
    pipeline_body = {
        "description": "Pipeline for hybrid search ranking",
        "processors": [
            {
                "normalize_keyword_score": {
                    "field": "_score",
                    "score_type": "keyword_score",
                    "weight": keyword_weight
                }
            },
            {
                "normalize_score": {
                    "field": "_score",
                    "score_type": "vector_score",
                    "weight": vector_weight
                }
            }
        ]
    }
    
    client.ingest.put_pipeline(id=pipeline_name, body=pipeline_body)
    return True

def hybrid_similarity_search_with_score(
    query: str,
    embedding_function: Callable,
    client: OpenSearch,
    index_name: str,
    k: int = 10,
    search_pipeline: str = None,
    post_filter: Optional[Dict] = None,
    text_field: str = "page_content",
    vector_field: str = "chunk_embedding",
    source: Optional[Dict] = None,
    highlight: Optional[Dict] = None,
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Perform a hybrid search in OpenSearch, combining keyword and semantic search.
    
    Parameters
    ----------
    query : str
        The search query text.
    embedding_function : Callable
        Function to convert text to embeddings.
    client : OpenSearch
        OpenSearch client.
    index_name : str
        Name of the OpenSearch index.
    k : int, optional
        Number of results to return, by default 10.
    search_pipeline : str, optional
        Name of search pipeline for result ranking, by default None.
    post_filter : Dict, optional
        Post-filter for OpenSearch query, by default None.
    text_field : str, optional
        Field containing the document text, by default "page_content".
    vector_field : str, optional
        Field containing the vector embedding, by default "chunk_embedding".
    source : Dict, optional
        Source filtering configuration, by default None.
    highlight : Dict, optional
        Highlighting configuration, by default None.
    
    Returns
    -------
    List[Tuple[Dict[str, Any], float]]
        List of (document, score) pairs.
    """
    if not query:
        return []  # Return empty results for empty query
        
    # Get the query embedding
    embeddings = embedding_function.embed_query(query)
    
    # Build search request
    search_query = {
        "size": k,
        "query": {
            "bool": {
                "should": [
                    # Keyword match on text field
                    {"match": {text_field: {"query": query}}},
                    # Vector search with KNN
                    {
                        "knn": {
                            vector_field: {
                                "vector": embeddings,
                                "k": k
                            }
                        }
                    }
                ]
            }
        }
    }
    
    # Add post filtering if specified
    if post_filter:
        search_query["post_filter"] = post_filter
        
    # Add source filtering if specified
    if source:
        search_query["_source"] = source
        
    # Add highlighting if specified
    if highlight:
        search_query["highlight"] = highlight
    
    # Add search pipeline if specified
    search_params = {}
    if search_pipeline:
        search_params["pipeline"] = search_pipeline
    
    # Execute search
    response = client.search(
        body=search_query,
        index=index_name,
        **search_params
    )
    
    # Process results
    hits = response["hits"]["hits"]
    results = []
    
    for hit in hits:
        doc = hit["_source"]
        score = hit["_score"]
        
        # Add highlights to doc if available
        if "highlight" in hit:
            doc["highlight"] = hit["highlight"]
            
        results.append((doc, score))
        
    return results
