from opensearchpy.exceptions import RequestError
from opensearchpy import OpenSearch, NotFoundError
from opensearchpy.helpers import bulk
from langchain_core.documents import Document
import numpy as np

def delete_index(client, index_name):
    """
    Delete an index in OpenSearch by name.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to delete.

    Returns
    -------
    dict
        The response from OpenSearch.
    """
    if client.indices.exists(index=index_name):
        return client.indices.delete(index=index_name)
    else:
        raise ValueError(f"Index '{index_name}' does not exist.")

def list_indexes(client):
    """
    List all indices
    """
    return list(client.indices.get_alias("*").keys())

def get_index_info(client, index_name):
    """
    Retrieve the fields (attributes) and the document count of an index in OpenSearch by name.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to retrieve the fields and document count from.

    Returns
    -------
    dict
        A dictionary containing the field mappings of the index and the document count.
    """
    if client.indices.exists(index=index_name):
        # Retrieve index field mappings
        index_mapping = client.indices.get_mapping(index=index_name)
        fields = index_mapping.get(index_name, {}).get('mappings', {}).get('properties', {})
        
        # Get document count
        index_stats = client.cat.indices(index=index_name, format="json")[0]
        doc_count = index_stats.get('docs.count', 0)
        
        # Return fields and document count
        return {
            "fields": fields,
            "document_count": doc_count
        }
    else:
        raise ValueError(f"Index '{index_name}' does not exist.")


def fetch_specific_fields(client, index_name, fields, size=10000):
    """
    Fetch all rows (documents) from an OpenSearch index, but only specific fields.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to fetch data from.
    fields : list of str
        List of field names to retrieve from the documents.

    Returns
    -------
    list
        A list of dictionaries containing the specified fields for each document.
    """
    if client.indices.exists(index=index_name):
        # Perform the search query with the source filter for specific fields
        response = client.search(
            index=index_name,
            _source=fields,  # Specify which fields to fetch
            size=size  # Adjust the size as needed or handle pagination
        )
        
        # Extract and return the hits (documents) from the response
        return [hit["_source"] for hit in response.get("hits", {}).get("hits", [])]
    else:
        raise ValueError(f"Index '{index_name}' does not exist.")


def create_knn_index(client: OpenSearch, index_name: str, dimension: int = 1024)->None:
    """
    Creates an OpenSearch index with KNN vector search and metadata fields.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to create.
    dimension : int, optional
        The dimensionality of the vector embeddings (default is 768).
    """

    if client.indices.exists(index=index_name):
        print(f"Index {index_name} already exists")
        return

    index_settings = {
        "settings": {
            "index": {
                "knn": True,
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
                        "parameters": {"ef_construction": 512, "m": 16},
                    },
                },
                "year": {"type": "text"},
                "doc_title": {"type": "text"},
                "doc_url": {"type": "text"},
                "doc_type": {"type": "text"},
                "raw_chunk_text": {"type": "text"},
            }
        }
    }

    client.indices.create(index=index_name, body=index_settings)
    print(f"Index '{index_name}' created.")    

def create_full_text_index(client: OpenSearch, index_name: str)->None:
    """
    Creates a full-text search index in OpenSearch if it does not already exist.

    This function checks whether the specified index exists. If the index is found,
    it prints a message and exits. Otherwise, it creates the index with predefined
    text-based mappings for metadata fields.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to create.

    Returns
    -------
    None
        This function does not return a value but prints messages indicating 
        whether the index was created or already exists.

    Notes
    -----
    - The index contains the following text fields:
      - `year`: The publication year.
      - `doc_title`: The title of the document.
      - `doc_url`: The source URL of the document.
      - `doc_type`: The category or type of the document.
      - `full_raw_text`: The complete extracted text from the document.
    """
    if client.indices.exists(index=index_name):
        print(f"Index {index_name} already exists")
        return

    index_settings = {
        "mappings": {
            "properties": {
                "year": {"type": "text"},
                "doc_title": {"type": "text"},
                "doc_url": {"type": "text"},
                "doc_type": {"type": "text"},
                "full_raw_text": {"type": "text"}
            }
        }
    }

    client.indices.create(index=index_name, body=index_settings)
    print(f"Index '{index_name}' created.")

def bulk_insert_embedding_documents(
    client: OpenSearch, index_name: str, documents: list[Document], vectors: list[list]
)->None:
    """
    Bulk inserts LangChain Document objects with embeddings into an OpenSearch KNN index.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index where documents will be inserted.
    documents : list of Document
        A list of LangChain Document objects.
    vectors : list of list[float]
        A list of vector embeddings corresponding to each document.
    """
    actions = []
    
    for doc, vector in zip(documents, vectors):
        action = {
            "_index": index_name,
            "_source": {
                "chunk_embedding": vector,
                "year": doc.metadata.get("year", ""),
                "doc_title": doc.metadata.get("doc_title", ""),
                "doc_url": doc.metadata.get("doc_url", ""),
                "doc_type": doc.metadata.get("doc_type", ""),
                "raw_chunk_text": doc.page_content,
            }
        }
        actions.append(action)

    # Perform the bulk insertion
    success, failed = bulk(client, actions)
    print(f"Inserted {success} documents successfully, {failed} failed.")

def bulk_insert_full_text_documents(
    client: OpenSearch, index_name: str, documents: list[Document]
) -> None:
    """
    Bulk inserts LangChain Document objects into an OpenSearch full-text index.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index where documents will be inserted.
    documents : list of Document
        A list of LangChain Document objects containing metadata and text content.

    Returns
    -------
    None
        Prints the number of successfully inserted documents and any failures.
    """
    actions = []
    
    for doc in documents:
        action = {
            "_index": index_name,
            "_source": {
                "year": doc.metadata.get("year", ""),
                "doc_title": doc.metadata.get("doc_title", ""),
                "doc_url": doc.metadata.get("doc_url", ""),
                "doc_type": doc.metadata.get("doc_type", ""),
                "full_raw_text": doc.page_content,
            }
        }
        actions.append(action)

    # Perform the bulk insertion
    success, failed = bulk(client, actions)
    print(f"Inserted {success} documents successfully, {failed} failed.")


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