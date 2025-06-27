import json
import os
from typing import Dict
import boto3
import logging
import uuid
import datetime
from opensearchpy import OpenSearch, RequestsHttpConnection
import psycopg
from langchain_aws import BedrockEmbeddings
import time
from aws_requests_auth.aws_auth import AWSRequestsAuth

# Import helpers
# from helpers.db import get_rds_connection
from helpers.chat import (
    get_bedrock_llm, 
    set_role_message,
    no_existing_messages,
    create_dynamodb_history_table,
    get_llm_output, 
    chat_with_agent, 
    get_prompt_for_role, 
)
from helpers.vectorstore import create_hybrid_search_pipeline
from helpers.tools.setup import initialize_tools

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Constants
SEARCH_PIPELINE_NAME = "hybridsearch" # Default name set by openSearch
KEYWORD_RATIO_OS_P = 0.3
SEMANTIC_RATIO_OS_P = 0.7

# Globals to be populated by init_constants()
OPENSEARCH_SEC = None
OPENSEARCH_HOST = None
INDEX_NAME = None
RDS_SEC = None

DFO_HTML_FULL_INDEX_NAME = None
DFO_MANDATE_FULL_INDEX_NAME = None
DFO_TOPIC_FULL_INDEX_NAME = None

BEDROCK_INFERENCE_PROFILE = None

RDS_PROXY_ENDPOINT = None
SM_DB_CREDENTIALS = None
TABLE_NAME_PARAM = None
EMBEDDING_MODEL_PARAM = None
BEDROCK_LLM_PARAM = None
REGION = None

# AWS Clients
secrets_manager_client = None # boto3.client("secretsmanager", region_name=REGION)
ssm_client = None # boto3.client("ssm", region_name=REGION)
bedrock_runtime = None # boto3.client("bedrock-runtime", region_name=REGION)

def init_constants():
    global OPENSEARCH_SEC, OPENSEARCH_HOST, INDEX_NAME, RDS_SEC
    global DFO_HTML_FULL_INDEX_NAME, DFO_MANDATE_FULL_INDEX_NAME, DFO_TOPIC_FULL_INDEX_NAME
    global BEDROCK_INFERENCE_PROFILE
    global RDS_PROXY_ENDPOINT, SM_DB_CREDENTIALS, TABLE_NAME_PARAM, EMBEDDING_MODEL_PARAM, BEDROCK_LLM_PARAM, REGION
    global secrets_manager_client, ssm_client, bedrock_runtime  # boto3 clients

    # Load environment variables
    SM_DB_CREDENTIALS = os.environ["SM_DB_CREDENTIALS"]
    RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
    REGION = os.environ["REGION"]

    # Init AWS clients (after REGION is known)
    secrets_manager_client = boto3.client("secretsmanager", region_name=REGION)
    ssm_client = boto3.client("ssm", region_name=REGION)
    bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION)

    # Load and resolve SSM parameters
    BEDROCK_LLM_PARAM = os.environ["BEDROCK_LLM_PARAM"]
    EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
    TABLE_NAME_PARAM = get_parameter(os.environ["TABLE_NAME_PARAM"])
    OPENSEARCH_HOST = get_parameter(os.environ["OPENSEARCH_HOST"])
    OPENSEARCH_SEC = get_parameter(os.environ["OPENSEARCH_SEC"])
    logger.info(f"OpenSearch Host: {OPENSEARCH_HOST}")
    logger.info(f"OpenSearch Sec Name: {OPENSEARCH_SEC}")
    INDEX_NAME = get_parameter(os.environ["OPENSEARCH_INDEX_NAME"])
    RDS_SEC = os.environ["RDS_SEC"]
    DFO_HTML_FULL_INDEX_NAME = get_parameter(os.environ["DFO_HTML_FULL_INDEX_NAME"])
    DFO_MANDATE_FULL_INDEX_NAME = get_parameter(os.environ["DFO_MANDATE_FULL_INDEX_NAME"])
    DFO_TOPIC_FULL_INDEX_NAME = get_parameter(os.environ["DFO_TOPIC_FULL_INDEX_NAME"])
    BEDROCK_INFERENCE_PROFILE = get_parameter(os.environ["BEDROCK_INFERENCE_PROFILE"])

def get_parameter(param_name: str):
    """Get parameter from SSM parameter store with caching."""
    try:
        response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except Exception as e:
        logger.error(f"Error fetching parameter {param_name}: {e}")
        raise

def setup_guardrail(guardrail_name):
    bedrock_mgmt_client = boto3.client("bedrock", region_name=REGION)
    paginator = bedrock_mgmt_client.get_paginator("list_guardrails")
    guardrail_id = guardrail_version = None

    for page in paginator.paginate():
        for guardrail in page["guardrails"]:
            if guardrail["name"] == guardrail_name:
                guardrail_id = guardrail["id"]
                guardrail_version = guardrail.get("version", None)
                break
        if guardrail_id:
            break

    if not guardrail_id:
        resp = bedrock_mgmt_client.create_guardrail(
            name=guardrail_name,
            description="Blocks harmful and off-topic content",
            contentPolicyConfig={
                "filtersConfig": [
                    {
                        "type": "HATE",
                        "inputStrength": "MEDIUM",
                        "outputStrength": "MEDIUM"
                    },
                    {
                        "type": "SEXUAL",
                        "inputStrength": "MEDIUM",
                        "outputStrength": "MEDIUM"
                    },
                    {
                        "type": "VIOLENCE",
                        "inputStrength": "MEDIUM",
                        "outputStrength": "MEDIUM"
                    },
                    {
                        "type": "INSULTS",
                        "inputStrength": "HIGH",
                        "outputStrength": "HIGH"
                    },
                    {
                        "type": "PROMPT_ATTACK",
                        "inputStrength": "HIGH",
                        "outputStrength": "NONE"
                    },
                    {
                        "type": "MISCONDUCT",
                        "inputStrength": "HIGH",
                        "outputStrength": "HIGH"
                    }
                ]
            },
            sensitiveInformationPolicyConfig={
                "piiEntitiesConfig": [
                    {"type": "EMAIL", "action": "ANONYMIZE"},
                    {"type": "PHONE", "action": "ANONYMIZE"}
                ]
            },
            # topicPolicyConfig={
            #     "topicsConfig": [
            #         {
            #             "name": "OffTopic",
            #             "type": "DENY",
            #             "definition": "This topic includes content not relevant to the Department of Fisheries and Oceans (DFO).",
            #             "examples": [
            #                 "Tell me a joke",
            #                 "How do I bake a cake?",
            #                 "What is the capital of France?",
            #                 "Explain the Big Bang theory"
            #             ],
            #             "inputEnabled": True,
            #             "inputAction": "BLOCK",
            #             "outputEnabled": False,   # Don't block output just in case
            #             "outputAction": "NONE"
            #         }
            #     ]
            # },
            blockedInputMessaging="This content is not allowed by our guidelines.",
            blockedOutputsMessaging="The assistant cannot respond to this request."
        )

        guardrail_id = resp["guardrailId"]
        time.sleep(5)

        ver_resp = bedrock_mgmt_client.create_guardrail_version(
            guardrailIdentifier=guardrail_id,
            description="Initial version with sensitive info policy only",
            clientRequestToken=str(uuid.uuid4())
        )
        guardrail_version = ver_resp["version"]

    return guardrail_id, guardrail_version

def classify_guardrail_violation(assessments):
    filter_reason_map = {
        "sexual": "Sexual content isn't appropriate for this assistant. Please keep it professional.",
        "violence": "Content involving violence is not permitted. Please rephrase respectfully.",
        "hate": "Hateful language is against our guidelines. Please use respectful language.",
        "self-harm": "References to self-harm are not appropriate. If you're struggling, please seek professional help.",
        "toxic": "Toxic or inflammatory language is not allowed. Please rephrase.",
        "insults": "Insulting language is blocked. Please be respectful.",
        "prompt_attack": "This prompt appears to manipulate the system inappropriately and is not allowed.",
        "misconduct": "This request involves misconduct or inappropriate behavior. Please revise."
    }

    for item in assessments:
        # Topic policy check
        if item.get("topicPolicy") and item["topicPolicy"].get("topic") == "OffTopic":
            return "Please stay on topic. This assistant is designed for DFO-related inquiries only."

        # Content filter check
        if item.get("contentFilter"):
            category = item["contentFilter"].get("category", "").lower()
            if category in filter_reason_map:
                return filter_reason_map[category]

        # Sensitive info policy check
        if item.get("sensitiveInformationPolicy"):
            entity_types = [e.get("type") for e in item["sensitiveInformationPolicy"].get("entities", [])]
            if "EMAIL" in entity_types:
                return "Please avoid sharing your email address."
            if "PHONE" in entity_types:
                return "Phone numbers are not allowed in the conversation."

    return "Your message was blocked by moderation filters. Please revise your input."
    



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

def map_role_to_display_name(role: str) -> str:
    """
    Map the role value to a display name.
    
    Parameters:
    -----------
    role : str
        The role value
        
    Returns:
    --------
    str
        The display name for the role
    """
    role_mapping = {
        "public": "General Public",
        "internal_researcher": "Internal Researcher",
        "policy_maker": "Policy Maker",
        "external_researcher": "External Researcher"
    }
    return role_mapping.get(role, "General Public")

def handler(event, context):
    """Lambda handler function"""
    logger.info("Text Generation Lambda function is called!")
    
    query_params = event.get("queryStringParameters", {})
    session_id = query_params.get("session_id", "")
    user_info = query_params.get("user_info", "")
    init_constants()
    
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
    dynamodb_table_name = TABLE_NAME_PARAM
    logger.info(f"DynamoDB Table Name: {dynamodb_table_name}")
    create_dynamodb_history_table(dynamodb_table_name, REGION)

    # If no question, return error
    if not question:
        logger.error("Missing required parameter: message_content")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameter: message_content')
        }
        
    # Check for user role
    if not user_role:
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
    
    guardrail_id, guardrail_version = setup_guardrail('comprehensive-guardrails')
    
    # Check if this is the first message for this session
    if no_existing_messages(dynamodb_table_name, session_id):
        logger.info(f"First message detected with user_role: {user_role}")
        
        # Override the question with the role selection
        role_display_name = map_role_to_display_name(user_role)
        
        # Create the role message
        set_role_message(role_display_name, dynamodb_table_name, session_id)

    # Apply guardrail to the question
    guard_resp = bedrock_runtime.apply_guardrail(
        guardrailIdentifier=guardrail_id,
        guardrailVersion=guardrail_version,
        source="INPUT",
        content=[{"text": {"text": question, "qualifiers": ["guard_content"]}}]
    )

    if guard_resp.get("action") == "GUARDRAIL_INTERVENED":
        msg = classify_guardrail_violation(guard_resp.get("assessments", []))
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            "body": json.dumps({
                "type": "guardrail",
                "content": msg,
                "options": [],
                "user_role": user_role,
                "tools_used": []
            })
        }


    try:
        # Initialize OpenSearch, DB, and get configuration values
        secrets = get_secret(OPENSEARCH_SEC)
        logger.info(f"OpenSearch Secrets: {secrets}")
        opensearch_host = OPENSEARCH_HOST
        opensearch_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )
        logger.info("OpenSearch client initialized successfully.")
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
                
        # Get role-specific prompt from database
        user_prompt = get_prompt_for_role(rds_conn, user_role)
        if not user_prompt:
            logger.error(f"Failed to retrieve prompt for role: {user_role}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error getting prompt for specified role')
            }

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
        
        # Initialize LLM
        # bedrock_inference_profile = get_parameter(BEDROCK_LLM_PARAM)
        bedrock_inference_profile = BEDROCK_INFERENCE_PROFILE # Using this for now as the one in SSM is not correct
        # print("Bedrock Inference Profile:", bedrock_inference_profile)
        llm = get_bedrock_llm(
            model_id=bedrock_inference_profile,
            region=REGION
        )
        
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
        # print(response)
        
        # Process the response
        response_data = get_llm_output(response['output'])

        # print(response_data)
        llm_output = response_data.get("llm_output")
        options = response_data.get("options", [])

        # print("LLM Output:\n", llm_output)
        # print("Options:\n", options)
        
        logger.info(f"Request processed in {duration:.2f} seconds")

                # Optional: Apply guardrail to LLM output
        guard_resp = bedrock_runtime.apply_guardrail(
            guardrailIdentifier=guardrail_id,
            guardrailVersion=guardrail_version,
            source="OUTPUT",
            content=[{"text": {"text": llm_output, "qualifiers": ["guard_content"]}}]
        )

        if guard_resp.get("action") == "GUARDRAIL_INTERVENED":
            msg = classify_guardrail_violation(guard_resp.get("assessments", []))
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                "body": json.dumps({
                    "type": "guardrail",
                    "content": msg,
                    "options": [],
                    "user_role": user_role,
                    "tools_used": []
                })
            }

        # print("Guardrail check passed for LLM output.")
        # print("Tools Summary:\n", tools_summary)
        # print("User Role:", user_role)
        # print("Options:\n", options)
        
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