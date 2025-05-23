import json
import boto3
import logging
from typing import Dict, List, Any
import psycopg

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Hardcoded constants (for now)
REGION_NAME = "us-west-2"
RDS_SEC = "rds/dfo-db-glue-test"

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
def build_mandate_query(name: str, language: str = "English", exclude_doc_id: str = None, 
                        year_filters: List[str] = None, doc_type_filters: List[str] = None, 
                        limit: int = 50) -> str:
    """Build SQL query for documents related to a mandate."""
    
    # Start building the base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.year,
           d.event_year,
           d.event_subject,
           dm.semantic_score,
           dm.llm_score,
           dm.llm_explanation
    FROM documents d
    INNER JOIN documents_mandates dm
      ON d.html_url = dm.html_url
    WHERE dm.mandate_name = '{name}' AND d.doc_language = '{language}'
      AND dm.llm_belongs = 'Yes'
    """
    
    # Add exclude condition if provided - directly exclude by doc_id
    if exclude_doc_id:
        query += f"\n  AND d.doc_id != '{exclude_doc_id}'"
    
    # Add year filters if provided - using event_year from schema
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.event_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    # Add ordering and limit
    query += f"\nORDER BY dm.llm_score DESC\nLIMIT {limit}"
    
    return query

def build_dfo_topic_query(name: str, language: str = "English", exclude_doc_id: str = None,
                         year_filters: List[str] = None, doc_type_filters: List[str] = None,
                         limit: int = 50) -> str:
    """Build SQL query for documents related to a DFO topic."""
    
    # Base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.year,
           d.event_year,
           d.event_subject,
           dt.semantic_score,
           dt.llm_score,
           dt.llm_explanation
    FROM documents d
    INNER JOIN documents_topics dt
      ON d.html_url = dt.html_url
    WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
      AND dt.llm_belongs = 'Yes'
    """
    
    # Add exclude condition if provided - directly exclude by doc_id
    if exclude_doc_id:
        query += f"\n  AND d.doc_id != '{exclude_doc_id}'"
    
    # Add year filters if provided - using event_year from schema
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.event_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    # Add ordering and limit
    query += f"\nORDER BY dt.llm_score DESC\nLIMIT {limit}"
    
    return query

def build_derived_topic_query(name: str, language: str = "English", exclude_doc_id: str = None,
                             year_filters: List[str] = None, doc_type_filters: List[str] = None,
                             limit: int = 50) -> str:
    """Build SQL query for documents related to a derived topic."""
    
    # Base query - using the provided structure
    query = f"""
    SELECT d.doc_id,
           d.html_url,
           d.title,
           d.doc_type,
           d.year,
           d.event_year,
           d.event_subject,
           ddt.confidence_score AS semantic_score,
           NULL AS llm_score,
           NULL AS llm_explanation
    FROM documents d
    INNER JOIN documents_derived_topic ddt
      ON d.html_url = ddt.html_url
    WHERE ddt.topic_name = '{name}' AND d.doc_language = '{language}'
    """
    
    # Add exclude condition if provided - directly exclude by doc_id
    if exclude_doc_id:
        query += f"\n  AND d.doc_id != '{exclude_doc_id}'"
    
    # Add year filters if provided - using event_year from schema
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.event_year IN ('{years_str}')"
    
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
          AND dm.llm_belongs = 'Yes'
        """
    elif topic_type == "dfo_topic":
        # Base query for DFO topic count
        query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_topics dt
          ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{name}' AND d.doc_language = '{language}'
          AND dt.llm_belongs = 'Yes'
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
    
    # Add year filters if provided - using event_year from schema
    if year_filters and len(year_filters) > 0:
        years_str = "', '".join(year_filters)
        query += f"\n  AND d.event_year IN ('{years_str}')"
    
    # Add document type filters if provided
    if doc_type_filters and len(doc_type_filters) > 0:
        doc_types_str = "', '".join(doc_type_filters)
        query += f"\n  AND d.doc_type IN ('{doc_types_str}')"
    
    return query

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
    Get documents related to a topic or mandate.
    """
    logger.info(f"Getting related documents for {topic_type}: {topic_name}")
    
    # Build the appropriate query based on topic type - passing exclude_doc_id directly
    if topic_type == "mandate":
        query = build_mandate_query(
            topic_name, language, exclude_doc_id, year_filters, doc_type_filters, limit
        )
    elif topic_type == "dfo_topic":
        query = build_dfo_topic_query(
            topic_name, language, exclude_doc_id, year_filters, doc_type_filters, limit
        )
    elif topic_type == "derived_topic":
        query = build_derived_topic_query(
            topic_name, language, exclude_doc_id, year_filters, doc_type_filters, limit
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
    
    # Format documents based on the simplified query results
    documents = []
    for row in results:
        # Parse results based on the query structure
        if topic_type in ["mandate", "dfo_topic"]:
            doc_id, html_url, title, doc_type, year, event_year, event_subject, semantic_score, llm_score, llm_explanation = row
            
            doc = {
                "id": doc_id,
                "title": title,
                "documentType": doc_type,
                "year": year,
                "csasYear": event_year,
                "csasEvent": event_subject,
                "semanticScore": float(semantic_score) if semantic_score is not None else None,
            }
            
            # Add LLM score for mandate and DFO topics
            if llm_score is not None:
                doc["llmScore"] = float(llm_score) / 10.0  # Scale from 0-100 to 0-10
            
            # Add explanation if available
            if llm_explanation:
                doc["explanation"] = llm_explanation
                
        else:  # derived_topic
            doc_id, html_url, title, doc_type, year, event_year, event_subject, semantic_score, _, _ = row
            
            doc = {
                "id": doc_id,
                "title": title,
                "documentType": doc_type,
                "year": year,
                "csasYear": event_year,
                "csasEvent": event_subject,
                "semanticScore": float(semantic_score) if semantic_score is not None else None,
            }
        
        documents.append(doc)
    
    # Return the simplified results (no detailed metadata by type)
    return {
        "documents": documents,
        "totalCount": total_count
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
        # Parse body if present
        if event.get("body"):
            body = json.loads(event.get("body"))
        else:
            body = {}
        
        # Get parameters matching exactly the frontend API call format
        topic_name = body.get("name")
        topic_type = event.get("queryStringParameters", {}).get("type", "")
        
        # The rest should be in the body
        filters = body.get("filters", {})
        current_doc_id = body.get("currentDocID")
        language = body.get("language", "English")
        
        # Direct mapping of topic type to internal type without additional complexity
        if topic_type == "mandate":
            internal_topic_type = "mandate"
        elif topic_type == "dfo":
            internal_topic_type = "dfo_topic"
        elif topic_type == "derived":
            internal_topic_type = "derived_topic"
        else:
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
        
        # Extract specific filters - these are already arrays in the input format
        year_filters = filters.get("years", [])
        doc_type_filters = filters.get("documentTypes", [])
        
        # Set up database connection
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
        
        # Get related documents with hardcoded limit of 50
        result = get_related_documents(
            pgsql_conn=pgsql_executor,
            conn_info=rds_conn_info,
            topic_type=internal_topic_type,
            topic_name=topic_name,
            language=language,
            exclude_doc_id=current_doc_id,
            year_filters=year_filters,
            doc_type_filters=doc_type_filters,
            limit=50  # Hardcoded limit (For now, can be changed later)
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