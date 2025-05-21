#!/usr/bin/env python
# coding: utf-8

import pandas as pd
import numpy as np
from opensearchpy import OpenSearch, RequestsHttpConnection, RequestsAWSV4SignerAuth
from requests_aws4auth import AWS4Auth
import boto3
from sklearn.feature_extraction.text import CountVectorizer
from umap import UMAP
from hdbscan import HDBSCAN
from bertopic import BERTopic
from bertopic.representation import MaximalMarginalRelevance
from bertopic.vectorizers import ClassTfidfTransformer
import psycopg
import io
from typing import Any, Tuple

import sys
import os
from datetime import datetime
import json
from typing import Dict, List, Iterable, Literal, Optional, Tuple

import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql
import hashlib

session = aws.session # always use this session for all AWS calls

# from awsglue.utils import getResolvedOptions

# args = getResolvedOptions(sys.argv, [
#     'html_urls_path',
#     'bucket_name',
#     'batch_id',
#     'region_name',
#     'embedding_model',
#     'opensearch_secret',
#     'opensearch_host',
#     'rds_secret',
#     'dfo_html_full_index_name',
#     'dfo_topic_full_index_name',
#     'dfo_mandate_full_index_name',
#     'pipeline_mode'
# ])

args = {
    'html_urls_path': 's3://dfo-test-datapipeline/batches/2025-05-07/html_data/CSASDocuments.xlsx',
    'bucket_name': 'dfo-test-datapipeline',
    'batch_id': '2025-05-07',
    'region_name': 'us-west-2',
    'embedding_model': 'amazon.titan-embed-text-v2:0',
    'opensearch_secret': 'opensearch-masteruser-test-glue',
    'opensearch_host': 'opensearch-host-test-glue',
    'rds_secret': 'rds/dfo-db-glue-test',
    'dfo_html_full_index_name': 'dfo-html-full-index',
    'dfo_topic_full_index_name': 'dfo-topic-full-index',
    'dfo_mandate_full_index_name': 'dfo-mandate-full-index',
    'pipeline_mode': 'full_update', # or 'topics_only', 'html_only'
    'sm_method': 'numpy', # 'numpy', 'opensearch'
    'topic_modelling_mode': 'retrain', # or 'predict'
}

REGION_NAME = args['region_name']
DFO_HTML_FULL_INDEX_NAME = args['dfo_html_full_index_name']
CURRENT_DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S")


def init_opensearch_client(host: str, region: str, secret_name: str) -> Tuple[OpenSearch, Any]:
    """
    Initialize OpenSearch client with fallback authentication.
    First tries basic auth, then falls back to AWS4Auth if that fails.
    
    Parameters
    ----------
    host : str
        OpenSearch host URL
    region : str
        AWS region name
    secret_name : str
        Name of the secret containing OpenSearch credentials
        
    Returns
    -------
    Tuple[OpenSearch, Any]
        Tuple containing:
        - Initialized OpenSearch client
        - Authentication object used (either tuple of (username, password) or AWS4Auth)
    """
    secrets = aws.get_secret(secret_name=secret_name, region_name=region)
    username = secrets.get('username')
    password = secrets.get('password')
    
    # First try basic auth
    try:
        auth = (username, password)
        client = OpenSearch(
            hosts=[{'host': host, 'port': 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection
        )
        # Test connection
        client.info()
        print("Connected using basic authentication")
        return client, auth
    except Exception as e:
        if "AuthorizationException" in str(e):
            print("Basic auth failed, falling back to AWS4Auth")
            # Fall back to AWS4Auth
            credentials = session.get_credentials()
            auth = RequestsAWSV4SignerAuth(credentials, region, 'es')
            
            client = OpenSearch(
                hosts=[{'host': host, 'port': 443}],
                http_auth=auth,
                use_ssl=True,
                verify_certs=True,
                connection_class=RequestsHttpConnection,
                pool_maxsize=20
            )
            # Test connection
            client.info()
            print("Connected using AWS4Auth")
            return client, auth
        else:
            raise e

# Initialize OpenSearch client with fallback authentication
opensearch_host = aws.get_parameter_ssm(
    parameter_name=args['opensearch_host'], region_name=REGION_NAME
)

op_client, auth = init_opensearch_client(
    host=opensearch_host,
    region=args['region_name'],
    secret_name=args['opensearch_secret']
)

info = op_client.info()
print(f"Welcome to {info['version']['distribution']} {info['version']['number']}!")

rds_secret = aws.get_secret(secret_name=args['rds_secret'],region_name=args['region_name'])

conn_info = {
    "host": rds_secret['host'],
    "port": rds_secret['port'],
    "dbname": rds_secret['dbname'],
    "user": rds_secret['username'],
    "password": rds_secret['password']
}

def train_custom_topic_model(
    documents,
    embeddings,
    seed=42,
    min_df=2,
    max_df=0.5,
    ngram_range=(1, 2),
    min_topic_size=5,
    top_n_words=15,
    rep_diversity=0.5,
    rep_top_n_words=5,
    n_neighbors=15,
    n_components=7,
    min_dist=0.0
):
    """Train a BERTopic model with custom components and return the model and topic distributions."""
    
    representation_model = MaximalMarginalRelevance(
        diversity=rep_diversity,
        top_n_words=rep_top_n_words
    )

    vectorizer_model = CountVectorizer(
        stop_words="english",
        ngram_range=ngram_range,
        min_df=min_df,
        max_df=max_df
    )

    ctfidf_model = ClassTfidfTransformer(
        bm25_weighting=True,
        reduce_frequent_words=True
    )

    umap_model = UMAP(
        n_neighbors=n_neighbors,
        n_components=n_components,
        min_dist=min_dist,
        metric="cosine",
        random_state=seed
    )

    hdbscan_model = HDBSCAN(
        min_cluster_size=min_topic_size,
        metric="euclidean",
        prediction_data=True,
        core_dist_n_jobs=-1
    )

    topic_model = BERTopic(
        language="english",
        calculate_probabilities=True,
        top_n_words=top_n_words,
        nr_topics="auto",
        vectorizer_model=vectorizer_model,
        ctfidf_model=ctfidf_model,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        representation_model=representation_model
    )

    topic_model = topic_model.fit(documents, embeddings)
    topic_distributions, _ = topic_model.approximate_distribution(documents, batch_size=100)
    
    return topic_model, topic_distributions


def generate_topic_labels(
    topic_info_df, 
    topic_model, 
    region="us-west-2", 
    model_id="us.meta.llama3-3-70b-instruct-v1:0",
    num_words=10, 
    num_docs=3, 
    temperature=0
):
    """
    Generate coherent topic labels using LLaMA via Amazon Bedrock for each topic in a BERTopic model.

    Parameters
    ----------
    topic_info_df : pd.DataFrame
        Output from topic_model.get_topic_info().
    topic_model : BERTopic
        The trained BERTopic model.
    region : str, default="us-west-2"
        AWS region for the Bedrock runtime client.
    model_id : str, default="us.meta.llama3-3-70b-instruct-v1:0"
        Model ID of the LLaMA model hosted on Bedrock.
    num_words : int, default=10
        Number of top words to include in the prompt.
    num_docs : int, default=3
        Number of representative documents to include in the prompt.
    temperature : float, default=0.3
        Temperature setting for LLaMA generation.

    Returns
    -------
    dict
        A dictionary mapping topic IDs to generated labels.
    """
    bedrock = session.client("bedrock-runtime", region_name=region)
    topic_labels = {}

    for _, row in topic_info_df.iterrows():
        topic_id = row["Topic"]
        if topic_id == -1:
            continue

        top_words = [word for word, _ in topic_model.get_topic(topic_id)[:num_words]]
        docs = topic_model.get_representative_docs(topic_id)[:num_docs]

        prompt = f"""
        <|begin_of_text|><|start_header_id|>system<|end_header_id|>
        You are generating topic labels for research documents related to Fisheries and Oceans Canada. 
        Given top words and representative documents from a BERTopic topic, generate a short, coherent, and descriptive label.
        Ignore superficial phrasing like "stock assessment" or "status report" in the representative documents - focus on species, issues, and themes discussed in the content.
        Top words may be noisy — use best judgment.

        - Top words: {', '.join(top_words)}

        - Representative documents:
        {"\n\n".join(docs)}

        Respond with the topic label ONLY.
        <|eot_id|><|start_header_id|>assistant<|end_header_id|>
        """

        body = json.dumps({
            "prompt": prompt,
            "temperature": temperature
        })

        try:
            response = bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=body
            )
            result = json.loads(response['body'].read())
            label = result.get("generation", "").strip()
            topic_labels[topic_id] = label if label else "Error"
            
        except Exception as e:
            print(str(e))
            topic_labels[topic_id] = "Error"

    return topic_labels


def generate_diagnostic_plots(topic_model, docs, embeddings, top_n=None, save_to_s3=True):
    """
    Generate the BERTopic visualizations
    and optionally save charts to s3
    """
    topic_cluster_viz = topic_model.visualize_documents(docs, embeddings=embeddings)
    if top_n is None:
        top_n = len(np.unique(topic_model.topics_))
    topwords_barchart = topic_model.visualize_barchart(top_n_topics=top_n)
    topic_similarity_heatmap = topic_model.visualize_heatmap()
    topic_scatterplot = topic_model.visualize_topics()

    return topic_cluster_viz, topwords_barchart, topic_similarity_heatmap, topic_scatterplot

def fetch_and_prepare_documents():
    """Fetched docs from OpenSearch"""
    fields = [
        'csas_html_year', 'html_doc_type', 'html_page_title', 'html_url',
        'html_language', 'page_content', 'chunk_embedding'
    ]
    fetched = op.fetch_specific_fields(op_client, DFO_HTML_FULL_INDEX_NAME, fields=fields)
    print("Fetched:", len(fetched))
    df = pd.DataFrame(fetched)
    # Compute doc_id from html_url
    df['doc_id'] = df['html_url'].apply(lambda x: hashlib.sha256(x.encode()).hexdigest())
    return df


def train_and_label_main_topics(docs_df):
    """Train BERTopic and use LLM to generate human readable labels"""

    docs = docs_df.query("html_doc_type != 'Proceedings'")
    print("# of All English docs except Proceedings:", len(docs))

    contents = docs['page_content'].tolist()
    embeddings = np.array(docs['chunk_embedding'].tolist())
    
    print("Starting initial topic modelling...")
    
    topic_model, topic_distributions = train_custom_topic_model(
        documents=contents,
        embeddings=embeddings,
        seed=17,
        min_df=2,
        max_df=0.7,
        min_topic_size=5,
        top_n_words=15,
        n_neighbors=15,
        n_components=7,
        min_dist=0.0
    )

    # Handle documents with zero-sum distributions
    zero_sum_mask = topic_distributions.sum(axis=1) == 0
    if zero_sum_mask.any():
        print(f"\nFound {zero_sum_mask.sum()} documents with zero-sum topic distributions")
        # Set these documents to topic -1 (outlier)
        topics_array = np.array(topic_model.topics_)
        topics_array[zero_sum_mask] = -1
        topic_model.topics_ = topics_array.tolist()


    topic_infos = topic_model.get_topic_info()
    llm_topics = generate_topic_labels(topic_infos, topic_model)
    topic_infos['llm_enhanced_topic'] = ["Miscellaneous"] + list(llm_topics.values())
    docs['topic_id'] = topic_model.topics_
    
    # For documents with zero-sum distributions, set probability to 0
    docs['topic_prob'] = topic_distributions.max(axis=1)
    docs.loc[zero_sum_mask, 'topic_prob'] = 0.0
    
    docs = docs.merge(
        topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )
    
    print("Finished initial topic modelling!")
    
    return topic_model, docs, topic_infos


def handle_outliers(docs, topic_model):
    """
    Train a BERTopic for the outliers from the first batch to generate some more labels
    Also use LLM to generate coherent labels
    """
    cols = [
        'html_language', 'html_doc_type', 'html_page_title', 'html_url', 
        'chunk_embedding', 'page_content', 'csas_html_year', 'topic_id'
    ]
    outliers = docs.query("topic_id == -1")
    if len(outliers) < 100:
        print("Too few outliers to train a separate topic model, mimimum 100 documents required")
        print("Number of outliers: ", len(outliers))
        return None, outliers, None

    outliers = outliers.loc[:, cols]
    outlier_contents = outliers['page_content'].tolist()
    outlier_embeddings = np.array(outliers['chunk_embedding'].tolist())

    print("Starting topic detection for outliers from previous batch")
    print("Number of outliers (topic with id -1): ", len(outliers))

    outlier_model, outlier_distributions = train_custom_topic_model(
        documents=outlier_contents,
        embeddings=outlier_embeddings,
        seed=17,
        min_df=1,
        max_df=0.8,
        min_topic_size=3,
        n_components=7,
        min_dist=0.0
    )
    highest_probabilities = outlier_distributions.max(axis=1)
    llm_topics_outlier = generate_topic_labels(
        outlier_model.get_topic_info(), outlier_model
    )
    outlier_topic_infos = outlier_model.get_topic_info()
    outlier_topic_infos['llm_enhanced_topic'] = ["Miscellaneous"] + list(llm_topics_outlier.values())
    outliers['topic_id'] = outlier_model.topics_
    outliers['topic_prob'] = highest_probabilities
    outliers = outliers.merge(
        outlier_topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )
    
    num_outliers_left = len(outliers.query("topic_id == -1"))
    print("Number of outliers remain: ", num_outliers_left)
    print("Finished topic detection for outliers")

    return outlier_model, outliers, outlier_topic_infos


def label_proceedings(docs_df, topic_model, outlier_model, topic_infos, outlier_topic_infos):
    print("Starting topics assignment to Proceedings documents")
    proceedings = docs_df.query('html_doc_type == "Proceedings"')
    proc_contents = proceedings['page_content'].tolist()
    proc_embeddings = np.array(proceedings['chunk_embedding'].tolist())
    print("# of Proceedings documents: ", len(proceedings))

    # First pass to the topic_model
    topic_ids, topic_distributions = topic_model.transform(proc_contents, embeddings=proc_embeddings)
    proceedings['topic_id'] = topic_ids
    proceedings['topic_prob'] = topic_distributions.max(axis=1)
    proceedings = proceedings.merge(
        topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )

    # Second pass to the outlier_model for Proceedings with topic -1
    if outlier_model is None:
        print("No outlier model or topic infos provided, possibly due to low number of outliers, skipping outlier assignment.")
        return proceedings

    cols = [
        'html_language', 'html_doc_type', 'html_page_title', 'html_url', 
        'chunk_embedding', 'page_content', 'csas_html_year', 'topic_id', 'topic_prob'
    ]
    proceeding_outliers = proceedings.loc[:, cols].query("topic_id == -1")
    proc_outlier_contents = proceeding_outliers['page_content'].tolist()
    proc_outlier_embeddings = np.array(proceeding_outliers['chunk_embedding'].tolist())
    proc_outlier_ids, proc_outlier_distributions = outlier_model.transform(
        proc_outlier_contents, embeddings=proc_outlier_embeddings
    )
    proceeding_outliers['topic_id'] = proc_outlier_ids
    proceeding_outliers['topic_prob'] = proc_outlier_distributions.max(axis=1)
    proceeding_outliers = proceeding_outliers.merge(
        outlier_topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )

    num_outliers_left = len(proceeding_outliers.query("topic_id == -1"))
    print("Number of outliers remain for Proceedings docs: ", num_outliers_left)
    print("Finished topics assignment to Proceedings documents")
    
    return pd.concat([proceedings.query("topic_id != -1"), proceeding_outliers], ignore_index=True)


def fetch_topics_from_db(conn_info: dict) -> pd.DataFrame:
    """
    Fetch topics from the derived_topics table in the database.
    
    Returns
    -------
    pd.DataFrame
        DataFrame containing topic_name, representation, and representative_docs
    """
    with psycopg.connect(**conn_info) as conn:
        query = """
        SELECT topic_name, representation, representative_docs
        FROM derived_topics
        """
        return pd.read_sql(query, conn)

def prepare_data_to_insert(combined_df, topic_infos, outlier_topic_infos, mode='retrain'):
    """
    Make dataframes looks exactly like the corresponding SQL table schemas
    
    Parameters
    ----------
    combined_df : pd.DataFrame
        Combined dataframe of all documents with their topics
    topic_infos : pd.DataFrame
        Topic information from the main model
    outlier_topic_infos : pd.DataFrame
        Topic information from the outlier model
    mode : str
        Either 'retrain' or 'predict'. In predict mode, only prepare documents_derived_topic table.
    """
    if mode == 'retrain':
        derived_topics_table = pd.concat(
            [topic_infos.query("Topic != -1"), outlier_topic_infos], ignore_index=True
        )
        if outlier_topic_infos is None:
            derived_topics_table = topic_infos.copy()
        derived_topics_table = derived_topics_table.loc[
            :, ["llm_enhanced_topic", "Representation", "Representative_Docs"]
        ].rename(
            columns={
                "llm_enhanced_topic": "topic_name",
                "Representation": "representation",
                "Representative_Docs": "representative_docs"
            }
        )
        derived_topics_table['last_updated'] = CURRENT_DATETIME
        
        # documents_derived_topic table
        combined_df['doc_id'] = combined_df['html_url'].apply(lambda x: hashlib.sha256(x.encode()).hexdigest())
        documents_derived_topic_table = combined_df.loc[
            :, ["doc_id", "html_url", "llm_enhanced_topic", "topic_prob"]
        ].rename(
            columns={
                "llm_enhanced_topic": "topic_name",
                "topic_prob": "confidence_score"
            }
        )
    else:
        derived_topics_table = None
        # documents_derived_topic table
        combined_df['doc_id'] = combined_df['html_url'].apply(lambda x: hashlib.sha256(x.encode()).hexdigest())
        documents_derived_topic_table = combined_df.loc[
            :, ["doc_id", "html_url", "topic_name", "topic_prob"]
        ].rename(
            columns={
                "topic_prob": "confidence_score"
            }
        )

    # Set confidence score to 0.0 for Miscellaneous topic
    documents_derived_topic_table.loc[
        documents_derived_topic_table['topic_name'] == "Miscellaneous",
        'confidence_score'
    ] = 0.0

    # Ensure all confidence scores are between 0 and 1
    documents_derived_topic_table['confidence_score'] = documents_derived_topic_table['confidence_score'].clip(0, 1)

    # add datetime now
    documents_derived_topic_table['last_updated'] = CURRENT_DATETIME

    return derived_topics_table, documents_derived_topic_table

def fetch_specific_documents_by_urls(client, index_name, urls, fields):
    """
    Fetch specific documents from OpenSearch by their _id (which are the sha256 hash of the html_url).
    Uses mget API for faster retrieval.
    
    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to fetch data from.
    urls : list
        List of document URLs to fetch (these are the _id fields).
    fields : list
        List of field names to retrieve from the documents.
        
    Returns
    -------
    list
        A list of dictionaries containing the specified fields for each document.
    """
    if not client.indices.exists(index=index_name):
        raise ValueError(f"Index '{index_name}' does not exist.")

    # Prepare the mget request body
    body = {
        "docs": [
            {
                "_index": index_name,
                "_id": hashlib.sha256(url.encode()).hexdigest(),
                "_source": fields
            }
            for url in urls
        ]
    }
    
    # Execute mget
    response = client.mget(body=body)
    
    # Extract results, filtering out any docs that weren't found
    return [
        doc["_source"] 
        for doc in response["docs"] 
        if doc["found"]
    ]

def fetch_new_documents():
    """Fetch only new documents that haven't been processed by topic modeling yet"""
    # Read tracking file
    tracking_path = f"batches/{args['batch_id']}/logs/html_ingestion/processed_and_ingested_html_docs.csv"
    s3_client = session.client('s3')
    
    try:
        # Download CSV from S3
        response = s3_client.get_object(
            Bucket=args['bucket_name'],
            Key=tracking_path
        )
        csv_content = response['Body'].read()
        tracking_df = pd.read_csv(io.BytesIO(csv_content))
    except Exception as e:
        print(f"No tracking file found or error reading file: {e}")
        return pd.DataFrame()
    
    urls_to_fetch = tracking_df['html_url'].tolist()
    
    if len(urls_to_fetch) == 0:
        print("No new documents to process")
        return pd.DataFrame()
    
    # Fetch these specific documents from OpenSearch
    fields = [
        'csas_html_year', 'html_doc_type', 'html_page_title', 'html_url',
        'html_language', 'page_content', 'chunk_embedding'
    ]
    fetched = fetch_specific_documents_by_urls(
        op_client, 
        DFO_HTML_FULL_INDEX_NAME, 
        urls_to_fetch,
        fields
    )
    df = pd.DataFrame(fetched)
    # Compute doc_id from html_url
    df['doc_id'] = df['html_url'].apply(lambda x: hashlib.sha256(x.encode()).hexdigest())
    return df

def main(dryrun=False, debug=False):
    
    print(f"Dryrun: {dryrun}, Debug: {debug}")
    # Check pipeline mode first
    pipeline_mode = args.get('pipeline_mode', 'full_update')
    if pipeline_mode == 'topics_only':
        print("Pipeline mode is 'topics_only'. Skipping topic modeling.")
        return

    # Now check topic modeling mode
    if args['topic_modelling_mode'] == 'retrain':
        print("BERTopic modelling mode: retrain")
        # Purge existing data
        with psycopg.connect(**conn_info) as conn:
            with conn.cursor() as cur:
                cur.execute("TRUNCATE TABLE documents_derived_topic CASCADE")
                cur.execute("TRUNCATE TABLE derived_topics CASCADE")
            conn.commit()
            print("Purged existing derived topics and documents derived topics data")
        
        # Fetch all documents and train new model
        docs_df = fetch_and_prepare_documents()
    else:  # predict mode
        print("BERTopic modelling mode: predict")
        # Fetch only new documents
        docs_df = fetch_new_documents()
        if len(docs_df) == 0:
            print("No new documents to process")
            return
        
        # Load existing models from S3
        s3_client = session.client('s3')
        bucket = args['bucket_name']
        s3_model_path = f"bertopic_model"
        
        # Create temporary directory
        temp_dir = "temp_outputs/bertopic"
        os.makedirs(temp_dir, exist_ok=True)
        
        # Download models
        s3_client.download_file(bucket, f"{s3_model_path}/topic_model.pkl", f"{temp_dir}/topic_model.pkl")
        topic_model = BERTopic.load(f"{temp_dir}/topic_model.pkl")
        
        try:
            s3_client.download_file(bucket, f"{s3_model_path}/outlier_model.pkl", f"{temp_dir}/outlier_model.pkl")
            outlier_model = BERTopic.load(f"{temp_dir}/outlier_model.pkl")
        except:
            outlier_model = None
        
        # Clean up
        os.remove(f"{temp_dir}/topic_model.pkl")
        if outlier_model is not None:
            os.remove(f"{temp_dir}/outlier_model.pkl")
        os.rmdir(temp_dir)
        
        # Process new documents
        docs = docs_df.query("html_doc_type != 'Proceedings'")
        contents = docs['page_content'].tolist()
        embeddings = np.array(docs['chunk_embedding'].tolist())
        
        # Predict topics
        topic_ids, topic_probs = topic_model.transform(contents, embeddings=embeddings)
        docs['topic_id'] = topic_ids
        docs['topic_prob'] = topic_probs.max(axis=1)
        
        # Get topic info
        topic_infos = topic_model.get_topic_info()
        docs = docs.merge(topic_infos, how="left", left_on="topic_id", right_on="Topic")
        docs = docs.drop(columns=['Topic'])

        # Fetch existing topics from database
        existing_topics = fetch_topics_from_db(conn_info)
        # Convert representation lists to strings for comparison
        topic_infos['representation_str'] = topic_infos['Representation'].apply(lambda x: '_'.join(x))
        existing_topics['representation_str'] = existing_topics['representation'].apply(lambda x: '_'.join(x))
        
        # Merge based on representation
        topic_infos = topic_infos.merge(
            existing_topics[['representation_str', 'topic_name']], 
            how='left',
            on='representation_str'
        )

        docs = docs.merge(topic_infos[['Topic', 'topic_name']], how="left", left_on="topic_id", right_on="Topic")

        # Handle outliers if outlier model exists
        if outlier_model is not None:
            outliers = docs.query("topic_id == -1")
            if len(outliers) >= 0:
                outlier_contents = outliers['page_content'].tolist()
                outlier_embeddings = np.array(outliers['chunk_embedding'].tolist())
                outlier_ids, outlier_probs = outlier_model.transform(outlier_contents, embeddings=outlier_embeddings)
                outliers['topic_id'] = outlier_ids
                outliers['topic_prob'] = outlier_probs.max(axis=1)
                
                # Handle zero probability cases
                zero_sum_mask = outlier_probs.sum(axis=1) == 0
                if zero_sum_mask.any():
                    outliers.loc[zero_sum_mask, 'topic_prob'] = 0.0
                
                outlier_topic_infos = outlier_model.get_topic_info()
                outliers = outliers.merge(outlier_topic_infos, how="left", left_on="topic_id", right_on="Topic")
                outliers = outliers.drop(columns=['Topic'])
                
                # Convert representation lists to strings for comparison
                outlier_topic_infos['representation_str'] = outlier_topic_infos['Representation'].apply(lambda x: '_'.join(x))
                
                # Merge based on representation
                outlier_topic_infos = outlier_topic_infos.merge(
                    existing_topics[['representation_str', 'topic_name']], 
                    how='left',
                    on='representation_str'
                )
                outliers = outliers.merge(outlier_topic_infos[['Topic', 'topic_name']], how="left", left_on="topic_id", right_on="Topic")
                outliers = outliers.drop(columns=['Topic'])
                docs = pd.concat([docs.query("topic_id != -1"), outliers], ignore_index=True)
        else:
            outlier_topic_infos = None
        
        # Process proceedings
        proceedings_df = label_proceedings(docs_df, topic_model, outlier_model, topic_infos, outlier_topic_infos)
        combined_df = pd.concat([docs, proceedings_df], ignore_index=True)
        
        # Prepare and insert data
        derived_topics_table, documents_derived_topic_table = prepare_data_to_insert(
            combined_df, topic_infos, outlier_topic_infos, mode='predict'
        )
        temp_dir = "temp_outputs/topic_modelling"
        if debug:
            os.makedirs(temp_dir, exist_ok=True)
            documents_derived_topic_table.to_csv(f"{temp_dir}/documents_derived_topic_table.csv", index=False)
        if not dryrun:
            pgsql.bulk_upsert_documents_derived_topic(documents_derived_topic_table, conn_info)
            
            # Update OpenSearch with derived topic categorizations
            derived_topic_categorizations = {}
            for doc_url, group in documents_derived_topic_table.groupby('html_url'):
                valid_topics = group['topic_name'].tolist()
                if valid_topics:
                    derived_topic_categorizations[doc_url] = valid_topics

            if derived_topic_categorizations:
                success, failed = op.bulk_update_categorizations(
                    op_client,
                    DFO_HTML_FULL_INDEX_NAME,
                    derived_topic_categorizations,
                    "derived_topic"
                )
                print(f"Updated derived topic categorizations: {success} successful, {failed} failed")
        
        return
    
    # Continue with retrain mode logic...
    topic_model, docs, topic_infos = train_and_label_main_topics(docs_df)
    outlier_model, outliers, outlier_topic_infos = handle_outliers(docs, topic_model)
    proceedings_df = label_proceedings(
        docs_df, topic_model, outlier_model, topic_infos, outlier_topic_infos
    )
    combined_df = pd.concat([docs.query("topic_id != -1"), outliers, proceedings_df], ignore_index=True)

    # sanity check before continuing
    assert len(outliers) == len(docs.query("topic_id == -1")), "Outliers count before / after does not match"
    assert len(docs_df) == len(proceedings_df) + len(docs.query("topic_id != -1")) + len(outliers), "Total count does not match"
    assert len(docs_df) == len(combined_df), "Total count does not match"

    derived_topics_table, documents_derived_topic_table = prepare_data_to_insert(
        combined_df, topic_infos, outlier_topic_infos, mode='retrain'
    )
    temp_dir = "temp_outputs/topic_modelling"
    if debug:
        os.makedirs(temp_dir, exist_ok=True)
        derived_topics_table.to_csv(f"{temp_dir}/derived_topics_table.csv", index=False)
        documents_derived_topic_table.to_csv(f"{temp_dir}/documents_derived_topic_table.csv", index=False)
    if not dryrun:
        pgsql.bulk_upsert_derived_topics(derived_topics_table, conn_info)
        pgsql.bulk_upsert_documents_derived_topic(documents_derived_topic_table, conn_info)
        
        # Update OpenSearch with derived topic categorizations
        derived_topic_categorizations = {}
        for doc_url, group in documents_derived_topic_table.groupby('html_url'):
            # Only include topics with confidence score > 0
            valid_topics = group[group['confidence_score'] > 0]['topic_name'].tolist()
            if valid_topics:
                derived_topic_categorizations[doc_url] = valid_topics

        if derived_topic_categorizations:
            success, failed = op.bulk_update_categorizations(
                op_client,
                DFO_HTML_FULL_INDEX_NAME,
                derived_topic_categorizations,
                "derived_topic"
            )
            print(f"Updated derived topic categorizations: {success} successful, {failed} failed")
    
    # Save models and data to S3
    s3_client = session.client('s3')
    bucket = args['bucket_name']
    s3_output_path = f"bertopic_model"
    
    # Create temporary directory for model files
    os.makedirs(temp_dir, exist_ok=True)
    
    # Save files locally first
    bertopic_dir = "bertopic"
    os.makedirs(f"{temp_dir}/{bertopic_dir}", exist_ok=True)
    docs_df.to_csv(f"{temp_dir}/{bertopic_dir}/train_data.csv", index=False)
    topic_model.save(f"{temp_dir}/{bertopic_dir}/topic_model.pkl", serialization="pickle")
    if outlier_model is not None:
        outlier_model.save(f"{temp_dir}/{bertopic_dir}/outlier_model.pkl", serialization="pickle")
    
    # Upload files to S3
    s3_client.upload_file(
        f"{temp_dir}/{bertopic_dir}/train_data.csv",
        bucket,
        f"{s3_output_path}/train_data.csv"
    )
    print(f"Saved train_data.csv to s3://{bucket}/{s3_output_path}/train_data.csv")
    
    s3_client.upload_file(
        f"{temp_dir}/{bertopic_dir}/topic_model.pkl",
        bucket,
        f"{s3_output_path}/topic_model.pkl"
    )
    print(f"Saved topic_model.pkl to s3://{bucket}/{s3_output_path}/topic_model.pkl")
    
    if outlier_model is not None:
        s3_client.upload_file(
            f"{temp_dir}/{bertopic_dir}/outlier_model.pkl",
            bucket,
            f"{s3_output_path}/outlier_model.pkl"
        )
        print(f"Saved outlier_model.pkl to s3://{bucket}/{s3_output_path}/outlier_model.pkl")
    
    # Clean up temporary files if not in debug mode
    if not debug:
        os.remove(f"{temp_dir}/{bertopic_dir}/train_data.csv")
        os.remove(f"{temp_dir}/{bertopic_dir}/topic_model.pkl")
        if outlier_model is not None:
            os.remove(f"{temp_dir}/{bertopic_dir}/outlier_model.pkl")
        os.rmdir(temp_dir)

if __name__ == "__main__":
    main(dryrun=False, debug=True)