# Vector-LLM Categorization: A Technical Deep Dive

## Table of Contents

- [Vector-LLM Categorization: A Technical Deep Dive](#vector-llm-categorization-a-technical-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Core Architecture: A Hybrid Approach](#core-architecture-a-hybrid-approach)
  - [1. Vector Similarity Stage: Efficient Candidate Selection](#1-vector-similarity-stage-efficient-candidate-selection)
  - [2. LLM Classification Stage: High-Fidelity Final Verdict](#2-llm-classification-stage-high-fidelity-final-verdict)
    - [Reliability Features:](#reliability-features)
  - [Key Parameters and Their Rationale](#key-parameters-and-their-rationale)
  - [Processing Pipeline](#processing-pipeline)
    - [Document Selection Modes](#document-selection-modes)
    - [Categorization and Result Processing](#categorization-and-result-processing)
  - [Error Handling and Performance](#error-handling-and-performance)
  - [Future Improvements](#future-improvements)

## Core Architecture: A Hybrid Approach

Our document categorization system is built on a two-stage architecture that intelligently combines the speed of vector search with the analytical depth of a Large Language Model (LLM). This hybrid model allows us to classify documents against topics and mandates with both high efficiency and nuanced accuracy.

## 1. Vector Similarity Stage: Efficient Candidate Selection

The first stage acts as a high-speed, intelligent filter. Its goal is to rapidly sift through a vast number of potential topics and mandates and present only the most plausible candidates for a given document. This is achieved by transforming the unstructured text of both documents and candidate labels into rich numerical representations called embeddings, using **Amazon Titan Embeddings V2**.

We calculate the relationship between a document and a potential topic using **cosine similarity**, a robust metric that measures the contextual alignment between two embeddings.

The system offers two backends for this process:

* **NumPy-based calculation**: Ideal for local development and smaller-scale workloads.
* **OpenSearch's K-Nearest Neighbor (KNN)**: Enables highly scalable and rapid similarity searches across millions of documents.

To ensure mathematical integrity, **all embeddings are normalized before comparison**, guaranteeing accurate and directly comparable cosine similarity scores.

To accommodate multiple descriptive variants of topics and mandates, the system uses the **maximum similarity score** across all variants, ensuring the strongest semantic link is captured.

## 2. LLM Classification Stage: High-Fidelity Final Verdict

Once the initial stage identifies a short list of promising candidates, the system passes them to a **Large Language Model** for a final, nuanced judgment. This step provides deeper, context-aware analysis beyond simple similarity.

We use **LLaMA 3 70B** via **Amazon Bedrock**, chosen for its:

* Exceptional reasoning abilities
* Large context window
* Proven capacity to follow complex instructions

### Reliability Features:

* **Deterministic Output**: Setting the model’s temperature to `0` ensures consistent outputs for the same input—crucial for auditability.
* **Structured JSON Output**: Responses are formatted into a structured JSON with `belongs`, `relevance`, and `explanation` fields.
* **Automatic JSON Repair**: A validation layer corrects malformed JSON responses automatically, increasing system robustness.


## Key Parameters and Their Rationale

* **`TOP_N = 7`**: Number of top candidates passed from the vector stage to the LLM. Provides a broad yet concise input set for the LLM.
* **`DESIRED_THRESHOLD = 0.2`**: Minimum similarity score required for a candidate to be considered. Effectively filters out irrelevant matches.

## Processing Pipeline

The system is built as a flexible data processing pipeline, adaptable to varying operational requirements.

### Document Selection Modes

* **`html_only`**: Standard mode for processing newly ingested or updated documents.
* **`topics_only`**: Triggers re-categorization when topic or mandate definitions change.
* **`full_update`**: Reprocesses the entire dataset, using the **OpenSearch scroll API** for batch retrieval.

### Categorization and Result Processing

* Topics and mandates are processed in **parallel** for efficiency.
* Each document flows through both the **vector similarity** and **LLM classification** stages.
* A classification is finalized **only if the LLM affirms** the document belongs to the category.
* Confirmed results are used to:

  * Generate CSV reports for auditing and analysis
  * Update the OpenSearch index using **efficient bulk operations**

## Error Handling and Performance

* Comprehensive **validation** and **retry logic** ensures reliability during transient failures.
* Smart candidate filtering ensures LLM resources are only used for the most plausible candidates.

## Future Improvements

* **Embedding Model Evaluation**: Benchmarking alternative models (e.g., Cohere, Mistral) to optimize accuracy, speed, and cost.
* **Batch Inference for Cost Reduction**: Moving non-urgent classification (e.g., `full_update`) to **Amazon Bedrock's Batch Inference** for cost efficiency.
* **Prompt Engineering Enhancements**: Refining prompts and adding few-shot examples to improve classification and explanation quality.


This hybrid system effectively bridges fast semantic filtering and deep contextual understanding, offering a **powerful and scalable solution for document classification**.
