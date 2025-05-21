import sys
import os
import io
from typing import Dict, List, Iterable, Literal, Optional, Tuple, Any
import pandas as pd
import numpy as np
from opensearchpy import OpenSearch, RequestsHttpConnection, RequestsAWSV4SignerAuth
from requests_aws4auth import AWS4Auth
import boto3
import psycopg
from datetime import datetime

sys.path.append("..")
import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql

# Constants that will be replaced with Glue context args, SSM params, or Secrets Manager
REGION_NAME = "us-west-2"

args = {
    'JOB_NAME': 'sql_ingestion',
    'html_urls_path': 's3://dfo-test-datapipeline/batches/2025-05-07/html_data/CSASDocuments.xlsx',
    'bucket_name': 'dfo-test-datapipeline',
    'batch_id': '2025-05-07',
    'region_name': 'us-west-2',
    'embedding_model': 'amazon.titan-embed-text-v2:0',
    'opensearch_secret': 'opensearch-masteruser-test-glue',
    'opensearch_host': 'opensearch-host-test-glue',
    'rds_secret': 'rds/dfo-db-glue-test',
    'dfo_html_full_index_name': 'dfo-html-full-index',
    'dfo_topic_full_index_name': 'dfo-topic-full-index',
    'dfo_mandate_full_index_name': 'dfo-mandate-full-index',
    'pipeline_mode': 'full_update', # or 'topics_only', 'html_only'
    'sm_method': 'numpy', # 'numpy', 'opensearch'
    'topic_modelling_mode': 'retrain', # or 'predict'
}

DFO_HTML_FULL_INDEX_NAME = args['dfo_html_full_index_name']

CURRENT_DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")

session = aws.session # always use this session for all AWS calls

def init_opensearch_client(host: str, region: str, secret_name: str) -> Tuple[OpenSearch, Any]:
    """
    Initialize OpenSearch client with fallback authentication.
    First tries basic auth, then falls back to AWS4Auth if that fails.
    
    Parameters
    ----------
    host : str
        OpenSearch host URL
    region : str
        AWS region name
    secret_name : str
        Name of the secret containing OpenSearch credentials
        
    Returns
    -------
    Tuple[OpenSearch, Any]
        Tuple containing:
        - Initialized OpenSearch client
        - Authentication object used (either tuple of (username, password) or AWS4Auth)
    """
    secrets = aws.get_secret(secret_name=secret_name, region_name=region)
    username = secrets.get('username')
    password = secrets.get('password')
    
    # First try basic auth
    try:
        auth = (username, password)
        client = OpenSearch(
            hosts=[{'host': host, 'port': 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection
        )
        # Test connection
        client.info()
        print("Connected using basic authentication")
        return client, auth
    except Exception as e:
        if "AuthorizationException" in str(e):
            print("Basic auth failed, falling back to AWS4Auth")
            # Fall back to AWS4Auth
            credentials = session.get_credentials()
            auth = RequestsAWSV4SignerAuth(credentials, region, 'es')
            
            client = OpenSearch(
                hosts=[{'host': host, 'port': 443}],
                http_auth=auth,
                use_ssl=True,
                verify_certs=True,
                connection_class=RequestsHttpConnection,
                pool_maxsize=20
            )
            # Test connection
            client.info()
            print("Connected using AWS4Auth")
            return client, auth
        else:
            raise e

def fetch_specific_fields(client, index_name: str, fields: List[str], scroll: str = "2m", batch_size: int = 5000) -> List[Dict]:
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
        timeout=30
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

def prepare_documents_table(document_df: pd.DataFrame, now: str) -> pd.DataFrame:
    """
    Prepare the documents table dataframe.

    Parameters
    ----------
    document_df : pd.DataFrame
        Raw document dataframe from OpenSearch
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed documents table dataframe
    """
    documents_table = (document_df.loc[:, [
        'html_url', 'html_year', 'html_page_title', 'html_doc_type', 'pdf_url', 
        'html_language', 'csas_html_year', 'csas_event'
    ]].copy().rename(columns={
        'html_year': 'year',
        'html_page_title': 'title',
        'html_doc_type': 'doc_type',
        'html_language': 'doc_language',
        'csas_html_year': 'event_year',
        'csas_event': 'event_subject'
    }))

    documents_table.loc[:, 'year'] = pd.to_numeric(documents_table['year'], errors='coerce').replace({np.nan: None})
    documents_table.loc[:, 'event_year'] = pd.to_numeric(documents_table['event_year'], errors='coerce').replace({np.nan: None})
    documents_table = documents_table.replace(np.nan, None)
    documents_table.loc[:, 'last_updated'] = now

    return documents_table

def prepare_mandates_table(mandate_df: pd.DataFrame, now: str) -> pd.DataFrame:
    """
    Prepare the mandates table dataframe.

    Parameters
    ----------
    mandate_df : pd.DataFrame
        Raw mandate dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed mandates table dataframe
    """
    mandates_table = mandate_df[["mandate_name"]].copy()
    mandates_table.loc[:, 'last_updated'] = now
    return mandates_table

def prepare_subcategories_table(subcategory_df: pd.DataFrame, mandate_df: pd.DataFrame, now: str) -> pd.DataFrame:
    """
    Prepare the subcategories table dataframe.

    Parameters
    ----------
    subcategory_df : pd.DataFrame
        Raw subcategory dataframe
    mandate_df : pd.DataFrame
        Raw mandate dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed subcategories table dataframe
    """
    subcategories_table = subcategory_df.merge(
        mandate_df,
        how="left",
        left_on="parent",
        right_on="tag"
    ).loc[:, ['subcategory_name', 'mandate_name']].copy()
    subcategories_table.loc[:, 'last_updated'] = now
    return subcategories_table

def prepare_topics_table(topic_df: pd.DataFrame, subcategory_df: pd.DataFrame, mandate_df: pd.DataFrame, now: str) -> pd.DataFrame:
    """
    Prepare the topics table dataframe.

    Parameters
    ----------
    topic_df : pd.DataFrame
        Raw topic dataframe
    subcategory_df : pd.DataFrame
        Raw subcategory dataframe
    mandate_df : pd.DataFrame
        Raw mandate dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed topics table dataframe
    """
    topics_table = topic_df.loc[:, ['tag', 'topic_name', 'parent']].copy()
    topics_table.loc[:, "mandate_tag"] = topics_table["parent"].str.extract(r"^(\d+)")
    topics_table.loc[:, "subcategory_tag"] = topics_table["parent"].where(topics_table["parent"].str.contains(r"\d+\.\d+"), None)
    topics_table = topics_table.merge(
        subcategory_df.loc[:, ['tag', 'subcategory_name']],
        how="left",
        left_on="subcategory_tag",
        right_on="tag"
    ).merge(
        mandate_df.loc[:, ['tag', 'mandate_name']],
        how='left',
        left_on='mandate_tag',
        right_on='tag'
    ).loc[:, ['topic_name', 'subcategory_name', 'mandate_name']].copy()
    topics_table = topics_table.replace(np.nan, None)
    topics_table.loc[:, 'last_updated'] = now
    return topics_table

def prepare_csas_events_table(documents_table: pd.DataFrame, now: str) -> pd.DataFrame:
    """
    Prepare the CSAS events table dataframe.

    Parameters
    ----------
    documents_table : pd.DataFrame
        Processed documents table dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed CSAS events table dataframe
    """
    csas_events_table = documents_table[['event_year', 'event_subject']].drop_duplicates().copy()
    csas_events_table.loc[:, 'last_updated'] = now
    return csas_events_table

def prepare_documents_mandates_table(
    mandate_results_df: pd.DataFrame,
    documents_table: pd.DataFrame,
    mandates_table: pd.DataFrame,
    now: str
) -> pd.DataFrame:
    """
    Prepare the documents_mandates table dataframe.

    Parameters
    ----------
    mandate_results_df : pd.DataFrame
        Raw mandate results dataframe
    documents_table : pd.DataFrame
        Processed documents table dataframe
    mandates_table : pd.DataFrame
        Processed mandates table dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed documents_mandates table dataframe
    """
    documents_mandates_table = mandate_results_df.merge(
        right=documents_table,
        left_on="Document URL",
        right_on="html_url",
        how="inner"
    ).merge(
        right=mandates_table,
        left_on="Mandate",
        right_on="mandate_name",
        how="inner"
    ).rename(
        columns={
            "LLM Belongs": "llm_belongs",
            "LLM Relevance": "llm_score",
            "LLM Explanation": "llm_explanation",
            "Semantic Score": "semantic_score"
        }
    ).astype({
        "html_url": str,
        "mandate_name": str,
        "llm_belongs": str,
        "llm_score": int,
        "llm_explanation": str,
        "semantic_score": np.float32
    }).loc[:, ["html_url", "mandate_name", "llm_belongs", "llm_score", "llm_explanation", "semantic_score"]]
    documents_mandates_table['last_updated'] = now
    return documents_mandates_table

def prepare_documents_topics_table(
    topic_results_df: pd.DataFrame,
    documents_table: pd.DataFrame,
    topics_table: pd.DataFrame,
    subcategory_df: pd.DataFrame,
    now: str
) -> pd.DataFrame:
    """
    Prepare the documents_topics table dataframe.

    Parameters
    ----------
    topic_results_df : pd.DataFrame
        Raw topic results dataframe
    documents_table : pd.DataFrame
        Processed documents table dataframe
    topics_table : pd.DataFrame
        Processed topics table dataframe
    subcategory_df : pd.DataFrame
        Raw subcategory dataframe
    now : str
        Current timestamp string

    Returns
    -------
    pd.DataFrame
        Processed documents_topics table dataframe
    """
    excluded_topics = subcategory_df['subcategory_name'].tolist()
    documents_topics_table = topic_results_df.query(
        "Topic not in @excluded_topics"
    ).merge(
        right=documents_table,
        left_on="Document URL",
        right_on="html_url",
        how="inner"
    ).merge(
        right=topics_table,
        left_on="Topic",
        right_on="topic_name",
        how="inner"
    ).rename(
        columns={
            "LLM Belongs": "llm_belongs",
            "LLM Relevance": "llm_score",
            "LLM Explanation": "llm_explanation",
            "Semantic Score": "semantic_score"
        }
    ).astype({
        "html_url": str,
        "topic_name": str,
        "llm_belongs": str,
        "llm_score": int,
        "llm_explanation": str,
        "semantic_score": np.float32
    }).sort_values(
        by=["html_url", "topic_name"]
    ).drop_duplicates(
        subset=["html_url", "topic_name", "llm_belongs"]
    ).assign(
        isPrimary=lambda x: True
    ).loc[:, ["html_url", "topic_name", "llm_belongs", "llm_score", "llm_explanation", "semantic_score", "isPrimary"]]
    documents_topics_table['last_updated'] = now
    return documents_topics_table

def prepare_dataframes(
    document_df: pd.DataFrame,
    mandate_df: pd.DataFrame,
    subcategory_df: pd.DataFrame,
    topic_df: pd.DataFrame,
    mandate_results_df: pd.DataFrame,
    topic_results_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Prepare dataframes for database ingestion.

    Parameters
    ----------
    document_df : pd.DataFrame
        DataFrame containing document information
    mandate_df : pd.DataFrame
        DataFrame containing mandate information
    subcategory_df : pd.DataFrame
        DataFrame containing subcategory information
    topic_df : pd.DataFrame
        DataFrame containing topic information
    mandate_results_df : pd.DataFrame
        DataFrame containing mandate categorization results
    topic_results_df : pd.DataFrame
        DataFrame containing topic categorization results

    Returns
    -------
    tuple
        Tuple of prepared dataframes for database ingestion
    """

    # Prepare each table
    documents_table = prepare_documents_table(document_df, CURRENT_DATETIME)
    mandates_table = prepare_mandates_table(mandate_df, CURRENT_DATETIME)
    subcategories_table = prepare_subcategories_table(subcategory_df, mandate_df, CURRENT_DATETIME)
    topics_table = prepare_topics_table(topic_df, subcategory_df, mandate_df, CURRENT_DATETIME)
    csas_events_table = prepare_csas_events_table(documents_table, CURRENT_DATETIME)
    documents_mandates_table = prepare_documents_mandates_table(
        mandate_results_df, documents_table, mandates_table, CURRENT_DATETIME
    )
    documents_topics_table = prepare_documents_topics_table(
        topic_results_df, documents_table, topics_table, subcategory_df, CURRENT_DATETIME
    )

    return (
        csas_events_table,
        documents_table,
        topics_table,
        mandates_table,
        subcategories_table,
        documents_mandates_table,
        documents_topics_table
    )

def main(dryrun: bool = False, debug: bool = False):
    
    print(f"Dryrun: {dryrun}, Debug: {debug}")
    # Get AWS credentials and parameters
    opensearch_host = aws.get_parameter_ssm(parameter_name=args['opensearch_host'], region_name=args['region_name'])
    rds_secret = aws.get_secret(args['rds_secret'])

    # Initialize OpenSearch client with fallback authentication
    client, auth = init_opensearch_client(
        host=opensearch_host,
        region=args['region_name'],
        secret_name=args['opensearch_secret']
    )

    # Connect to PostgreSQL
    conn_info = {
        "host": rds_secret['host'],
        "port": rds_secret['port'],
        "dbname": rds_secret['dbname'],
        "user": rds_secret['username'],
        "password": rds_secret['password']
    }

    # Test connection
    if not pgsql.test_connection(conn_info):
        print("Failed to connect to PostgreSQL")
        return
    print("Connected to PostgreSQL")

    # Create tables if they don't exist
    if not dryrun:
        try:
            pgsql.create_tables_if_not_exists(conn_info)
        except Exception as e:
            print(f"Error creating tables: {str(e)}")
            return

    # Define fields to fetch from OpenSearch
    document_fields = [
        'csas_event', 'csas_html_title', 'csas_html_year',
        'html_doc_type', 'html_language', 'html_page_title', 'html_url', 
        'html_year', 'html_language', 'page_content', 'pdf_url'
    ]

    # Fetch data from OpenSearch
    fetched_documents = fetch_specific_fields(client, DFO_HTML_FULL_INDEX_NAME, document_fields)
    
    # Convert to DataFrames
    document_df = pd.DataFrame(fetched_documents).drop_duplicates()
    
    # Read CSV files from S3
    s3_client = session.client('s3')
    bucket = args['bucket_name']
    
    # Read topics and mandates data
    try:
        # Read mandates
        topics_mandates_folder = f"batches/{args['batch_id']}/topics_mandates_data"
        response = s3_client.get_object(
            Bucket=bucket,
            Key=f"{topics_mandates_folder}/new_mandates.csv"
        )
        mandate_df = pd.read_csv(io.StringIO(response['Body'].read().decode('utf-8')), dtype=str)
        mandate_df = mandate_df.rename(columns={'name': 'mandate_name'})
        
        # Read subcategories
        response = s3_client.get_object(
            Bucket=bucket,
            Key=f"{topics_mandates_folder}/new_subcategories.csv"
        )
        subcategory_df = pd.read_csv(io.StringIO(response['Body'].read().decode('utf-8')), dtype=str)
        subcategory_df = subcategory_df.rename(columns={'name': 'subcategory_name'})
        
        # Read topics
        response = s3_client.get_object(
            Bucket=bucket,
            Key=f"{topics_mandates_folder}/new_topics.csv"
        )
        topic_df = pd.read_csv(io.StringIO(response['Body'].read().decode('utf-8')), dtype=str)
        topic_df = topic_df.rename(columns={'name': 'topic_name'})
        
        # Read mandate results
        # vector_llm_categorization results
        response = s3_client.get_object(
            Bucket=bucket,
            Key=f"batches/{args['batch_id']}/logs/vector_llm_categorization/{args['sm_method']}_combined_mandates_results.csv"
        )
        mandate_results_df = pd.read_csv(io.StringIO(response['Body'].read().decode('utf-8')))
        
        # Read topic results
        response = s3_client.get_object(
            Bucket=bucket,
            Key=f"batches/{args['batch_id']}/logs/vector_llm_categorization/{args['sm_method']}_combined_topics_results.csv"
        )
        topic_results_df = pd.read_csv(io.StringIO(response['Body'].read().decode('utf-8')))

    except Exception as e:
        print(f"Error reading CSV files from S3: {str(e)}")
        raise

    # Prepare dataframes for database ingestion
    (
        csas_events_table,
        documents_table,
        topics_table,
        mandates_table,
        subcategories_table,
        documents_mandates_table,
        documents_topics_table
    ) = prepare_dataframes(
        document_df,
        mandate_df,
        subcategory_df,
        topic_df,
        mandate_results_df,
        topic_results_df,
    )

    # Bulk insert into PostgreSQL
    if debug:
        os.makedirs("temp_outputs/sql_ingestion_output", exist_ok=True)
        documents_table.to_csv("temp_outputs/sql_ingestion_output/documents_table.csv", index=False)
        mandates_table.to_csv("temp_outputs/sql_ingestion_output/mandates_table.csv", index=False)
        subcategories_table.to_csv("temp_outputs/sql_ingestion_output/subcategories_table.csv", index=False)
        topics_table.to_csv("temp_outputs/sql_ingestion_output/topics_table.csv", index=False)
        documents_mandates_table.to_csv("temp_outputs/sql_ingestion_output/documents_mandates_table.csv", index=False)
        documents_topics_table.to_csv("temp_outputs/sql_ingestion_output/documents_topics_table.csv", index=False)
    if not dryrun:
        pgsql.bulk_upsert_csas_events(csas_events_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_documents(documents_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_mandates(mandates_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_subcategories(subcategories_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_topics(topics_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_documents_mandates(documents_mandates_table.values.tolist(), conn_info)
        pgsql.bulk_upsert_documents_topics(documents_topics_table.values.tolist(), conn_info)

if __name__ == "__main__":
    main(dryrun=False, debug=True) 