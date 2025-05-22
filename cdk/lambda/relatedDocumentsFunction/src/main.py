import json
import boto3
import logging
from typing import Dict, List, Any, Tuple
from opensearchpy import OpenSearch
import psycopg

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Hardcoded constants (for now)
OPENSEARCH_SEC = "opensearch-masteruser-test-glue"
OPENSEARCH_HOST = "opensearch-host-test-glue"
REGION_NAME = "us-west-2"
INDEX_NAME = "dfo-html-full-index"
EMBEDDING_MODEL_PARAM = "amazon.titan-embed-text-v2:0"
RDS_SEC = "rds/dfo-db-glue-test"

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

# Query builders for different topic types
def build_mandate_query(name: str, language: str = "English", exclude_urls: List[str] = None, 
                        year_filters: List[str] = None, doc_type_filters: List[str] = None, 
                        limit: int = 50) -> str:
    """Build SQL query for documents related to a mandate."""
    
    # Start building the base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.html_year,
           dm.semantic_score,
           dm.llm_score,
           dm.llm_explanation
    FROM documents d
    INNER JOIN documents_mandates dm
      ON d.html_url = dm.html_url
    WHERE dm.mandate_name = '{name}' AND d.doc_language = '{language}'
      AND dm.llm_score >= 4
    """
    
    # Add exclude condition if provided
    if exclude_urls and len(exclude_urls) > 0:
        urls_str = "', '".join(exclude_urls)
        query += f"\n  AND d.html_url NOT IN ('{urls_str}')"
    
    # Add year filters if provided
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.html_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    # Add ordering and limit
    query += f"\nORDER BY dm.llm_score DESC\nLIMIT {limit}"
    
    return query

def build_dfo_topic_query(name: str, language: str = "English", exclude_urls: List[str] = None,
                         year_filters: List[str] = None, doc_type_filters: List[str] = None,
                         limit: int = 50) -> str:
    """Build SQL query for documents related to a DFO topic."""
    
    # Base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.html_year,
           dt.semantic_score,
           dt.llm_score,
           dt.llm_explanation
    FROM documents d
    INNER JOIN documents_topics dt
      ON d.html_url = dt.html_url
    WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
      AND dt.llm_score >= 4
    """
    
    # Add exclude condition if provided
    if exclude_urls and len(exclude_urls) > 0:
        urls_str = "', '".join(exclude_urls)
        query += f"\n  AND d.html_url NOT IN ('{urls_str}')"
    
    # Add year filters if provided
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.html_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    # Add ordering and limit
    query += f"\nORDER BY dt.llm_score DESC\nLIMIT {limit}"
    
    return query

def build_derived_topic_query(name: str, language: str = "English", exclude_urls: List[str] = None,
                             year_filters: List[str] = None, doc_type_filters: List[str] = None,
                             limit: int = 50) -> str:
    """Build SQL query for documents related to a derived topic."""
    
    # Base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.html_year,
           ddt.confidence_score AS semantic_score,
           NULL AS llm_score,
           NULL AS llm_explanation
    FROM documents d
    INNER JOIN documents_derived_topic ddt
      ON d.html_url = ddt.html_url
    WHERE ddt.topic_name = '{name}' AND d.doc_language = '{language}'
    """
    
    # Add exclude condition if provided
    if exclude_urls and len(exclude_urls) > 0:
        urls_str = "', '".join(exclude_urls)
        query += f"\n  AND d.html_url NOT IN ('{urls_str}')"
    
    # Add year filters if provided
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.html_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    # Add ordering and limit
    query += f"\nORDER BY ddt.confidence_score DESC\nLIMIT {limit}"
    
    return query

def build_count_query(topic_type: str, name: str, language: str = "English", 
                     year_filters: List[str] = None, doc_type_filters: List[str] = None) -> str:
    """Build a query to count total matching documents."""
    
    if topic_type == "mandate":
        # Base query for mandate count
        query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{name}' AND d.doc_language = '{language}'
          AND dm.llm_score >= 4
        """
    elif topic_type == "dfo_topic":
        # Base query for DFO topic count
        query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_topics dt
          ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
          AND dt.llm_score >= 4
        """
    elif topic_type == "derived_topic":
        # Base query for derived topic count
        query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{name}' AND d.doc_language = '{language}'
        """
    else:
        raise ValueError(f"Unknown topic type: {topic_type}")
    
    # Add year filters if provided
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.html_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    return query

def build_metadata_query(topic_type: str, name: str, language: str = "English") -> Dict[str, str]:
    """Build queries to get metadata about document distribution."""
    
    metadata_queries = {}
    
    # By document type
    if topic_type == "mandate":
        metadata_queries["by_type"] = f"""
        SELECT d.doc_type, COUNT(*)
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{name}' AND d.doc_language = '{language}'
          AND dm.llm_score >= 4
        GROUP BY d.doc_type
        ORDER BY COUNT(*) DESC
        """
        
        metadata_queries["by_year"] = f"""
        SELECT d.html_year, COUNT(*)
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{name}' AND d.doc_language = '{language}'
          AND dm.llm_score >= 4
        GROUP BY d.html_year
        ORDER BY d.html_year DESC
        """
    elif topic_type == "dfo_topic":
        metadata_queries["by_type"] = f"""
        SELECT d.doc_type, COUNT(*)
        FROM documents d
        INNER JOIN documents_topics dt
          ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
          AND dt.llm_score >= 4
        GROUP BY d.doc_type
        ORDER BY COUNT(*) DESC
        """
        
        metadata_queries["by_year"] = f"""
        SELECT d.html_year, COUNT(*)
        FROM documents d
        INNER JOIN documents_topics dt
          ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
          AND dt.llm_score >= 4
        GROUP BY d.html_year
        ORDER BY d.html_year DESC
        """
    else:  # derived_topic
        metadata_queries["by_type"] = f"""
        SELECT d.doc_type, COUNT(*)
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{name}' AND d.doc_language = '{language}'
        GROUP BY d.doc_type
        ORDER BY COUNT(*) DESC
        """
        
        metadata_queries["by_year"] = f"""
        SELECT d.html_year, COUNT(*)
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{name}' AND d.doc_language = '{language}'
        GROUP BY d.html_year
        ORDER BY d.html_year DESC
        """
    
    return metadata_queries

def get_related_documents(
    *, pgsql_conn, conn_info: Dict[str, Any], 
    topic_type: str, topic_name: str, 
    language: str = "English",
    exclude_doc_id: str = None,
    year_filters: List[str] = None,
    doc_type_filters: List[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get documents related to a topic or mandate, with additional metadata.
    """
    logger.info(f"Getting related documents for {topic_type}: {topic_name}")
    
    # If we have a document ID to exclude, first get its URL
    exclude_urls = []
    if exclude_doc_id:
        doc_url_query = f"""
        SELECT html_url FROM documents WHERE doc_id = '{exclude_doc_id}'
        """
        doc_url_result = pgsql_conn.execute_query(doc_url_query, conn_info)
        if doc_url_result and len(doc_url_result) > 0:
            exclude_urls = [doc_url_result[0][0]]
    
    # Build the appropriate query based on topic type
    if topic_type == "mandate":
        query = build_mandate_query(
            topic_name, language, exclude_urls, year_filters, doc_type_filters, limit
        )
    elif topic_type == "dfo_topic":
        query = build_dfo_topic_query(
            topic_name, language, exclude_urls, year_filters, doc_type_filters, limit
        )
    elif topic_type == "derived_topic":
        query = build_derived_topic_query(
            topic_name, language, exclude_urls, year_filters, doc_type_filters, limit
        )
    else:
        raise ValueError(f"Unknown topic type: {topic_type}")
    
    # Execute the query
    logger.debug(f"Executing query: {query}")
    results = pgsql_conn.execute_query(query, conn_info)
    
    # Get total count of matching documents
    count_query = build_count_query(
        topic_type, topic_name, language, year_filters, doc_type_filters
    )
    count_result = pgsql_conn.execute_query(count_query, conn_info)
    total_count = count_result[0][0] if count_result else 0
    
    # Get metadata
    metadata_queries = build_metadata_query(topic_type, topic_name, language)
    
    by_type_results = pgsql_conn.execute_query(metadata_queries["by_type"], conn_info)
    by_year_results = pgsql_conn.execute_query(metadata_queries["by_year"], conn_info)
    
    # Format metadata
    documents_by_type = {doc_type: count for doc_type, count in by_type_results}
    documents_by_year = {str(year): count for year, count in by_year_results}
    
    # Format documents based on the simplified query results
    documents = []
    for row in results:
        # Parse results based on the query structure
        if topic_type in ["mandate", "dfo_topic"]:
            doc_id, html_url, title, doc_type, year, semantic_score, llm_score, llm_explanation = row
            
            doc = {
                "id": doc_id,
                "title": title,
                "documentType": doc_type,
                "year": year,
                "semanticScore": float(semantic_score) if semantic_score is not None else None,
            }
            
            # Add LLM score for mandate and DFO topics
            if llm_score is not None:
                doc["llmScore"] = float(llm_score) / 10.0  # Scale from 0-100 to 0-10
            
            # Add explanation if available
            if llm_explanation:
                doc["explanation"] = llm_explanation
                
        else:  # derived_topic
            doc_id, html_url, title, doc_type, year, semantic_score, _, _ = row
            
            doc = {
                "id": doc_id,
                "title": title,
                "documentType": doc_type,
                "year": year,
                "semanticScore": float(semantic_score) if semantic_score is not None else None,
            }
        
        documents.append(doc)
    
    # Return the results
    return {
        "documents": documents,
        "totalCount": total_count,
        "metadata": {
            "totalDocuments": total_count,
            "documentsByType": documents_by_type,
            "documentsByYear": documents_by_year
        }
    }

class PgExecutor:
    """A simple class to execute PostgreSQL queries with a connection."""
    
    def __init__(self, conn):
        self.conn = conn
        
    def execute_query(self, sql, conn_info):
        with self.conn.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchall()

def handler(event, context):
    try:
        # First check query string parameters (for GET requests)
        query_params = event.get("queryStringParameters", {}) or {}
        
        # Get parameters from query string if present
        topic_name = query_params.get("name")
        topic_type = query_params.get("type", "").lower()
        current_doc_id = query_params.get("currentDocID")
        
        # If not in query parameters, try to get from body (for POST requests)
        if not topic_name and event.get("body"):
            body = json.loads(event.get("body"))
            topic_name = body.get("name")
            topic_type = (body.get("type", "") or "").lower()
            filters = body.get("filters", {})
            current_doc_id = body.get("currentDocID")
            limit = body.get("limit", 50)
            language = body.get("language", "English")
        else:
            # Handle filter parameters from query string
            filters = {}
            if "years" in query_params:
                filters["years"] = query_params["years"].split(",") if query_params.get("years") else []
            if "documentTypes" in query_params:
                filters["documentTypes"] = query_params["documentTypes"].split(",") if query_params.get("documentTypes") else []
            limit = int(query_params.get("limit", 50))
            language = query_params.get("language", "English")
        
        # Map API parameter type to internal type
        type_mapping = {
            "mandate": "mandate",
            "dfo": "dfo_topic",
            "derived": "derived_topic",
            "dfo_topic": "dfo_topic", 
            "derived_topic": "derived_topic"
        }
        
        # Validate and map the topic type
        internal_topic_type = type_mapping.get(topic_type)
        if not internal_topic_type:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Invalid topic type: {topic_type}. Expected one of: mandate, dfo, derived"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        if not topic_name:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing topic name parameter"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Extract specific filters
        year_filters = filters.get("years", [])
        doc_type_filters = filters.get("documentTypes", [])
        
        # Set up API clients
        secrets = get_secret(OPENSEARCH_SEC)
        opensearch_host = get_parameter(OPENSEARCH_HOST)
        
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
        pgsql_executor = PgExecutor(rds_conn)
        
        # Get related documents
        result = get_related_documents(
            pgsql_conn=pgsql_executor,
            conn_info=rds_conn_info,
            topic_type=internal_topic_type,
            topic_name=topic_name,
            language=language,
            exclude_doc_id=current_doc_id,
            year_filters=year_filters,
            doc_type_filters=doc_type_filters,
            limit=limit
        )
        
        # Return the formatted response
        return {
            "statusCode": 200,
            "body": json.dumps(result),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }
        
    except ValueError as ve:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(ve)}),
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