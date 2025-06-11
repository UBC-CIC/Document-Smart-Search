# HTML Processing Deep Dive

## Table of Contents

- [HTML Processing Deep Dive](#html-processing-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Core Architecture](#core-architecture)
  - [Key Components](#key-components)
    - [1. Document Information Extraction](#1-document-information-extraction)
    - [2. Text Cleaning and Normalization](#2-text-cleaning-and-normalization)
    - [3. Document Type Classification](#3-document-type-classification)
    - [4. Year Extraction](#4-year-extraction)
  - [Processing Pipeline](#processing-pipeline)
    - [1. Document Selection](#1-document-selection)
    - [2. Event-Based Processing](#2-event-based-processing)
  - [Error Handling and Validation](#error-handling-and-validation)
    - [1. Document Validation](#1-document-validation)
    - [2. Language Validation](#2-language-validation)
  - [Output Structure](#output-structure)

## Core Architecture

The pipeline uses a multi-stage approach to process HTML documents:

1. **Document Selection and Filtering**
   - Filters documents based on language (English only)
   - Checks for existing documents in OpenSearch
   - Groups documents by CSAS events for efficient processing
   - Supports override mode for reprocessing existing documents

2. **HTML Download and Parsing**
   - Asynchronous downloading with rate limiting (5 concurrent requests)
   - Robust error handling for various HTTP scenarios
   - BeautifulSoup4 for HTML parsing
   - Handles redirects and 404 errors gracefully

3. **Information Extraction**
   - Main text extraction from specific sections
   - Metadata extraction (title, authors, language, etc.)
   - Document type classification
   - Year extraction from titles
   - PDF download URL extraction

4. **Text Processing and Cleaning**
   - Unicode normalization
   - Special character handling
   - Whitespace normalization
   - Language detection and validation

## Key Components

### 1. Document Information Extraction

The `extract_document_info` function handles the core extraction process:

```python
def extract_document_info(page: BeautifulSoup) -> Dict[str, Optional[str]]:
    """
    Extracts key information from the document page:
    - Main text from the third <section> element
    - Document download URL from <a> tag with class 'gc-dwnld-lnk'
    - Document title from <title> tag
    - Language using multiple detection methods
    - Subject from first h2 header
    - Authors from h3 tag following subject
    """
```

Key features:

- Multiple fallback methods for main text extraction
- Comprehensive language detection
- Robust author name normalization
- Subject extraction with cleaning

### 2. Text Cleaning and Normalization

The `normalize_string` function handles text normalization:

```python
def normalize_string(name: str) -> str:
    """
    Normalizes string by:
    - Normalizing Unicode (é → e)
    - Removing non-breaking spaces
    - Collapsing multiple spaces
    - Fixing OCR punctuation issues
    - Removing diacritics
    """
```

Features:

- Unicode normalization for consistent character representation
- Special character handling for OCR errors
- Whitespace normalization
- Diacritic removal for better matching
- Consistent punctuation handling

### 3. Document Type Classification

The `extract_doc_type` function classifies documents:

```python
def extract_doc_type(html_page_title):
    """
    Classifies documents into types:
    - Research Document
    - Proceedings
    - Terms of Reference
    - Science Advisory Report
    - Science Response
    - Other Publication
    """
```

### 4. Year Extraction

The `extract_document_year_from_title` function:

```python
def extract_document_year_from_title(html_page_title):
    """
    Extracts publication year from document title
    Uses regex pattern matching for 4-digit years
    """
```

Features:

- Regex-based year extraction
- Validation against expected year ranges
- Handling of various year formats

## Processing Pipeline

### 1. Document Selection

```python
async def process_html_docs(html_docs, enable_override=False, dryrun=False, debug=False):
    """
    Main processing pipeline:
    1. Filters documents
    2. Downloads HTML
    3. Extracts information
    4. Generates embeddings
    5. Ingests into OpenSearch
    """
```

Key steps:

- Document filtering and validation
- Concurrent HTML downloading
- Information extraction
- Embedding generation
- OpenSearch ingestion

### 2. Event-Based Processing

```python
async def process_events(html_event_to_html_documents, enable_override=False, dryrun=False, debug=False):
    """
    Processes documents grouped by CSAS events
    Maintains processing statistics
    Handles errors and logging
    """
```

Features:

- Event-based grouping
- Progress tracking
- Error aggregation
- Statistics collection

## Error Handling and Validation

### 1. Document Validation

```python
def is_valid_document(doc, debug=False) -> bool:
    """
    Validates documents based on:
    - Required fields presence
    - Document type requirements
    - Language validation
    - PDF URL requirements
    """
```

### 2. Language Validation

```python
def is_english_document(url: str, debug=False) -> bool:
    """
    Validates document language:
    - Checks URL extensions
    - Handles French and Inuktitut documents
    - Supports debug logging
    """
```

## Output Structure

The pipeline generates several output files:

1. **Processed Documents**
   - Location: `s3://{bucket_name}/batches/{batch_id}/logs/html_ingestion/`
   - Files:
     - `processed_and_ingested_html_docs.csv`: Successfully processed documents
     - `html_fail_error_dump_docs.csv`: Processing errors
     - `url_redirects.csv`: URL redirection information
     - `html_fail_docs.csv`: Failed HTML processing
     - `too_long_docs.csv`: Documents exceeding embedding limits

2. **OpenSearch Index**
   - Index name: `dfo-html-full-index`
   - Stores:
     - Document text
     - Metadata
     - Embeddings
     - Processing status
