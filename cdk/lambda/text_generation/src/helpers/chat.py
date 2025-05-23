import json
import boto3
import re
import logging
import time
from typing import Dict, List, Any, Optional, Tuple

from langchain.tools import Tool
from langchain.agents import create_react_agent, AgentExecutor
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableWithMessageHistory
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
from langchain_aws import ChatBedrockConverse

from helpers.tools.tool_wrapper import get_tool_calls_summary, reset_all_tool_wrappers

logger = logging.getLogger()

# Define the initial greeting message once to avoid duplication
INITIAL_GREETING = {
    "message": ("Hello! I am a Smart Agent specialized in Fisheries and Oceans Canada (DFO). "
                "I can help you with questions related to DFO documents, science advice, and more!"
                "\nPlease select the best role below that fits you. We can better answer your questions."
                "Do not include personal details such as your name and private content."),
    "options": ["General Public", "Internal Researcher", "Policy Maker", "External Researcher"]
}

# Define the welcome message after role selection
ROLE_SELECTION_RESPONSE = "Thank you for selecting your role. How can I help you with your questions about Fisheries and Oceans Canada today?"

def create_dynamodb_history_table(table_name: str, region_name: str):
    """
    Ensure that the DynamoDB table for chat history exists.
    
    Parameters:
    -----------
    table_name : str
        The name of the DynamoDB table
    region_name : str, optional
        AWS region name (uses default if None)
    """
    # Create client with region if specified
    dynamodb = boto3.resource('dynamodb', region_name=region_name)
    
    # Check if table exists
    existing_tables = [table.name for table in dynamodb.tables.all()]
    if table_name in existing_tables:
        logger.info(f"DynamoDB table {table_name} already exists.")
        return
    
    # Create table if it doesn't exist
    table = dynamodb.create_table(
        TableName=table_name,
        KeySchema=[
            {
                'AttributeName': 'session_id',
                'KeyType': 'HASH'
            }
        ],
        AttributeDefinitions=[
            {
                'AttributeName': 'session_id',
                'AttributeType': 'S'
            }
        ],
        BillingMode='PAY_PER_REQUEST'
    )
    
    # Wait until the table exists
    table.meta.client.get_waiter('table_exists').wait(TableName=table_name)
    logger.info(f"Created DynamoDB table: {table_name}")

def get_bedrock_llm(model_id: str, region: str):
    """
    Get a Bedrock LLM instance.
    
    Parameters:
    -----------
    model_id : str
        The ID of the Bedrock model to use
    region : str
        AWS region
        
    Returns:
    --------
    ChatBedrockConverse
        A Bedrock chat model instance
    """
    return ChatBedrockConverse(
        model_id=model_id,
        region_name=region,
    )

def get_llm_output(response: str) -> dict:
    """
    Splits the content into main content and follow-up questions.
    
    Parameters:
    -----------
    response : str
        The LLM response text
        
    Returns:
    --------
    dict
        Dictionary with llm_output (main content) and options (follow-up questions)
    """
    match = re.search(r"(.*)You might have the following questions:(.*)", response, re.DOTALL)

    if match:
        main_content = match.group(1).strip()
        questions_text = match.group(2).strip()
    else:
        main_content = response.strip()
        questions_text = ""

    # Function to format URLs as Markdown links
    def markdown_link_replacer(match):
        url = match.group(0).rstrip('.')
        return f"[{url}]({url})"

    # Replace all URLs in the main content with Markdown hyperlinks
    main_content = re.sub(r"https?://[^\s]+", markdown_link_replacer, main_content)

    # Format follow-up questions
    questions_text = questions_text.replace('\n', '')  # Remove newlines
    questions = re.split(r'\?\s*(?=\S|$)', questions_text)  # Split on question marks
    questions = [question.strip() + '?' for question in questions if question.strip()]  # Add ? back to valid questions

    return {
        "llm_output": main_content,
        "options": questions
    }

def get_initial_user_query():
    """
    Generate an initial greeting to the user.
    List what the agent can do.
    And suggests the user a few options to start the conversation.
    
    Returns:
    --------
    str
        JSON string with initial message and role options
    """
    return json.dumps(INITIAL_GREETING, indent=4)

def create_agent_prompt(user_prompt: Optional[str]) -> PromptTemplate:
    """
    Create the prompt template for the agent.
    
    Parameters:
    -----------
    user_prompt : str
        User-specific prompt to include
        
    Returns:
    --------
    PromptTemplate
        The configured prompt template
    """
    if user_prompt is None:
        template = """
        You are a specialized Smart Agent for Fisheries and Oceans Canada (DFO).
        Your mission is to answer user queries with absolute accuracy using verified facts.
        If you lack sufficient evidence, clearly state that you do not have the necessary data.
        When you provide an answer without support from verified documents, please indicate it.
        If you cannot fully answer a query, guide the user on how to obtain more information.
        
        You have access to the following tools:
        {tools}
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
        Previous conversation history:
        {chat_history}
        Question: {input}
        Thought: {agent_scratchpad}"""
        return PromptTemplate.from_template(template)
    else:
        template = """
        {user_prompt}
        
        You have access to the following tools:
        {tools}
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
        Previous conversation history:
        {chat_history}
        Question: {input}
        Thought: {agent_scratchpad}"""

        return PromptTemplate.from_template(template).partial(user_prompt=user_prompt)


# Note: Currently disabled the user prompt in the template
def chat_with_agent(
    user_query: str, 
    table_name: str, 
    session_id: str, 
    user_prompt: Optional[str],
    tools: List[Tool],
    tool_wrappers: Dict[str, Any],
    llm: ChatBedrockConverse,
    verbose: bool = False
) -> Tuple[Dict[str, Any], Dict[str, Any], float]:
    """
    Process a query using the smart agent.
    
    Parameters:
    -----------
    user_query : str
        The query from the user
    table_name : str
        DynamoDB table name for chat history
    session_id : str
        Unique session identifier
    user_prompt : Optional[str]
        Role-specific prompt to include
    tools : List[Tool]
        List of tools for the agent to use
    tool_wrappers : Dict[str, ToolWrapper]
        Dictionary of tool wrappers for tracking
    llm : ChatBedrockConverse
        The LLM to use
    verbose : bool
        Whether to enable verbose output
        
    Returns:
    --------
    Tuple containing:
    - Response dict
    - Tool calls summary
    - Processing duration
    """
    start_time = time.time()
    
    # Create prompt template
    prompt = create_agent_prompt(user_prompt)
    
    # Create agent
    agent = create_react_agent(
        tools=tools,
        llm=llm,
        prompt=prompt,
    )
    
    # Create agent executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=verbose,
        handle_parsing_errors=True,
    )
    
    # Create agent with chat history
    agent_with_chat_history = RunnableWithMessageHistory(
        agent_executor,
        lambda session_id: DynamoDBChatMessageHistory(
            table_name=table_name,
            session_id=session_id
        ),
        input_messages_key="input",
        history_messages_key="chat_history",
        output_messages_key="output",
    )
    
    # Process the query
    response = agent_with_chat_history.invoke(
        {"input": user_query},
        config={"configurable": {"session_id": session_id}}
    )
    
    # Calculate duration
    end_time = time.time()
    duration = end_time - start_time
    
    if verbose:
        logger.info(f"Smart Agent Chat took {duration:.2f} seconds.")
    
    # Get tool usage summary
    tools_summary = get_tool_calls_summary(tool_wrappers)
    
    # Reset tool wrappers for next query
    reset_all_tool_wrappers(tool_wrappers)
    
    return response, tools_summary, duration

def get_prompt_for_role(conn, user_role: str) -> Optional[str]:
    """
    Get prompt specific to user role from database.
    
    Parameters:
    -----------
    conn : psycopg2.extensions.connection
        Database connection
    user_role : str
        User role (public, researcher)
        
    Returns:
    --------
    Optional[str]
        The prompt for the specified role, or None if not found
    """
    try:
        with conn.cursor() as cur:
            # Map valid roles to column names
            role_column_mapping = {
                "public": "public",
                "internal_researcher": "internal_researcher",
                "policy_maker": "policy_maker",
                "external_researcher": "external_researcher"
            }
            
            # Validate user_role and get corresponding column name
            if user_role not in role_column_mapping:
                logger.error(f"Invalid user_role: {user_role}")
                return None
                
            column_name = role_column_mapping[user_role]
            
            # Construct query using safe column name
            query = f"""
                SELECT {column_name}
                FROM prompts
                WHERE {column_name} IS NOT NULL
                ORDER BY time_created DESC NULLS LAST
                LIMIT 1;
            """
            
            cur.execute(query)
            result = cur.fetchone()
            
            if result and result[0]:
                return str(result[0])
            else:
                logger.warning(f"No prompts found for role: {user_role}.")
                return None
    except Exception as e:
        logger.error(f"Error fetching system prompt for role {user_role}: {e}")
        return None