## Table of Contents

- [Table of Contents](#table-of-contents)
- [Topic Modeling Architecture: A Deep Dive](#topic-modeling-architecture-a-deep-dive)
- [Core Philosophy: Leveraging BERTopic](#core-philosophy-leveraging-bertopic)
- [The Modeling Pipeline: A Step-by-Step Breakdown](#the-modeling-pipeline-a-step-by-step-breakdown)
  - [1. Text Vectorization and Preprocessing](#1-text-vectorization-and-preprocessing)
  - [2. Dimensionality Reduction with UMAP](#2-dimensionality-reduction-with-umap)
  - [3. Density-Based Clustering with HDBSCAN](#3-density-based-clustering-with-hdbscan)
  - [4. Topic Representation with c-TF-IDF and MMR](#4-topic-representation-with-c-tf-idf-and-mmr)
- [Advanced Strategy: A Two-Stage Modeling Approach](#advanced-strategy-a-two-stage-modeling-approach)
  - [The Primary Model: Discovering Core Topics](#the-primary-model-discovering-core-topics)
  - [The Outlier Model: Uncovering Niche Subjects](#the-outlier-model-uncovering-niche-subjects)
- [Intelligent Topic Labeling with Generative AI](#intelligent-topic-labeling-with-generative-ai)
- [Operational Framework](#operational-framework)
  - [Document Processing and Confidence Scoring](#document-processing-and-confidence-scoring)
  - [Model Persistence: Retrain vs. Predict Modes](#model-persistence-retrain-vs-predict-modes)
- [Final Remarks on Methodology and Parameter Selection](#final-remarks-on-methodology-and-parameter-selection)
- [Future Enhancement: Zero-Shot Topic Modeling](#future-enhancement-zero-shot-topic-modeling)
- [The Mechanism: Hybrid Assignment and Discovery](#the-mechanism-hybrid-assignment-and-discovery)
  - [1. Defining Known Topics of Interest](#1-defining-known-topics-of-interest)
  - [2. Similarity-Based Assignment](#2-similarity-based-assignment)
  - [3. Unsupervised Discovery of Remaining Documents](#3-unsupervised-discovery-of-remaining-documents)
- [Conceptual Implementation for Our Project](#conceptual-implementation-for-our-project)
  - [1. Zero-Shot Topic Modeling with Pre-Computed Embeddings](#1-zero-shot-topic-modeling-with-pre-computed-embeddings)
  - [2. Zero-Shot Topic Modeling with Pretrained Embedding Model (sentence-transformers/all-MiniLM-L6-v2)](#2-zero-shot-topic-modeling-with-pretrained-embedding-model-sentence-transformersall-minilm-l6-v2)
  - [Specific changes in the codebase](#specific-changes-in-the-codebase)
    - [Key Changes Needed:](#key-changes-needed)
- [Integrating Zero-Shot Topic Modeling with BERTopic](#integrating-zero-shot-topic-modeling-with-bertopic)
  - [Pseudocode for Modification](#pseudocode-for-modification)
  - [Explanation of the Approach](#explanation-of-the-approach)
    - [Strategic Advantages for Our System](#strategic-advantages-for-our-system)
- [Further Reading](#further-reading)

## Topic Modeling Architecture: A Deep Dive

This document provides a comprehensive technical overview of the topic modeling component. The system is engineered to automatically analyze and categorize a large corpus of documents into coherent, interpretable topics. Our approach is distinguished by its use of state-of-the-art models, a unique two-stage clustering strategy to uncover niche subjects, and the integration of Large Language Models (LLMs) for generating human-readable topic labels. All modeling is performed with a fixed seed (`seed=42`) to ensure that all experiments and production runs are fully reproducible.

## Core Philosophy: Leveraging BERTopic

The foundation of our architecture is the **BERTopic** framework. This library was selected for its modern approach, which moves beyond traditional frequency-based methods. BERTopic leverages contextual embeddings from Transformer models (like BERT) to capture the semantic meaning of text. This results in topics that are grouped by meaning and context, not just shared keywords. Its inherent modularity also allows us to fine-tune each stage of the pipeline—from vectorization to clustering—for optimal performance within our specific domain.

## The Modeling Pipeline: A Step-by-Step Breakdown

The topic modeling process is executed through a carefully configured pipeline. Each component is optimized to ensure the final topics are distinct, relevant, and meaningful.

### 1. Text Vectorization and Preprocessing

The initial step involves transforming the raw text into a structured format suitable for machine learning. This is handled by a `CountVectorizer`, configured to capture the most significant terms.

- **N-grams and Stopwords:** We use an `ngram_range` of `(1, 2)`. This configuration is crucial as it allows the model to capture not only single words (unigrams) but also important two-word phrases (bigrams). Concepts like "climate change" or "vessel monitoring" carry significantly more meaning than their constituent words alone, and including them leads to more precise and contextually rich topics.

- **Document Frequency Thresholds:** The vectorizer is precisely tuned with a minimum document frequency (`min_df=2`) and a maximum (`max_df=0.5`). This is a critical noise-reduction strategy.
  - **`min_df=2`:** This setting filters out terms that appear in only a single document. Such terms are often spelling errors, processing artifacts, or so highly specific that they cannot contribute to a recurring, generalizable topic. By requiring a term to appear in at least two documents, we establish a baseline of significance.
  - **`max_df=0.5`:** This threshold excludes terms that appear in more than 50% of all documents. In any specialized corpus, certain words (e.g., "department," "report" in an administrative context) become so ubiquitous they are functionally "stopwords." Including them would dilute topic meanings and reduce the distinctiveness between topics. This cutoff ensures the model focuses on terms that help differentiate document groups.

### 2. Dimensionality Reduction with UMAP

The vectorized text embeddings exist in a very high-dimensional space. We use **Uniform Manifold Approximation and Projection (UMAP)** to intelligently reduce this complexity before clustering.

- **`n_components=7`:** This parameter, which sets the target dimension, was determined to be the "sweet spot" for this dataset. A lower number risks oversimplifying the data and merging distinct topics, while a higher number can retain too much noise and prevent clear clusters from forming. Experimentation showed that 7 dimensions best preserve the topical complexity required for robust clustering.
- **`n_neighbors=15`:** This parameter dictates how UMAP balances local versus global structure. A value of `15` instructs the algorithm to consider a moderate-sized local neighborhood when learning the data's structure. This is a robust default that effectively captures detailed local patterns (which form topics) without being overly influenced by micro-structures that may just be noise.
- **`min_dist=0.0`:** This parameter controls how tightly UMAP packs points together. By setting it to `0.0`, we encourage UMAP to create extremely dense, tightly-packed clusters. This is a deliberate strategic choice, as it produces an output that is optimally suited for the subsequent HDBSCAN clustering step, which excels at identifying and separating such dense regions.

### 3. Density-Based Clustering with HDBSCAN

Once the data is in a manageable dimension, we use **HDBSCAN** to group similar documents.

- **`min_topic_size=5`:** This parameter sets the minimum number of documents required to constitute a valid topic. We set this to `5` to enforce a standard of topical significance. Any grouping with fewer than five documents is considered too small to be a reliable, recurring theme and is more likely an incidental collection of documents. This prevents the model from generating a long tail of spurious, low-value topics.

### 4. Topic Representation with c-TF-IDF and MMR

After documents are clustered, we distill what each topic is about.

- **`top_n_words=15`:** To represent each topic, we extract the top 15 words as determined by the c-TF-IDF (BM25) algorithm. This number provides sufficient detail for an analyst (or a downstream LLM) to grasp the nuances of a topic without being overwhelming.
- **`Maximal Marginal Relevance (MMR)`:** To generate a more concise and readable summary for each topic, we use MMR with parameters `rep_diversity=0.5` and `rep_top_n_words=5`. This creates a secondary, highly-polished representation. The `rep_top_n_words=5` setting creates a quick 5-word summary, while a `rep_diversity=0.5` offers a perfect 50/50 balance between choosing words that are highly relevant to the topic and words that are different from each other. This prevents redundant summaries like "fish, fishes, fishing, fishery, fisherman" and promotes diverse, descriptive labels instead.

## Advanced Strategy: A Two-Stage Modeling Approach

A significant innovation in this architecture is the two-stage process for topic discovery. This ensures that we capture not only broad themes but also nuanced sub-topics that would otherwise be lost.

### The Primary Model: Discovering Core Topics

The first stage trains the BERTopic model with the standard, relatively strict configuration detailed above. This model excels at identifying the most prevalent topics. Documents that cannot be assigned are designated as outliers and passed to the next stage.

### The Outlier Model: Uncovering Niche Subjects

If a sufficient number of outliers are found, a second BERTopic model is trained *exclusively on these documents*. This model uses a deliberately more lenient configuration to find smaller, hidden themes.

- **`min_df=1` and `max_df=0.8`:** For the outlier-only corpus, we relax the frequency thresholds. A term appearing in just one of these documents (`min_df=1`) could now be significant for a niche topic. Similarly, a term could appear in a high percentage of these few documents and still be relevant, so we raise the upper ceiling to `max_df=0.8`.
- **`min_topic_size=3`:** The very purpose of this model is to find smaller clusters. By lowering the minimum topic size to `3`, we empower the model to formally recognize these highly specific sub-topics, which were correctly identified as outliers by the more stringent primary model.

## Intelligent Topic Labeling with Generative AI

To transcend the limitations of simple keyword lists and produce truly descriptive topic names, we leverage a Large Language Model (LLaMA via Amazon Bedrock). This final step translates the statistical output of the model into meaningful, human-centric labels that accurately reflect the core theme of the documents within a topic.

- **Comprehensive Context Injection:** The quality of an LLM's output is directly proportional to the quality of its input. Therefore, we provide the model with a rich, multi-faceted prompt. To be mindful of the model's context window limitations while still providing deep context, the prompt is programmatically assembled to include the top keywords of the topic cluster and the **full text content of the top 3 most representative documents** for that topic cluster. This number offers a deliberate balance, giving the model enough source material to understand nuance but also be mindful of not overloading the model with too much context.

- **Instruction-Tuned Generation:** The prompt concludes with a crucial set of instructions designed to ensure labeling accuracy. The model is specifically cautioned that while the top keywords are strong indicators, they can sometimes be noisy. Therefore, it is directed to give greater analytical weight to the full text of the three representative documents, treating them as the primary source of truth for the topic's core theme. The ultimate instruction is to synthesize this comprehensive information into a concise label that is as broadly applicable as possible to all documents within the cluster, not just the three examples it was shown.

- **Controlled and Factual Output:** To ensure the output is both descriptive and reliable, the model's `temperature` is set to a low value of `0.4`. This discourages the LLM from making overly creative or speculative leaps, instead guiding it to produce labels that are factually grounded in the provided documents. This process is what elevates a topic from an ambiguous list like `["vessel", "monitoring", "license"]` into a clear, actionable, and immediately understandable label such as **"Regulatory Compliance for Vessel Monitoring and Licensing"**.

## Operational Framework

The system is designed with real-world MLOps principles in mind, including robust document handling and distinct operational modes for maintenance and inference.

### Document Processing and Confidence Scoring

The end-to-end pipeline includes special logic for handling different document types and calculates a probability-based `confidence score` for every topic assignment. This score is vital metadata, allowing downstream applications to gauge the reliability of a given topic assignment.

### Model Persistence: Retrain vs. Predict Modes

The system supports two operational modes:

- **Retrain Mode:** This mode trains entirely new models from the full dataset. It is used when significant new data is available or model configurations have been updated, ensuring the models remain fresh and accurate.
- **Predict Mode:** For day-to-day operations, this mode loads pre-trained models from S3 to process only new documents. This ensures topic consistency over time and is highly efficient.

## Final Remarks on Methodology and Parameter Selection

It is important to contextualize the work and parameter values detailed in this document as part of a successful **Proof of Concept (POC)**. The settings herein were not chosen arbitrarily, but represent a strong baseline established through a methodical process of iterative experimentation, balancing insights from NLP best practices with empirical results from our specific document corpus. This iterative tuning is essential for any unsupervised learning method.

By its very nature, an unsupervised approach discovers emergent patterns in data without predefined labels. This makes it a powerful tool for exploration, but it also means the model's output can be sensitive to the statistical properties of the input text, such as noise, document length, and linguistic diversity.
While no unsupervised method is perfect, this first iteration successfully validated the viability of our approach and serves as an excellent starting point for future enhancements and the development of a more sophisticated system.

## Future Enhancement: Zero-Shot Topic Modeling

While our current system effectively discovers emergent topics, a key opportunity for advancement is to incorporate predefined subjects directly into the modeling process.

Building upon the concept of **Guided Topic Modeling**, a more flexible and powerful implementation involves using **BERTopic's Zero-Shot Topic Modeling** capability. This advanced technique allows us to specify a list of anticipated topics relevant to our mandate (e.g., specific regulations, species, or scientific initiatives). The model then attempts to classify documents under these predefined headings.

Critically, any documents that do not align with our specified topics are passed through the standard unsupervised clustering pipeline. This creates a **powerful hybrid system**—one that can track known areas of interest while simultaneously retaining its exploratory power to uncover novel or unexpected themes from the data.

## The Mechanism: Hybrid Assignment and Discovery

Zero-Shot Topic Modeling in BERTopic intelligently combines guided assignment with unsupervised discovery through a distinct workflow:

### 1. Defining Known Topics of Interest

The process begins by defining a `zeroshot_topic_list`—a simple list of descriptive labels for topics we expect to find. For our context, this list would include subjects central to the department's operations, such as:

- *Impact of Climate Change on Salmon Stocks*
- *Fisheries Act Regulatory Compliance*
- *Monitoring of Aquatic Invasive Species*
- *Marine Mammal Protection and Incidents*

The clarity and descriptiveness of these labels are crucial, as they are embedded into the same semantic space as our documents for comparison.

### 2. Similarity-Based Assignment

BERTopic calculates the cosine similarity between each document's embedding and the embedding of each predefined topic label. A document is assigned to a zero-shot topic if its semantic similarity score exceeds a specified `zeroshot_min_similarity` threshold (e.g., `0.80`). This threshold acts as a **confidence gate**, ensuring only highly relevant documents are matched to our predefined topics.

### 3. Unsupervised Discovery of Remaining Documents

Documents that fail to meet the similarity threshold for any predefined topic are **not discarded**. Instead, they are collected and processed by BERTopic's **standard unsupervised pipeline** (UMAP reduction followed by HDBSCAN clustering).

This is where the true power of the hybrid approach lies—if a new, unforeseen issue emerges in the literature (e.g., a previously unknown marine disease or novel fishing technology), the system will automatically discover and form a new topic cluster around it.

## Conceptual Implementation for Our Project

The following pseudo-code illustrates how this would be implemented within our system:

### 1. Zero-Shot Topic Modeling with Pre-Computed Embeddings

```python
# Assume 'docs' is a list of document texts from our corpus.
# Assume 'embeddings' is a NumPy array of pre-computed document embeddings.

# 1. Define the predefined topics relevant to Fisheries and Oceans Canada.
zeroshot_topic_list = [
    "Fisheries Act Regulatory Compliance",
    "Aquatic Invasive Species Monitoring",
    "Impact of Climate Change on Salmon Stocks",
    "Marine Mammal Protection and Incidents",
    "SARA Species at Risk Reporting",
    "Ocean Acidification Research"
]

from bertopic import BERTopic

# 2. Initialize BERTopic with zero-shot parameters.
# Note that we do NOT pass an `embedding_model` since we provide them directly.
# The similarity threshold is a key parameter to tune.
topic_model = BERTopic(
    min_topic_size=10,                    # For newly discovered topics
    zeroshot_topic_list=zeroshot_topic_list,
    zeroshot_min_similarity=0.80,         # High threshold ensures strong thematic matches
    verbose=True
)

# 3. Fit the model, passing both the documents and their pre-computed embeddings.
topics, probabilities = topic_model.fit_transform(docs, embeddings=embeddings)

# 4. Inspect the results.
# The output will contain a mix of our predefined topics and newly discovered ones.
# topic_model.get_topic_info()
```

### 2. Zero-Shot Topic Modeling with Pretrained Embedding Model (sentence-transformers/all-MiniLM-L6-v2)

```python
# Assume 'docs' is a list of document texts from our corpus.

# 1. Define the predefined topics relevant to Fisheries and Oceans Canada.
zeroshot_topic_list = [
    ...
]

from bertopic import BERTopic

# 2. Initialize BERTopic with zero-shot parameters. For this one it's using a pretrained embedding model.
# The similarity threshold is a key parameter to tune.
topic_model = BERTopic(
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",
    min_topic_size=10,
    zeroshot_topic_list=zeroshot_topic_list,
    zeroshot_min_similarity=0.80,  # High threshold ensures strong thematic matches
    verbose=True
)

# 3. Fit the model to our documents.
topics, probabilities = topic_model.fit_transform(docs)

# 4. Inspect the results.
# The output will contain a mix of our predefined topics and newly discovered ones.
# topic_model.get_topic_info()
```

### Specific changes in the codebase

This section will describe the specific changes made to the codebase to implement the zero-shot topic modeling. Please note that this is all hypothetical, as we have not yet implemented the zero-shot topic modeling in the codebase ourselves, so there might be other necessary changes that are not mentioned to make the zero-shot topic modeling work for the entire system as a whole. Thus, all code provided below will be in the form of pseudo-code.

#### Key Changes Needed:

## Integrating Zero-Shot Topic Modeling with BERTopic

To incorporate zero-shot topic modeling into your existing BERTopic pipeline while retaining the original logic, we will primarily modify the `train_custom_topic_model` function and how parameters are passed to it. This approach allows for predefined topics to be identified alongside newly discovered topics from clustering.

### Pseudocode for Modification

Here's a detailed pseudocode representation of the changes, maintaining your script's structure and variable names:

```python
# ... (rest of imports and initializations) ...

# New: Add arguments for zero-shot topic list and similarity threshold
args = getResolvedOptions(sys.argv, [
    # ... (existing args) ...
    'zeroshot_topic_list', # New argument for a JSON string of predefined topics
    'zeroshot_min_similarity' # New argument for similarity threshold
])

# ... (rest of global variables and init_opensearch_client) ...

# New: Parse zero-shot topics and similarity from arguments
# We use a default empty list and a default similarity of 0.7 if not provided.
ZERO_SHOT_TOPIC_LIST = json.loads(args.get('zeroshot_topic_list', '[]'))
ZERO_SHOT_MIN_SIMILARITY = float(args.get('zeroshot_min_similarity', 0.7))

# or fetch a file containing the zero-shot topics from s3 directly
s3_bucket_name = "my-bucket"
s3_key = "zeroshot_topics.json"
ZERO_SHOT_TOPIC_LIST = fetch_zero_shot_topics_from_s3(s3_bucket_name, s3_key)


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
    min_dist=0.0,
    # New parameters for zero-shot:
    zeroshot_topic_list=None,
    zeroshot_min_similarity=None
):
    """
    This function trains a BERTopic model with custom components, now supporting zero-shot topic modeling.
    It returns the trained model and topic distributions.
    """
    
    # ... (existing representation_model, vectorizer_model, ctfidf_model, umap_model, hdbscan_model remain unchanged) ...

    # Initialize BERTopic model
    topic_model = BERTopic(
        language="english",
        calculate_probabilities=True,
        top_n_words=top_n_words,
        nr_topics="auto", # This parameter dynamically adjusts when zero-shot topics are used
        vectorizer_model=vectorizer_model,
        ctfidf_model=ctfidf_model,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        representation_model=representation_model,
        # NEW: Pass zero-shot parameters directly to the BERTopic constructor
        zeroshot_topic_list=zeroshot_topic_list,
        zeroshot_min_similarity=zeroshot_min_similarity
    )

    # Fit the model. BERTopic will automatically manage zero-shot assignment before clustering
    # if `zeroshot_topic_list` is provided.
    topic_model = topic_model.fit(documents, embeddings)
    
    # Approximate distribution remains the same
    topic_distributions, _ = topic_model.approximate_distribution(documents, batch_size=100)
    
    return topic_model, topic_distributions


# ... (rest of generate_topic_labels, generate_diagnostic_plots, fetch_and_prepare_documents functions) ...


def train_and_label_main_topics(docs_df):
    """
    This function trains BERTopic (now with potential zero-shot capability) and uses an LLM to generate human-readable labels.
    """

    docs = docs_df.query("html_doc_type != 'Proceedings'")
    print("# of All English docs except Proceedings:", len(docs))

    contents = docs['page_content'].tolist()
    embeddings = np.array(docs['chunk_embedding'].tolist())
    
    print("Starting initial topic modeling (potentially with zero-shot topics)...")
    
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
        min_dist=0.0,
        # NEW: Pass the globally defined zero-shot arguments to the training function
        zeroshot_topic_list=ZERO_SHOT_TOPIC_LIST,
        zeroshot_min_similarity=ZERO_SHOT_MIN_SIMILARITY
    )

    # ... (rest of the function for handling zero-sum distributions and initial topic info) ...

    # Handle topic information and LLM labeling
    topic_infos = topic_model.get_topic_info()

    # Generate LLM labels only for newly discovered topics (excluding the outlier topic -1).
    # This assumes that zero-shot topics either have their final labels from `zeroshot_topic_list`
    # or will be handled appropriately by subsequent logic if LLM-enhanced labels are still desired for them.
    llm_topics = generate_topic_labels(
        topic_infos.query("Topic != -1"), topic_model
    )
    
    # Initialize 'llm_enhanced_topic' with the 'Name' provided by BERTopic (which will include zero-shot names).
    topic_infos['llm_enhanced_topic'] = topic_infos['Name'] 
    
    # Overwrite with LLM-generated labels for the relevant topics.
    for topic_id, label in llm_topics.items():
        if topic_id != -1: 
            topic_infos.loc[topic_infos['Topic'] == topic_id, 'llm_enhanced_topic'] = label

    # Special handling for the miscellaneous topic (-1)
    topic_infos.loc[topic_infos['Topic'] == -1, 'llm_enhanced_topic'] = "Miscellaneous"
    
    docs['topic_id'] = topic_model.topics_
    # ... (rest of `train_and_label_main_topics` remains unchanged) ...


def handle_outliers(docs, topic_model):
    """
    This function trains a BERTopic model for outliers from the initial batch to generate additional labels.
    Typically, this processes "true" outliers (-1) from the HDBSCAN step, not documents unassigned by zero-shot.
    """
    # ... (existing logic remains largely the same) ...
    # If the outlier model also needs zero-shot capability, `train_custom_topic_model` call here
    # would also require `zeroshot_topic_list` and `zeroshot_min_similarity` parameters.
    # We assume for now only the main model uses it.


def label_proceedings(docs_df, topic_model, outlier_model, topic_infos, outlier_topic_infos):
    """
    This function assigns topics to Proceedings documents using the trained models.
    """
    # ... (existing logic for `transform` remains the same) ...
    # The `transform` method will automatically leverage the zero-shot definitions
    # if the `topic_model` was trained with them.


# ... (rest of fetch_topics_from_db, prepare_data_to_insert, fetch_specific_documents_by_urls, fetch_new_documents functions) ...


def main(dryrun=False, debug=False):
    # ... (existing pipeline mode check) ...

    if args['topic_modelling_mode'] == 'retrain':
        # ... (existing purge logic) ...
        
        # Fetch all documents and train a new model
        docs_df = fetch_and_prepare_documents()

        # The `train_and_label_main_topics` function now includes the zero-shot parameters.
        topic_model, docs, topic_infos = train_and_label_main_topics(docs_df)
        
        # ... (rest of retrain mode logic including handle_outliers, label_proceedings,
        #       prepare_data_to_insert, saving models to S3) ...

    else:  # predict mode
        # ... (existing predict mode logic) ...
        # Loading and using the models remains unchanged. The `transform` method
        # of the loaded BERTopic model will inherently apply the zero-shot logic
        # if the model was trained with it.
        pass

# ... (if __name__ == "__main__":) ...
```

### Explanation of the Approach

1.  **Parameter Introduction**: We introduced two new command-line arguments: `zeroshot_topic_list` (a JSON string representing a Python list of topic labels) and `zeroshot_min_similarity` (a float). These arguments enable dynamic configuration of your predefined topics and the assignment threshold when running the script. Default values are provided for robustness.

2.  **`train_custom_topic_model` Augmentation**: The `train_custom_topic_model` function now accepts these two new parameters. Crucially, these parameters are directly passed to the `BERTopic` constructor. BERTopic is designed to internally handle the zero-shot logic: it will first attempt to assign documents to your predefined topics based on semantic similarity. Documents that do not meet the `zeroshot_min_similarity` threshold for any predefined topic are then passed through the standard UMAP and HDBSCAN pipeline for the discovery of new, emergent topics.

3.  **`train_and_label_main_topics` Integration**: The global variables `ZERO_SHOT_TOPIC_LIST` and `ZERO_SHOT_MIN_SIMILARITY` are passed to `train_custom_topic_model` when it is called within `train_and_label_main_topics`. This ensures the zero-shot functionality is applied during the primary topic modeling phase.

4.  **Topic ID and Labeling Considerations**: When zero-shot topics are utilized, `topic_model.get_topic_info()` will include entries for your predefined topics. These topics typically have distinct IDs and their `Name` field will be populated with the labels you provided in `zeroshot_topic_list`. The pseudocode includes an adjustment to the `llm_enhanced_topic` assignment logic within `train_and_label_main_topics`. It generates LLM labels only for topics *not* identified as outliers (`-1`). For zero-shot topics, it assumes the names provided in your `zeroshot_topic_list` are sufficient for `llm_enhanced_topic`, ensuring they are not redundantly relabeled by the LLM unless specifically desired.

5.  **Preservation of Original Logic**:

  * **Component Models**: All your custom components (e.g., `CountVectorizer`, `UMAP`, `HDBSCAN`) remain in place and continue to function as intended for the discovery of new topics.
  * **Outlier Handling**: The `handle_outliers` function will process documents that are true outliers from the HDBSCAN clustering step, regardless of whether zero-shot was applied initially.
  * **Prediction (`transform`)**: The `transform` method, used in "predict" mode and for processing "Proceedings" documents, will automatically apply the zero-shot logic if the `BERTopic` model was originally trained with it.
  * **Database Operations**: The `prepare_data_to_insert` function and subsequent database insertion logic should handle the combined set of zero-shot and newly clustered topics, as `get_topic_info()` provides comprehensive information for all topics.

#### Strategic Advantages for Our System

Integrating this zero-shot methodology offers significant advantages over purely unsupervised or simpler guided methods:

- **Retention of Exploratory Power**
  The system remains a powerful tool for horizon scanning. We do not limit our analysis to preconceived notions, ensuring that emergent environmental threats or scientific breakthroughs are still discovered.

- **Enhanced Relevance and Interpretability**
  The final topic set is immediately more useful, as it is anchored to familiar, mission-critical concepts. New topics can be contextualized against this stable background of known subjects.

With **Zero-Shot Topic Modeling**, we can evolve our system into a more dynamic and responsive intelligence tool that effectively balances our need to monitor known responsibilities with the necessity of discovering unknown challenges.

## Further Reading

- [BERTopic Zero-Shot Topic Modeling](https://maartengr.github.io/BERTopic/getting_started/zeroshot/zeroshot.html)
- [BERTopic Documentation](https://maartengr.github.io/BERTopic/)
- [BERTopic GitHub Repository](https://github.com/MaartenGr/BERTopic)
