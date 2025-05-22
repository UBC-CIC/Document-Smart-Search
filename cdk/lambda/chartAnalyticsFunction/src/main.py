import json
import boto3
import logging
from typing import Dict, List, Any
import psycopg
from datetime import datetime

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

def build_topic_chart_query(topics: List[str], start_date: str, end_date: str, language: str = "English") -> str:
    """Build SQL query to get document counts by year for topics."""
    # Parse dates to get years
    start_year = datetime.fromisoformat(start_date.replace('Z', '+00:00')).year
    end_year = datetime.fromisoformat(end_date.replace('Z', '+00:00')).year
    
    # Base query structure - creates rows for all years in range
    query = f"""
    WITH years AS (
        SELECT generate_series({start_year}, {end_year}) AS year
    ),
    """
    
    # For each topic, create a subquery that counts documents per year
    topic_subqueries = []
    for i, topic in enumerate(topics):
        topic_subquery = f"""
    topic_{i}_counts AS (
        SELECT d.year, COUNT(*) as count
        FROM documents d
        INNER JOIN documents_topics dt
        ON d.html_url = dt.html_url
        WHERE dt.topic_name = '{topic}' 
        AND d.doc_language = '{language}'
        AND d.year BETWEEN {start_year} AND {end_year}
        GROUP BY d.year
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

def build_mandate_chart_query(mandates: List[str], start_date: str, end_date: str, language: str = "English") -> str:
    """Build SQL query to get document counts by year for mandates."""
    # Parse dates to get years
    start_year = datetime.fromisoformat(start_date.replace('Z', '+00:00')).year
    end_year = datetime.fromisoformat(end_date.replace('Z', '+00:00')).year
    
    # Base query structure - creates rows for all years in range
    query = f"""
    WITH years AS (
        SELECT generate_series({start_year}, {end_year}) AS year
    ),
    """
    
    # For each mandate, create a subquery that counts documents per year
    mandate_subqueries = []
    for i, mandate in enumerate(mandates):
        mandate_subquery = f"""
    mandate_{i}_counts AS (
        SELECT d.year, COUNT(*) as count
        FROM documents d
        INNER JOIN documents_mandates dm
        ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate}' 
        AND d.doc_language = '{language}'
        AND d.year BETWEEN {start_year} AND {end_year}
        GROUP BY d.year
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

def get_topics_list(pgsql_conn, conn_info: Dict[str, Any], language: str = "English") -> List[Dict[str, str]]:
    """Get the list of available topics."""
    query = f"""
    SELECT DISTINCT topic_name 
    FROM documents_topics
    WHERE topic_name IS NOT NULL
    ORDER BY topic_name
    """
    
    results = pgsql_conn.execute_query(query, conn_info)
    return [{"label": row[0], "value": row[0]} for row in results]

def get_mandates_list(pgsql_conn, conn_info: Dict[str, Any], language: str = "English") -> List[Dict[str, str]]:
    """Get the list of available mandates."""
    query = f"""
    SELECT DISTINCT mandate_name 
    FROM documents_mandates
    WHERE mandate_name IS NOT NULL
    ORDER BY mandate_name
    """
    
    results = pgsql_conn.execute_query(query, conn_info)
    return [{"label": row[0], "value": row[0]} for row in results]

def get_chart_data(
    *, pgsql_conn, conn_info: Dict[str, Any],
    data_type: str, items: List[str],
    start_date: str, end_date: str,
    language: str = "English"
) -> List[Dict[str, Any]]:
    """
    Get chart data for topics or mandates over time.
    """
    logger.info(f"Getting chart data for {data_type}: {items}")
    
    if not items:
        return []
    
    # Build appropriate query based on data type
    if data_type == "topics":
        query = build_topic_chart_query(items, start_date, end_date, language)
    elif data_type == "mandates":
        query = build_mandate_chart_query(items, start_date, end_date, language)
    else:
        raise ValueError(f"Unknown data type: {data_type}")
    
    # Execute the query
    logger.debug(f"Executing chart query: {query}")
    results = pgsql_conn.execute_query(query, conn_info)
    
    # Convert query results to frontend chart format
    chart_data = []
    for row in results:
        data_point = {"year": row[0]}  # First column is year
        
        # Add counts for each topic/mandate
        for i, item in enumerate(items):
            data_point[item] = row[i + 1]  # Offset by 1 for the year column
            
        chart_data.append(data_point)
    
    return chart_data

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
        # Parse query string parameters
        query_params = event.get("queryStringParameters", {}) or {}
        # Parse body if present
        if event.get("body"):
            body = json.loads(event.get("body"))
        else:
            body = {}
        
        # Determine request type (topics or mandates)
        request_type = query_params.get("type", "topics")
        
        # For topics list or mandates list
        if request_type == "topics_list" or request_type == "mandates_list":
            language = body.get("language", "English")
            
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
            
            try:
                if request_type == "topics_list":
                    result = get_topics_list(pgsql_executor, rds_conn_info, language)
                else:  # mandates_list
                    result = get_mandates_list(pgsql_executor, rds_conn_info, language)
                
                return {
                    "statusCode": 200,
                    "body": json.dumps(result),
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                }
            finally:
                rds_conn.close()
        
        # For chart data requests
        start_date = query_params.get("startDate")
        end_date = query_params.get("endDate")
        items_param = query_params.get("topics" if request_type == "topics" else "mandates", "")
        items = items_param.split(",") if items_param else []
        language = body.get("language", "English")
        
        if not start_date or not end_date:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing date range parameters"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
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
        
        try:
            # Get chart data
            result = get_chart_data(
                pgsql_conn=pgsql_executor,
                conn_info=rds_conn_info,
                data_type=request_type,
                items=items,
                start_date=start_date,
                end_date=end_date,
                language=language
            )
            
            return {
                "statusCode": 200,
                "body": json.dumps(result),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        finally:
            rds_conn.close()
    
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