import json
import os
from typing import Dict
import boto3
import logging
import uuid
import datetime
from opensearchpy import OpenSearch
import psycopg
from langchain_aws import BedrockEmbeddings

# Import helpers
# from helpers.db import get_rds_connection
from helpers.chat import (
    get_bedrock_llm, 
    create_dynamodb_history_table,
    get_llm_output, 
    chat_with_agent, 
    get_prompt_for_role, 
    INITIAL_GREETING,
    ROLE_SELECTION_RESPONSE
)
from helpers.vectorstore import create_hybrid_search_pipeline
# , initialize_opensearch_and_db
from helpers.tools.setup import initialize_tools

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Environment variables
# DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
# REGION = os.environ["REGION"]
# RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
# BEDROCK_LLM_PARAM = os.environ["BEDROCK_LLM_PARAM"]
# EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
# DYNAMODB_TABLE_NAME = os.environ["TABLE_NAME_PARAM"]

# Constants
SEARCH_PIPELINE_NAME = "html_hybrid_search"
KEYWORD_RATIO_OS_P = 0.3
SEMANTIC_RATIO_OS_P = 0.7

# Hardcoded constants (for now)
OPENSEARCH_SEC = "opensearch-masteruser-test-glue"
OPENSEARCH_HOST = "opensearch-host-test-glue"
INDEX_NAME = "dfo-html-full-index"
RDS_SEC = "rds/dfo-db-glue-test"

DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"

# REGION_NAME = "us-west-2"
# EMBEDDING_MODEL_PARAM = "amazon.titan-embed-text-v2:0"
# Other parameters - these should be passed in as environment variables
BEDROCK_INFERENCE_PROFILE = "us.meta.llama3-3-70b-instruct-v1:0"
# EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
# DYNAMODB_TABLE_NAME = "DynamoDB-Conversation-Table"

# Constants from the original stack
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
SM_DB_CREDENTIALS = os.environ["SM_DB_CREDENTIALS"]
TABLE_NAME_PARAM = os.environ["TABLE_NAME_PARAM"]
EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
BEDROCK_LLM_PARAM = os.environ["BEDROCK_LLM_PARAM"]
REGION = os.environ["REGION"]

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION)
ssm_client = boto3.client("ssm", region_name=REGION)
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)

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

def log_user_engagement(conn, session_id: str, message: str, user_role: str = None, user_info: str = None):
    """Log user engagement in database"""
    try:
        with conn.cursor() as cur:
            log_id = str(uuid.uuid4())
            timestamp = datetime.datetime.now()
            
            query = """
            INSERT INTO user_engagement_log (
                log_id, session_id, engagement_type, 
                engagement_details, user_role, user_info, timestamp
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            
            cur.execute(
                query, 
                (
                    log_id, 
                    session_id, 
                    "message creation", 
                    message, 
                    user_role, 
                    user_info, 
                    timestamp
                )
            )
            
            conn.commit()
            logger.info("User engagement logged successfully.")
    except Exception as e:
        logger.error(f"Error logging user engagement: {e}")
        if conn:
            conn.rollback()

def handler(event, context):
    """Lambda handler function"""
    logger.info("Text Generation Lambda function is called!")
    
    query_params = event.get("queryStringParameters", {})
    session_id = query_params.get("session_id", "")
    user_info = query_params.get("user_info", "")
    
    if not session_id:
        logger.error("Missing required parameter: session_id")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: session_id')
        }
    
    body = {} if event.get("body") is None else json.loads(event.get("body"))
    question = body.get("message_content", "")
    user_role = body.get("user_role", "")
    is_role_selection = body.get("is_role_selection", False)
    
    # Create DynamoDB table if it doesn't exist
    dynamodb_table_name = get_parameter(TABLE_NAME_PARAM)
    create_dynamodb_history_table(dynamodb_table_name, REGION)

    # If no question, return initial greeting
    if not question:
        logger.info("Start of conversation. Creating conversation history table in DynamoDB.")
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({
                "type": "ai",
                "content": INITIAL_GREETING["message"],
                "options": INITIAL_GREETING["options"],
                "user_role": user_role
            })
        }
    
    # Handle role selection - respond directly without calling the LLM
    if is_role_selection:
        logger.info(f"User selected role: {user_role}")
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({
                "type": "ai",
                "content": ROLE_SELECTION_RESPONSE,
                "options": [],
                "user_role": user_role
            })
        }
    
    # Check for user role
    if not user_role and question:
        logger.error("Missing required parameter: user_role")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: user_role')
        }
    
    try:
        # Initialize OpenSearch, DB, and get configuration values
        # Set up OpenSearch client - This is hard coded to a test database for now
        secrets = get_secret(OPENSEARCH_SEC)
        opensearch_host = get_parameter(OPENSEARCH_HOST)
        opensearch_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )
        
        create_hybrid_search_pipeline(
            client=opensearch_client,
            pipeline_name=SEARCH_PIPELINE_NAME,
            keyword_weight=KEYWORD_RATIO_OS_P,
            semantic_weight=SEMANTIC_RATIO_OS_P
        )

        # Set up RDS connection - This is hard coded to a test database for now
        tools_rds_secret = get_secret(RDS_SEC)
        tools_rds_conn_info = {
            "host": tools_rds_secret['host'],
            "port": tools_rds_secret['port'],
            "dbname": tools_rds_secret['dbname'],
            "user": tools_rds_secret['username'],
            "password": tools_rds_secret['password']
        }
        tools_rds_conn = psycopg.connect(**tools_rds_conn_info)

        # Set up RDS connection - This is the real stack database for storing metadata.
        rds_secret = get_secret(SM_DB_CREDENTIALS)
        rds_conn_info = {
            "host": RDS_PROXY_ENDPOINT,
            "port": rds_secret['port'],
            "dbname": rds_secret['dbname'],
            "user": rds_secret['username'],
            "password": rds_secret['password']
        }
        rds_conn = psycopg.connect(**rds_conn_info)

        # Initialize embeddings
        bedrock_embedder_model = get_parameter(EMBEDDING_MODEL_PARAM)
        # print("Bedrock Embedder Model:", bedrock_embedder_model)
        embedder = BedrockEmbeddings(
            model_id=bedrock_embedder_model,
            client=bedrock_runtime,
            region_name=REGION
        )
                
        # Get role-specific prompt from database -> Note right now user_promp is not used
        # Create RDS database connection
        user_prompt = get_prompt_for_role(rds_conn, user_role)
        if not user_prompt:
            logger.error(f"Failed to retrieve prompt for role: {user_role}")
            # For now we will not fail the request if we cannot get the prompt 
            # But we will log the error
            # return {
            #     'statusCode': 500,
            #     "headers": {
            #         "Content-Type": "application/json",
            #         "Access-Control-Allow-Headers": "*",
            #         "Access-Control-Allow-Origin": "*",
            #         "Access-Control-Allow-Methods": "*",
            #     },
            #     'body': json.dumps('Error getting prompt for specified role')
            # }
        
        print("User Role:", user_role)
        print("User Prompt:", user_prompt)

        # Log the user's question -> Doesnt work right now (No database table exists)
        log_user_engagement(rds_conn, session_id, question, user_role, user_info)
        
        # Initialize tools using helper function
        tools, tool_wrappers = initialize_tools(
            opensearch_client=opensearch_client,
            conn=tools_rds_conn,
            embedder=embedder,
            html_index_name=DFO_HTML_FULL_INDEX_NAME,
            mandate_index_name=DFO_MANDATE_FULL_INDEX_NAME,
            topic_index_name=DFO_TOPIC_FULL_INDEX_NAME,
            search_pipeline=SEARCH_PIPELINE_NAME,
            region=REGION
        )
        
        # print("\nInitialize LLM\n")

        # Initialize LLM
        # bedrock_inference_profile = get_parameter(BEDROCK_LLM_PARAM)
        bedrock_inference_profile = BEDROCK_INFERENCE_PROFILE # Using this for now as the one in SSM is not correct
        # print("Bedrock Inference Profile:", bedrock_inference_profile)
        llm = get_bedrock_llm(
            model_id=bedrock_inference_profile,
            region=REGION
        )
        
        
        print("\nLLM Initialized\n")

        # Process the question with the agent
        response, tools_summary, duration = chat_with_agent(
            user_query=question,
            table_name=dynamodb_table_name,
            session_id=session_id,
            user_prompt=user_prompt,
            tools=tools,
            tool_wrappers=tool_wrappers,
            llm=llm,
            verbose=False 
        )
        
        # Process the response
        response_data = get_llm_output(response['output'])
        llm_output = response_data.get("llm_output")
        options = response_data.get("options", [])
        
        logger.info(f"Request processed in {duration:.2f} seconds")
        
        # Return the response
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({
                "type": "ai",
                "content": llm_output,
                "options": options,
                "user_role": user_role,
                "tools_used": tools_summary
            })
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
        # Close the tools RDS connection if it was opened
        if 'tools_rds_conn' in locals():
            tools_rds_conn.close()
        # Close the OpenSearch client if it was opened
        if 'opensearch_client' in locals():
            opensearch_client.close()
