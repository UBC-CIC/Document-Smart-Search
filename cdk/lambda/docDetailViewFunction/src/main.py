from datetime import datetime
import json
import boto3
import logging
from typing import Dict, List, Any, Tuple
from opensearchpy import OpenSearch
import psycopg
import os

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()


OPENSEARCH_SEC = os.environ.get("OPENSEARCH_SEC")
OPENSEARCH_HOST = os.environ.get("OPENSEARCH_HOST")
REGION_NAME = os.environ.get("REGION")
INDEX_NAME = os.environ.get("INDEX_NAME")
EMBEDDING_MODEL_PARAM = os.environ.get("EMBEDDING_MODEL_PARAM")
RDS_SEC = os.environ.get("SM_DB_CREDENTIALS")

# Map of frontend filter names to OpenSearch field names
FILTER_FIELD_MAPPING = {
    "years": "csas_html_year",
    "topics": "topic_categorization", 
    "mandates": "mandate_categorization",
    "authors": "html_authors",
    "documentTypes": "html_doc_type",
}

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION_NAME)
ssm_client = boto3.client("ssm", region_name=REGION_NAME)

def get_parameter(param_name: str):
    """Get parameter from SSM parameter store with caching."""
    try:
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except Exception as e:
        logger.error(f"Error fetching parameter {param_name}: {e}")
        raise

def get_secret(secret_name: str) -> Dict:
    try:
        response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
        return json.loads(response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
        raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
    except Exception as e:
        logger.error(f"Error fetching secret {secret_name}: {e}")
        raise

def rename_result_fields(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Rename fields in search results to match frontend expectations."""
    field_mapping = {
        "csas_html_title": "title",
        "html_year": "year",
        "csas_html_year": "csasYear",
        "csas_event": "csasEvent",
        "html_doc_type": "documentType",
    }
    
    transformed_results = []
    for result in results:
        # Copy the result to avoid modifying the original
        transformed_result = result.copy()
        
        # Rename fields directly at the top level of the result
        for old_name, new_name in field_mapping.items():
            if old_name in transformed_result:
                transformed_result[new_name] = transformed_result.pop(old_name)
        
        transformed_results.append(transformed_result)
        
    return transformed_results

# Helper functions for document detail view
def _build_os_query_by_id(document_id: str) -> Dict[str, Any]:
    return {
        "size": 1,
        "_source": [
            "csas_html_title",
            "csas_event",
            "csas_html_year",
            "html_year",
            "html_doc_type",
            "pdf_url",
            "html_url",
            "html_subject",
            "html_language",
            "html_authors",
            "manually_verified"
        ],
        "query": {
            "ids": {
                "values": [document_id]
            }
        }
    }

# New function to fetch last_updated from PostgreSQL
def _fetch_last_updated(*, pgsql, conn_info: Dict[str, Any], doc_id: str) -> str:
    sql = f"""
    SELECT last_updated 
    FROM documents 
    WHERE doc_id = '{doc_id}'
    """
    
    results = pgsql.execute_query(sql, conn_info)
    if results and len(results) > 0 and results[0][0]:
        return results[0][0]
    return "N/A"

def _fetch_related_documents(
    *, pgsql, conn_info: Dict[str, Any], csas_event: str, csas_year: int, language: str, current_url: str
) -> List[Dict[str, str]]:
    sql = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.year
    FROM documents AS d
    JOIN csas_events AS e
      ON d.event_year   = e.event_year
     AND d.event_subject = e.event_subject
    WHERE e.event_year   = {csas_year}
      AND e.event_subject = '{csas_event}'
      AND d.doc_language  = '{language}'
      AND d.html_url     != '{current_url}'
    """
    
    results = pgsql.execute_query(sql, conn_info)
    return [{"doc_id": doc_id, "html_url": url, "title": title, "doc_type": doc_type, "year": year} 
            for doc_id, url, title, doc_type, year in results]

def _fetch_document_metadata(*, op_client, index_name: str, document_id: str) -> Dict[str, Any]:
    resp = op_client.search(index=index_name, body=_build_os_query_by_id(document_id))
    if resp["hits"]["hits"]:
        src = resp["hits"]["hits"][0]["_source"]
        return {
            "document_name": src["csas_html_title"],
            "csas_event_name": src["csas_event"],
            "csas_event_year": src["csas_html_year"],
            "publish_date": src["html_year"],
            "document_type": src["html_doc_type"],
            "html_url": src["html_url"],
            "pdf_url": src["pdf_url"],
            "html_language": src["html_language"],
            "document_subject": src.get("html_subject", ""),
            "manually_verified": src.get("manually_verified", False),
            "html_authors": src.get("html_authors", []),
        }
    return {"error": "Document not found in OpenSearch"}

def _classification_sql(url: str) -> str:
    return f"""
    SELECT *
    FROM (
        SELECT 'mandate' AS entity_type,
               m.mandate_name  AS entity_name,
               dm.semantic_score,
               dm.llm_score,
               dm.llm_explanation
        FROM documents_mandates dm
        JOIN mandates m ON dm.mandate_name = m.mandate_name
        WHERE dm.html_url = '{url}' AND dm.llm_belongs = 'Yes'

        UNION ALL

        SELECT 'dfo_topic',
               t.topic_name,
               dt.semantic_score,
               dt.llm_score,
               dt.llm_explanation
        FROM documents_topics dt
        JOIN topics t ON dt.topic_name = t.topic_name
        WHERE dt.html_url = '{url}' AND dt.llm_belongs = 'Yes'

        UNION ALL

        SELECT 'non_dfo_topic',
               ddt.topic_name,
               ddt.confidence_score,
               NULL::numeric,
               NULL::text
        FROM documents_derived_topic ddt
        WHERE ddt.html_url = '{url}'
    ) AS combined_results
    ORDER BY llm_score DESC;
    """

def _fetch_classifications(
    *, pgsql, conn_info: Dict[str, Any], url: str
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    rows = pgsql.execute_query(_classification_sql(url), conn_info)

    mandates, dfo_topics, non_dfo = [], [], []
    for entity_type, name, sem_score, llm_score, explain in rows:
        if entity_type == "mandate":
            mandates.append(
                {"name": name, "semanticScore": float(sem_score), "llmScore": float(llm_score) / 10.0, "explanation": explain}
            )
        elif entity_type == "dfo_topic":
            dfo_topics.append(
                {"name": name, "semanticScore": float(sem_score), "llmScore": float(llm_score) / 10.0, "explanation": explain}
            )
        else:  # non_dfo_topic (No need to divide by 10)
            non_dfo.append({"name": name, "semanticScore": float(sem_score)})
    return mandates, dfo_topics, non_dfo

def get_document_categorization(
    payload: dict,
    *,
    op_client,
    index_name: str,
    pgsql_conn,
    conn_info: Dict[str, Any],
) -> Dict[str, Any]:
    doc_id = payload.get("document_id", "").strip()
    base = _fetch_document_metadata(op_client=op_client, index_name=index_name, document_id=doc_id)

    if "error" in base:
        return base

    url = base["html_url"]
    
    # Fetch last_updated from PostgreSQL
    last_updated = _fetch_last_updated(
        pgsql=pgsql_conn, 
        conn_info=conn_info, 
        doc_id=doc_id
    )
    # Only convert last_updated to isoformat if it's a datetime object
    if isinstance(last_updated, datetime):
        base["last_updated"] = last_updated.isoformat()
    else:
        base["last_updated"] = last_updated
    
    mandates, dfo_topics, other_topics = _fetch_classifications(
        pgsql=pgsql_conn, conn_info=conn_info, url=url
    )

    related_docs = _fetch_related_documents(
        pgsql=pgsql_conn,
        conn_info=conn_info,
        csas_event=base["csas_event_name"],
        csas_year=base["csas_event_year"],
        language=base["html_language"],
        current_url=url
    )

    base.update(
        {
            "dfo_mandates": mandates,
            "dfo_topics": dfo_topics,
            "other_topics": other_topics,
            "related_documents": related_docs,
        }
    )
    return base

def format_document_for_frontend(doc_id: str, doc_data: Dict[str, Any]) -> Dict[str, Any]:
    """Format document data to match frontend expectations"""
    # Handle error case
    if "error" in doc_data:
        return {
            "id": "unknown",
            "title": "Document Not Found",
            "lastUpdated": "N/A",
            "verified": False,
            "type": "Unknown",
            "year": "N/A",
            "subject": "This document could not be found in our system",
            "csasEvent": "N/A",
            "csasYear": "N/A",
            "documentUrl": "#",
            "authors": [],
            "relatedMandates": [],
            "primaryTopics": [],
            "secondaryTopics": [],
            "relatedDocuments": []
        }
    
    # Format related documents
    related_documents = []
    for doc in doc_data.get("related_documents", []):
        related_documents.append({
            "id": doc["doc_id"],
            "title": doc["title"],
            "type": doc["doc_type"],
            "year": doc.get("year", "N/A"),  # Use each document's own year
            "csasEvent": doc_data.get("csas_event_name", "N/A"),
            "csasYear": doc_data.get("csas_event_year", "N/A"),
            "documentUrl": doc["html_url"],
        })
    
    # Format the result
    result = {
        "id": doc_id,
        "title": doc_data.get("document_name", "Untitled"),
        "lastUpdated": doc_data.get("last_updated", "N/A"),  # Use the last_updated field from the database
        "verified": doc_data.get("manually_verified", False),
        "type": doc_data.get("document_type", "Unknown"),
        "year": doc_data.get("publish_date", "N/A"),
        "subject": doc_data.get("document_subject", ""),
        "csasEvent": doc_data.get("csas_event_name", "N/A"),
        "csasYear": doc_data.get("csas_event_year", "N/A"),
        "htmlUrl": doc_data.get("html_url", "#"),
        "documentUrl": doc_data.get("pdf_url", "#"),
        "authors": doc_data.get("html_authors", []),
        "relatedMandates": doc_data.get("dfo_mandates", []),
        "primaryTopics": doc_data.get("dfo_topics", []),
        "secondaryTopics": doc_data.get("other_topics", []),
        "relatedDocuments": related_documents
    }
    
    return result

def handler(event, context):
    try:
        query_params = event.get("queryStringParameters", {}) or {}

        # Fetch the document ID from query parameters
        document_id = query_params.get("document_id", "")
        
        if not document_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing document ID"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Set up OpenSearch client
        secrets = get_secret(OPENSEARCH_SEC)
        opensearch_host = get_parameter(OPENSEARCH_HOST)
        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )
        
        # Set up RDS connection
        rds_secret = get_secret(RDS_SEC)
        rds_conn_info = {
            "host": rds_secret['host'],
            "port": rds_secret['port'],
            "dbname": rds_secret['dbname'],
            "user": rds_secret['username'],
            "password": rds_secret['password']
        }
        
        rds_conn = psycopg.connect(**rds_conn_info)
        
        # Create a simple Postgres query executor compatible with the helper functions
        class PgExecutor:
            def execute_query(self, sql, conn_info):
                with rds_conn.cursor() as cursor:
                    cursor.execute(sql)
                    return cursor.fetchall()
        
        pgsql_executor = PgExecutor()
        
        # Get document data
        doc_data = get_document_categorization(
            {"document_id": document_id},
            op_client=op_client,
            index_name=INDEX_NAME,
            pgsql_conn=pgsql_executor,
            conn_info=rds_conn_info
        )
        
        # Format data for frontend
        formatted_document = format_document_for_frontend(document_id, doc_data)
        
        # Return the formatted document
        return {
            "statusCode": 200,
            "body": json.dumps(formatted_document),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "trace": error_trace
            }),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }
    finally:
        # Close the RDS connection if it was opened
        if 'rds_conn' in locals():
            rds_conn.close()
        # Close the OpenSearch client if it was opened
        if 'op_client' in locals():
            op_client.close()