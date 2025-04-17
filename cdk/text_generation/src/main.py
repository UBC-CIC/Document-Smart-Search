import os
import json
import boto3
import logging
import uuid
import datetime
from typing import Dict, Any, Optional

# Import helpers
from helpers.db import get_secret, get_rds_connection
# from helpers.chat import get_bedrock_llm, create_dynamodb_history_table, get_llm_output, get_initial_student_query, chat_with_agent, get_prompt_for_role, get_initial_user_query
from helpers.chat import get_bedrock_llm, create_dynamodb_history_table, get_llm_output, chat_with_agent, get_prompt_for_role, get_initial_user_query
from helpers.vectorstore import get_opensearch_client, create_hybrid_search_pipeline, initialize_embeddings, initialize_opensearch_and_db
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
REGION = "us-west-2"

## OpenSearch
OPENSEARCH_HOST_SSM = "/dfo/opensearch/host"
OPENSEARCH_PORT = 443
OPENSEARCH_SEC = "opensearch/masteruser"

DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
SEARCH_PIPELINE_NAME = "html_hybrid_search"
KEYWORD_RATIO_OS_P = 0.3
SEMANTIC_RATIO_OS_P = 0.7

## SQL (PostgreSQL)
RDS_PROXY_PORT = 5432
RDS_PROXY_DB_NAME = "postgres"
RDS_PROXY_HOST = "/dfo/rds/host_url"
RDS_PROXY_SEC_SSM = "/dfo/rds/secretname"

## DynanoDB chat history
DYNAMODB_TABLE_NAME = "DynamoDB-Conversation-Table"

## Bedrock Agents
BEDROCK_INFERENCE_PROFILE = "us.meta.llama3-3-70b-instruct-v1:0"
EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBEDDING_DIM = 1024

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

# Note: I have not tested this function, so unsure if this works
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
    
    # Create DynamoDB table if it doesn't exist
    create_dynamodb_history_table(DYNAMODB_TABLE_NAME, REGION)
    
    # If no question, return initial greeting
    if not question:
        logger.info("Start of conversation. Creating conversation history table in DynamoDB.")
        # initial_query = get_initial_student_query()
        initial_query = get_initial_user_query()
        query_data = json.loads(initial_query)
        message = query_data["message"]
        options = query_data["options"]
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
                # "content": "Hello! Please select the best role below that fits you. We can better answer your questions. Don't include personal details such as your name and private content.",
                "content": message,
                "options": options,
                "user_role": user_role
            })
        }
    
    # Note: Currently disables user role check
    # # Check for user role
    # if not user_role:
    #     logger.error("Missing required parameter: user_role")
    #     return {
    #         'statusCode': 400,
    #         "headers": {
    #             "Content-Type": "application/json",
    #             "Access-Control-Allow-Headers": "*",
    #             "Access-Control-Allow-Origin": "*",
    #             "Access-Control-Allow-Methods": "*",
    #         },
    #         'body': json.dumps('Missing required parameter: user_role')
    #     }
    
    try:
        # Initialize OpenSearch, DB, and get configuration values
        opensearch_host: str = get_parameter(OPENSEARCH_HOST_SSM)
        rds_endpoint: str = get_parameter(RDS_PROXY_HOST)
        rds_secret_name:str = get_parameter(RDS_PROXY_SEC_SSM)
        opensearch_client, rds_conn_info = initialize_opensearch_and_db(
            rds_secret_name=rds_secret_name,
            rds_dbname=RDS_PROXY_DB_NAME,
            rds_endpoint=rds_endpoint,
            rds_port=RDS_PROXY_PORT,
            os_secret_name=OPENSEARCH_SEC,
            opensearch_host=opensearch_host,
            opensearch_port=OPENSEARCH_PORT,
            search_pipeline=SEARCH_PIPELINE_NAME,
            keyword_weight=KEYWORD_RATIO_OS_P,
            semantic_weight=SEMANTIC_RATIO_OS_P,
            secrets_client=secrets_manager_client
        )
        
        # print("Starting SQL Database connection")
        

        
        # print("SQL Database connection started")
        
        # Initialize embeddings
        embedder = initialize_embeddings(
            model_id=EMBEDDING_MODEL_ID,
            client=bedrock_runtime,
            region=REGION
        )
        
        print("Embeddings initialized")
        
        # # Get role-specific prompt from database -> Note right now user_promp is not used
        # Create RDS database connection
        # conn = get_rds_connection(rds_conn_info)
        # user_prompt = get_prompt_for_role(conn, user_role)
        # if not user_prompt:
        #     logger.error(f"Failed to retrieve prompt for role: {user_role}")
        #     return {
        #         'statusCode': 500,
        #         "headers": {
        #             "Content-Type": "application/json",
        #             "Access-Control-Allow-Headers": "*",
        #             "Access-Control-Allow-Origin": "*",
        #             "Access-Control-Allow-Methods": "*",
        #         },
        #         'body': json.dumps('Error getting prompt for specified role')
        #     }
        
        # print(user_prompt)
        user_prompt: str = "N/A" # Placeholder for user prompt, currently not used


#         # Log the user's question -> Doesnt work right now
#         log_user_engagement(conn, session_id, question, user_role, user_info)
        
        # Initialize tools using helper function
        tools, tool_wrappers = initialize_tools(
            opensearch_client=opensearch_client,
            conn_info=rds_conn_info,
            embedder=embedder,
            html_index_name=DFO_HTML_FULL_INDEX_NAME,
            mandate_index_name=DFO_MANDATE_FULL_INDEX_NAME,
            topic_index_name=DFO_TOPIC_FULL_INDEX_NAME,
            search_pipeline=SEARCH_PIPELINE_NAME,
            region=REGION
        )
        
        print("\nInitialize LLM\n")

        # Initialize LLM
        llm = get_bedrock_llm(
            model_id=BEDROCK_INFERENCE_PROFILE,
            region=REGION
        )
        
        
        print("\nLLM Initialized\n")

        
        # Process the question with the agent
        response, tools_summary, duration = chat_with_agent(
            user_query=question,
            table_name=DYNAMODB_TABLE_NAME,
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
    # finally:
    #     # Close any database connections
    #     if 'conn' in locals() and conn:
    #         conn.close()

# ------------ TESTING CODE (can be removed for production) ------------
def run_test(
    query: str = "What can you help me with?", 
    user_role: str = "public",
    session_id: str = "test-session-123"
):
    """
    Test function to run the chat pipeline locally without Lambda.
    
    Parameters:
    -----------
    query : str
        The query to test with
    user_role : str
        The user role (public, educator, admin)
    session_id : str
        Session ID for the chat
    """
    # Mock event for handler
    event = {
        "queryStringParameters": {"session_id": session_id, "user_info": "test-user"},
        "body": json.dumps({"message_content": query, "user_role": user_role})
    }
    
    # Create test prompts
    test_user_prompts = {
        "public": "You are responding to a member of the public.",
        "educator": "You are responding to an educator.",
        "admin": "You are responding to an admin."
    }
    
    # Override get_prompt_for_role for testing
    original_get_prompt_for_role = globals()["get_prompt_for_role"]
    
    def test_get_prompt_for_role(conn, user_role):
        logger.info(f"Using test prompt for role: {user_role}")
        return test_user_prompts.get(user_role, "")
    
    try:
        # Replace the function temporarily
        globals()["get_prompt_for_role"] = test_get_prompt_for_role
        
        # Call the handler and get the response
        response = handler(event, None)
        
        # Print the response in a readable format
        if response["statusCode"] == 200:
            body = json.loads(response["body"])
            print("\n" + "="*50)
            print("QUERY:", query)
            print("ROLE:", user_role)
            print("\nRESPONSE:")
            print(body["content"])
            if body.get("options"):
                print("\nFOLLOW-UP QUESTIONS:")
                for i, q in enumerate(body["options"]):
                    print(f"{i+1}. {q}")
            if body.get("tools_used"):
                print("\nTOOLS USED:")
                print(json.dumps(body["tools_used"], indent=2))
            print("="*50 + "\n")
        else:
            print("ERROR:", response)
    
    finally:
        # Restore original function
        globals()["get_prompt_for_role"] = original_get_prompt_for_role

if __name__ == "__main__":
    # Only run this code when executing the script directly (not when imported)
    import argparse
    
    parser = argparse.ArgumentParser(description="Test the DFO Smart Search")
    parser.add_argument("--query", type=str, default="What can you help me with?", 
                      help="Query to test")
    parser.add_argument("--role", type=str, default="public", 
                      choices=["public", "educator", "admin"],
                      help="User role")
    parser.add_argument("--session-id", type=str, default="test-session-123", 
                      help="Session ID for chat history")
    
    args = parser.parse_args()
    
    # Run the test with provided arguments
    run_test(
        query=args.query,
        user_role=args.role,
        session_id=args.session_id
    )