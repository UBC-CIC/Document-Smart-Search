import pandas as pd
import torch
import os
import json
from langchain import __version__ as langchain_version
import pandas as pd
import boto3
from io import BytesIO
from opensearchpy import OpenSearch
from opensearchpy.helpers import bulk
import os
import json
from pathlib import Path
from pprint import pprint

with open(Path("configs.json"), "r") as file:
    configs = json.load(file)

SM_DB_CREDENTIALS=os.environ['SM_DB_CREDENTIALS']
RDS_PROXY_ENDPOINT= os.environ['RDS_PROXY_ENDPOINT']
BEDROCK_LLM_PARAM= os.environ['BEDROCK_LLM_PARAM']
EMBEDDING_MODEL_PARAM= os.environ['EMBEDDING_MODEL_PARAM']
TABLE_NAME_PARAM= os.environ['TABLE_NAME_PARAM']
REGION_NAME = os.environ['REGION']

# HARDCODED VALUES, TO BE CHANGED
BUCKET_NAME = "dfo-documents"
FOLDER_NAME = "documents"
LOCAL_DIR = "s3_data"
OPENSEARCH_SEC = configs['aws']['secrets']['opensearch']




def handler(event, context):
    return {
        "statusCode": 200,
        "body": {
            "pandas_version": pd.__version__,
            "torch_version": torch.__version__,
            "langchain_version": langchain_version
        }
    }