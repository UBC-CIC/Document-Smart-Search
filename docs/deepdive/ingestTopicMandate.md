# Topics and Mandates Ingestion Script

## Table of Contents

- [Topics and Mandates Ingestion Script](#topics-and-mandates-ingestion-script)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Input Files](#input-files)
    - [1. Topics CSV (`new_topics.csv`)](#1-topics-csv-new_topicscsv)
    - [2. Mandates CSV (`new_mandates.csv`)](#2-mandates-csv-new_mandatescsv)
    - [3. Subcategories CSV (`new_subcategories.csv`)](#3-subcategories-csv-new_subcategoriescsv)
  - [Processing Steps](#processing-steps)
  - [Output](#output)
  - [Usage](#usage)
  - [Dependencies](#dependencies)
  - [Notes](#notes)

## Overview

The `ingest_topics_and_mandates.py` script processes hierarchical topic and mandate data, generates embeddings, and stores them in OpenSearch for efficient similarity search. This script is a crucial component in the document categorization pipeline, as it prepares the reference data against which documents will be categorized.

## Input Files

### 1. Topics CSV (`new_topics.csv`)

A CSV file containing the hierarchical topic structure with the following columns:

A CSV file containing the hierarchical topic structure with the following columns:
- `topic_id`: Unique identifier for the topic
- `topic_name`: Name/description of the topic
- `subcategory_id`: ID of the parent subcategory (if any)
- `subcategory_name`: Name of the parent subcategory
- `description`: Detailed description of the topic
- `keywords`: Comma-separated list of relevant keywords

Example:
```csv
topic_id,topic_name,subcategory_id,subcategory_name,description,keywords
T001,Climate Change Impacts,SC001,Environmental Science,Study of climate change effects on ecosystems,climate,ecosystem,impact
```

### 2. Mandates CSV (`new_mandates.csv`)
A CSV file containing mandate information with the following columns:
- `mandate_id`: Unique identifier for the mandate
- `mandate_name`: Name/description of the mandate
- `description`: Detailed description of the mandate
- `keywords`: Comma-separated list of relevant keywords

Example:
```csv
mandate_id,mandate_name,description,keywords
M001,Environmental Protection,Regulations for environmental conservation,environment,protection,conservation
```

### 3. Subcategories CSV (`new_subcategories.csv`)
A CSV file containing subcategory information with the following columns:
- `subcategory_id`: Unique identifier for the subcategory
- `subcategory_name`: Name of the subcategory
- `description`: Detailed description of the subcategory
- `keywords`: Comma-separated list of relevant keywords

Example:
```csv
subcategory_id,subcategory_name,description,keywords
SC001,Environmental Science,Study of environmental systems and processes,environment,science,ecology
```

## Processing Steps

1. **Data Loading and Validation**
   - Loads all three CSV files
   - Validates required columns and data types
   - Checks for data integrity and relationships

2. **Text Preparation**
   - Combines relevant fields to create comprehensive text representations
   - For topics: Combines topic name, description, keywords, and subcategory information
   - For mandates: Combines mandate name, description, and keywords
   - For subcategories: Combines subcategory name, description, and keywords

3. **Embedding Generation**
   - Uses the `Amazon Titan Embed Text v2` model to generate embeddings
   - Creates embeddings for:
     - Individual topics
     - Individual mandates 
     - Individual subcategories

4. **OpenSearch Indexing**
   - Creates or updates OpenSearch indices for:
     - Topics
     - Mandates
     - Subcategories
   - Stores both the text data and corresponding embeddings
   - Maintains hierarchical relationships between topics and subcategories

## Output

The script creates/updates three OpenSearch indices:

1. **Topics Index**
   - Contains topic information and embeddings
   - Includes subcategory relationships
   - Used for topic-based document categorization

2. **Mandates Index**
   - Contains mandate information and embeddings
   - Used for mandate-based document categorization

3. **Subcategories Index**
   - Contains subcategory information and embeddings
   - Used for hierarchical topic organization

## Usage

```bash
python ingest_topics_and_mandates.py \
    --batch_id YYYY-MM-DD \
    --topics_file new_topics.csv \
    --mandates_file new_mandates.csv \
    --subcategories_file new_subcategories.csv
```

## Dependencies

- `sentence-transformers`: For generating embeddings
- `pandas`: For data manipulation
- `opensearch-py`: For OpenSearch interaction
- `numpy`: For numerical operations

## Notes

- The script assumes a specific directory structure in S3 for input files
- All input files should be UTF-8 encoded
- The script handles missing or malformed data gracefully
- Embeddings are generated using the default SentenceTransformer model
- OpenSearch indices are created with appropriate mappings for vector search 