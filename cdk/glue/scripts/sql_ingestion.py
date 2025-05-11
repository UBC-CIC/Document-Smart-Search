import sys
import os
from typing import Dict, List, Iterable, Literal, Optional, Tuple
import pandas as pd
import numpy as np
from opensearchpy import OpenSearch
import psycopg
from datetime import datetime

sys.path.append("..")
import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql

# Constants that will be replaced with Glue context args, SSM params, or Secrets Manager
OPENSEARCH_SEC = "opensearch"
OPENSEARCH_HOST = "/dfo/opensearch/host"
REGION_NAME = "ca-central-1"
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"

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
    ]].rename(columns={
        'html_year': 'year',
        'html_page_title': 'title',
        'html_doc_type': 'doc_type',
        'html_language': 'doc_language',
        'csas_html_year': 'event_year',
        'csas_event': 'event_subject'
    }).astype({
        "html_url": "string",
        "year": "string",
        "title": "string",
        "doc_type": "string",
        "pdf_url": "string",
        "doc_language": "string",
        "event_year": "string",
        "event_subject": "string"
    }).map(lambda x: None if pd.isna(x) else x))

    documents_table['year'] = pd.to_numeric(documents_table['year'], errors='coerce').replace({np.nan: None})
    documents_table['event_year'] = pd.to_numeric(documents_table['event_year'], errors='coerce').replace({np.nan: None})
    documents_table = documents_table.replace(np.nan, None)
    documents_table['last_updated'] = now

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
    mandates_table = mandate_df[["mandate_name"]]
    mandates_table['last_updated'] = now
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
    ).loc[:, ['subcategory_name', 'mandate_name']]
    subcategories_table['last_updated'] = now
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
    topics_table = topic_df.loc[:, ['tag', 'topic_name', 'parent']]
    topics_table["mandate_tag"] = topics_table["parent"].str.extract(r"^(\d+)")
    topics_table["subcategory_tag"] = topics_table["parent"].where(topics_table["parent"].str.contains(r"\d+\.\d+"), None)
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
    ).loc[:, ['topic_name', 'subcategory_name', 'mandate_name']].replace(np.nan, None)
    topics_table['isDFO'] = True
    topics_table['last_updated'] = now
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
    csas_events_table = documents_table[['event_year', 'event_subject']].drop_duplicates()
    csas_events_table['last_updated'] = now
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
        left_on="URL",
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
        left_on="URL",
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
    topic_results_df: pd.DataFrame
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
    now = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")

    # Prepare each table
    documents_table = prepare_documents_table(document_df, now)
    mandates_table = prepare_mandates_table(mandate_df, now)
    subcategories_table = prepare_subcategories_table(subcategory_df, mandate_df, now)
    topics_table = prepare_topics_table(topic_df, subcategory_df, mandate_df, now)
    csas_events_table = prepare_csas_events_table(documents_table, now)
    documents_mandates_table = prepare_documents_mandates_table(
        mandate_results_df, documents_table, mandates_table, now
    )
    documents_topics_table = prepare_documents_topics_table(
        topic_results_df, documents_table, topics_table, subcategory_df, now
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

def main():
    # Get AWS credentials and parameters
    secrets = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)
    opensearch_host = aws.get_parameter_ssm(parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME)
    rds_hosturl = aws.get_parameter_ssm('/dfo/rds/host_url')
    rds_secret = aws.get_secret(aws.get_parameter_ssm("/dfo/rds/secretname"))

    # Connect to OpenSearch
    auth = (secrets['username'], secrets['password'])
    op_client = OpenSearch(
        hosts=[{'host': opensearch_host, 'port': 443}],
        http_compress=True,
        http_auth=auth,
        use_ssl=True,
        verify_certs=True
    )

    # Connect to PostgreSQL
    conn_info = {
        "host": rds_hosturl,
        "port": 5432,
        "dbname": "postgres",
        "user": rds_secret['username'],
        "password": rds_secret['password']
    }

    # Define fields to fetch from OpenSearch
    document_fields = [
        'csas_event', 'csas_html_title', 'csas_html_year',
        'html_doc_type', 'html_language', 'html_page_title', 'html_url', 
        'html_year', 'html_language', 'page_content', 'pdf_url'
    ]

    # Fetch data from OpenSearch
    fetched_documents = fetch_specific_fields(op_client, DFO_HTML_FULL_INDEX_NAME, document_fields)
    
    # Convert to DataFrames
    document_df = pd.DataFrame(fetched_documents).drop_duplicates()
    mandate_df = pd.read_csv("../export/new_mandates.csv", dtype=str)
    subcategory_df = pd.read_csv("../export/new_subcategories.csv", dtype=str)
    topic_df = pd.read_csv("../export/new_topics.csv", dtype=str)
    mandate_results_df = pd.read_csv("../export/categorization/combined_mandates_results.csv")
    topic_results_df = pd.read_csv("../export/categorization/combined_topics_results.csv")

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
        topic_results_df
    )

    # Bulk insert into PostgreSQL
    pgsql.bulk_upsert_csas_events(csas_events_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_documents(documents_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_mandates(mandates_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_subcategories(subcategories_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_topics(topics_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_documents_mandates(documents_mandates_table.values.tolist(), conn_info)
    pgsql.bulk_upsert_documents_topics(documents_topics_table.values.tolist(), conn_info)

if __name__ == "__main__":
    main() 