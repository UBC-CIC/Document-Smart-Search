import os
import re
import json
import boto3
import torch
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

REGION_NAME = configs['aws']['region_name']
OPENSEARCH_SEC = configs['aws']['secrets']['opensearch']
INDEX_NAME = "dfo-langchain-vector-index"
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
        
        # Check if this is a document summary request
        if body.get("message_content"):
            # This is a request for document summary generation
            message_content = body.get("message_content")
            
            # Process the prompt and generate a response
            # In a real implementation, this would call Bedrock or another LLM service
            # Here we'll generate a mock response based on the prompt
            
            # Extract document title from the prompt if possible
            title_match = re.search(r'document titled "(.*?)"', message_content)
            title = title_match.group(1) if title_match else "Unknown Document"
            
            # Generate mock summary
            summary = (
                f"This comprehensive document focuses on key aspects related to marine conservation "
                f"and environmental protection strategies. The document provides detailed analysis of "
                f"current challenges facing ocean ecosystems and proposes several solutions."
            )
            
            # Add some detail based on any topics mentioned in the prompt
            topic_matches = re.search(r'about (.*?) and was', message_content)
            if topic_matches:
                topics = topic_matches.group(1)
                summary += f" Specifically addressing {topics}, the document outlines policy recommendations "
                summary += "and scientific findings that support sustainable management practices."
            
            # Add bullet points for a more comprehensive response
            summary += "\n\n• Key finding: Ocean acidification is increasing at a rate of 5% annually in coastal regions\n"
            summary += "• Recommendation: Implement protected marine zones in critical habitat areas\n"
            summary += "• Data indicates that sustainable fishing practices have shown a 12% increase in fish populations\n"
            summary += "• Future research should focus on climate change impacts on marine biodiversity"
            
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "content": summary
                }),
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS"
                }
            }
            
        # If not a document summary request, handle as a standard query
        query = body.get("query", "")
        if not query:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'query'"})
            }

        # # Step 2: Embed the query using Bedrock
        # bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
        # embedder = BedrockEmbeddings(
        #     client=bedrock_client,
        #     model_id=configs['embeddings']['embedding_model']
        # )

        # # Step 3: Call OpenSearch hybrid similarity search
        # opensearch_client = op_client # get_opensearch_client()

        # results = op.hybrid_similarity_search_with_score(
        #     query=query,
        #     embedding_function=embedder,
        #     client=opensearch_client,
        #     index_name=INDEX_NAME,
        #     k=3,
        #     search_pipeline="html_hybrid_search",
        #     text_field="page_content",
        #     vector_field="chunk_embedding"
        # )
        results = [("doc1", 0.95), ("doc2", 0.90), ("doc3", 0.85)]  # Mock results for testing

        # Return modified results in the format expected by the frontend
        return {
            "statusCode": 200,
            "body": json.dumps({
                "query": query,
                "results": [
                    {
                        "score": score,
                        "id": f"doc-{i+1}",
                        "title": f"Document about {query.title() if query else 'Marine Conservation'} - Part {i+1}",
                        "year": str(2020 + i % 4),
                        "author": ["DFO Research Team", "Canadian Coast Guard", "Marine Science Division"][i % 3],
                        "category": ["Report", "Policy Document", "Research Paper"][i % 3],
                        "documentType": ["Report", "Policy Document", "Research Paper"][i % 3],
                        "topics": ["Ocean Science", "Environmental Protection", "Marine Conservation"][:2+i%2],
                        "mandates": ["Ocean Protection", "Sustainable Fishing"][:1+i%2],
                        "highlights": [
                            f"Important finding related to {query}" if query else "Important finding related to marine ecosystems",
                            f"Key data on {query}" if query else "Key data on conservation efforts",
                            f"Recommendation regarding {query}" if query else "Recommendation regarding sustainable practices"
                        ],
                        "metadata": doc
                    }
                    for i, (doc, score) in enumerate(results)
                ],
                "langchain": langchain_version
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

