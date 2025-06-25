# DFO Smart Search Documentation

This folder contains comprehensive documentation for the DFO Smart Search application, a system designed to categorize documents against topics and mandates using vector-based LLM categorization. The documentation covers everything from data preparation and deployment to architecture details and user guides.

## Documentation Overview

| Document | Description |
|----------|-------------|
| [Data Preparation Guide](dataPreparation.md) | Instructions for preparing files to upload to S3 for the data pipeline, including file structure, required columns, and examples for topics, mandates, and subcategories. |
| [Deployment Guide](deploymentGuide.md) | Step-by-step instructions for deploying the DFO Smart Search pipeline on AWS, including infrastructure setup, configuration, and deployment procedures. |
| [Architecture Deep Dive](architectureDeepDive.md) | Comprehensive technical documentation covering the system architecture, data flow, AWS services integration, and detailed component explanations. |
| [Security Guide](security-guide.md) | Security best practices, compliance requirements, and implementation guidelines for securing the DFO Smart Search pipeline and data. |
| [User Guide](userGuide.md) | End-user documentation explaining how to use the DFO Smart Search system, including interface navigation and common operations. |
| [Modification Guide](modificationGuide.md) | Guidelines for customizing and extending the DFO Smart Search pipeline, including code modifications and configuration changes. |
| [API Gateway Documentation](api-gateway-doc.pdf) | Technical specification and reference for the API Gateway integration, including endpoints, authentication, and usage examples. |

## Additional Resources

- **images/**: Contains diagrams, screenshots, and visual aids referenced throughout the documentation
- **rag_architecture/**: Detailed documentation specific to the RAG (Retrieval-Augmented Generation) architecture components
- **deepdive/**: In-depth technical analysis and implementation details for advanced users

## Getting Started

For new users, we recommend starting with:
1. [Data Preparation Guide](dataPreparation.md) - Learn how to prepare your data
2. [User Guide](userGuide.md) - Understand how to use the system
3. [Deployment Guide](deploymentGuide.md) - Set up the infrastructure

For technical users and developers:
1. [Architecture Deep Dive](architectureDeepDive.md) - Understand the system design
2. [Security Guide](security-guide.md) - Implement security measures
3. [Modification Guide](modificationGuide.md) - Customize the system
