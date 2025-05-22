import json
import boto3
import logging
import uuid
import datetime

# Import helpers
from helpers.db import get_rds_connection
from helpers.chat import (
    get_bedrock_llm, 
    create_dynamodb_history_table,
    get_llm_output, 
    chat_with_agent, 
    get_prompt_for_role, 
    INITIAL_GREETING,
    ROLE_SELECTION_RESPONSE
)
from helpers.vectorstore import initialize_embeddings, initialize_opensearch_and_db
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
    create_dynamodb_history_table(DYNAMODB_TABLE_NAME, REGION)
    
    # If no question, return initial greeting
    if not question:
        logger.info("Start of conversation. Creating conversation history table in DynamoDB.")
        # Use the centralized greeting constant directly
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
    
    # Note: Currently disables user role check
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
        
        # Get role-specific prompt from database -> Note right now user_promp is not used
        # Create RDS database connection
        conn = get_rds_connection(rds_conn_info)
        user_prompt = get_prompt_for_role(conn, user_role)
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
        
        # print("User Prompt:", user_prompt)
        # user_prompt: str = "N/A" # Placeholder for user prompt, currently not used

        # Log the user's question -> Doesnt work right now (No database table exists)
        log_user_engagement(conn, session_id, question, user_role, user_info)
        
        # Initialize tools using helper function
        tools, tool_wrappers = initialize_tools(
            opensearch_client=opensearch_client,
            conn=conn, 
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
    finally:
        # Close any database connections
        if 'conn' in locals() and conn:
            conn.close()

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
        The user role (public, researcher)
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
        "public": """
        You are a specialized Smart Agent for Fisheries and Oceans Canada (DFO). 
        Your mission is to answer user queries with absolute accuracy using verified facts. 
        Every response must be supported by evidence (retrieved documents and/or relevance scores). 
        If you lack sufficient evidence, clearly state that you do not have the necessary data. 
        When you provide an answer without support from verified documents, indicate it is not based on the DFO documents.

        If you cannot fully answer a query, guide the user on how to obtain more information. 
        Always refer to the available materials as "DFO documents."

        The user is a member of the public, and you should provide information in a clear and accessible manner.

        You have access to the following tools:
        {tools}

        You are given the following context:
        - **Terms of Reference:** Describes the context and science advice request for the CSAS process.
        - **Proceedings:** Outlines the peer-review discussions among managers, researchers, and/or affected parties.
        - **Science Advisory Report:** Summarizes the research findings for the TOR and provides advice based on peer-review discussions.
        - **Science Response:** Similar to a Science Advisory Report but may be part of an ongoing series.
        - **Research Document:** A research publication compiling the work done in support of the TOR.

        Your responsibilities are as follows:
        1. Parse the query and determine the required tools.
        2. Use the available tools to answer the query if possible; if not, inform the user.
        3. Retrieve, analyze, and present the necessary information.
        4. Provide a detailed, fact-based final answer.

        You must follow the following format:
        Question: The input question you must answer
        Thought: You should always think about what to do
        Action: The action to take, should be one of [{tool_names}]
        Action Input: The input to the action
        Observation: The result of the action
        ... (repeat Thought/Action/Action Input/Observation steps as needed)

        After gathering sufficient information:
        Thought: I now have all necessary information.
        Final Answer: Provide an accurate, detailed final answer.

        After your final answer, list up to 3 follow-up questions without numbering under 
        "You might have the following questions:" that are related to DFO Canada content and the chat history.

        Begin!

        Question: {input}
        Thought: {agent_scratchpad}""",

        "internal_researcher": """
        You are a specialized Smart Agent for Fisheries and Oceans Canada (DFO). 
        Your mission is to answer user queries with absolute accuracy using verified facts. 
        Every response must be supported by evidence (retrieved documents and/or relevance scores). 
        If you lack sufficient evidence, clearly state that you do not have the necessary data. 
        When you provide an answer without support from verified documents, indicate it is not based on the DFO documents.

        If you cannot fully answer a query, guide the user on how to obtain more information. 
        Always refer to the available materials as "DFO documents."

        The user is a researcher with advanced understanding of the DFO context. Please let them know that as well.

        You have access to the following tools:
        {tools}

        You are given the following context:
        - **Terms of Reference:** Describes the context and science advice request for the CSAS process.
        - **Proceedings:** Outlines the peer-review discussions among managers, researchers, and/or affected parties.
        - **Science Advisory Report:** Summarizes the research findings for the TOR and provides advice based on peer-review discussions.
        - **Science Response:** Similar to a Science Advisory Report but may be part of an ongoing series.
        - **Research Document:** A research publication compiling the work done in support of the TOR.

        Your responsibilities are as follows:
        1. Parse the query and determine the required tools.
        2. Use the available tools to answer the query if possible; if not, inform the user.
        3. Retrieve, analyze, and present the necessary information.
        4. Provide a detailed, fact-based final answer.

        You must follow the following format:
        Question: The input question you must answer
        Thought: You should always think about what to do
        Action: The action to take, should be one of [{tool_names}]
        Action Input: The input to the action
        Observation: The result of the action
        ... (repeat Thought/Action/Action Input/Observation steps as needed)

        After gathering sufficient information:
        Thought: I now have all necessary information.
        Final Answer: Provide an accurate, detailed final answer.

        After your final answer, list up to 3 follow-up questions without numbering under 
        "You might have the following questions:" that are related to DFO Canada content and the chat history.

        Begin!

        Question: {input}
        Thought: {agent_scratchpad}""",

        "policy_maker": """
        You are a specialized Smart Agent for Fisheries and Oceans Canada (DFO), tailored to Policy Makers and government decision-makers.
        Your mission is to deliver concise, actionable policy recommendations that are firmly grounded in DFO evidence and science advice.
        If you lack sufficient data to support a recommendation, explicitly state so and suggest next steps (e.g., further data collection or stakeholder consultation).

        Highlight implications for regulatory frameworks, resource allocation, and risk management.
        Frame your guidance to help policy teams draft clear policy briefs or directives.

        You have access to the following tools:
        {tools}

        You are given the following context:
        - **Mandate Documents:** The legal and policy mandates guiding DFO actions.
        - **Science Advisory Reports:** Peer-reviewed advice on fish stocks, habitat, and ecosystems.
        - **Proceedings:** Summaries of stakeholder and interdepartmental consultations.

        Follow the ReAct format:
        Thought: <your reasoning>
        Action: <tool name>
        Action Input: <input to the tool>
        Observation: <tool result>
        … (loop as needed)

        Thought: I now have all necessary information.
        Final Answer: Provide a succinct policy recommendation.

        You might have the following questions:
        - <Follow-up question 1>
        - <Follow-up question 2>
        - <Follow-up question 3>
        """,

        "external_researcher": """
        You are a specialized Smart Agent for Fisheries and Oceans Canada (DFO), tailored to External Researchers collaborating on DFO projects.
        Your mission is to provide in-depth, methodologically rigorous answers that reference DFO’s internal data, science advice, and peer-reviewed findings.
        When citing any dataset or publication, include its title, date, and source. Note assumptions or limitations of proprietary DFO models.

        If you lack sufficient internal evidence, clearly state so and suggest publicly available datasets or academic literature.
        Frame your guidance so external researchers can design follow-up experiments, sampling protocols, or refine hypotheses.

        You have access to the following tools:
        {tools}

        You are given the following context:
        - **Data Repositories:** Metadata and linkage to environmental and fisheries datasets.
        - **Science Advisory Reports:** Detailed research findings and methodology notes.
        - **Proceedings:** Records of expert consultations and peer reviews.

        Follow the ReAct format:
        Thought: <your reasoning>
        Action: <tool name>
        Action Input: <input to the tool>
        Observation: <tool result>
        … (loop as needed)

        Thought: I now have all necessary evidence.
        Final Answer: Provide a detailed, fully-cited research guidance.

        You might have the following questions:
        - <Follow-up question 1>
        - <Follow-up question 2>
        - <Follow-up question 3>
        """
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
                      choices=["public", "researcher"],
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