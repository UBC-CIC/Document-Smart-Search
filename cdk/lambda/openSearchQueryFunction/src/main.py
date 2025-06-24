import os
import re
import json
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from pathlib import Path
from pprint import pprint
from opensearchpy import OpenSearch
from langchain_community.document_loaders import JSONLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import OpenSearchVectorSearch
from langchain_aws.embeddings import BedrockEmbeddings  # ✅ CHANGED
from langchain import __version__ as langchain_version

import src.aws_utils as aws
import src.opensearch_utils as op

with open(Path("configs.json"), "r") as f:
    configs = json.load(f)

REGION_NAME = os.environ.get("REGION")
OPENSEARCH_SEC = os.environ.get("OPENSEARCH_SEC")
INDEX_NAME = os.environ.get("INDEX_NAME")
BUCKET_NAME = "dfo-documents"
FOLDER_NAME = "documents"
LOCAL_DIR = "s3_data"

def set_secrets():
    global SECRETS
    SECRETS = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)

def clean_text(text: str) -> str:
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text

def metadata_func(record: dict, metadata: dict) -> dict:
    metadata["url"] = record.get("url")
    metadata["publicationYear"] = record.get("publicationYear")
    metadata["key"] = metadata["publicationYear"] + "/" + record.get("name")
    return metadata

def get_opensearch_client():
    return OpenSearch(
        hosts=[{'host': 'search-test-dfo-yevtcwsp7i4vjzy4kdvalwpxgm.aos.ca-central-1.on.aws', 'port': 443}],
        http_compress=True,
        http_auth=(SECRETS['username'], SECRETS['passwords']),
        use_ssl=True,
        verify_certs=True
    )

def process_documents():
    loader = DirectoryLoader(
        "./s3_data/ParsedPublications/2001/", glob="*.json",
        loader_cls=JSONLoader,
        loader_kwargs={
            'jq_schema': '.',
            'content_key': 'text',
            "metadata_func": metadata_func
        },
    )
    docs = loader.load()
    for doc in docs:
        doc.page_content = clean_text(doc.page_content)
        doc.metadata.pop("source", None)

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    docs = text_splitter.split_documents(docs)
    return docs

def handler(event, context):
    try:
        # Parse the input body
        body = json.loads(event.get("body", "{}"))
        
        # Extract query and filters
        query = body.get("query", "")
        filters = body.get("filters", {})

        # Extract filter categories
        years = filters.get("years", [])
        topics = filters.get("topics", [])
        mandates = filters.get("mandates", [])
        authors = filters.get("authors", [])
        document_types = filters.get("documentTypes", [])
        
        # Log received parameters for debugging
        print(f"Query: {query}")
        print(f"Filters - Years: {years}, Topics: {topics}, Mandates: {mandates}, Authors: {authors}, Types: {document_types}")
        
        # Initialize OpenSearch client and other configs
        # ... existing code for client initialization ...

        # In a real implementation, we'd use the filters to construct a more complex query
        # Here, we'll generate mock results matching the frontend's expected format
        
        # Generate 3-10 results based on query length as a simple variation factor
        result_count = min(10, max(3, len(query) if query else 3))
        
        mock_results = []
        for i in range(result_count):
            # Create a unique document ID
            doc_id = f"doc-{i+1}-{hash(query + str(i)) % 1000:03d}"
            
            # Randomize document year within filter constraints if provided
            if years and len(years) > 0:
                year = years[i % len(years)]
            else:
                year = str(2018 + (i % 6))  # Years between 2018-2023
            
            # Generate topic and mandate lists within filter constraints
            doc_topics = []
            all_topics = ["Ocean Science", "Environmental Protection", "Marine Conservation", "Fisheries Management", 
                          "Climate Change", "Biodiversity", "Coastal Management", "Aquaculture"]
            
            if topics and len(topics) > 0:
                doc_topics = topics[:1 + i % len(topics)]
            else:
                doc_topics = all_topics[i % 4:i % 4 + 2]
            
            doc_mandates = []
            all_mandates = ["Ocean Protection", "Sustainable Fishing", "Research", "Coastal Management", 
                           "Policy Development", "Conservation"]
            
            if mandates and len(mandates) > 0:
                doc_mandates = mandates[:1 + i % len(mandates)]
            else:
                doc_mandates = all_mandates[i % 3:i % 3 + 2]
            
            # Select author based on filters
            all_authors = ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division", 
                          "Policy Unit", "Environmental Assessment Group", "Fisheries Council"]
            
            if authors and len(authors) > 0:
                author = authors[i % len(authors)]
            else:
                author = all_authors[i % len(all_authors)]
            
            # Select document type based on filters
            all_document_types = ["Report", "Policy Document", "Research Paper", "Guideline", "Brochure", "Assessment"]
            
            if document_types and len(document_types) > 0:
                doc_type = document_types[i % len(document_types)]
            else:
                doc_type = all_document_types[i % len(all_document_types)]
            
            # Generate title that includes the query if provided
            if query:
                title = f"{all_document_types[i % len(all_document_types)]} on {query.title()} - {doc_topics[0]}"
            else:
                title = f"{all_document_types[i % len(all_document_types)]} on {doc_topics[0]} and {doc_mandates[0]}"
            
            # Generate highlights that mention the query
            highlights = []
            if query:
                highlights = [
                    f"This section discusses {query} in the context of {doc_topics[0]}.",
                    f"Significant findings related to {query} show promising results for conservation efforts.",
                    f"Recommendations include further research on {query} and its impacts on marine ecosystems."
                ]
            else:
                highlights = [
                    f"This section discusses key findings related to {doc_topics[0]}.",
                    f"Data analysis shows significant trends in {doc_mandates[0]}.",
                    f"Future work will focus on expanding research in {doc_topics[-1]}."
                ]
            
            # Create the document result
            doc_result = {
                "id": doc_id,
                "title": title,
                "year": year,
                "author": author,
                "category": doc_type,  # Use document type as category
                "documentType": doc_type,
                "topics": doc_topics,
                "mandates": doc_mandates,
                "highlights": highlights,
                "url": f"https://example.com/documents/{doc_id}"
            }
            
            mock_results.append(doc_result)
        
        # Return the mock results
        return {
            "statusCode": 200,
            "body": json.dumps({
                "query": query,
                "results": mock_results
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

