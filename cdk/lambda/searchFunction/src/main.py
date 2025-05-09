import pandas as pd
import torch
from langchain import __version__ as langchain_version

def handler(event, context):
    return {
        "statusCode": 200,
        "body": {
            "pandas_version": pd.__version__,
            "torch_version": torch.__version__,
            "langchain_version": langchain_version
        }
    }