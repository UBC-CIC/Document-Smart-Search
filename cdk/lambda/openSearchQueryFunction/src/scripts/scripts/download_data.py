import pandas as pd
import boto3
from io import BytesIO
import os
import json
from pathlib import Path
import sys
sys.path.append("..")
from src import aws_utils as aws

session  = aws.session

# cd into scripts/ and run: python download_data.py
if __name__ == "__main__":
    aws.download_s3_folder('dfo-documents', 'documents', '../s3_data')