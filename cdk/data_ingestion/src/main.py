import os
import json
import boto3
import psycopg2
from datetime import datetime, timezone
import logging

from helpers.vectorstore import update_vectorstore
from langchain_aws import BedrockEmbeddings


# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
REGION = os.environ["REGION"]
DFO_DATA_INGESTION_BUCKET = os.environ["BUCKET"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

EMBEDDING_BUCKET_NAME = os.environ["EMBEDDING_BUCKET_NAME"]
EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
# AWS Clients
secrets_manager_client = boto3.client("secretsmanager")
ssm_client = boto3.client("ssm")
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)
# Cached resources
connection = None
db_secret = None
EMBEDDING_MODEL_ID = None

def get_parameter():
    """
    Fetch a parameter value from Systems Manager Parameter Store.
    """
    global EMBEDDING_MODEL_ID
    if EMBEDDING_MODEL_ID is None:
        try:
            response = ssm_client.get_parameter(Name=EMBEDDING_MODEL_PARAM, WithDecryption=True)
            EMBEDDING_MODEL_ID = response["Parameter"]["Value"]
        except Exception as e:
            logger.error(f"Error fetching parameter {EMBEDDING_MODEL_PARAM}: {e}")
            raise
    return EMBEDDING_MODEL_ID



def get_secret():
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
            db_secret = json.loads(response)
        except Exception as e:
            logger.error(f"Error fetching secret {DB_SECRET_NAME}: {e}")
            raise
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

def parse_s3_file_path(document_key):
    # Assuming the file path is of the format: {category_id}/{document_name}.{document_type}
    try:
        category_id, documentname_with_ext = document_key.split('/')
        document_name, document_type = documentname_with_ext.rsplit('.', 1)  # Split on the last period
        return category_id, document_name, document_type
    except Exception as e:
        logger.error(f"Error parsing S3 document path: {e}")
        return {
                    "statusCode": 400,
                    "body": json.dumps("Error parsing S3 document path.")
                }

def insert_file_into_db(category_id, document_name, document_type, document_s3_file_path):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    
    try:
        cur = connection.cursor()

        # Check if a record already exists
        select_query = """
        SELECT * FROM "documents"
        WHERE category_id = %s
        AND document_name = %s
        AND document_type = %s;
        """
        cur.execute(select_query, (category_id, document_name, document_type))

        existing_document = cur.fetchone()

        if existing_document:
            # Update the existing record
            update_query = """
                UPDATE "documents"
                SET document_s3_file_path = %s,
                time_created = %s
                WHERE category_id = %s
                AND document_name = %s
                AND document_type = %s;
            """
            timestamp = datetime.now(timezone.utc)
            cur.execute(update_query, (
                document_s3_file_path,  # filepath
                timestamp,  # time_uploaded
                category_id,  # module_id
                document_name,  # filename
                document_type  # filetype
            ))
            logger.info(f"Successfully updated file {document_name}.{document_type} in database for module {category_id}.")
        else:
            # Insert a new record
            insert_query = """
                INSERT INTO "documents" 
                (category_id, document_s3_file_path, document_name, document_type, metadata, time_created)
                VALUES (%s, %s, %s, %s, %s, %s);
            """
            timestamp = datetime.now(timezone.utc)
            cur.execute(insert_query, (
                category_id,  # module_id
                document_s3_file_path,
                document_name,  # filename
                document_type, # filetype
                "",
                timestamp

        ))
        logger.info(f"Successfully inserted document {document_name}.{document_type} into database for module {category_id}.")

        connection.commit()
        cur.close()
        
    except Exception as e:
        if cur:
            cur.close()
        connection.rollback()
        logger.error(f"Error inserting document {document_name}.{document_type} into database: {e}")
        raise

def update_vectorstore_from_s3(bucket, category_id):
    # bucket = "DFO-data-ingestion-bucket"
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION
    )
    
    embeddings = BedrockEmbeddings(
        model_id=get_parameter(), 
        client=bedrock_runtime,
        region_name=REGION
    )
    
    secret = get_secret()

    vectorstore_config_dict = {
        'collection_name': "all",
        'dbname': secret["dbname"],
        'user': secret["username"],
        'password': secret["password"],
        'host': RDS_PROXY_ENDPOINT,
        'port': secret["port"]
    }

    try:
        update_vectorstore(
            bucket=bucket,
            category_id=category_id,
            vectorstore_config_dict=vectorstore_config_dict,
            embeddings=embeddings
        )
    except Exception as e:
        logger.error(f"Error updating vectorstore for course {category_id}: {e}")
        raise

def handler(event, context):
    records = event.get('Records', [])
    if not records:
        return {
            "statusCode": 400,
            "body": json.dumps("No valid S3 event found.")
        }

    for record in records:
        event_name = record['eventName']
        bucket_name = record['s3']['bucket']['name']

        # Only process files from the DFO_DATA_INGESTION_BUCKET
        if bucket_name != DFO_DATA_INGESTION_BUCKET:
            print(f"Ignoring event from non-target bucket: {bucket_name}")
            continue  # Ignore this event and move to the next one
        document_key = record['s3']['object']['key']


        # Parse the file path
        category_id, document_name, document_type = parse_s3_file_path(document_key)
        if not category_id or not document_name or not document_type:
            return {
                    "statusCode": 400,
                    "body": json.dumps("Error parsing S3 file path.")
            }

        if event_name.startswith('ObjectCreated:'):
            # Insert the file into the PostgreSQL database
            try:
                insert_file_into_db(
                    category_id=category_id,
                    document_name=document_name,
                    document_type=document_type,
                    document_s3_file_path=document_key
                )
                logger.info(f"File {document_name}.{document_type} inserted successfully.")
            except Exception as e:
                logger.error(f"Error inserting file {document_name}.{document_type} into database: {e}")
                return {
                    "statusCode": 500,
                    "body": json.dumps(f"Error inserting file {document_name}.{document_type}: {e}")
                }
            
        else:
            logger.info(f"File {document_name}.{document_type} is being deleted. Deleting files from database does not occur here.")
        # Update embeddings for course after the file is successfully inserted into the database
        try:
                update_vectorstore_from_s3(bucket_name, category_id)
                logger.info(f"Vectorstore updated successfully for course {category_id}.")
        except Exception as e:
                logger.error(f"Error updating vectorstore for course {category_id}: {e}")
                return {
                    "statusCode": 500,
                    "body": json.dumps(f"Document inserted, but error updating vectorstore: {e}")
                }

        return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "New file inserted into database.",
                    "location": f"s3://{bucket_name}/{document_key}"
                })
            }

    return {
        "statusCode": 400,
        "body": json.dumps("No new document upload or deletion event found.")
    }