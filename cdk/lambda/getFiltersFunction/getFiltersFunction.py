import os
import json
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# Environment variables
ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
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

def get_filter_values(index, field):
    """Fetch unique filter values for a given index and field"""

    return None  # Placeholder for actual implementation
    query = {
        "size": 0,  # We don't need actual document results, just aggregations
        "aggs": {
            "unique_values": {
                "terms": {
                    "field": field,
                    "size": 1000  # ncrease this if necessary
                }
            }
        }
    }
    response = client.search(index=index, body=query)
    
    # Extract unique values from the aggregation
    unique_values = [bucket['key'] for bucket in response['aggregations']['unique_values']['buckets']]
    
    return unique_values

def handler(event, context):
    try:
        # Get the unique filter values from OpenSearch
        topics = get_filter_values(TOPIC_IDX, "name")  # Topic names
        mandates = get_filter_values(MANDATE_IDX, "name")  # Mandate names
        years = get_filter_values("dfo-html-documents", "year")  # Year field
        
        # Add these new filter types
        authors = get_filter_values("dfo-html-documents", "author.keyword")
        document_types = get_filter_values("dfo-html-documents", "documentType.keyword")
        
        # If the OpenSearch query fails, provide mock data
        if not topics:
            topics = ["Ocean Science", "Environmental Protection", "Marine Conservation", "Fisheries Management"]
        if not mandates:
            mandates = ["Ocean Protection", "Sustainable Fishing", "Research", "Coastal Management"]
        if not years:
            years = ["2020", "2021", "2022", "2023"]
        if not authors:
            authors = ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division", "Policy Unit"]
        if not document_types:
            document_types = ["Report", "Policy Document", "Research Paper", "Guideline", "Brochure"]

        # Return the filters in the response
        filters = {
            "topics": topics,
            "mandates": mandates,
            "years": years,
            "authors": authors,
            "documentTypes": document_types
        }

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
        print(f"Error fetching filters: {str(e)}")
        # Return mock data in case of error
        mock_filters = {
            "topics": ["Ocean Science", "Environmental Protection", "Marine Conservation", "Fisheries Management"],
            "mandates": ["Ocean Protection", "Sustainable Fishing", "Research", "Coastal Management"],
            "years": ["2020", "2021", "2022", "2023"],
            "authors": ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division", "Policy Unit"],
            "documentTypes": ["Report", "Policy Document", "Research Paper", "Guideline", "Brochure"]
        }
        return {
            "statusCode": 200,
            "body": json.dumps(mock_filters),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            }
        }
