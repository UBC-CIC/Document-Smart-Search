from opensearchpy import OpenSearch
from opensearchpy.exceptions import RequestError
from opensearchpy.helpers import bulk

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

def create_index(client, index_name):
    index_body = {
      'settings': {
        'index': {
          'number_of_shards': 4
        }
      }
    }

    try:
        response = client.indices.create(index_name, body=index_body)
        print("Created index!")
    except RequestError as e:
        if "resource_already_exists_exception" in str(e):
            print("The index already exists.")
        else:
            print(f"RequestError: {e}")