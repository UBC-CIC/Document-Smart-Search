import os
import json
import boto3
from botocore.config import Config
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

REGION = os.environ["REGION"]
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(s3={"addressing_style": "virtual"}, region_name=REGION, signature_version="s3v4"),
)

BUCKET = os.environ["BUCKET"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

# AWS Clients
secrets_manager_client = boto3.client('secretsmanager')
# Global variables for caching
connection = None
db_secret = None

def get_secret():
    global db_secret
    if not db_secret:
        response = secrets_manager_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
        db_secret = json.loads(response)
    return db_secret

def connect_to_db():
    global connection
    if connection is None or connection.closed:
        try:
            secret = get_secret()
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': secret["port"]
            }
            connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
            connection = psycopg2.connect(connection_string)
            logger.info("Connected to the database!")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            if connection:
                connection.rollback()
                connection.close()
            raise
    return connection

def list_documents_in_s3_prefix(bucket, prefix):
    documents = []
    continuation_token = None

    while True:
        if continuation_token:
            result = s3.list_objects_v2(
                Bucket=bucket, 
                Prefix=prefix, 
                ContinuationToken=continuation_token
            )
        else:
            result = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

        if 'Contents' in result:
            for obj in result['Contents']:
                # With an empty prefix the original key is returned.
                documents.append(obj['Key'].replace(prefix, ''))
        if result.get('IsTruncated'):
            continuation_token = result.get('NextContinuationToken')
        else:
            break
    return documents

def generate_presigned_url(bucket, key):
    try:
        return s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=300,
            HttpMethod="GET",
        )
    except Exception as e:
        logger.exception(f"Error generating presigned URL for {key}: {e}")
        return None

def get_document_metadata_from_db(category_id, document_name, document_type):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return None
    try:
        cur = connection.cursor()
        query = """
            SELECT metadata 
            FROM "documents" 
            WHERE category_id = %s AND document_name = %s AND document_type = %s;
        """
        cur.execute(query, (category_id, document_name, document_type))
        result = cur.fetchone()
        cur.close()
        if result:
            return result[0]
        else:
            logger.warning(f"No metadata found for {document_name}.{document_type}.")
            return None
    except Exception as e:
        logger.error(f"Error retrieving metadata for {document_name}.{document_type}: {e}")
        if cur:
            cur.close()
        connection.rollback()
        return None

@logger.inject_lambda_context
def lambda_handler(event, context):
    try:
        # Instead of requiring a category from the query string, we list all objects
        prefix = ""  # empty prefix lists all objects in the bucket
        document_list = list_documents_in_s3_prefix(BUCKET, prefix)

        document_list_urls = {}
        for document_name in document_list:
            document_type = document_name.split('.')[-1]
            presigned_url = generate_presigned_url(BUCKET, document_name)
            # Using a constant 'default' or simply skip metadata if no longer applicable.
            metadata = get_document_metadata_from_db("default", document_name.split('.')[0], document_type)
            document_list_urls[document_name] = {
                "url": presigned_url,
                "metadata": metadata
            }

        logger.info("Presigned URLs and metadata generated successfully", extra={
            "document_files": document_list_urls,
        })

        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps({'document_files': document_list_urls})
        }
    except Exception as e:
        logger.exception(f"Error generating presigned URLs or retrieving metadata: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Internal server error')
        }
