#!/bin/bash

# Required environment variables for testing
export SM_DB_CREDENTIALS="opensearch/masteruser"
export REGION="us-west-2"
export RDS_PROXY_ENDPOINT="localhost:5432"
export BEDROCK_LLM_PARAM="/dfo/llm/model"
export EMBEDDING_MODEL_PARAM="/dfo/embeddings/model"
export TABLE_NAME_PARAM="DynamoDB-Conversation-Table"

# Optional: AWS credentials if not using a profile
# export AWS_ACCESS_KEY_ID="your_access_key"
# export AWS_SECRET_ACCESS_KEY="your_secret_key"
# export AWS_SESSION_TOKEN="your_session_token"

echo "Environment variables set for DFO Smart Search testing."
echo "Run your tests with: python test_script.py"
