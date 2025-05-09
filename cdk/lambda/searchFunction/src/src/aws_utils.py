import boto3
from botocore.exceptions import ClientError, ProfileNotFound
import json
import os
import glob
from pathlib import Path

current_dir = os.path.dirname(__file__)
with open(Path(current_dir, "..", "configs.json"), "r") as file:
    configs = json.load(file)
profile_name = configs['aws'].get("profile_name", None)
region_name = configs['aws']["region_name"]
session = boto3.session.Session()
print("AWS Session without profile created!")
if profile_name: # if you run this script locally, using an aws profile
    try:
        print(f"Attempting to use a Session with profile_name: {profile_name}")
        session = boto3.session.Session(profile_name=profile_name)
        print(f"Successfully using Session with AWS profile: {profile_name} ({region_name})")
    except ProfileNotFound as e:
        print(f"Profile: {profile_name} not found, using non-profile Session!")
        
def get_secret(secret_name, region_name):

    # Create a Secrets Manager client
    
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        raise e

    secret = get_secret_value_response['SecretString']
    return json.loads(secret)


def download_s3_folder(bucket_name, s3_folder, local_dir):
    """
    Downloads all files from a specified S3 folder to a local directory using a specific AWS profile.
    
    Parameters:
    bucket_name (str): The name of the S3 bucket.
    s3_folder (str): The path of the folder in the S3 bucket (with trailing slash).
    local_dir (str): The local directory where files should be saved.
    """
    # Initialize a session using the specified profile
    s3 = session.client('s3')

    # Ensure local directory exists
    if not os.path.exists(local_dir):
        os.makedirs(local_dir, exist_ok=True)
    
    # List objects in the S3 folder
    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name, Prefix=s3_folder)

    for page in pages:
        for obj in page['Contents']:
            s3_key = obj['Key']
            if s3_key.endswith('/'):
                continue  # Skip folders
            
            local_file_path = os.path.join(local_dir, os.path.relpath(s3_key, s3_folder))

            # Ensure subdirectories exist
            os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
            
            print(f"Downloading {s3_key} to {local_file_path}...")
            s3.download_file(bucket_name, s3_key, local_file_path)
        
    print("Download complete.")


def list_s3_files(bucket_name, prefix):
    """
    List all files in an S3 bucket that match a given prefix.

    Parameters
    ----------
    bucket_name : str
        The name of the S3 bucket.
    prefix : str
        The prefix to filter the files.

    Returns
    -------
    list of str
        A list of file keys matching the prefix.
    """
    s3 = session.client('s3')
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
    return [obj['Key'] for obj in response.get('Contents', [])]

def extract_json(bucket, key):
    """
    Extract content from a JSON file stored in an S3 bucket.

    Parameters
    ----------
    bucket : str
        The name of the S3 bucket containing the JSON file.
    key : str
        The key (path) of the JSON file in the S3 bucket.

    Returns
    -------
    dict
        The parsed JSON content as a dictionary.
    """
    s3 = session.client('s3')
    json_obj = s3.get_object(Bucket=bucket, Key=key)
    json_content = json_obj['Body'].read()
    return json.loads(json_content)
