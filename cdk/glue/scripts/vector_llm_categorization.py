#!/usr/bin/env python
# coding: utf-8

# Standard library imports
import sys
import os
import json
import asyncio
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
from datetime import datetime

# External library imports
import numpy as np
import pandas as pd
from opensearchpy import OpenSearch
from langchain.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_aws import ChatBedrockConverse
from langchain_aws.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import OpenSearchVectorSearch
from langchain_aws.llms import BedrockLLM
# from awsglue.utils import getResolvedOptions


# Custom module imports
sys.path.append("..")
import src.aws_utils as aws
import src.opensearch as op

# Constants
# Get job parameters
# args = getResolvedOptions(sys.argv, [
#     'JOB_NAME',
#     'batch_id',
#     'region_name',
#     'embedding_model',
#     'opensearch_secret',
#     'opensearch_host'
# ])

# Index Names
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"

args = {
    'JOB_NAME': 'vector_llm_categorization',
    'bucket_name': 'dfo-test-datapipeline',
    'batch_id': '2025-05-07',
    'region_name': 'us-west-2',
    'embedding_model': 'amazon.titan-embed-text-v2:0',
    'opensearch_secret': 'opensearch-masteruser-test-glue',
    'opensearch_host': 'opensearch-host-test-glue'
}

REGION_NAME = args['region_name']
EMBEDDING_MODEL = args['embedding_model']

# OpenSearch Configuration
OPENSEARCH_SEC = args['opensearch_secret']
OPENSEARCH_HOST = args['opensearch_host']

# Runtime Variables
CURRENT_DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")

# AWS and OpenSearch connection setup
session = aws.session
secrets = aws.get_secret(secret_name=OPENSEARCH_SEC, region_name=REGION_NAME)
opensearch_host = aws.get_parameter_ssm(parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME)
auth = (secrets['username'], secrets['password'])

op_client = OpenSearch(
    hosts=[{'host': opensearch_host, 'port': 443}],
    http_compress=True,
    http_auth=auth,
    use_ssl=True,
    verify_certs=True
)
info = op_client.info()
print(f"Connected to {info['version']['distribution']} {info['version']['number']}!")

# Configuration variables
SM_METHOD = "opensearch"  # Options: "numpy" or "opensearch", opensearch mode is untested
EXPORT_OUTPUT = True  # Toggle file export
DESIRED_THRESHOLD = 0.2  # Threshold for similarity/highlighting

# Set up the embedding model via LangChain
bedrock_client = session.client("bedrock-runtime", region_name=REGION_NAME)
embedder = BedrockEmbeddings(client=bedrock_client, model_id=EMBEDDING_MODEL)

mandates_vector_store = OpenSearchVectorSearch(
    index_name=DFO_MANDATE_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url=f"https://{opensearch_host}",
    http_compress=True,
    http_auth = auth,
    use_ssl = True,
    verify_certs=True,
)

topics_vector_store = OpenSearchVectorSearch(
    index_name=DFO_TOPIC_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url=f"https://{opensearch_host}",
    http_compress=True,
    http_auth = auth,
    use_ssl = True,
    verify_certs=True,
)

def get_all_mandates(client, index_name):
    """
    Retrieve mandates from OpenSearch, group by mandate name, and return:
      - A list of mandate Document objects,
      - A numpy array of their embeddings,
      - A dict grouping mandates by name.
    """
    mandates_response = client.search(index=index_name, body={"size": 1000, "query": {"match_all": {}}})
    matches = mandates_response["hits"]["hits"]

    mandates_by_name = defaultdict(list)
    for hit in matches:
        source = hit["_source"]
        mandate_name = source.get("name", "N/A")
        mandates_by_name[mandate_name].append(hit)

    mandates = []
    mandate_embeddings_list = []
    cleaned_mandates_by_name = defaultdict(list)
    for mandate_name, hits in mandates_by_name.items():
        total = len(hits)
        for idx, hit in enumerate(hits, start=1):
            source = hit["_source"]
            metadata = source.copy()
            if 'chunk_embedding' in metadata:
                del metadata['chunk_embedding']
            if 'name_and_description' in metadata:
                del metadata['name_and_description']
            metadata['description_number'] = f"{idx}/{total}"
            text = hit["_source"].get('name_and_description', '')
            mandate = Document(page_content=text, metadata=metadata)
            mandates.append(mandate)
            cleaned_mandates_by_name[mandate_name].append(mandate)
            embedding = np.array(hit["_source"]["chunk_embedding"])
            mandate_embeddings_list.append(embedding)

    mandate_embeddings = np.vstack(mandate_embeddings_list)
    return mandates, mandate_embeddings, cleaned_mandates_by_name


def get_all_topics(client, index_name):
    """
    Retrieve topics from OpenSearch, group by topic name, and return:
      - A list of topic Document objects,
      - A numpy array of their embeddings,
      - A dict grouping topics by name.
    """
    topics_response = client.search(index=index_name, body={"size": 1000, "query": {"match_all": {}}})
    matches = topics_response["hits"]["hits"]

    topics_by_name = defaultdict(list)
    for hit in matches:
        source = hit["_source"]
        topic_name = source.get("name", "N/A")
        topics_by_name[topic_name].append(hit)

    topics = []
    topic_embedding_list = []
    cleaned_topics_by_name = defaultdict(list)
    for topic_name, hits in topics_by_name.items():
        total = len(hits)
        for idx, hit in enumerate(hits, start=1):
            source = hit["_source"]
            metadata = source.copy()
            if 'chunk_embedding' in metadata:
                del metadata['chunk_embedding']
            if 'name_and_description' in metadata:
                del metadata['name_and_description']
            metadata['description_number'] = f"{idx}/{total}"
            text = hit["_source"].get('name_and_description', '')
            topic = Document(page_content=text, metadata=metadata)
            topics.append(topic)
            cleaned_topics_by_name[topic_name].append(topic)
            embedding = np.array(hit["_source"]["chunk_embedding"])
            topic_embedding_list.append(embedding)

    topic_embeddings = np.vstack(topic_embedding_list)
    return topics, topic_embeddings, cleaned_topics_by_name


def get_combined_topics(items_by_name: dict, possible_topics: Optional[List[str]] = None) -> str:
    """
    Combine topics or mandates into a single text string.
    If possible_topics is provided (list of topic/mandate names), include only those.

    Parameters:
        items_by_name (dict): Dictionary of items (topics or mandates) grouped by name
        possible_topics (List[str], optional): List of item names to include
    """
    combined_topics = ""
    possible_topics_lower = {t.lower() for t in possible_topics} if possible_topics else None
    for topic_name, docs in items_by_name.items():
        if possible_topics_lower and topic_name.lower() not in possible_topics_lower:
            continue
        combined_topics += f"-> {topic_name}:"
        for doc in docs:
            description = doc.metadata.get('description', '').replace(":", " -")
            combined_topics += f" {description}"
        combined_topics += "\n"
    return combined_topics


def parse_json_response(response: str) -> Optional[dict]:
    """
    Attempt to parse a response as JSON; if it fails, try to extract a substring.
    """
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        first_brace = response.find('{')
        last_brace = response.rfind('}')
        if (first_brace != -1 and last_brace != -1):
            try:
                return json.loads(response[first_brace:last_brace + 1])
            except json.JSONDecodeError:
                pass
    print("Failed to quick parse JSON response.")

    print("Atempting to salvage situation with LLM")

    responses_dict = parse_json_with_retries(response, 1, False)
    if responses_dict is None:
        print("All atempts to fix response failed.")
    else:
        print("Salvage successful")

    return responses_dict


def parse_json_with_retries(json_string: str, max_attempts=3, verbose = True):
    """
    Attempt to parse the JSON string. If parsing fails, use a quick LLM call
    to reformat the text into valid JSON. Retry the quick fix up to max_attempts.
    """
    # Create the ChatBedrockConverse LLM instance using the existing session
    llm = ChatBedrockConverse(
        client=bedrock_client,  # Use the existing bedrock client
        model_id="us.meta.llama3-3-70b-instruct-v1:0",
        temperature=0,
    )

    attempt = 0
    current_json_string = json_string
    while attempt < max_attempts:
        try:
            parsed = json.loads(current_json_string)
            return parsed
        except json.JSONDecodeError as e:
            if verbose:
                print(f"Attempt {attempt + 1}: JSON parsing failed:", e)

            # Create a prompt to reformat the JSON string.
            quick_fix_prompt = (
                f"Please convert the following text into valid JSON, DO NOT INCLUDE ANY PREFIX OR SUFFIX LIKE ```json.:\n\n{current_json_string}"
            )
            quick_response = llm.invoke(quick_fix_prompt)
            current_json_string = quick_response.content.strip().strip('```')

            if verbose:
                print(f"Attempt {attempt + 1}: Quick fix prompt:")
                print(quick_fix_prompt)

            attempt += 1

    # Final attempt after max_attempts
    try:
        if verbose:
            print("\n")
        return json.loads(current_json_string)
    except json.JSONDecodeError as e:
        if verbose:
            print("Final attempt failed:", e)
            print("\n")

        return None


def store_output_dfs(output_dict: dict, bucket_name: str, batch_id: str, method: str, debug: bool = False):
    """
    Store the final output DataFrames as CSV files in S3 under temp_outputs folder.
    If debug=True, also save locally in vector_llm_cat_output/.
    
    Parameters:
        output_dict (dict): Dictionary of DataFrames to save
        bucket_name (str): S3 bucket name
        batch_id (str): Batch ID for the folder structure
        debug (bool): If True, also save files locally
    """
    s3_client = session.client('s3')
    output_dir = f"batches/{batch_id}/temp_outputs"
    
    # Create local directory if debug mode
    if debug:
        local_dir = "vector_llm_cat_output"
        os.makedirs(local_dir, exist_ok=True)
    
    for name, df in output_dict.items():
        # Create CSV in memory
        csv_buffer = df.to_csv(index=False)
        
        # Upload to S3
        s3_key = f"{output_dir}/{method}_{name}.csv"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=csv_buffer
        )
        print(f"Uploaded {method}_{name}.csv to s3://{bucket_name}/{s3_key}")
        
        # Save locally if in debug mode
        if debug:
            local_path = os.path.join(local_dir, f"{method}_{name}.csv")
            df.to_csv(local_path, index=False)
            print(f"Saved {method}_{name}.csv locally to {local_path}")


def opensearch_semantic_search_top_targets(document: Document, n: int = 7, vector_store=None) -> dict:
    """
    Use OpenSearch vector search to retrieve topics or mandates relevant to a given document.

    Since a single topic/mandate may have multiple descriptions, we first retrieve a larger set of candidates,
    group results by topic/mandate name (using the maximum relevance score among descriptions), and then return the top n topics/mandates.

    Parameters:
        document (Document): The document for which to search related topics.
        n (int): The number of top topics to return.

    Returns:
        dict: A dictionary where keys are topic/mandate names and values are the maximum relevance scores.
    """
    # Extract document text
    document_text = document.page_content

    # Retrieve topic similarity search results from OpenSearch vector search
    targets_results = vector_store.similarity_search_with_relevance_scores(
        document_text,
        k=n,                # pull more documents to cover all descriptions
        vector_field="chunk_embedding",
        text_field="name_and_description",
    )
    
    # Group results by topic/mandate name and select the maximum relevance score per topic/mandate
    grouped_targets = {}
    for result in targets_results:
        candidate_doc, relevance_score = result
        target_name = candidate_doc.metadata.get('name', 'N/A')
        # If a topic has multiple descriptions, keep the highest score
        if target_name in grouped_targets:
            grouped_targets[target_name] = max(grouped_targets[target_name], relevance_score)
        else:
            grouped_targets[target_name] = relevance_score

    # Sort topics/mandates by relevance score in descending order and take the top n topics/mandates.
    # {topic_name1: relevance_score1, topic_name2: relevance_score2, ...}
    top_targets = dict(sorted(grouped_targets.items(), key=lambda item: item[1], reverse=True)[:n])
    return top_targets

def numpy_semantic_similarity_categorization(
    targets: List[Document],
    target_embeddings: np.array,
    documents: List[Document],
    document_embeddings: np.array,
    semantic_transform: str = 'raw',
    threshold: float = 0.54
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Compute cosine similarity (with optional transformation) between each document and target.
    Returns:
      - A full similarity DataFrame (one column per target description)
      - An aggregated DataFrame (one column per unique target name with max similarity)
    """
    n, k = len(documents), len(targets)

    # Normalize embeddings for cosine similarity (dot product)
    document_embeddings = document_embeddings / np.linalg.norm(document_embeddings, axis=1, keepdims=True)
    target_embeddings = target_embeddings / np.linalg.norm(target_embeddings, axis=1, keepdims=True)

    cosine_sim = np.dot(document_embeddings, target_embeddings.T)
    if semantic_transform == 'linear':
        scaled_scores = (cosine_sim + 1) / 2
    elif semantic_transform == 'angular':
        scaled_scores = 1 - np.arccos(cosine_sim) / np.pi
    else:
        scaled_scores = cosine_sim

    print(f"Cosine similarity transformation: {semantic_transform}")

    # Build full DataFrame
    key = "name"
    target_names = [(t.metadata.get(key, "Unknown"), t.metadata.get('description_number', "")) for t in targets]
    doc_names = [d.metadata.get('html_url', f"Doc_{i}") for i, d in enumerate(documents)]
    full_df = pd.DataFrame(scaled_scores, index=doc_names, columns=target_names)

    # Aggregate by unique target names
    unique_names = sorted(set([name for name, _ in target_names]))
    max_df = pd.DataFrame(index=doc_names, columns=unique_names)

    for name in unique_names:
        relevant_columns = [col for col in full_df.columns if col[0] == name]
        max_df[name] = full_df[relevant_columns].max(axis=1)

    return full_df, max_df


def semantic_similarity(targets, target_embeddings, documents, document_embeddings, method="numpy", n=10, vector_store=None) -> pd.DataFrame | dict:
    """
    Perform semantic similarity using either numpy or OpenSearch.
    """
    if method == "numpy":
        return numpy_semantic_similarity_categorization(
            targets=targets,
            target_embeddings=target_embeddings,
            documents=documents,
            document_embeddings=document_embeddings,
            threshold=DESIRED_THRESHOLD,
            semantic_transform='raw'
        )
    elif method == "opensearch":
        results = {}
        for doc in documents:
            key =  doc.metadata.get('html_url', '')
            results[key] = opensearch_semantic_search_top_targets(doc, n=n, vector_store=vector_store)
        return results
    else:
        raise ValueError("Invalid semantic similarity method. Choose 'numpy' or 'opensearch'.")


def get_top_n_topics(max_df: pd.DataFrame, n: int = 7) -> dict:
    """
    Get top N topics for each document based on semantic similarity scores.
    
    Parameters:
        max_df (pd.DataFrame): DataFrame with semantic similarity scores
        n (int): Number of top topics to retain per document
        
    Returns:
        dict: Dictionary mapping document titles to their top N topics
    """
    top_topics = {}
    for i, doc_idx in enumerate(max_df.index):
        # Get scores for this document using iloc to ensure we get a Series
        doc_scores = max_df.iloc[i]
        # Get top N topics
        top_topics[doc_idx] = doc_scores.nlargest(n).index.tolist()
        # print(top_topics[doc_idx])
    return top_topics


def validate_llm_response(target_result: dict) -> Tuple[bool, Optional[dict], Optional[str]]:
    """
    Validate LLM response for topic/mandate categorization.
    
    Parameters:
        target_result (dict): The LLM response to validate
        
    Returns:
        Tuple[bool, Optional[dict], Optional[str]]: 
            - bool: Whether validation passed
            - Optional[dict]: Validated and processed result if valid, None if invalid
            - Optional[str]: Error message if invalid, None if valid
    """
    
    # Check for all required fields
    required_fields = {
        "name": "topic/mandate name",
        "belongs": "Yes/No classification",
        "relevance": "relevance score (0-10)",
        "explanation": "explanation text"
    }
    
    missing_fields = []
    for field, description in required_fields.items():
        if field not in target_result:
            missing_fields.append(f"{field} ({description})")
    
    if missing_fields:
        return False, None, f"Missing required fields: {', '.join(missing_fields)}"
    
    # Validate field values
    topic_name = target_result["name"]
    belongs = target_result["belongs"].lower()  # Convert to lowercase for comparison
    relevance = target_result["relevance"]
    
    if belongs not in [ "yes", "no"]:
        return False, None, f"Invalid 'belongs' value '{belongs}'. Expected 'Yes' or 'No'"
    
    try:
        relevance = int(relevance)
        if not 0 <= relevance <= 10:
            return False, None, f"Invalid 'relevance' value {relevance}. Expected integer between 0-10"
    except (ValueError, TypeError):
        return False, None, f"Invalid 'relevance' value '{relevance}'. Expected integer between 0-10"
    
    # Return validated and processed result
    return True, {
        "name": topic_name,
        "belongs": belongs.capitalize(),  # Convert back to proper case
        "relevance": relevance,
        "explanation": target_result["explanation"]
    }, None


async def categorize_documents(documents, document_embeddings, targets, target_embeddings, target_type, items_by_name, method="numpy", prompt_template=None, vector_store=None, top_n: int = 10, debug: bool = False):
    """
    Categorize documents based on either topics or mandates using semantic similarity and LLM.
    First uses semantic similarity to get top N topics, then uses LLM for final categorization.
    
    Parameters:
        debug (bool): If True, save prompts to file for inspection
    """
    print(f"Starting {target_type} categorization with method: {method}")
    if method == "numpy":
        # max_df is a DataFrame with the semantic scores for all documents and all targets
        # row index is the html_url, column index is the target name e.g Topic_1, Topic_2, ...
        _, max_df = semantic_similarity(
            documents=documents,
            document_embeddings=document_embeddings,
            targets=targets,
            target_embeddings=target_embeddings,
            method="numpy"
        )

        # top_topics is a dictionary with the top N topics for each document
        # key is the html_url value is a list of topic names
        top_topics = get_top_n_topics(max_df, n=top_n)
    else:
        # {(html_url1): {topic_name1: relevance_score1, topic_name2: relevance_score2, ...}, (html_url2): {...}, ...}
        doc_topic_scores_dict = semantic_similarity(
            documents=documents,
            document_embeddings=document_embeddings,
            targets=targets,
            target_embeddings=target_embeddings,
            method="opensearch",
            vector_store=vector_store
        )
        # For opensearch method, use all topics
        ks =  list(doc_topic_scores_dict.keys()) # list of html_url
        vs = [list(v.keys()) for v in doc_topic_scores_dict.values()] # list of lists of topic names
        # dictionary with html_url as keys and lists of topic names as values
        top_topics = dict(zip(ks, vs))

    # Set up file writing if in debug mode
    f = None
    if debug:
        output_dir = "vector_llm_cat_output"
        os.makedirs(output_dir, exist_ok=True)
        prompt_file = os.path.join(output_dir, f"{target_type}_prompts.txt")
        f = open(prompt_file, 'w', encoding='utf-8')
    
    try:
        # Use LLM for final categorization
        categorization_results = {}
        for doc in documents:
            doc_key = doc.metadata.get('html_url', '')

            # Only get combined text for top N topics
            if method == "numpy":
                combined_text = get_combined_topics(items_by_name, top_topics[doc_key])
            else:
                combined_text = get_combined_topics(items_by_name, top_topics[doc_key])
            formatted_prompt = prompt_template.invoke({
                target_type: combined_text,
                "document": doc.page_content
            })
            
            # Save the formatted prompt to file if in debug mode
            if debug and f is not None:
                f.write("\n" + "="*80 + "\n")
                f.write(f"Processing document: {doc_key}\n")
                f.write("="*80 + "\n")
                f.write("Formatted prompt being sent to LLM:\n")
                f.write("-"*80 + "\n")
                f.write(str(formatted_prompt.text) + "\n")
                f.write("-"*80 + "\n\n")
            
            response = await query_model(formatted_prompt)
            categorization_results[doc_key] = parse_json_response(response)
            
        if debug:
            print(f"Saved {target_type} prompts to {prompt_file}")
    finally:
        if f is not None:
            f.close()

    combined_rows = []
    doc_url_to_title_mapping = {}
    for doc in documents:
        doc_url_to_title_mapping[doc.metadata.get('html_url', '')] = doc.metadata.get('html_page_title', 'Unknown')
    for doc_key, llm_results in categorization_results.items():
        if method == "numpy":
            semantic_scores = max_df.loc[doc_key]
        else:
            semantic_scores = doc_topic_scores_dict[doc_key]
        
        # Create a mapping of topic names to their semantic scores
        topic_scores = {topic: score for topic, score in semantic_scores.items()}
        
        for target_result in llm_results:
            is_valid, validated_result, error_msg = validate_llm_response(target_result)
            if not is_valid:
                print(f"Warning: {error_msg}")
                print(f"Full result: {target_result}")
                continue
            
            if target_type == "mandates":
                combined_rows.append({
                    "Document Title": doc_url_to_title_mapping[doc_key],
                    "Document URL": doc_key,
                    "Mandate": validated_result["name"],
                    "Semantic Score": topic_scores.get(validated_result["name"], 0.0),
                    "LLM Belongs": validated_result["belongs"],
                    "LLM Relevance": validated_result["relevance"],
                    "LLM Explanation": validated_result["explanation"]
                })
            elif target_type == "topics":
                combined_rows.append({
                    "Document Title": doc_url_to_title_mapping[doc_key],
                    "Document URL": doc_key,
                    "Topic": validated_result["name"],
                    "Semantic Score": topic_scores.get(validated_result["name"], 0.0),
                    "LLM Belongs": validated_result["belongs"],
                    "LLM Relevance": validated_result["relevance"],
                    "LLM Explanation": validated_result["explanation"]
                })

    return pd.DataFrame(combined_rows)


async def query_model(prompt):
    """
    Query the LLM model with a given prompt.
    
    Parameters:
        prompt: The prompt to send to the model
        
    Returns:
        str: The model's response
    """
    llm = BedrockLLM(
        client=bedrock_client,
        model_id="us.meta.llama3-3-70b-instruct-v1:0",
        model_kwargs={"temperature": 0, "top_p": 0.9},
        streaming=True
    )
    response = await llm.ainvoke(prompt)
    return response


async def main(debug=False):
    """
    Main function to execute the categorization pipeline.
    """
    # Fetch all documents from OpenSearch
    fields = [
        'csas_html_year', 'html_doc_type', 'html_page_title', 'html_url',
        'html_language', 'page_content', 'chunk_embedding'
    ]
    fetched_docs = op.fetch_specific_fields(op_client, DFO_HTML_FULL_INDEX_NAME, fields=fields)
    print(f"Found {len(fetched_docs)} documents in total")

    # Convert fetched documents to Document objects and prepare embeddings
    all_downloaded_docs = []
    all_doc_embeddings = []
    for doc in fetched_docs:
        metadata = {field: doc[field] for field in fields if field in doc and field not in ['page_content', 'chunk_embedding']}
        page_content = doc.get('page_content', '')
        vector = np.array(doc.get('chunk_embedding', []))
        if len(vector) > 0:  # Only include documents with embeddings
            doc_obj = Document(page_content=page_content, metadata=metadata)
            all_downloaded_docs.append(doc_obj)
            all_doc_embeddings.append(vector)

    all_downloaded_docs = all_downloaded_docs[:5] # first 2 documents
    all_doc_embeddings = np.array(all_doc_embeddings)[:5, :] # first 2 document embeddings
    print(f"Processed {len(all_downloaded_docs)} documents with embeddings")

    # Get mandates and topics
    mandates, mandate_embeddings, mandates_by_name = get_all_mandates(op_client, DFO_MANDATE_FULL_INDEX_NAME)
    topics, topic_embeddings, topics_by_name = get_all_topics(op_client, DFO_TOPIC_FULL_INDEX_NAME)

    # Categorize mandates
    mandate_prompt_template = PromptTemplate(
        input_variables=['mandates', 'document'],
        template="""
        <|begin_of_text|>
        <|start_header_id|>System<|end_header_id|>
        You are an assistant trained to categorize documents based on predefined mandates.
        <|eot_id|>
        <|start_header_id|>User<|end_header_id|>
        Here is a list of mandates (each may have multiple descriptions, separated by ':'), please read carefully:
        ---
        {mandates}
        ---
        Below is the document to categorize:
        ---
        {document}
        ---
        For each mandate, you must reply in exact JSON format with these fields:
        - name: the name of the mandate
        - "belongs": "Yes" or "No"
        - "explanation": A brief reason.
        - "relevance": A score (0-10).

        Reply only with valid JSON.
        <|eot_id|>
        <|start_header_id|>Assistant<|end_header_id|>
        <|eot_id|>
        """
    )
    df_mandates_combined = await categorize_documents(
        documents=all_downloaded_docs,
        document_embeddings=all_doc_embeddings,
        targets=mandates,
        target_embeddings=mandate_embeddings,
        target_type="mandates",
        items_by_name=mandates_by_name,
        method=SM_METHOD,
        prompt_template=mandate_prompt_template,
        vector_store=mandates_vector_store,
        top_n=7,  # Get top 7 topics
        debug=debug
    )

    # Categorize topics
    topic_prompt_template = PromptTemplate(
        input_variables=['topics', 'document'],
        template="""
        <|begin_of_text|>
        <|start_header_id|>System<|end_header_id|>
        You are an assistant trained to categorize documents based on research topics.
        <|eot_id|>
        <|start_header_id|>User<|end_header_id|>
        Here is a list of topics (each may have multiple descriptions, separated by ':'), please read carefully:
        ---
        {topics}
        ---
        Below is the document to categorize:
        ---
        {document}
        ---
        For each topic, you must reply in exact JSON format with these fields:
        - name: the name of the topic
        - "belongs": "Yes" or "No"
        - "explanation": A brief reason.
        - "relevance": A score (0-10).

        Reply only with valid JSON.
        <|eot_id|>
        <|start_header_id|>Assistant<|end_header_id|>
        <|eot_id|>
        """
    )
    df_topics_combined = await categorize_documents(
        documents=all_downloaded_docs,
        document_embeddings=all_doc_embeddings,
        targets=topics,
        target_embeddings=topic_embeddings,
        target_type="topics",
        items_by_name=topics_by_name,
        method=SM_METHOD,
        prompt_template=topic_prompt_template,
        vector_store=topics_vector_store,
        top_n=7,  # Get top 7 topics
        debug=debug
    )

    # Store results in S3 and locally if debug=True
    store_output_dfs({
        "combined_mandates_results": df_mandates_combined,
        "combined_topics_results": df_topics_combined
    }, args['bucket_name'], args['batch_id'], method=SM_METHOD, debug=debug)


if __name__ == "__main__":
    asyncio.run(main(debug=True))