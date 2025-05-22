import re
import json
import boto3
import logging
from typing import Dict, List, Any

from opensearchpy import OpenSearch

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Hardcoded constants (for now)
OPENSEARCH_SEC = "opensearch-masteruser-test-glue"
OPENSEARCH_HOST = "opensearch-host-test-glue"
REGION_NAME = "us-west-2"
INDEX_NAME = "dfo-html-full-index"
EMBEDDING_MODEL_PARAM = "amazon.titan-embed-text-v2:0"
BEDROCK_MODEL_PARAM = "us.meta.llama3-3-70b-instruct-v1:0"

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION_NAME)
ssm_client = boto3.client("ssm", region_name=REGION_NAME)

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

def extract_key_insights(analysis_text: str) -> List[str]:
    """Extract key insights from the LLM analysis text."""
    insights = []
    
    # Look for key findings section
    key_findings_match = re.search(r'Key Findings[:\n]+(.*?)(?:Relevance to User Query|\Z)', 
                                 analysis_text, re.DOTALL | re.IGNORECASE)
    
    if key_findings_match:
        findings_text = key_findings_match.group(1).strip()
        # Extract bullet points or numbered insights
        bullet_points = re.findall(r'(?:^|\n)[•\-\*\d+\.]\s*([^\n]+)', findings_text)
        
        if bullet_points:
            insights = [point.strip() for point in bullet_points if point.strip()]
        else:
            # If no bullet points found, split by newlines and filter empty lines
            insights = [line.strip() for line in findings_text.split('\n') if line.strip()]
    
    # If no insights found, provide a generic one to avoid empty list
    if not insights:
        insights = ["Document contains relevant information to your query"]
    
    return insights

def _get_document_by_id(
    *,
    op_client,
    index_name: str,
    document_id: str,
) -> Dict[str, Any]:
    """Return document metadata and content (empty strings if not found)."""
    try:
        resp = op_client.get(index=index_name, 
                             id=document_id,
                            _source=[
                                "html_subject",
                                "csas_html_title",
                                "csas_event",
                                "csas_html_year",
                                "html_url",
                                "page_content",
                                "html_doc_type"
                            ])
        src = resp["_source"]
        title = src.get("html_subject") or src.get("csas_html_title") or "Unknown"

        return {
            "title": title,
            "document_type": src.get("html_doc_type", "Unknown"),
            "document_subject": src.get("html_subject", "Unknown"),
            "csas_event": src.get("csas_event", "Unknown"),
            "csas_event_year": src.get("csas_html_year", "Unknown"),
            "document_url": src.get("html_url", "Unknown"),
            "text": src.get("page_content", ""),
        }
    except Exception as e:
        logger.error(f"Error fetching document {document_id}: {e}")
        return {"title": "Document not found", "text": ""}

def handler(event, context):
    try:
        # Parse the input body
        body = {} if event.get("body") is None else json.loads(event.get("body"))
        
        # Check if this is a document summary request by checking if BOTH the documentId and userQuery are present
        if not body.get("documentId", "") or not body.get("userQuery", ""):
            # If neither is present, return an error
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "documentId and userQuery are required"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }

        # This is a request for document analysis/summary
        document_id = body.get("documentId")
        user_query = body.get("userQuery", "")

        secrets = get_secret(secret_name=OPENSEARCH_SEC)
        opensearch_host = get_parameter(param_name=OPENSEARCH_HOST)
        op_client = OpenSearch(
            hosts=[{'host': opensearch_host, 'port': 443}],
            http_compress=True,
            http_auth=(secrets['username'], secrets['password']),
            use_ssl=True,
            verify_certs=True
        )

        # Fetch document from OpenSearch
        doc = _get_document_by_id(
            op_client=op_client,
            index_name=INDEX_NAME,
            document_id=document_id
        )
        
        if not doc["text"]:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Document not found"}),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        
        # Create the prompt for Bedrock
        llm_prompt = f"""
        Please analyze this document in relation to the user's query.
        
        Format your response with clear sections:
        
        # Key Findings
        - List 3-5 bullet points of the most important insights from the document
        
        # Summary
        Provide a concise summary of the document's content and its relevance to the query
        
        User Query:
        {user_query}

        Document:
        Title: {doc['title']}
        Alternative Title: {doc['document_subject']}
        Document type: {doc['document_type']}
        
        Canadian Science Advisory Secretariat (CSAS) Event Name: {doc['csas_event']}
        CSAS Event Year: {doc['csas_event_year']}
        
        Text:
        {doc['text']}
        """
        
        # Call Bedrock for LLM analysis
        bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
        
        response = bedrock_client.invoke_model(
            modelId=BEDROCK_MODEL_PARAM,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "prompt": llm_prompt,
                "temperature": 0.7
            })
        )
        
        response_body = json.loads(response.get("body").read())
        analysis = response_body.get("generation", "")
        
        # Extract summary - assume everything after the Summary header and before any other header
        summary_match = re.search(r'# Summary\s+(.*?)(?:#|\Z)', analysis, re.DOTALL)
        summary = summary_match.group(1).strip() if summary_match else analysis
        
        # Extract key insights as a list
        key_insights = extract_key_insights(analysis)
        
        # Return only what the frontend expects
        return {
            "statusCode": 200,
            "body": json.dumps({
                "title": doc["title"],
                "summary": summary.strip(),
                "keyInsights": key_insights
            }),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            }
        }
    except Exception as e:
        import traceback
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc()
            }),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }

