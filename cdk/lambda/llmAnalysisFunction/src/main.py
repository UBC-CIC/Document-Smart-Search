import re
import json
import boto3
import logging
from typing import Dict, List, Any
import os

from opensearchpy import OpenSearch

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

OPENSEARCH_SEC = None
OPENSEARCH_HOST = None
REGION_NAME = None
INDEX_NAME = None
EMBEDDING_MODEL_PARAM = None
SUMMARY_LLM_MODEL_ID = None


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

def init_constants():
    """Initialize constants from environment variables."""
    global OPENSEARCH_SEC, OPENSEARCH_HOST, REGION_NAME, INDEX_NAME, EMBEDDING_MODEL_PARAM, SUMMARY_LLM_MODEL_ID
    try:
        OPENSEARCH_SEC = get_parameter(os.environ["OPENSEARCH_SEC"])
        logger.info(f"Using OpenSearch secret: {OPENSEARCH_SEC}")
        OPENSEARCH_HOST = os.environ["OPENSEARCH_HOST"]
        REGION_NAME = os.environ["REGION"]
        INDEX_NAME = get_parameter(os.environ["INDEX_NAME"])
        EMBEDDING_MODEL_PARAM = get_parameter(os.environ["EMBEDDING_MODEL_PARAM"])
        SUMMARY_LLM_MODEL_ID = get_parameter(os.environ["SUMMARY_LLM_MODEL_ID"])
    except KeyError as e:
        logger.error(f"Missing environment variable: {e}")

def extract_key_insights(analysis_text: str) -> List[str]:
    """Extract key insights from the LLM analysis text."""
    insights = []
    
    # Look for key findings section using the exact expected format
    key_findings_match = re.search(r'# Key Findings\s+(.*?)(?:# Summary|\Z)', 
                                   analysis_text, re.DOTALL)
    
    if key_findings_match:
        findings_text = key_findings_match.group(1).strip()
        # Extract bullet points with hyphen format as specified in prompt
        bullet_points = re.findall(r'- ([^\n]+)', findings_text)
        
        if bullet_points:
            # Remove duplicates while preserving order
            seen = set()
            unique_insights = []
            for point in bullet_points:
                point_stripped = point.strip()
                if point_stripped and point_stripped not in seen:
                    seen.add(point_stripped)
                    unique_insights.append(point_stripped)
            insights = unique_insights
    
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
        # Initialize constants from environment variables
        init_constants()
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

        cleaned_text = doc['text'].replace("\n", " ").strip()
        main_prompt = f"""
        You are an expert summarizer. Analyze the document in relation to the user's query, 
        and respond only in the following exact format in plain text, no other formatting or text:

        # Key Findings
        - 3 to 5 bullet points: each a single, self-contained insight
        
        # Summary
        A concise paragraph that (1) summarizes the document's main content, 
        (2) explains its relevance to the user's question, and (3) assigns a
        rating from 1 to 10 based on how well the document answers the user's
        question using neutral, objective second-person language to the user
        (e.g., 'It would be rated a [x] out of 10', not 'I would rate it...').

        Constraints:
        - Use exactly these two sections and no other headings.
        - Bullet lists must use a hyphen (`- `).
        - Do not ask any follow-up questions or add any commentary.
        - Do not include any additional text outside the specified sections.
        - Refer to the user in the second person as "you".
        - Do not speak in the first person, no "I" or "we".
        ---

        **Document Metadata:**  
        Title: {doc['title']}  
        Alt Title: {doc['document_subject']}  
        Type: {doc['document_type']}  
        CSAS Event: {doc['csas_event']} ({doc['csas_event_year']})

        **Full Text:**  
        {cleaned_text}

        **User Query:**  
        {user_query}
        """

        llm_prompt = (
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
            "You are an expert summarizer. Respond only with the sections: # Key Findings and # Summary.\n"
            "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
            f"{main_prompt}\n"
            "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
        )

        # Call Bedrock for LLM analysis
        bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)

        response = bedrock_client.invoke_model(
            modelId=SUMMARY_LLM_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "prompt": llm_prompt,
                "temperature": 0.1,
                "max_gen_len": 1024
            })
        )
        
        response_body = json.loads(response.get("body").read())
        logger.info(f"LLM response: {response_body}")
        analysis: str = response_body.get("generation", "").replace("`", "")

        # Extract summary - assume everything after the Summary header and before any other header
        summary_match = re.search(r'# Summary\s+(.*?)(?:#|\Z)', analysis, re.DOTALL)
        summary = summary_match.group(1).strip() if summary_match else analysis.strip()

        # Extract key insights as a list
        key_insights = extract_key_insights(analysis)

        # Return only what the frontend expects
        return {
            "statusCode": 200,
            "body": json.dumps({
                "title": doc["title"],
                "summary": summary,
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

