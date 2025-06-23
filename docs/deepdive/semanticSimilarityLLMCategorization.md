# Vector-LLM Categorization: A Technical Deep Dive

## Table of Contents

- [Vector-LLM Categorization: A Technical Deep Dive](#vector-llm-categorization-a-technical-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [1. Vector Similarity Stage: Efficient Candidate Selection](#1-vector-similarity-stage-efficient-candidate-selection)
  - [2. LLM Classification Stage: High-Fidelity Final Verdict](#2-llm-classification-stage-high-fidelity-final-verdict)
    - [Reliability Features](#reliability-features)
  - [Key Parameters and Their Rationale](#key-parameters-and-their-rationale)
  - [Processing Pipeline](#processing-pipeline)
    - [Document Selection Modes](#document-selection-modes)
    - [Categorization and Result Processing](#categorization-and-result-processing)
  - [Error Handling and Performance](#error-handling-and-performance)

The document categorization system employs a robust, two-stage architecture that seamlessly integrates the efficiency of vector search with the advanced analytical capabilities of a Large Language Model (LLM). This hybrid approach facilitates precise document classification against diverse topics and mandates, balancing high throughput with nuanced accuracy.

---

## 1. Vector Similarity Stage: Efficient Candidate Selection

The initial stage functions as a high-speed, intelligent filter, designed to swiftly identify and present the most plausible topic and mandate candidates for a given document. This is achieved by transforming both the unstructured text of documents and candidate labels into rich numerical representations, known as embeddings, utilizing **Amazon Titan Embeddings V2**.

The contextual alignment between a document and a potential topic is quantified using **cosine similarity**, a robust metric derived from their respective embeddings.

The system offers two distinct backends for this process:

* A **NumPy-based calculation** is provided for local development and smaller-scale workloads, offering flexibility and ease of use.
* **OpenSearch's K-Nearest Neighbor (KNN)** enables highly scalable and rapid similarity searches across millions of documents, supporting large-scale deployments.

To ensure mathematical integrity and directly comparable scores, **all embeddings undergo normalization prior to comparison**.

Furthermore, to accommodate multiple descriptive variants for topics and mandates, the system employs the **maximum similarity score** across all variants. This ensures that the strongest semantic link is always captured, regardless of the specific phrasing used.

---

## 2. LLM Classification Stage: High-Fidelity Final Verdict

Following the initial identification of a concise list of promising candidates, these are subsequently forwarded to a Large Language Model for a final, nuanced assessment. This stage facilitates a deeper, context-aware analysis that extends beyond simple semantic similarity.

**LLaMA 3 70B**, accessed via **Amazon Bedrock**, has been selected for this critical stage due to its:

* Exceptional reasoning abilities.
* Extensive context window, allowing for comprehensive textual analysis.
* Proven capacity to accurately follow complex instructions.

### Reliability Features

To ensure the integrity and consistency of the classification process, several key reliability features have been implemented:

* **Deterministic Output**: The model's temperature is set to $0$, guaranteeing consistent outputs for identical inputs. This is crucial for auditability and reproducibility.
* **Structured JSON Output**: Responses are consistently formatted into a structured JSON object, including `belongs`, `relevance`, `explanation` fields. This standardized format facilitates downstream processing and integration.
* **Automatic JSON Repair**: A validation layer automatically corrects malformed JSON responses, significantly enhancing system robustness and minimizing processing interruptions.

---

## Key Parameters and Their Rationale

The system's operation is governed by specific parameters, each chosen for its strategic contribution to efficiency and accuracy:

* **`TOP_N = 7`**: This parameter dictates the number of top candidates passed from the vector similarity stage to the LLM. This specific value was chosen to avoid overloading the context window of the LLM while still providing a sufficiently broad yet concise input set for its in-depth analysis. It is important to note that this is a configurable parameter, allowing for adjustment based on specific operational requirements and LLM capabilities.
* **`DESIRED_THRESHOLD = 0.2`**: This represents the minimum similarity score required for a candidate to be considered relevant. It acts as an effective filter, excluding irrelevant matches and optimizing the subsequent LLM processing.

---

## Processing Pipeline

The system is engineered as a flexible data processing pipeline, designed to adapt to varying operational requirements and data flows.

### Document Selection Modes

The pipeline supports distinct document selection modes to accommodate various processing scenarios:

* **`html_only`**: This is the standard mode for processing newly ingested or updated documents, ensuring that the most current information is categorized.
* **`topics_only`**: This mode triggers a re-categorization of documents specifically when topic or mandate definitions undergo changes, maintaining the accuracy of classifications.
* **`full_update`**: This mode facilitates the reprocessing of the entire dataset, efficiently retrieving documents in batches using the **OpenSearch scroll API**.

### Categorization and Result Processing

Once documents are selected, they undergo a systematic categorization and result processing flow:

* Topics and mandates are processed in **parallel** to maximize efficiency and minimize processing time.
* Each document seamlessly progresses through both the **vector similarity** and **LLM classification** stages, ensuring comprehensive analysis.
* A classification is finalized **only if the LLM affirms** that the document genuinely belongs to the respective category, providing a crucial layer of validation.
* Confirmed results are utilized for two primary purposes:
    * Generation of **CSV reports** for thorough auditing and detailed analysis.
    * Efficient updating of the OpenSearch index through **bulk operations**, ensuring data consistency and accessibility.

---

## Error Handling and Performance

The system incorporates robust mechanisms for error handling and performance optimization:

* Comprehensive **validation** and **retry logic** are integrated to ensure high reliability, effectively managing transient failures and maintaining continuous operation.
* Smart candidate filtering ensures that LLM resources are judiciously applied only to the most plausible candidates, optimizing computational efficiency and cost-effectiveness.
