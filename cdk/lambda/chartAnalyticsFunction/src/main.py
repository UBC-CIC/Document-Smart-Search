import json
import boto3
import logging
from typing import Dict, List
import psycopg

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Hardcoded constants
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

def execute_rds_query(rds_conn, q: str, verbose: bool = False):
    with rds_conn.cursor() as cursor:
        cursor.execute(q)
        if "select" in q.lower():
            return cursor.fetchall()
        if verbose:
            print("Query executed!")
        return None
    
def build_topic_chart_query(topics: List[str], from_year: int, to_year: int, doc_types: List[str] = None, language: str = "English") -> str:
    """Build SQL query to get document counts by year for topics."""
    
    # Base query structure - creates rows for all years in range
    query = f"""
    WITH years AS (
        SELECT generate_series({from_year}, {to_year}) AS year
    ),
    """
    
    # For each topic, create a subquery that counts documents per year
    topic_subqueries = []
    for i, topic in enumerate(topics):
        topic_subquery = f"""
    topic_{i}_counts AS (
        SELECT d.event_year as year, COUNT(*) as count
        FROM documents d
        INNER JOIN documents_topics dt
        ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{topic}' 
        AND d.doc_language = '{language}'
        AND d.event_year BETWEEN {from_year} AND {to_year}
        AND dt.llm_belongs = 'Yes'
        """
        
        # Add document type filter if provided
        if doc_types and len(doc_types) > 0:
            doc_types_quoted = [f"'{doc_type}'" for doc_type in doc_types]
            doc_types_str = ", ".join(doc_types_quoted)
            topic_subquery += f"AND d.doc_type IN ({doc_types_str})\n"
            
        topic_subquery += """
        GROUP BY d.event_year
    )"""
        topic_subqueries.append(topic_subquery)
    
    query += ",\n".join(topic_subqueries)
    
    # Main query that joins all the counts together
    query += """
    SELECT y.year"""
    
    for i, topic in enumerate(topics):
        query += f""",
        COALESCE(t{i}.count, 0) as "{topic}" """
    
    query += """
    FROM years y
    """
    
    # Left join each topic count to include years with zero counts
    for i in range(len(topics)):
        query += f"""
    LEFT JOIN topic_{i}_counts t{i} ON y.year = t{i}.year"""
    
    query += """
    ORDER BY y.year
    """
    
    return query

def build_mandate_chart_query(mandates: List[str], from_year: int, to_year: int, doc_types: List[str] = None, language: str = "English") -> str:
    """Build SQL query to get document counts by year for mandates."""
    
    # Base query structure - creates rows for all years in range
    query = f"""
    WITH years AS (
        SELECT generate_series({from_year}, {to_year}) AS year
    ),
    """
    
    # For each mandate, create a subquery that counts documents per year
    mandate_subqueries = []
    for i, mandate in enumerate(mandates):
        mandate_subquery = f"""
    mandate_{i}_counts AS (
        SELECT d.event_year as year, COUNT(*) as count
        FROM documents d
        INNER JOIN documents_mandates dm
        ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate}' 
        AND d.doc_language = '{language}'
        AND d.event_year BETWEEN {from_year} AND {to_year}
        AND dm.llm_belongs = 'Yes'
        """
        
        # Add document type filter if provided
        if doc_types and len(doc_types) > 0:
            doc_types_quoted = [f"'{doc_type}'" for doc_type in doc_types]
            doc_types_str = ", ".join(doc_types_quoted)
            mandate_subquery += f"AND d.doc_type IN ({doc_types_str})\n"
            
        mandate_subquery += """
        GROUP BY d.event_year
    )"""
        mandate_subqueries.append(mandate_subquery)
    
    query += ",\n".join(mandate_subqueries)
    
    # Main query that joins all the counts together
    query += """
    SELECT y.year"""
    
    for i, mandate in enumerate(mandates):
        query += f""",
        COALESCE(m{i}.count, 0) as "{mandate}" """
    
    query += """
    FROM years y
    """
    
    # Left join each mandate count to include years with zero counts
    for i in range(len(mandates)):
        query += f"""
    LEFT JOIN mandate_{i}_counts m{i} ON y.year = m{i}.year"""
    
    query += """
    ORDER BY y.year
    """
    
    return query

def build_derived_topic_chart_query(topics: List[str], from_year: int, to_year: int, doc_types: List[str] = None, language: str = "English") -> str:
    """Build SQL query to get document counts by year for derived topics."""
    
    # Base query structure - creates rows for all years in range
    query = f"""
    WITH years AS (
        SELECT generate_series({from_year}, {to_year}) AS year
    ),
    """
    
    # For each derived topic, create a subquery that counts documents per year
    topic_subqueries = []
    for i, topic in enumerate(topics):
        topic_subquery = f"""
    topic_{i}_counts AS (
        SELECT d.event_year as year, COUNT(*) as count
        FROM documents d
        INNER JOIN documents_derived_topic dt
        ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{topic}' 
        AND d.doc_language = '{language}'
        AND d.event_year BETWEEN {from_year} AND {to_year}
        """
        
        # Add document type filter if provided
        if doc_types and len(doc_types) > 0:
            doc_types_quoted = [f"'{doc_type}'" for doc_type in doc_types]
            doc_types_str = ", ".join(doc_types_quoted)
            topic_subquery += f"AND d.doc_type IN ({doc_types_str})\n"
            
        topic_subquery += """
        GROUP BY d.event_year
    )"""
        topic_subqueries.append(topic_subquery)
    
    query += ",\n".join(topic_subqueries)
    
    # Main query that joins all the counts together
    query += """
    SELECT y.year"""
    
    for i, topic in enumerate(topics):
        query += f""",
        COALESCE(t{i}.count, 0) as "{topic}" """
    
    query += """
    FROM years y
    """
    
    # Left join each topic count to include years with zero counts
    for i in range(len(topics)):
        query += f"""
    LEFT JOIN topic_{i}_counts t{i} ON y.year = t{i}.year"""
    
    query += """
    ORDER BY y.year
    """
    
    return query

def execute_chart_query(pgsql_conn, query):
    """Execute chart query and return results"""
    with pgsql_conn.cursor() as cursor:
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return results

def handler(event, context):
    try:
        # Parse query string parameters
        query_params = event.get("queryStringParameters", {}) or {}
        
        # Get date range parameters (required)
        from_year = query_params.get("fromYear")
        to_year = query_params.get("toYear")
        
        if not from_year or not to_year:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing year range parameters"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Convert years to integers
        try:
            from_year = int(from_year)
            to_year = int(to_year)
        except ValueError:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Year parameters must be integers"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Parse topics/mandates parameters
        topics = query_params.get("topics", "").split(",") if query_params.get("topics") else []
        mandates = query_params.get("mandates", "").split(",") if query_params.get("mandates") else []
        derived_topics = query_params.get("derived_topics", "").split(",") if query_params.get("derived_topics") else []
        
        # Parse document types
        doc_types = query_params.get("document_types", "").split(",") if query_params.get("document_types") else []
        
        # Check if we have either topics, derived_topics, or mandates
        if not topics and not mandates and not derived_topics:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Either topics, derived_topics, or mandates parameter must be provided"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Default language
        language = query_params.get("language", "English")
        
        # Connect to database
        rds_secret = get_secret(RDS_SEC)
        rds_conn_info = {
            "host": rds_secret['host'],
            "port": rds_secret['port'],
            "dbname": rds_secret['dbname'],
            "user": rds_secret['username'],
            "password": rds_secret['password']
        }
        
        # Connect to PostgreSQL
        try:
            with psycopg.connect(**rds_conn_info) as conn:
                # Build and execute appropriate query
                if topics:
                    query = build_topic_chart_query(topics, from_year, to_year, doc_types, language)
                    result = execute_chart_query(conn, query)
                elif derived_topics:
                    query = build_derived_topic_chart_query(derived_topics, from_year, to_year, doc_types, language)
                    result = execute_chart_query(conn, query)
                else:
                    query = build_mandate_chart_query(mandates, from_year, to_year, doc_types, language)
                    result = execute_chart_query(conn, query)
                
                return {
                    "statusCode": 200,
                    "body": json.dumps(result),
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                }
        except Exception as db_error:
            logger.error(f"Database error: {str(db_error)}")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": f"Database error: {str(db_error)}"}),
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