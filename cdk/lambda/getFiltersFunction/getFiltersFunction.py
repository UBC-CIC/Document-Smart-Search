import os
import json
import boto3
import logging
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Environment variables
ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
DOCUMENTS_INDEX = os.environ.get("DOCUMENTS_INDEX_NAME", "dfo-html-documents")
TOPIC_IDX = os.environ.get("TOPIC_INDEX_NAME", "dfo-topics")
MANDATE_IDX = os.environ.get("MANDATE_INDEX_NAME", "dfo-mandates")

# AWS credentials and region
session = boto3.Session()
creds = session.get_credentials().get_frozen_credentials()
region = session.region_name or os.environ.get("AWS_REGION", "us-west-2")
awsauth = AWS4Auth(
    creds.access_key,
    creds.secret_key,
    region,
    "es",
    session_token=creds.token
)

# OpenSearch client
client = OpenSearch(
    hosts=[{"host": ENDPOINT, "port": 443}],
    http_auth=awsauth,
    use_ssl=True,
    verify_certs=True,
    connection_class=RequestsHttpConnection
)

def get_filter_values(index, field, size=1000):
    """Fetch unique filter values for a given index and field"""
    query = {
        "size": 0,  # We don't need document results, just aggregations
        "aggs": {
            "unique_values": {
                "terms": {
                    "field": field,
                    "size": size,
                    "order": {"_count": "desc"}  # Sort by document count (most frequent first)
                }
            }
        }
    }
    
    try:
        response = client.search(index=index, body=query)
        # Extract unique values from the aggregation
        unique_values = [bucket['key'] for bucket in response['aggregations']['unique_values']['buckets']]
        return unique_values
    except Exception as e:
        logger.error(f"Error querying {index} for {field}: {str(e)}")
        return []

def handler(event, context):
    try:
        # Check for specific requested filters
        requested_filters = []
        
        # Parse requested filters from query parameters if present
        query_params = event.get("queryStringParameters", {}) or {}
        if query_params and "filters" in query_params:
            requested_filters = query_params["filters"].split(",")
            # Validate and sanitize requested filters
            allowed_filters = ["years", "topics", "mandates", "authors", "document_types"]
            requested_filters = [f for f in requested_filters if f in allowed_filters]
        
        # If no valid filters requested, return all
        if not requested_filters:
            requested_filters = ["years", "topics", "mandates", "authors", "document_types"]
        
        # Initialize empty results dictionary
        filters = {}
        
        # Only fetch the requested filters
        if "years" in requested_filters:
            filters["years"] = get_filter_values(DOCUMENTS_INDEX, "csas_html_year")
            if not filters["years"]:
                filters["years"] = ["2023", "2022", "2021", "2020", "2019"]
        
        if "topics" in requested_filters:
            filters["topics"] = get_filter_values(TOPIC_IDX, "name.keyword")
            if not filters["topics"]:
                filters["topics"] = ["Ocean Science", "Environmental Protection", "Marine Conservation", "Fisheries Management"]
        
        if "mandates" in requested_filters:
            filters["mandates"] = get_filter_values(MANDATE_IDX, "name.keyword")
            if not filters["mandates"]:
                filters["mandates"] = ["Ocean Protection", "Sustainable Fishing", "Research", "Coastal Management"]
        
        if "authors" in requested_filters:
            filters["authors"] = get_filter_values(DOCUMENTS_INDEX, "author.keyword")
            if not filters["authors"]:
                filters["authors"] = ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division", "Policy Unit"]
        
        if "document_types" in requested_filters:
            filters["documentTypes"] = get_filter_values(DOCUMENTS_INDEX, "html_doc_type.keyword")
            if not filters["documentTypes"]:
                filters["documentTypes"] = ["Research Document", "Terms of Reference", "Scientific Advice", "Policy", "Unknown"]
        
        # Sort years in descending order if present
        if "years" in filters:
            filters["years"] = sorted(filters["years"], reverse=True)

        return {
            "statusCode": 200,
            "body": json.dumps(filters),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            }
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