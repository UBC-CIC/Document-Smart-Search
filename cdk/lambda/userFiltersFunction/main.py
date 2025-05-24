import json
from typing import Dict
import boto3
import logging
from opensearchpy import OpenSearch
import psycopg

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Environment variables
# Hardcoded constants (for now)
OPENSEARCH_SEC = "opensearch-masteruser-test-glue"
OPENSEARCH_HOST = "opensearch-host-test-glue"
RDS_SEC = "rds/dfo-db-glue-test"
REGION_NAME = "us-west-2"

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

def handler(event, context):
    try:
        # Check for specific requested filters
        requested_filters = []
        
        # Parse requested filters from query parameters if present
        query_params = event.get("queryStringParameters", {}) or {}
        if query_params and "filters" in query_params:
            requested_filters = query_params["filters"].split(",")
            # Validate and sanitize requested filters
            allowed_filters = ["years", "topics", "mandates", "authors", "document_types", "derived_topics"]
            requested_filters = [f for f in requested_filters if f in allowed_filters]

        # If no valid filters requested, return all
        if not requested_filters:
            requested_filters = ["years", "topics", "mandates", "authors", "document_types", "derived_topics"]
        
        # Initialize empty results dictionary
        filters = {}

        secrets = get_secret(OPENSEARCH_SEC)
        opensearch_host = get_parameter(OPENSEARCH_HOST)
        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )

        rds_secret = get_secret(RDS_SEC)
        rds_conn_info = {
            "host": rds_secret['host'],
            "port": rds_secret['port'],
            "dbname": rds_secret['dbname'],
            "user": rds_secret['username'],
            "password": rds_secret['password']
        }

        rds_conn = psycopg.connect(**rds_conn_info)

        # Fetch filter values from RDS and OpenSearch
        for f in requested_filters:
            if f == "years":
                # Fetch years from RDS
                try:
                    sql = """
                    SELECT DISTINCT event_year
                    FROM csas_events
                    """
                    results = execute_rds_query(rds_conn, sql)
                    filters["years"] = [str(x[0]) for x in results if x[0] is not None]
                except Exception as e:
                    logger.error(f"Error querying RDS for years: {str(e)}")
                    filters["years"] = []  # Empty list fallback on error
                
            elif f == "topics":
                # Fetch topics from RDS
                try:
                    sql = """
                    SELECT topic_name
                    FROM topics
                    """
                    results = execute_rds_query(rds_conn, sql)
                    filters["topics"] = [x[0] for x in results if x[0] is not None]
                except Exception as e:
                    logger.error(f"Error querying RDS for topics: {str(e)}")
                    filters["topics"] = []  # Empty list fallback on error
                
            elif f == "derived_topics":
                # Fetch derived topics from RDS
                try:
                    sql = """
                    SELECT topic_name
                    FROM derived_topics
                    """
                    results = execute_rds_query(rds_conn, sql)
                    filters["derivedTopics"] = [x[0] for x in results if x[0] is not None]
                except Exception as e:
                    logger.error(f"Error querying RDS for derived topics: {str(e)}")
                    filters["derivedTopics"] = []  # Empty list fallback on error
                
            elif f == "mandates":
                # Fetch mandates from RDS
                try:
                    sql = """
                    SELECT mandate_name
                    FROM mandates
                    """
                    results = execute_rds_query(rds_conn, sql)
                    filters["mandates"] = [x[0] for x in results if x[0] is not None]
                except Exception as e:
                    logger.error(f"Error querying RDS for mandates: {str(e)}")
                    filters["mandates"] = []  # Empty list fallback on error
                
            # elif f == "document_types":
            #     # Fetch document types from RDS
            #     try:
            #         sql = """
            #         SELECT DISTINCT doc_type
            #         FROM documents
            #         """
            #         results = execute_rds_query(rds_conn, sql)
            #         filters["documentTypes"] = [x[0] for x in results if x[0] is not None]
            #     except Exception as e:
            #         logger.error(f"Error querying RDS for document types: {str(e)}")
            #         filters["documentTypes"] = []  # Empty list fallback on error
                
            elif f == "document_types":
                # Fetch document types from RDS
                try:
                    sql = """
                    SELECT DISTINCT doc_type
                    FROM documents
                    """
                    results = execute_rds_query(rds_conn, sql)
                    doc_types = [x[0] for x in results if x[0] is not None]
                    
                    # Sort "Unknown" to be last in the list
                    if "Unknown" in doc_types:
                        doc_types.remove("Unknown")
                        doc_types.sort()  # Sort remaining document types
                        doc_types.append("Unknown")  # Add Unknown at the end
                    else:
                        doc_types.sort()
                        
                    filters["documentTypes"] = doc_types
                except Exception as e:
                    logger.error(f"Error querying RDS for document types: {str(e)}")
                    filters["documentTypes"] = []  # Empty list fallback on error

            elif f == "authors":
                # Fetch authors from OpenSearch using aggregation
                # Note: No longer used in the frontend so not implemented
                filters["authors"] = []
                # authors_query = {
                #     "size": 0,
                #     "aggs": {
                #         "author_terms": {
                #             "terms": {
                #                 "field": "html_authors.keyword",
                #                 "size": 1000
                #             }
                #         }
                #     }
                # }
                
                # try:
                #     response = op_client.search(index="dfo-html-full-index", body=authors_query)
                #     filters["authors"] = [bucket['key'] for bucket in response['aggregations']['author_terms']['buckets']]
                # except Exception as e:
                #     logger.error(f"Error querying OpenSearch for authors: {str(e)}")
                #     filters["authors"] = []  # Empty list if an error occurs
        
        # Sort years in descending order if present
        if "years" in filters:
            filters["years"] = sorted(filters["years"], reverse=True)

        return {
            "statusCode": 200,
            "body": json.dumps(filters),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            }
        }

    except Exception as e:
        logger.error(f"Error processing request: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(f'Error processing request: {str(e)}')
        }
    finally:
        # Close the RDS connection if it was opened
        if 'rds_conn' in locals():
            rds_conn.close()
        # Close the OpenSearch client if it was opened
        if 'op_client' in locals():
            op_client.close()