# HTML Processing Deep Dive

## Table of Contents

- [HTML Processing Deep Dive](#html-processing-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Core Architecture: A Multi-Stage Processing Pipeline](#core-architecture-a-multi-stage-processing-pipeline)
  - [1. Document Selection and Filtering](#1-document-selection-and-filtering)
  - [2. HTML Download and Parsing](#2-html-download-and-parsing)
  - [3. Information Extraction](#3-information-extraction)
  - [4. Text Processing and Cleaning](#4-text-processing-and-cleaning)
  - [Key Components Explained](#key-components-explained)
    - [Document Information Extraction (`extract_document_info`)](#document-information-extraction-extract_document_info)
    - [Text Cleaning and Normalization (`normalize_string`)](#text-cleaning-and-normalization-normalize_string)
    - [Document Type and Year Extraction (`extract_doc_type`, `extract_document_year_from_title`)](#document-type-and-year-extraction-extract_doc_type-extract_document_year_from_title)
  - [5. Embedding Generation](#5-embedding-generation)
  - [6. Document Ingestion](#6-document-ingestion)
  - [Processing Pipeline in Action](#processing-pipeline-in-action)
    - [Document Selection and Event-Based Processing](#document-selection-and-event-based-processing)
  - [Error Handling and Validation](#error-handling-and-validation)
  - [Output Structure](#output-structure)


## Core Architecture: A Multi-Stage Processing Pipeline

Our HTML processing pipeline is designed as a robust, multi-stage system that transforms raw web documents into clean, structured, and enriched data ready for analysis and ingestion. The architecture prioritizes data quality, resilience, and efficient processing.

## 1. Document Selection and Filtering

The pipeline begins with a rigorous selection phase to ensure only relevant documents are processed. This involves filtering documents by language to focus on our primary (English) corpus and checking against the existing OpenSearch index to avoid redundant processing. Documents are intelligently grouped by their associated CSAS (Canadian Science Advisory Secretariat) events, a crucial step that allows for coherent, batch-oriented processing and maintains contextual integrity. An override mode is also supported to allow for the reprocessing of specific documents when necessary.

## 2. HTML Download and Parsing

Once selected, documents are downloaded asynchronously. To avoid overwhelming the source servers and to ensure stable operation, the downloader is configured with a rate limit of five concurrent requests. This stage is engineered for resilience, with robust error handling for various HTTP scenarios, including redirects (which are tracked) and 404 errors, which are handled gracefully without halting the entire pipeline. We use the powerful BeautifulSoup4 library for all HTML parsing, allowing us to navigate and extract information from complex and sometimes inconsistent document structures.

## 3. Information Extraction

This is the core of the pipeline, where unstructured HTML is converted into valuable structured data. Key information extracted includes:

* The main text body, carefully targeted from specific sections of the page.
* Essential metadata such as the document title, a list of authors, and the source language.
* A classification of the document type (e.g., "Research Document," "Proceedings").
* The publication year, extracted directly from the title string.
* The direct download URL for any associated PDF files.

## 4. Text Processing and Cleaning

To ensure consistency and high quality for downstream tasks like embedding generation, all extracted text undergoes a comprehensive cleaning and normalization process. This includes Unicode normalization, handling of special characters and artifacts, standardizing whitespace, and re-validating the document's language.

## Key Components Explained

### Document Information Extraction (`extract_document_info`)

This function is the workhorse of the extraction process. It navigates the parsed HTML tree to pull out specific data points. For instance, it targets the third `<section>` element, which has been empirically identified as the most common location for main text content. The function includes multiple fallback methods to ensure that even if the primary target is missing, it can still attempt to extract the necessary information. It employs a multi-faceted approach to language detection and includes robust logic for normalizing author names and cleaning extracted subject lines.

### Text Cleaning and Normalization (`normalize_string`)

The `normalize_string` function is critical for data consistency. It applies several transformations, such as normalizing Unicode (e.g., converting `é` to `e`), removing non-breaking spaces, and collapsing multiple whitespace characters. This standardization is vital for accurate text matching, searching, and ensuring the quality of the embeddings generated later in the pipeline.

### Document Type and Year Extraction (`extract_doc_type`, `extract_document_year_from_title`)

These helper functions add valuable structured metadata. `extract_doc_type` classifies each document into one of several predefined categories, which is essential for enabling faceted search and filtering in the final application. Similarly, `extract_document_year_from_title` uses regular expressions to reliably find and extract the publication year, providing another critical data point for sorting and analysis.

## 5. Embedding Generation

The pipeline generates embeddings for each document using Amazon Bedrock. This step is crucial for enabling vector similarity search and for downstream tasks like categorization and retrieval.

## 6. Document Ingestion

The pipeline ingests the processed documents into OpenSearch, creating a searchable knowledge base that powers the final user-facing application.

## Processing Pipeline in Action

### Document Selection and Event-Based Processing

The `process_html_docs` function serves as the main entry point, orchestrating the entire workflow from filtering and downloading to information extraction and eventual ingestion into OpenSearch. This process is further organized by the `process_events` function, which groups documents by their CSAS event. This event-based approach is highly efficient for processing large volumes of related content, allowing for better progress tracking, error aggregation, and the collection of meaningful processing statistics for each event.

## Error Handling and Validation

A key design principle of the pipeline is its focus on data quality and robustness, enforced through multiple layers of validation.

**Document Validation (`is_valid_document`)**
Before any significant processing occurs, this function runs a series of checks to ensure a document is valid. It verifies the presence of required fields, confirms the document type is recognized, and validates that a PDF URL is present where expected. This proactive validation prevents incomplete or corrupt data from entering the system.

**Language Validation (`is_english_document`)**
This function provides an additional check to ensure the document is in English, handling specific URL patterns that indicate other languages like French or Inuktitut.

## Output Structure

The pipeline's final output consists of a set of detailed log files and the updated OpenSearch index.

**Processing Logs**
For complete auditability and debugging, the pipeline generates several CSV files in an S3 bucket. These logs detail which documents were processed successfully, which failed and why, which URLs were redirected, and which documents were too large for the embedding model.

**OpenSearch Index**
The ultimate destination for the processed data is our OpenSearch index. Here, the clean text, all extracted metadata, and the generated text embeddings are stored, creating a rich, searchable knowledge base that powers the final user-facing application.