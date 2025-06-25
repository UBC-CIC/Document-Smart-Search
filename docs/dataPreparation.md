# Data Preparation Guide

This document provides instructions for preparing files to upload to S3 for the DFO Smart Search data pipeline. The pipeline processes documents and categorizes them against topics and mandates using vector-based LLM categorization.

## S3 File Structure

Upload your files to the following S3 structure:

```
s3://{bucket_name}/batches/{batch_id}/
├── html_data/
│   └── html_urls.xlsx
├── topics_mandates_data/
│   ├── new_topics.csv
│   ├── new_mandates.csv
│   └── new_subcategories.csv
```

Where `{batch_id}` is a unique identifier (e.g., YYYY-MM-DD format like `2024-01-15`).

## Required Files

### 1. html_urls.xlsx

**Note**: The actual file name can be anything as long as it is an `xlsx` file.* However it must have **a single sheet named `CSAS HTML URLs`**.

**Location**: `html_data/html_urls.xlsx`

**Purpose**: Contains document URLs and metadata for processing.

**Required Columns**:

- `Year`: Year of the document
- `Document Title`: Title of the document
- `Document URL`: URL to the document
- `CSAS Event`: CSAS Event name (e.g any event grouping between multiple documents)

**Example Rows**:

| Year | Document Title | Document URL | CSAS Event |
|------|----------------|-------------|------------|
| 2024 | Atlantic Salmon Stock Assessment 2024 | https://www.canada.ca/reports/2024/atlantic-salmon-assessment.html | Atlantic Salmon Stock Assessment |
| 2024 | Aquaculture Licensing Framework | https://www.canada.ca/policies/2024/aquaculture-licensing.html | Aquaculture Licensing Framework |
| 2024 | Marine Protected Areas Evaluation | https://www.canada.ca/assessments/2024/marine-protected-areas.html | Marine Protected Areas Evaluation |

### 2. new_topics.csv

**Location**: `topics_mandates_data/new_topics.csv`

**Purpose**: Defines child topics for document categorization.

**Required Columns**:
- `type`: Always "topic"
- `tag`: Unique topic identifier (e.g., "1.1.1")
- `name`: Topic name
- `description`: Topic description (can be a list of descriptions)
- `parent`: Parent subcategory tag (e.g., "1.1")
- `description_1`, `description_2`, `description_3`: Individual description components

**Example Rows**:
| type | tag | name | description | parent | description_1 | description_2 | description_3 |
|------|-----|------|-------------|--------|---------------|---------------|---------------|
| topic | 1.1.1 | Stock Assessments | ['Stock assessments provide critical data on fish population dynamics, helping scientists and policymakers establish sustainable harvest levels.'] | 1.1 | Stock assessments provide critical data on fish population dynamics, helping scientists and policymakers establish sustainable harvest levels. | Accurate stock assessments prevent overfishing by determining population trends over time. | By incorporating satellite tracking, genetic studies, and catch data, modern stock assessments improve fisheries management. |
| topic | 1.1.2 | Biomass Estimation | ['Biomass estimation is essential for understanding the total available fish stock in an ecosystem.'] | 1.1 | Biomass estimation is essential for understanding the total available fish stock in an ecosystem. | Fish populations fluctuate due to environmental changes and fishing pressures. | Improved biomass estimation methods, such as acoustic surveys and underwater drones, enhance accuracy and efficiency. |
| topic | 1.2.1 | Sustainable Practices | ['Sustainable aquaculture practices reduce environmental impacts through responsible site selection, waste management, and efficient feed use.'] | 1.2 | Sustainable aquaculture practices reduce environmental impacts through responsible site selection, waste management, and efficient feed use. | Advances in closed-containment systems and integrated multi-trophic aquaculture (IMTA) help mitigate negative effects on marine ecosystems. | Regulatory frameworks ensure that aquaculture operations minimize pollution, protect wild fish populations, and promote responsible industry growth. |

### 3. new_mandates.csv

**Location**: `topics_mandates_data/new_mandates.csv`

**Purpose**: Defines high-level mandates for document categorization.

**Required Columns**:
- `type`: Always "mandate"
- `tag`: Unique mandate identifier (e.g., "1")
- `name`: Mandate name
- `description`: Mandate description (can be a list of descriptions)
- `description_1`, `description_2`, `description_3`: Individual description components

**Example Rows**:
| type | tag | name | description | description_1 | description_2 | description_3 |
|------|-----|------|-------------|---------------|---------------|---------------|
| mandate | 1 | Sustainable Fisheries and Aquaculture | ['The Department of Fisheries and Oceans (DFO) ensures that Canada's fisheries and aquaculture industries operate sustainably while balancing economic and ecological priorities.'] | The Department of Fisheries and Oceans (DFO) ensures that Canada's fisheries and aquaculture industries operate sustainably while balancing economic and ecological priorities. | Regulatory Approach: DFO enforces fisheries and aquaculture regulations to maintain ecological balance while supporting economic viability. | Economic Development Approach: Sustainable fisheries and aquaculture are managed as key drivers of Canada's blue economy, supporting job creation and international trade. |
| mandate | 2 | Conservation of Aquatic Ecosystems | ['DFO is responsible for the protection and restoration of marine and freshwater ecosystems, ensuring biodiversity and habitat resilience.'] | DFO is responsible for the protection and restoration of marine and freshwater ecosystems, ensuring biodiversity and habitat resilience. | Scientific Approach: DFO utilizes research-driven conservation strategies to protect and restore aquatic ecosystems. | Policy and Governance Approach: Conserving aquatic ecosystems requires a regulatory framework that integrates land-use planning, environmental laws, and international agreements. |
| mandate | 3 | Marine Operations and Response | ['The department oversees marine operations, including oceanographic research, environmental emergency response, and maritime safety.'] | The department oversees marine operations, including oceanographic research, environmental emergency response, and maritime safety. | Emergency Preparedness Approach: DFO maintains a robust emergency response system to address oil spills, marine pollution, and extreme weather events. | Maritime Infrastructure and Safety Approach: Ensuring safe and efficient maritime operations is a core mandate of DFO. |

### 4. new_subcategories.csv

**Location**: `topics_mandates_data/new_subcategories.csv`

**Purpose**: Defines parent topics (subcategories) that group related child topics.

**Required Columns**:
- `type`: Always "subcategory"
- `tag`: Unique subcategory identifier (e.g., "1.1")
- `name`: Subcategory name
- `description`: Subcategory description
- `parent`: Parent mandate tag (e.g., "1")
- `description_1`: Description component

**Example Rows**:
| type | tag | name | description | parent | description_1 |
|------|-----|------|-------------|--------|---------------|
| subcategory | 1.1 | Fisheries Management | ['Fisheries management involves the regulation and oversight of fishing activities to ensure sustainable stock levels, ecosystem health, and compliance with national and international guidelines.'] | 1 | Fisheries management involves the regulation and oversight of fishing activities to ensure sustainable stock levels, ecosystem health, and compliance with national and international guidelines. |
| subcategory | 1.2 | Aquaculture Management | ['Aquaculture management focuses on the sustainable cultivation of fish, shellfish, and seaweed to complement wild fisheries and support food security.'] | 1 | Aquaculture management focuses on the sustainable cultivation of fish, shellfish, and seaweed to complement wild fisheries and support food security. |
| subcategory | 2.1 | Habitat Protection and Restoration | ['Conserving and restoring aquatic habitats is essential for maintaining biodiversity and supporting fisheries.'] | 2 | Conserving and restoring aquatic habitats is essential for maintaining biodiversity and supporting fisheries. |

## File Preparation Guidelines

1. **CSV Format**: Use UTF-8 encoding and comma-separated values
2. **Excel Format**: Use .xlsx format for the documents file
3. **Data Quality**: Ensure all required columns are present and populated
4. **Hierarchy**: Maintain proper parent-child relationships between mandates, subcategories, and topics via the `parent` column and the `tag` column.
5. **Descriptions**: Provide detailed, meaningful descriptions for better categorization accuracy
