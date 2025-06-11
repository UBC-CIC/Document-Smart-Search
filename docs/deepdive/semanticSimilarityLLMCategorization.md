# Vector-LLM Categorization: A Technical Deep Dive

## Table of Contents

- [Vector-LLM Categorization: A Technical Deep Dive](#vector-llm-categorization-a-technical-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Core Architecture: A Hybrid Approach](#core-architecture-a-hybrid-approach)
    - [1. Vector Similarity Stage: Efficient Candidate Selection](#1-vector-similarity-stage-efficient-candidate-selection)
    - [2. LLM Classification Stage: High-Fidelity Final Verdict](#2-llm-classification-stage-high-fidelity-final-verdict)
  - [Key Parameters and Their Rationale](#key-parameters-and-their-rationale)
  - [Processing Pipeline](#processing-pipeline)
    - [Document Selection Modes](#document-selection-modes)
    - [Categorization Process](#categorization-process)
    - [Result Processing](#result-processing)
  - [Error Handling and Validation](#error-handling-and-validation)
  - [Performance Considerations](#performance-considerations)
  - [Future Improvements](#future-improvements)

---

## Core Architecture: A Hybrid Approach

The categorization system is composed of two tightly integrated stages:

### 1. Vector Similarity Stage: Efficient Candidate Selection

In this first stage, the system rapidly narrows down a list of possible topic or mandate matches for a given document. This is accomplished by converting both documents and candidate labels into embeddings using **Amazon Titan Embeddings V2**. These embeddings are numerical vectors that capture semantic meaning.

* The similarity between the document and candidate embeddings is computed using **cosine similarity**, which identifies how closely aligned the vectors are in multi-dimensional space.
* Two backends are supported:

  * **NumPy-based cosine similarity** is used for smaller-scale or local development scenarios.
  * **OpenSearch KNN search** is utilized for production-grade workloads, enabling rapid similarity search over millions of embeddings.
* Before performing comparisons, all embeddings are **normalized**, ensuring that cosine similarity values are accurate and meaningful.
* Topics and mandates can be described by multiple textual variants. The system intelligently selects the **maximum similarity score** across these descriptions to ensure that the strongest signal is used.

### 2. LLM Classification Stage: High-Fidelity Final Verdict

After identifying top candidate matches via vector similarity, the system delegates final classification to an LLM. This ensures nuanced understanding and accurate decision-making.

* The model used is **LLaMA 3 70B**, accessed through **Amazon Bedrock**, selected for its strong reasoning and large context window.
* Several mechanisms enhance reliability:

  * **Deterministic Output:** The model temperature is set to `0`, ensuring the same input always produces the same output.
  * **Structured JSON Output:** The LLM is prompted to return a JSON object specifying classification results (`belongs`, `relevance`, and `explanation`). This structure makes parsing reliable and reduces integration errors.
  * **Automatic JSON Repair:** If the model returns malformed JSON, a built-in validator attempts to auto-correct it, improving system robustness.


## Key Parameters and Their Rationale

A few parameters govern the system's balance of performance, cost, and accuracy:

* **TOP\_N = 7:** The number of top candidates selected via similarity. Choosing 7 provides a wide enough set for the LLM to consider multiple plausible options, without overwhelming the LLM or consuming too much context.
* **DESIRED\_THRESHOLD = 0.2:** Any candidate with a cosine similarity below this value is discarded. This prevents low-quality matches from wasting LLM compute and helps reduce classification noise.


## Processing Pipeline

The system operates as a flexible pipeline, capable of adapting to different operational scenarios.

### Document Selection Modes

* **`html_only`:** Optimized for daily runs where only new or updated HTML documents need classification.
* **`topics_only`:** Triggered when topic/mandate definitions are updated, causing a re-categorization of all documents.
* **`full_update`:** Reprocesses the entire document set. When run at scale, documents are retrieved in batches using the OpenSearch scroll API to ensure efficiency.

### Categorization Process

* Both topics and mandates are processed in **parallel**, maximizing throughput.
* Each document goes through **two filters**: vector similarity, followed by LLM classification.
* The pipeline includes **comprehensive validation** and **automatic retry logic** to handle transient failures or malformed inputs.

### Result Processing

* A document is only categorized if the LLM affirms it **"belongs"** to a topic or mandate.
* Confirmed classifications are used to:

  * Generate **CSV reports** containing metadata, similarity scores, and LLM decisions.
  * Perform **OpenSearch updates**, writing results back to the master index using efficient bulk operations.

## Error Handling and Validation

Reliability is built into every layer of the system:

* Input documents are validated before processing.
* LLM responses are checked against a strict schema.
* If JSON output from the LLM is malformed, the system attempts automatic repair.
* OpenSearch updates are performed with detailed error tracking and retry mechanisms to guard against transient issues.

## Performance Considerations

The pipeline is designed with performance and scale in mind:

* Efficient **batching** is used for all document retrieval and processing.
* **Parallelization** is leveraged at multiple stages.
* Most importantly, **smart candidate filtering** ensures that expensive LLM calls are only made for plausible candidates.

## Future Improvements

To make the system even more efficient and accurate, the following enhancements are planned:

* **Embedding Model Evaluation:** Explore other embedding providers (e.g., Cohere, Mistral) to improve the balance between accuracy, inference speed, and cost.
* **Batch Inference with Bedrock:** For full reprocessing, shift from real-time to **batch LLM inference** to reduce cost for time-insensitive workload. This is one of the most expensive part of the pipeline.
* **Prompt Engineering Enhancements:** Refine the prompts used for LLM classification to improve accuracy and interpretability.

This hybrid system effectively bridges the gap between fast semantic filtering and deep contextual understanding, offering a powerful and scalable solution for document classification.