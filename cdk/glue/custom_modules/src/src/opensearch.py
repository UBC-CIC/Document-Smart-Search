from opensearchpy.exceptions import RequestError
from opensearchpy import OpenSearch, NotFoundError
from opensearchpy.helpers import bulk
from langchain_core.documents import Document
import hashlib

# Additional classes for topic and mandates ingestion
from opensearchpy import RequestsHttpConnection
from typing import List, Dict, Optional, Tuple, Literal

import numpy as np

def list_indexes(client):
    """
    List all indices
    """
    return list(client.indices.get_alias("*").keys())

def fetch_specific_fields(client, index_name, fields, scroll="2m", batch_size=5000):
    """
    Fetch all rows (documents) from an OpenSearch index, retrieving only specific fields,
    using the Scroll API to bypass the 10,000-document limit.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to fetch data from.
    fields : list of str
        List of field names to retrieve from the documents.
    scroll : str, optional
        Time the scroll context should be kept alive (default is "2m").
    batch_size : int, optional
        Number of documents per scroll request (default is 5000).

    Returns
    -------
    list
        A list of dictionaries containing the specified fields for each document.
    """
    if not client.indices.exists(index=index_name):
        raise ValueError(f"Index '{index_name}' does not exist.")

    all_results = []

    # Initial search request to get the scroll_id
    response = client.search(
        index=index_name,
        _source=fields,
        scroll=scroll,
        size=batch_size,
        timeout=60
    )

    scroll_id = response.get("_scroll_id")
    hits = response.get("hits", {}).get("hits", [])

    while hits:
        all_results.extend(hit["_source"] for hit in hits)

        # Fetch next batch
        response = client.scroll(scroll_id=scroll_id, scroll=scroll)
        scroll_id = response.get("_scroll_id")
        hits = response.get("hits", {}).get("hits", [])

    # Clear the scroll context to free resources
    client.clear_scroll(scroll_id=scroll_id)

    return all_results


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
    
    

# ----- BELLOW ARE SCRIPTS FOR INGESTING BOTH MANDATES AND TOPICS ----- #

# ----- INDEX CREATION FUNCTIONS ----- #

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

# ----- BULK INSERT FUNCTIONS ----- #

def bulk_insert_topic_documents(
    client: OpenSearch, index_name: str, documents: list[Document], vectors: list[list[float]]
) -> None:
    """
    Bulk inserts topic documents into the OpenSearch topic index.
    
    Expects each Document to have metadata:
      - topic_name
      - topic_description
      - related_themes (list)
    and its page_content is the concatenated "topic_name_and_description".
    
    The document _id is set as the SHA-256 hash of topic_name + topic_description.
    """
    actions = []
    for doc, vector in zip(documents, vectors):
        # Create a unique ID based on topic_name and topic_description.
        id_str = hashlib.sha256(doc.page_content.encode('utf-8')).hexdigest()
        
        doc_body = {
            "chunk_embedding": vector,
            "name": doc.metadata.get("name", ""),
            "description": doc.metadata.get("description", ""),
            "name_and_description": doc.page_content,
            "type": doc.metadata.get("type", ""),
            "tag": doc.metadata.get("tag", ""),
            "parent_tag": doc.metadata.get("parent_tag", ""),
            "mandate_tag": doc.metadata.get("mandate_tag", "")
        }
        
        action = {
            "_op_type": "update",           # Use update to allow upsert (replace if exists)
            "_index": index_name,
            "_id": id_str,                  # Set the document ID to the computed hash
            "doc": doc_body,
            "doc_as_upsert": True           # Create the document if it doesn't exist
        }
        actions.append(action)

    success, _ = bulk(client, actions)
    print(f"Inserted {success} topic documents successfully.")


def bulk_insert_mandate_documents(
    client: OpenSearch, index_name: str, documents: list[Document], vectors: list[list[float]]
) -> None:
    """
    Bulk inserts mandate documents into the OpenSearch mandate index.
    
    Expects each Document to have metadata:
      - mandate
      - short_description
      - description
    and its page_content is the concatenated "mandate_and_description".
    
    The document _id is set as the SHA-256 hash of mandate + description.
    """
    actions = []
    for doc, vector in zip(documents, vectors):
        # Create a unique ID based on mandate and description.
        id_str = hashlib.sha256(doc.page_content.encode('utf-8')).hexdigest()
        
        doc_body = {
            "chunk_embedding": vector,
            "name": doc.metadata.get("name", ""),
            "description": doc.metadata.get("description", ""),
            "name_and_description": doc.page_content,
            "tag": doc.metadata.get("tag", ""),
        }
        
        action = {
            "_op_type": "update",
            "_index": index_name,
            "_id": id_str,
            "doc": doc_body,
            "doc_as_upsert": True
        }
        actions.append(action)

    success, _ = bulk(client, actions)
    print(f"Inserted {success} mandate documents successfully.")

# ----- HTML Index ----- #
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

def bulk_insert_html_documents(client: OpenSearch, index_name: str, documents: list[Document], vectors: list[list[float]]) -> None:
    """
    Bulk inserts HTML documents into the specified OpenSearch index.

    Preserves all original metadata fields and adds normalized fields:
      - 'year': chosen from 'html_year' (fallback to 'csas_html_year')
      - 'doc_title': chosen from 'csas_html_title' (fallback to 'html_page_title')
      - 'doc_url': from 'html_url'
      - 'download_url': from 'pdf_url'
      - 'language': from 'html_language'

    The document _id is set as the SHA-256 hash of the document's URL.
    """
    actions = []
    for doc, vector in zip(documents, vectors):
        metadata = doc.metadata
        year = metadata.get("csas_html_year", None)
        if year is None:
            year = metadata.get("html_year", None)

        doc_title = metadata.get("csas_html_title", None)
        if doc_title is None:
            doc_title = metadata.get("html_page_title", None)

        doc_body = {
            "chunk_embedding": vector,
            "page_content": doc.page_content,

            # Original metadata fields
            "csas_html_year": metadata.get("csas_html_year", ""),
            "csas_html_title": metadata.get("csas_html_title", ""),
            "csas_event": metadata.get("csas_event", ""),
            "html_url": metadata["html_url"],  # MUST BE DEFINED
            "pdf_url": metadata.get("pdf_url", ""),
            "html_language": metadata.get("html_language", ""),
            "html_page_title": metadata.get("html_page_title", ""),
            "html_year": metadata.get("html_year", ""),
            "html_doc_type": metadata.get("html_doc_type", ""),

            # Additional normalized metadata fields
            "year": year,
            "doc_title": doc_title,
            "doc_url": metadata.get("html_url", ""),
            "download_url": metadata.get("pdf_url", ""),
            "language": metadata.get("html_language", "")
        }

        # Create a unique ID based on the document URL
        id_str = hashlib.sha256(metadata["html_url"].encode('utf-8')).hexdigest()

        # Use update action with doc_as_upsert for replacement by _id
        action = {
            "_op_type": "update",
            "_index": index_name,
            "_id": id_str,  # Use SHA-256 hash of URL as ID
            "doc": doc_body,
            "doc_as_upsert": True
        }
        actions.append(action)

    success, _ = bulk(client, actions)
    print(f"Inserted {success} HTML documents successfully.")

def delete_index(client: OpenSearch, index_name: str) -> None:
    """
    Deletes an OpenSearch index by name.

    Args:
      client: An instance of the OpenSearch client.
      index_name: The name of the index to delete.
    """
    if client.indices.exists(index=index_name):
        client.indices.delete(index=index_name)
        print(f"Index '{index_name}' deleted.")
    else:
        print(f"Index '{index_name}' does not exist.")
        

def get_document_text_and_embeddings(
    client: OpenSearch, index_name: str, html_page_title: str
):
    """
    Retrieve the text, embeddings, and metadata of a document from an Elasticsearch index 
    based on an exact match of the HTML page title.

    Parameters
    ----------
    client : Elasticsearch
        Elasticsearch client instance.
    html_page_title : str
        The exact title of the HTML page to search for.
    index_name : str
        Name of the Elasticsearch index.

    Returns
    -------
    tuple or None
        A tuple containing (document text, embedding, metadata) if found, otherwise None.
    """
    html_response = client.search(
        index=index_name,
        body={
            "size": 1000,

            # HAVE TO DO THIS FOR EXACT STRING MATCH
            "query": {
                "match_phrase": {
                    "html_page_title": html_page_title
                }
            }
            # ,"_source": ["doc_url", "download_url", "doc_type", "page_content", ""]
        }
    )
    if html_response["hits"]["hits"]:
        doc_information = html_response["hits"]["hits"][0]['_source']
    else:
        print("No docs found")
        return None
    metadata = doc_information.copy()
    del metadata['page_content']
    del metadata['chunk_embedding']

    return doc_information['page_content'], np.array(doc_information['chunk_embedding']), metadata



# ----- Pipeline Search ----- #
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
    """
    Returns the payload for performing a hybrid search.

    Combines a text-based match query on `text_field` and a k-NN query on `vector_field`.

    Args:
        query_text (str): The query text for the text match.
        query_vector (List[float]): The vector representation of the query.
        k (int): Number of nearest neighbors to return.
        text_field (str): Field on which the text match is performed.
                          Defaults to "page_content".
        vector_field (str): Field on which the k-NN search is performed.
                            Defaults to "chunk_embedding".
        source (Optional[Dict]): Custom _source configuration for the search payload.
                                 If not provided, defaults to excluding the vector field.
        highlight (Optional[Dict]): Highlight configuration to return highlighted snippets.
        post_filter (Optional[Dict]): Additional filter to further restrict the results.

    Returns:
        Dict: The query payload.
    """
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
    """
    Performs a hybrid similarity search and returns a list of tuples containing
    each result dictionary and its relevancy score.

    Args:
        query (str): The search query text.
        embedding_function: The embeddings instance used to convert text to vectors.
        client: The OpenSearch client instance.
        index_name (str): The OpenSearch index name.
        k (int): The number of results to return.
        search_pipeline (str): The name of the search pipeline configured in OpenSearch.
        post_filter (Optional[Dict]): An optional post filter for the query.
        text_field (str): Field for the text match query.
                          Defaults to "page_content".
        vector_field (str): Field for the vector search.
                            Defaults to "chunk_embedding".
        source (Optional[Dict]): Custom _source configuration for the search payload.
        highlight (Optional[Dict]): Highlight configuration for the query.

    Returns:
        List[Tuple[Dict, float]]: A list of tuples where each tuple is (result, score).
    """
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
    results = []
    for hit in response.get("hits", {}).get("hits", []):
        source_data = hit["_source"]
        if "highlight" in hit:
            source_data["highlight"] = hit["highlight"]
        score = hit.get("_score", 0)
        results.append((source_data, score))
    
    return results

def bulk_update_categorizations(
    client: OpenSearch,
    index_name: str,
    doc_categorizations: Dict[str, List[str]],
    categorization_type: Literal["mandate", "topic", "derived_topic"]
) -> Tuple[int, int]:
    """
    Bulk updates categorizations for documents in OpenSearch.
    
    Args:
        client: OpenSearch client instance
        index_name: Name of the index to update
        doc_categorizations: Dictionary mapping document URLs to lists of names
        categorization_type: Type of categorization to update ("mandate", "topic", or "derived_topic")
        
    Returns:
        Tuple of (success_count, failure_count)
    """
    field_name = f"{categorization_type}_categorization"
    
    actions = [
        {
            "_op_type": "update",
            "_index": index_name,
            "_id": hashlib.sha256(doc_url.encode('utf-8')).hexdigest(),
            "doc": {
                field_name: names
            }
        }
        for doc_url, names in doc_categorizations.items()
    ]
    
    success, failed = bulk(client, actions)
    return success, failed

