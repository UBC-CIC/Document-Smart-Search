import logging
from typing import Dict, Any, List, Tuple
from opensearchpy import OpenSearch
from langchain_aws import BedrockEmbeddings
from langchain.tools import Tool

from helpers.tools.none_tool import NoneTool
from helpers.tools.mandate_tools import MandateTools
from helpers.tools.topic_tools import TopicTools
from helpers.tools.document_tools import DocumentTools
from helpers.tools.search_tools import SearchTools
from helpers.tools.tool_wrapper import ToolWrapper

logger = logging.getLogger()

def initialize_tools(
    opensearch_client: OpenSearch, 
    conn_info: Dict[str, Any], 
    embedder: BedrockEmbeddings,
    html_index_name: str,
    mandate_index_name: str,
    topic_index_name: str,
    search_pipeline: str,
    region: str
) -> Tuple[List[Tool], Dict[str, ToolWrapper]]:
    """
    Initialize all tool classes and create tools for the agent.
    
    Parameters:
    -----------
    opensearch_client : OpenSearch
        The OpenSearch client
    conn_info : Dict[str, Any]
        Database connection information
    embedder : BedrockEmbeddings
        The embeddings model for semantic search
    html_index_name : str
        Name of the HTML index in OpenSearch
    mandate_index_name : str
        Name of the mandate index in OpenSearch
    topic_index_name : str
        Name of the topic index in OpenSearch
    search_pipeline : str
        Name of the search pipeline in OpenSearch
    region : str
        AWS region
    
    Returns:
    --------
    Tuple[List[Tool], Dict[str, ToolWrapper]]
        A tuple containing:
        - List of initialized tools
        - Dictionary of tool wrappers
    """
    # Initialize tool classes
    none_tool = NoneTool()
    
    mandate_tools = MandateTools(
        opensearch_client=opensearch_client,
        mandate_index_name=mandate_index_name,
        region=region,
        conn_info=conn_info
    )
    
    topic_tools = TopicTools(
        opensearch_client=opensearch_client,
        topic_index_name=topic_index_name,
        region=region,
        conn_info=conn_info
    )
    
    document_tools = DocumentTools(
        opensearch_client=opensearch_client,
        html_index_name=html_index_name,
        conn_info=conn_info
    )
    
    search_tools = SearchTools(
        opensearch_client=opensearch_client,
        embedder=embedder,
        html_index_name=html_index_name,
        search_pipeline=search_pipeline
    )
    
    # Create LangChain Tool instances
    tools = [
        Tool(
            name="None",
            func=none_tool.none_tool,
            description="Does nothing and returns an empty string. Not meant to be called."
        ),
        Tool(
            name="Get All DFO Mandates And Descriptions",
            func=mandate_tools.get_all_dfo_mandates_and_descriptions,
            description="Returns all DFO mandates with their descriptions as JSON."
        ),
        Tool(
            name="Get All DFO Topics And Descriptions",
            func=topic_tools.get_all_dfo_topics_and_descriptions,
            description="Returns all DFO topics with their descriptions as JSON."
        ),
        Tool(
            name="Mandate Related Documents",
            func=mandate_tools.mandate_related_documents_tool,
            description="Returns related documents for a given DFO mandate."
        ),
        Tool(
            name="Topic Related Documents",
            func=topic_tools.topic_related_documents_tool,
            description="Returns related documents for a given DFO topic."
        ),
        Tool(
            name="Document Categorization Results",
            func=document_tools.document_categorization_results_tool,
            description="Returns document categorization and metadata for a given document URL."
        ),
        Tool(
            name="Document HTML Raw Text",
            func=document_tools.document_html_raw_text_tool,
            description="Returns the cleaned HTML text content for a given document URL."
        ),
        Tool(
            name="Semantic HTML Page Search",
            func=search_tools.semantic_html_search_tool,
            description="Performs semantic search for html documents based on an input query."
        )
    ]
    
    # Wrap tools for tracking
    tool_wrappers = {tool.name: ToolWrapper(tool) for tool in tools}
    
    return tools, tool_wrappers
