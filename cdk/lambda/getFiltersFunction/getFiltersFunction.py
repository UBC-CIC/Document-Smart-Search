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

        # Return the filters in the response
        filters = {
            "topics": topics,
            "mandates": mandates,
            "years": years
        }

        return {
            "statusCode": 200,
            "body": json.dumps(filters)
        }

    except Exception as e:
        print(f"Error fetching filters: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to fetch filter options"})
        }
