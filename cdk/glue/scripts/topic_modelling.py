#!/usr/bin/env python
# coding: utf-8

import pandas as pd
import numpy as np
from opensearchpy import OpenSearch
import boto3
from sklearn.feature_extraction.text import CountVectorizer
from umap import UMAP
from hdbscan import HDBSCAN
from bertopic import BERTopic
from bertopic.representation import MaximalMarginalRelevance
from bertopic.vectorizers import ClassTfidfTransformer
import psycopg

import sys
import os
from datetime import datetime
import json
from typing import Dict, List, Iterable, Literal, Optional, Tuple

import src.aws_utils as aws
import src.opensearch as op
import src.pgsql as pgsql

session = aws.session

secrets = aws.get_secret(secret_name=OPENSEARCH_SEC,region_name=REGION_NAME)
opensearch_host = aws.get_parameter_ssm(
    parameter_name=OPENSEARCH_HOST, region_name=REGION_NAME
)
# Connect to OpenSearch
auth = (secrets['username'], secrets['password'])

op_client = OpenSearch(
    hosts=[{'host': opensearch_host, 'port': 443}],
    http_compress=True,
    http_auth=auth,
    use_ssl=True,
    verify_certs=True,
    timeout=60,
    max_retries=3,
    retry_on_timeout=True
)

rds_hosturl = aws.get_parameter_ssm('/dfo/rds/host_url')
rds_secret = aws.get_secret(aws.get_parameter_ssm("/dfo/rds/secretname"))

conn_info = {
    "host": rds_hosturl,
    "port": 5432,
    "dbname": "postgres",
    "user": rds_secret['username'],
    "password": rds_secret['password']
}

DFO_HTML_FULL_INDEX_NAME = "dfo-html-full-index" # to be replaced with environment var
BUCKET_NAME = "dfo-test-datapipeline  Info" # to be replaced with environment var
DATETIME = datetime.now().strftime(r"%Y-%m-%d %H:%M:%S") # to be replaced with environment var

def fetch_specific_fields(client, index_name, fields, scroll="2m", batch_size=5000):
    """
    Fetch all rows (documents) from an OpenSearch index, retrieving only specific fields,
    using the Scroll API to bypass the 10,000-document limit.

    Parameters
    ----------
    client : OpenSearch
        The OpenSearch client instance.
    index_name : str
        The name of the index to fetch data from.
    fields : list of str
        List of field names to retrieve from the documents.
    scroll : str, optional
        Time the scroll context should be kept alive (default is "2m").
    batch_size : int, optional
        Number of documents per scroll request (default is 5000).

    Returns
    -------
    list
        A list of dictionaries containing the specified fields for each document.
    """
    if not client.indices.exists(index=index_name):
        raise ValueError(f"Index '{index_name}' does not exist.")

    all_results = []

    # Initial search request to get the scroll_id
    response = client.search(
        index=index_name,
        _source=fields,
        scroll=scroll,
        size=batch_size,
        timeout=60
    )

    scroll_id = response.get("_scroll_id")
    hits = response.get("hits", {}).get("hits", [])

    while hits:
        all_results.extend(hit["_source"] for hit in hits)

        # Fetch next batch
        response = client.scroll(scroll_id=scroll_id, scroll=scroll)
        scroll_id = response.get("_scroll_id")
        hits = response.get("hits", {}).get("hits", [])

    # Clear the scroll context to free resources
    client.clear_scroll(scroll_id=scroll_id)

    return all_results


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
        Ignore superficial phrasing like “stock assessment” or “status report” in the representative documents - focus on species, issues, and themes discussed in the content.
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
    fetched = fetch_specific_fields(op_client, DFO_HTML_FULL_INDEX_NAME, fields=fields)
    print("Fetched:", len(fetched))
    return pd.DataFrame(fetched)


def train_and_label_main_topics(docs_df):
    """Train BERTopic and use LLM to generate human readable labels"""

    docs = docs_df.query("html_doc_type != 'Proceedings'")
    print("# of All English docs except Proceedings:", len(docs))

    contents = docs['page_content'].tolist()
    embeddings = np.array(docs['chunk_embedding'].tolist())
    
    print("Starting initial topic modelling...")
    
    topic_model, topic_probs = train_custom_topic_model(
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

    topic_infos = topic_model.get_topic_info()
    llm_topics = generate_topic_labels(topic_infos, topic_model)
    topic_infos['llm_enhanced_topic'] = ["Miscellaneous"] + list(llm_topics.values())
    docs['topic_id'] = topic_model.topics_
    # highest_probabilities = topic_probs.max(axis=1) ## UNCOMMENT THIS LINE TO USE THE PROBABILITIES
    # docs['topic_prob'] = highest_probabilities
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

    outlier_model, outlier_topic_probs = train_custom_topic_model(
        documents=outlier_contents,
        embeddings=outlier_embeddings,
        seed=17,
        min_df=1,
        max_df=0.8,
        min_topic_size=3,
        n_components=7,
        min_dist=0.0
    )
    # highest_probabilities = outlier_topic_probs.max(axis=1)
    llm_topics_outlier = generate_topic_labels(
        outlier_model.get_topic_info(), outlier_model
    )
    outlier_topic_infos = outlier_model.get_topic_info()
    outlier_topic_infos['llm_enhanced_topic'] = ["Miscellaneous"] + list(llm_topics_outlier.values())
    # outtlier_topic_infos['topic_prob] = highest_probabilities
    outliers['topic_id'] = outlier_model.topics_
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
    topic_ids = topic_model.transform(proc_contents, embeddings=proc_embeddings)[0]
    proceedings['topic_id'] = topic_ids
    proceedings = proceedings.merge(
        topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )

    # Second pass to the outlier_model for Proceedings with topic -1
    if outlier_model is None:
        print("No outlier model or topic infos provided, possibly due to low number of outliers, skipping outlier assignment.")
        return proceedings

    cols = [
        'html_language', 'html_doc_type', 'html_page_title', 'html_url', 
        'chunk_embedding', 'page_content', 'csas_html_year', 'topic_id'
    ]
    proceeding_outliers = proceedings.loc[:, cols].query("topic_id == -1")
    proc_outlier_contents = proceeding_outliers['page_content'].tolist()
    proc_outlier_embeddings = np.array(proceeding_outliers['chunk_embedding'].tolist())
    proc_outlier_label = outlier_model.transform(
        proc_outlier_contents, embeddings=proc_outlier_embeddings
    )[0]
    proceeding_outliers['topic_id'] = proc_outlier_label
    proceeding_outliers = proceeding_outliers.merge(
        outlier_topic_infos, how="left", left_on="topic_id", right_on="Topic"
    )

    num_outliers_left = len(proceeding_outliers.query("topic_id == -1"))
    print("Number of outliers remain for Proceedings docs: ", num_outliers_left)
    print("Finished topics assignment to Proceedings documents")
    
    return pd.concat([proceedings.query("topic_id != -1"), proceeding_outliers], ignore_index=True)


def prepare_data_to_insert(combined_df, topic_infos, outlier_topic_infos):
    """
    Make dataframes looks exactly like the corresponding SQL table schemas
    """

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

    # documents_derived_topic table
    documents_derived_topic_table  = combined_df.loc[
        :, ["html_url", "llm_enhanced_topic"]
    ].rename(
        columns={
            "llm_enhanced_topic": "topic_name"
        }
    )

    # add datetime now
    derived_topics_table['last_updated'] = DATETIME
    documents_derived_topic_table['last_updated'] = DATETIME

    return derived_topics_table, documents_derived_topic_table

def bulk_upsert_derived_topics(derived_topics_table, conn_info: dict, upsert=True):
    """
    Given a dataframe exactly like the SQL table, insert the rows into the database
    """
    
    sql = """
    INSERT INTO derived_topics (topic_name, representation, representative_docs, last_updated)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (topic_name)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            representation = EXCLUDED.representation,
            representative_docs = EXCLUDED.representative_docs,
            last_updated = EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"

    data = [
        (
            row["topic_name"],
            row["representation"],
            row["representative_docs"],
            row["last_updated"],
        )
        for _, row in derived_topics_table.iterrows()
    ]

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, data)
        conn.commit()


def bulk_upsert_documents_derived_topic(documents_derived_topic_table, conn_info: dict, upsert=True):
    """
    Given a dataframe exactly like the SQL table, insert the rows into the database
    """

    sql = """
    INSERT INTO documents_derived_topic (html_url, topic_name, last_updated)
    VALUES (%s, %s, %s)
    ON CONFLICT (html_url, topic_name)
    """
    if upsert:
        sql += "DO NOTHING;"
    else:
        sql += "DO NOTHING;"  # keeping logic consistent for now

    data = [
        (row["html_url"], row["topic_name"], row["last_updated"])
        for _, row in documents_derived_topic_table.iterrows()
    ]

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, data)
        conn.commit()

def main(dryrun=False):
    # docs_df = fetch_and_prepare_documents().query("csas_html_year == 2017 & html_language == 'English'")
    docs_df = fetch_and_prepare_documents().query("html_language == 'English'")
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
        combined_df, topic_infos, outlier_topic_infos
    )

    if not dryrun:
        bulk_upsert_derived_topics(derived_topics_table, conn_info)
        bulk_upsert_documents_derived_topic(documents_derived_topic_table, conn_info)
    
    # save the dataset that it was trained on
    # docs_df.csv("../export/bertopic/train_data.csv", index=False)
    aws.save_to_s3(
        "bertopic_model/train_data.csv",
        bucket_name=BUCKET_NAME,
        object_name="bertopic/train_data.csv"
    )
    # save the topic models to s3
    # topic_model.save("../export/bertopic/topic_model.pkl", serialization="pickle")
    # outlier_model.save("../export/bertopic/outlier_model.pkl", serialization="pickle")
    aws.save_to_s3(
        "../bertopic_model/topic_model.pkl",
        bucket_name=BUCKET_NAME,
        object_name="bertopic/topic_model.pkl"
    )
    if outlier_model is not None:
        aws.save_to_s3(
            "../bertopic_model/outlier_model.pkl",
            bucket_name=BUCKET_NAME,
            object_name="bertopic/outlier_model.pkl"
        )
    

if __name__ == "__main__":
    main(dryrun=False)