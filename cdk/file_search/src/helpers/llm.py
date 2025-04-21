import json
import logging
from typing import Optional, Dict, Any
import boto3

logger = logging.getLogger()

def get_bedrock_llm(model_id: str, region: str):
    """
    Initialize a Bedrock LLM client.
    
    Parameters:
    -----------
    model_id : str
        The ID of the model to use
    region : str
        The AWS region
        
    Returns:
    --------
    ChatBedrockConverse
        Initialized LLM client
    """
    from langchain_aws import ChatBedrockConverse
    
    return ChatBedrockConverse(
        model_id=model_id,
        region_name=region
    )

def analyze_document_relevance(
    llm,
    user_query: str,
    document: Dict[str, Any]
) -> str:
    """
    Analyze how a document relates to a user query using an LLM.
    
    Parameters:
    -----------
    llm : ChatBedrockConverse
        The LLM to use for analysis
    user_query : str
        The user's search query
    document : Dict[str, Any]
        The document to analyze
        
    Returns:
    --------
    str
        The LLM's analysis of the document's relevance
    """
    document_name = document.get("csas_html_title", "Unknown")
    text = document.get("page_content", "No text found")
    
    llm_format_message = f"""
    Please give me a detailed expert analysis how a given document relates to a user query.
    
    User Query:
    {user_query}
    
    Document Title:
    {document_name}
    
    Document Text:
    {text}
    """
    
    try:
        response = llm.invoke(llm_format_message)
        return response.content
    except Exception as e:
        logger.error(f"Error analyzing document relevance: {e}")
        return f"Error analyzing document: {str(e)}"
