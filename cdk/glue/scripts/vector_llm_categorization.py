#!/usr/bin/env python
# coding: utf-8

# Standard library imports
import sys
import os
import json
import asyncio
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

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

# Custom module imports
sys.path.append("..")
import src.aws_utils as aws
import src.opensearch as op

# Constants
OPENSEARCH_SEC = "opensearch-secret"  # Will be replaced with SecretManager parameter
OPENSEARCH_HOST = "/dfo/opensearch/host"  # Will be replaced with SSM parameter
REGION_NAME = "us-west-2"  # Will be replaced with Glue context argument
EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0"  # Will be replaced with Glue context argument
DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index"
DFO_TOPIC_FULL_INDEX_NAME = "dfo-topic-full-index"
DFO_MANDATE_FULL_INDEX_NAME = "dfo-mandate-full-index"


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
SM_METHOD = "numpy"  # Options: "numpy" or "opensearch"
EXPORT_OUTPUT = True  # Toggle file export
DESIRED_THRESHOLD = 0.2  # Threshold for similarity/highlighting

# Set up the embedding model via LangChain
bedrock_client = session.client("bedrock-runtime", region_name=REGION_NAME)
embedder = BedrockEmbeddings(client=bedrock_client, model_id=EMBEDDING_MODEL)

topics_vector_store = OpenSearchVectorSearch(
    index_name=DFO_TOPIC_FULL_INDEX_NAME,
    embedding_function=embedder,
    opensearch_url="https://search-dfo-test-domain-7q7o6yzv2fgbsul7sbijedtltu.us-west-2.es.amazonaws.com",
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


def semantic_similarity_categorization(
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
    doc_names = [d.metadata.get('html_page_title', f"Doc_{i}") for i, d in enumerate(documents)]
    full_df = pd.DataFrame(scaled_scores, index=doc_names, columns=target_names)

    # Aggregate by unique target names
    unique_names = sorted(set([name for name, _ in target_names]))
    max_df = pd.DataFrame(index=doc_names, columns=unique_names)

    for name in unique_names:
        relevant_columns = [col for col in full_df.columns if col[0] == name]
        max_df[name] = full_df[relevant_columns].max(axis=1)

    return full_df, max_df


def top_topics_for_documents(df: pd.DataFrame, n=3, threshold=0.2, max_n=None) -> dict:
    """
    For each document (row in df), return either all topics with scores above the threshold or the top n topics.
    """
    top_topics = {}
    for doc in df.index:
        sorted_topics = df.loc[doc].sort_values(ascending=False)
        if threshold is None:
            selected_topics = sorted_topics.head(n)
        else:
            topics_above_threshold = sorted_topics[sorted_topics > threshold]
            selected_topics = sorted_topics.head(n) if len(topics_above_threshold) < n else topics_above_threshold
        if max_n is not None:
            selected_topics = selected_topics.head(max_n)
        top_topics[doc] = selected_topics.to_dict()
    return top_topics


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
    # Create the ChatBedrockConverse LLM instance.
    llm = ChatBedrockConverse(
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


def store_output_dfs(output_dict: dict, output_dir: str = "results"):
    """
    Store the final output DataFrames as CSV and Excel files.
    """
    os.makedirs(output_dir, exist_ok=True)
    for name, df in output_dict.items():
        csv_path = os.path.join(output_dir, f"{name}.csv")
        excel_path = os.path.join(output_dir, f"{name}.xlsx")
        df.to_csv(csv_path, index=False)
        df.to_excel(excel_path, index=False)
    print(f"Exported results to {output_dir}.")


def opensearch_semantic_search_top_topics(document: Document, n: int = 10) -> dict:
    """
    Use OpenSearch vector search to retrieve topics relevant to a given document.

    Since a single topic may have multiple descriptions, we first retrieve a larger set of candidates,
    group results by topic name (using the maximum relevance score among descriptions), and then return the top n topics.

    Parameters:
        document (Document): The document for which to search related topics.
        n (int): The number of top topics to return.

    Returns:
        dict: A dictionary where keys are topic names and values are the maximum relevance scores.
    """
    # Extract document text
    document_text = document.page_content

    # Retrieve topic similarity search results from OpenSearch vector search
    topics_results = topics_vector_store.similarity_search_with_relevance_scores(
        document_text,
        k=100,                # pull more documents to cover all descriptions
        vector_field="chunk_embedding",
        text_field="name_and_description",
    )

    print("Related Topic Results:", len(topics_results))

    # Group results by topic name and select the maximum relevance score per topic
    grouped_topics = {}
    for result in topics_results:
        candidate_doc, relevance_score = result
        topic_name = candidate_doc.metadata.get('name', 'N/A')
        # If a topic has multiple descriptions, keep the highest score
        if topic_name in grouped_topics:
            grouped_topics[topic_name] = max(grouped_topics[topic_name], relevance_score)
        else:
            grouped_topics[topic_name] = relevance_score

    # Sort topics by relevance score in descending order and take the top n topics.
    top_topics = dict(sorted(grouped_topics.items(), key=lambda item: item[1], reverse=True)[:n])

    return top_topics


def semantic_similarity(targets, target_embeddings, documents, document_embeddings, method="numpy", n=10):
    """
    Perform semantic similarity using either numpy or OpenSearch.
    """
    if method == "numpy":
        return semantic_similarity_categorization(
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
            key = (doc.metadata.get('html_page_title', 'Unknown'), doc.metadata.get('doc_url', ''))
            results[key] = opensearch_semantic_search_top_topics(doc, n=n)
        return results
    else:
        raise ValueError("Invalid semantic similarity method. Choose 'numpy' or 'opensearch'.")


async def categorize_documents(documents, targets, target_embeddings, items_by_name, method="numpy", prompt_template=None):
    """
    Categorize documents based on either topics or mandates using semantic similarity and LLM.
    """
    if method == "numpy":
        full_df, max_df = semantic_similarity(targets, target_embeddings, documents, None, method="numpy")
    else:
        max_df = semantic_similarity(targets, None, documents, None, method="opensearch")

    categorization_results = {}
    for doc in documents:
        doc_key = (doc.metadata.get('html_page_title', 'Unknown'), doc.metadata.get('doc_url', ''))
        if method == "numpy":
            semantic_scores = max_df.loc[doc_key[0]].to_dict()
        else:
            semantic_scores = max_df.get(doc_key, {})

        combined_text = get_combined_topics(items_by_name, list(semantic_scores.keys()))
        formatted_prompt = prompt_template.invoke({
            "topics": combined_text,
            "document": doc.page_content
        })
        response = await query_model(formatted_prompt)
        categorization_results[doc_key] = parse_json_response(response)

    combined_rows = []
    for doc_key, llm_results in categorization_results.items():
        doc_title, doc_url = doc_key
        semantic_scores = max_df.get(doc_key, {})
        for target, details in llm_results.items():
            combined_rows.append({
                "Document Title": doc_title,
                "URL": doc_url,
                "Target": target,
                "Semantic Score": semantic_scores.get(target, None),
                "LLM Belongs": details.get("belongs", ""),
                "LLM Relevance": details.get("relevance", "-1"),
                "LLM Explanation": details.get("explanation", "")
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


async def main():
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
    
    all_doc_embeddings = np.array(all_doc_embeddings)
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
        Here is a list of mandates:
        ---
        {mandates}
        ---
        Below is the document to categorize:
        ---
        {document}
        ---
        Reply in JSON format.
        <|eot_id|>
        """
    )
    df_mandates_combined = await categorize_documents(
        all_downloaded_docs, mandates, mandate_embeddings, mandates_by_name, method=SM_METHOD, prompt_template=mandate_prompt_template
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
        Here is a list of topics:
        ---
        {topics}
        ---
        Below is the document to categorize:
        ---
        {document}
        ---
        Reply in JSON format.
        <|eot_id|>
        """
    )
    df_topics_combined = await categorize_documents(
        all_downloaded_docs, topics, topic_embeddings, topics_by_name, method=SM_METHOD, prompt_template=topic_prompt_template
    )

    # Store results
    if EXPORT_OUTPUT:
        store_output_dfs({
            "combined_mandates_results": df_mandates_combined,
            "combined_topics_results": df_topics_combined
        })


if __name__ == "__main__":
    asyncio.run(main())