import os
import json
import boto3
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
        print(f"Error querying {index} for {field}: {str(e)}")
        return []

def handler(event, context):
    try:
        # Get the unique filter values from OpenSearch
        years = get_filter_values(DOCUMENTS_INDEX, "csas_html_year")
        topics = get_filter_values(TOPIC_IDX, "name.keyword")
        mandates = get_filter_values(MANDATE_IDX, "name.keyword")
        authors = get_filter_values(DOCUMENTS_INDEX, "author.keyword")
        document_types = get_filter_values(DOCUMENTS_INDEX, "html_doc_type.keyword")
        
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
        # print(f"Error fetching filters: {str(e)}")
        # # Return mock data in case of error
        # mock_filters = {
        #     "topics": ["Ocean Science", "Environmental Protection", "Marine Conservation", "Fisheries Management"],
        #     "mandates": ["Ocean Protection", "Sustainable Fishing", "Research", "Coastal Management"],
        #     "years": ["2023", "2022", "2021", "2020", "2019"],
        #     "authors": ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division", "Policy Unit"],
        #     "documentTypes": ["Research Document", "Terms of Reference", "Scientific Advice", "Policy", "Unknown"]
        # }
        # return {
        #     "statusCode": 200,
        #     "body": json.dumps(mock_filters),
        #     "headers": {
        #         "Content-Type": "application/json",
        #         "Access-Control-Allow-Origin": "*",
        #         "Access-Control-Allow-Methods": "GET, OPTIONS"
        #     }
        # }
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