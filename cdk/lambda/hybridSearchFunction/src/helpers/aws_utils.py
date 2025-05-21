import boto3
from botocore.exceptions import ClientError, ProfileNotFound
import json
import os
import glob
from pathlib import Path

# current_dir = os.path.dirname(__file__)

# profile_name = configs['aws'].get("profile_name", None)
# region_name = configs['aws']["region_name"]
# session = boto3.session.Session()
# print("AWS Session without profile created!")
# if profile_name: # if you run this script locally, using an aws profile
#     try:
#         print(f"Attempting to use a Session with profile_name: {profile_name}")
#         session = boto3.session.Session(profile_name=profile_name)
#         print(f"Successfully using Session with AWS profile: {profile_name} ({region_name})")
#     except ProfileNotFound as e:
#         print(f"Profile: {profile_name} not found, using non-profile Session!")
        
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

def get_parameter_ssm(parameter_name, region_name, with_decryption=True):
    """
    Retrieve a parameter from AWS Systems Manager Parameter Store.

    Parameters:
        parameter_name (str): The name of the parameter to retrieve.
        region_name (str): The AWS region where the parameter is stored.
        with_decryption (bool): Whether to decrypt the parameter value if it's encrypted.

    Returns:
        str: The parameter value.
    """
    # Create a Systems Manager (SSM) client
    client = session.client(
        service_name='ssm',
        region_name=region_name
    )

    try:
        response = client.get_parameter(
            Name=parameter_name,
            WithDecryption=with_decryption
        )
        return response['Parameter']['Value']
    except ClientError as e:
        raise e
