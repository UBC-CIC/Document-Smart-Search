import json
import logging
import psycopg2
import boto3
from typing import Any, Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# def get_secret(secret_name: str, secrets_manager_client=None, expect_json=True) -> Dict:
#     """
#     Fetch a secret from AWS Secrets Manager.
    
#     Parameters:
#     -----------
#     secret_name : str
#         The name/ARN of the secret to retrieve
#     secrets_manager_client : boto3.client, optional
#         The boto3 client for Secrets Manager
#     expect_json : bool, default=True
#         Whether to parse the secret as JSON
        
#     Returns:
#     --------
#     dict
#         The parsed secret value
#     """
#     if secrets_manager_client is None:
#         secrets_manager_client = boto3.client("secretsmanager")
        
#     try:
#         response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
#         return json.loads(response) if expect_json else response
#     except json.JSONDecodeError as e:
#         logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
#         raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
#     except Exception as e:
#         logger.error(f"Error fetching secret {secret_name}: {e}")
#         raise

# def get_rds_connection(rds_conn_info: Dict[str, Any]) -> psycopg2.extensions.connection:
#     """
#     Create a connection to the PostgreSQL database using credentials from Secrets Manager.
    
#     Parameters:
#     -----------
#     secret_name : str
#         The name/ARN of the secret containing database credentials
#     rds_endpoint : str
#         The endpoint URL for the RDS instance or proxy
#     secrets_manager_client : boto3.client, optional
#         The boto3 client for Secrets Manager
        
#     Returns:
#     --------
#     psycopg2.extensions.connection
#         An active database connection
#     """
#     try:
#         connection_string = " ".join([f"{key}={value}" for key, value in rds_conn_info.items()])
#         connection = psycopg2.connect(connection_string)
#         logger.info("Connected to the database!")
#         return connection
#     except Exception as e:
#         logger.error(f"Failed to connect to database: {e}")
#         raise

def execute_query(q: str, conn, verbose=False) -> Optional[List[Tuple]]:
    """
    Execute a SQL statement string using an existing connection.
    
    Parameters:
    -----------
    q : str
        SQL statement string
    conn : psycopg2.extensions.connection
        An existing database connection
    verbose : bool, default=False
        Whether to log query execution
        
    Returns:
    --------
    List of tuples or None
        Query results if SELECT, None otherwise
    """
    res = None
    if "select" in q.lower():
        with conn.cursor() as cur:
            cur.execute(q)
            res = cur.fetchall()
    else:
        with conn.cursor() as cur:
            cur.execute(q)
    if verbose:
        logger.info("Query executed!")
    return res
