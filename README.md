# Smart Document Categorization System

This system explores how Large Language Models (LLMs) and vector embeddings can enhance document organization by providing an intelligent and automated way to categorize and analyze large collections of documents. Acting as a smart document processor, the system automatically identifies relevant topics and mandates for each document, providing explainable categorizations with confidence scores. The system also allows for chatbot functionality, where users can ask questions and receive tailored responses aligned with topics and mandates. This approach makes document management more efficient and insightful, enabling better organization and discovery of information across large document repositories.

| Index                                               | Description                                             |
| :-------------------------------------------------- | :------------------------------------------------------ |
| [High Level Architecture](#high-level-architecture) | High level overview illustrating component interactions |
| [Deployment](#deployment-guide)                     | How to deploy the project                               |
| [User Guide](#user-guide)                           | The working solution                                    |
| [Directories](#directories)                         | General project directory structure                     |
| [API Documentation](#api-documentation)             | Documentation on the API the project uses               |
| [Changelog](#changelog)                             | Any changes post publish                                |
| [Credits](#credits)                                 | Meet the team behind the solution                       |
| [License](#license)                                 | License details                                         |

## High-Level Architecture

The following architecture diagram illustrates the various AWS components utilized to deliver the solution. For an in-depth explanation of the frontend and backend stacks, please look at the [Architecture Guide](docs/architectureDeepDive.md).

![Alt text](docs/images/architecture.png)

## Deployment Guide

To deploy this solution, please follow the steps laid out in the [Deployment Guide](./docs/deploymentGuide.md)

## User Guide

Please refer to the [Web App User Guide](./docs/userGuide.md) for instructions on navigating the web app interface.

## Directories

```
├── cdk/                           # AWS CDK infrastructure code
│   ├── bin/                       # CDK app entry point
│   ├── data_ingestion/           # Data ingestion components
│   ├── file_search/              # File search functionality
│   ├── glue/                     # AWS Glue jobs and scripts
│   │   ├── scripts/              # Glue job scripts
│   │   └── custom_modules/       # Shared Python modules
│   ├── lambda/                   # AWS Lambda functions
│   ├── layers/                   # Lambda layers
│   ├── lib/                      # CDK stack definitions
│   ├── sql_schema/              # Database schema definitions
│   └── text_generation/         # Text generation components
├── docs/                         # Project documentation
├── export/                       # Export files
├── frontend/                     # Public-facing web application
│   ├── public/                   # Static assets
│   └── src/                      # Source code
│       ├── app/                  # Next.js app router
│       └── components/           # React components
│           ├── analytics/        # Analytics components
│           ├── chat/            # Chat interface components
│           ├── document-detail/ # Document detail view
│           ├── document-search/ # Document search interface
│           ├── home/            # Home page components
│           └── ui/              # Shared UI components
└── frontendAdmin/                # Admin web application
    ├── public/                   # Static assets
    └── src/                      # Source code
        ├── app/                  # Next.js app router
        └── components/           # React components
            ├── analytics/        # Analytics dashboard
            ├── auth/            # Authentication components
            ├── feedback/        # User feedback components
            ├── history/         # History tracking
            ├── prompt/          # Prompt management
            └── ui/              # Shared UI components
```

1. `/cdk`: Contains the AWS CDK infrastructure code
   - `/bin`: CDK app entry point and stack instantiation
   - `/data_ingestion`: Data ingestion pipeline components
   - `/file_search`: File search and indexing functionality
   - `/glue`: AWS Glue jobs for data processing
     - `/scripts`: Glue job Python scripts
     - `/custom_modules`: Shared Python modules
   - `/lambda`: AWS Lambda functions
   - `/layers`: Lambda layers for shared dependencies
   - `/lib`: CDK stack definitions and infrastructure code
   - `/sql_schema`: Database schema and migration files
   - `/text_generation`: Text generation and processing components

2. `/docs`: Project documentation and guides

3. `/frontend`: Public-facing web application
   - `/public`: Static assets and public files
   - `/src`: Application source code
     - `/app`: Next.js app router and pages
     - `/components`: React components and UI elements
       - `/analytics`: Analytics and reporting components
       - `/chat`: Chat interface and messaging components
       - `/document-detail`: Document viewing and details
       - `/document-search`: Search interface and results
       - `/home`: Home page and landing components
       - `/ui`: Shared UI components and styles

4. `/frontendAdmin`: Administrative web application
   - `/public`: Static assets and public files
   - `/src`: Application source code
     - `/app`: Next.js app router and pages
     - `/components`: React components and UI elements
       - `/analytics`: Analytics dashboard and metrics
       - `/auth`: Authentication and authorization
       - `/feedback`: User feedback management
       - `/history`: History tracking and logs
       - `/prompt`: Prompt management and configuration
       - `/ui`: Shared UI components and styles

## API Documentation

Here you can learn about the API the project uses: [API Documentation](./docs/api-documentation.pdf).

## Modification Guide

Steps to implement optional modifications such as changing the colours of the application can be found [here](./docs/modificationGuide.md)

## Changelog

N/A

## Credits

This application was architected and developed by [Daniel Long](https://www.linkedin.com/in/pin-hong-long/), [Tien Nguyen](https://www.linkedin.com/in/nhantien/), [Nikhil Sinclair](https://www.linkedin.com/in/nikhil-sinclair/), and [Zayan Sheikh](https://www.linkedin.com/in/zayans/), with project assistance by [Amy Cao](https://www.linkedin.com/in/amy-c-2313121b1/) and Harleen Chahal. Thanks to the UBC Cloud Innovation Centre Technical and Project Management teams for their guidance and support.

## License

This project is distributed under the [MIT License](LICENSE).

Licenses of libraries and tools used by the system are listed below:

[PostgreSQL license](https://www.postgresql.org/about/licence/)

- For PostgreSQL and pgvector
- "a liberal Open Source license, similar to the BSD or MIT licenses."

[LLaMa 3.3 Community License Agreement](https://www.llama.com/llama3_3/license/)

- For Llama 3.3 70B Instruct model
