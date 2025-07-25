import logging
from typing import Dict, Any, List, Tuple
from opensearchpy import OpenSearch
from langchain_aws import BedrockEmbeddings
from langchain.tools import Tool

from helpers.tools.none_tool import NoneTool
from helpers.tools.mandate_tools import MandateTools
from helpers.tools.topic_tools import TopicTools
from helpers.tools.derived_topic_tools import DerivedTopicTools
from helpers.tools.search_tools import SearchTools
from helpers.tools.tool_wrapper import ToolWrapper

logger = logging.getLogger()

def initialize_tools(
    opensearch_client: OpenSearch, 
    conn, 
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
    conn : psycopg2.extensions.connection
        An existing database connection to reuse
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
        html_index_name=html_index_name, 
        region=region,
        conn=conn
    )
    
    topic_tools = TopicTools(
        opensearch_client=opensearch_client,
        topic_index_name=topic_index_name,
        html_index_name=html_index_name,
        region=region,
        conn=conn
    )
    
    derived_topic_tools = DerivedTopicTools(
        opensearch_client=opensearch_client,
        html_index_name=html_index_name,
        region=region,
        conn=conn
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
            description="Returns the names of DFO mandates with their descriptions and the number of related documents for each."
        ),
        Tool(
            name="Get All DFO Topics And Descriptions",
            func=topic_tools.get_all_dfo_topics_and_descriptions,
            description="Returns the names of DFO topics with their descriptions and the number of related documents for each."
        ),
        Tool(
            name="Get All DFO Derived Topics And Counts",
            func=derived_topic_tools.get_all_dfo_derived_topics_and_counts,
            description="Returns the names of all DFO derived topics and the number of related documents for each."
        ),
        Tool(
            name="Mandate Related Documents",
            func=mandate_tools.mandate_related_documents_tool,
            description="Returns top related documents for a given DFO mandate. The mandate MUST match exactly one of the DFO mandates."
        ),
        Tool(
            name="Topic Related Documents",
            func=topic_tools.topic_related_documents_tool,
            description="Returns top related documents for a given DFO topic. The topic MUST match exactly one of the DFO topics."
        ),
        Tool(
            name="Derived Topic Related Documents",
            func=derived_topic_tools.derived_topic_related_documents_tool,
            description="Returns top related documents for a given DFO derived topic. The derived topic MUST match exactly one of the DFO derived topics."
        ),
        Tool(
            name="Semantic HTML Page Search",
            func=search_tools.semantic_html_search_tool,
            description="Returns top related HTML documents to a user query."
        )
    ]
    
    # Wrap tools for tracking
    tool_wrappers = {tool.name: ToolWrapper(tool) for tool in tools}
    
    return tools, tool_wrappers
