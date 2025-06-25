# Deployment Guide

## Table of Contents
- [Deployment Guide](#deployment-guide)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Pre-Deployment](#pre-deployment)
    - [Create GitHub Personal Access Token](#create-github-personal-access-token)
    - [Enable Models in Bedrock](#enable-models-in-bedrock)
  - [Deployment](#deployment)
    - [Step 1: Fork \& Clone The Repository](#step-1-fork--clone-the-repository)
    - [Step 2: Upload Secrets](#step-2-upload-secrets)
    - [Step 3: CDK Deployment](#step-3-cdk-deployment)
  - [Post-Deployment](#post-deployment)
    - [Task 1:Upload the files for the data pipeline](#task-1upload-the-files-for-the-data-pipeline)
      - [Before you start](#before-you-start)
      - [Please note](#please-note)
    - [Task 2: Build AWS Amplify App](#task-2-build-aws-amplify-app)
  - [Cleanup](#cleanup)
    - [Taking down the deployed stack](#taking-down-the-deployed-stack)

## Requirements
Before you deploy, you must have the following installed on your device:
- [git](https://git-scm.com/downloads)
- [AWS Account](https://aws.amazon.com/account/)
- [GitHub Account](https://github.com/)
- [AWS CLI](https://aws.amazon.com/cli/)
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) *(v2.122.0 > required)*
- [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [node](https://nodejs.org/en/ln/getting-started/how-to-install-nodejs) *(v20.0.0 > required)*
- [docker](https://www.docker.com/products/docker-desktop/)

## Pre-Deployment
### Create GitHub Personal Access Token
To deploy this solution, you will need to generate a GitHub personal access token. Please visit [here](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) for detailed instruction to create a personal access token.

*Note: when selecting the scopes to grant the token (step 8 of the instruction), make sure you select `repo` scope.*

**Once you create a token, please note down its value as you will use it later in the deployment process.**

Docker must also be running for the deployment to work.

### Enable Models in Bedrock

First, navigate to Amazon Bedrock in the AWS Console. From the home page, click on model access under Bedrock configurations:
![](./images/bedrockhome.png)

Then click on "Modify model access":
![](./images/modifymodels.png)

Finally, enable the relevant models, click next and on the next page click submit. Amazon Titan Embeddings V2 and Meta Llama 3 70B Instruct are required for this project.
![](./images/enablemodels.png)

The relevant models are now enabled in Bedrock.
## Deployment
### Step 1: Fork & Clone The Repository
First, you need to fork the repository. To create a fork, navigate to the [main branch](https://github.com/UBC-CIC/DFO-Smart-Search) of this repository. Then, in the top-right corner, click `Fork`.

![](./images/fork.jpeg)

You will be directed to the page where you can customize owner, repository name, etc, but you do not have to change any option. Simply click `Create fork` in the bottom right corner.

Now let's clone the GitHub repository onto your machine. To do this:
1. Create a folder on your computer to contain the project code.
2. For an Apple computer, open Terminal. If on a Windows machine, open Command Prompt or Windows Terminal. Enter into the folder you made using the command `cd path/to/folder`. To find the path to a folder on a Mac, right click on the folder and press `Get Info`, then select the whole text found under `Where:` and copy with ⌘C. On Windows (not WSL), enter into the folder on File Explorer and click on the path box (located to the left of the sch bar), then copy the whole text that shows up.
3. Clone the GitHub repository by entering the following command. Be sure to replace `<YOUR-GITHUB-USERNAME>` with your own username.
```
git clone https://github.com/<YOUR-GITHUB-USERNAME>/DFO-Smart-Search.git
```
The code should now be in the folder you created. Navigate into the root folder containing the entire codebase by running the command:
```
cd DFO-Smart-Search
```

### Step 2: Upload Secrets
You would have to supply your GitHub personal access token you created earlier when deploying the solution. Run the following command and ensure you replace `<YOUR-GITHUB-TOKEN>` and `<YOUR-PROFILE-NAME>` with your actual GitHub token and the appropriate AWS profile name.
```
aws secretsmanager create-secret \
    --name github-personal-access-token \
    --secret-string '{\"my-github-token\":\"<YOUR-GITHUB-TOKEN>\"}'\
    --profile <YOUR-PROFILE-NAME>
```

Moreover, you will need to upload your github username to Amazon SSM Parameter Store. You can do so by running the following command. Make sure you replace `<YOUR-GITHUB-USERNAME>` and `<YOUR-PROFILE-NAME>` with your actual username and the appropriate AWS profile name.

```
aws ssm put-parameter \
    --name "DFO-owner-name" \
    --value "<YOUR-GITHUB-USERNAME>" \
    --type String \
    --profile <YOUR-PROFILE-NAME>
```

You would have to supply a custom database username when deploying the solution to increase security. Run the following command and ensure you replace `<YOUR-DB-USERNAME>` with the custom name of your choice.

```
aws secretsmanager create-secret \
    --name DFOSecrets \
    --secret-string '{\"DB_Username\":\"<YOUR-DB-USERNAME>\"}'\
    --profile <your-profile-name>
  
Note: If you using an Apple Computer, use the following command instead:
aws secretsmanager create-secret \
    --name DFOSecrets \
    --secret-string "{\"DB_Username\":\"<YOUR-DB-USERNAME>\"}"\
    --profile <your-profile-name>
```

For example,

```
aws secretsmanager create-secret \
    --name DFOSecrets \
    --secret-string '{\"DB_Username\":\"DFOSecrets\"}'\
    --profile <your-profile-name>
```
Note: No special characters are allowed in the secret value.

Finally, in order to restrict user sign up to specific email domains, you will need to upload a comma separated list of allowed email domains to Amazon SSM Parameter Store. You can do so by running the following command. Make sure you replace `<YOUR-ALLOWED-EMAIL-DOMAIN-LIST>` and `<YOUR-PROFILE-NAME>` with your actual list and the appropriate AWS profile name.

```
aws ssm put-parameter \
    --name "/DFO/AllowedEmailDomains" \
    --value "<YOUR-ALLOWED-EMAIL-DOMAIN-LIST>" \
    --type SecureString \
    --profile <YOUR-PROFILE-NAME>
```

For example,

```
aws ssm put-parameter \
    --name "/DFO/AllowedEmailDomains" \
    --value "gmail.com,ubc.ca" \
    --type SecureString \
    --profile <YOUR-PROFILE-NAME>
```
### Step 3: CDK Deployment
It's time to set up everything that goes on behind the scenes! For more information on how the backend works, feel free to refer to the Architecture Deep Dive, but an understanding of the backend is not necessary for deployment.

Open a terminal in the `/cdk` directory.

**Download Requirements**: Install requirements with npm by running `npm install` command.


**Initialize the CDK stack**(required only if you have not deployed any resources with CDK in this region before). Please replace `<your-profile-name>` with the appropriate AWS profile used earlier.
```
cdk synth --profile <your-profile-name>
cdk bootstrap aws://<YOUR_AWS_ACCOUNT_ID>/<YOUR_ACCOUNT_REGION> --profile <your-profile-name>
```

**Deploy CDK stack**
You may run the following command to deploy the stacks all at once. Again, replace `<your-profile-name>` with the appropriate AWS profile used earlier. Also replace `<your-stack-prefix>` with the appropriate stack prefix.

The stack prefix will be prefixed onto the physical names of the resources created during deployment.

If you have trouble running the above command, try removing all the \ and run it in one line.
```
cdk deploy --all \
 --parameters <your-stack-prefix>-Amplify:githubRepoName=DFO-Smart-Search \
 --context StackPrefix=<your-stack-prefix> \
 --profile <your-profile-name>
```

For example: 

```
cdk deploy --all --parameters DFOSmartSearch-Amplify:githubRepoName=DFO-Smart-Search --context StackPrefix=DFOSmartSearch --profile <your-profile-name>
```

## Post-Deployment

### Task 1:Upload the files for the data pipeline

#### Before you start

You will need to upload 4 different files to the S3 bucket for the data pipeline to ingest, for first time deployment.

- An `xlsx` file that contains the html urls
- 3 `csv` files that contains the topics, mandates, and subcategories data

For more information on the files, please refer to the [Data Pipeline](./dataPreparation.md) documentation.

1. You will need to upload the files for the data pipeline to the S3 bucket. It will contain `dataupload` in its name.

![alt text](./images/datapipeline/s3-dataupload.png)

2. Navigate into the `batches` folder
 
![alt text](./images/datapipeline/s3-root.png)

3. Create a new folder for the batch you want to upload. The subfolder name can be anything, as long as it is unique. We highly recommend using the date of the batch as the subfolder name for easier tracking. For example, let's use `2025_05_21` as the subfolder name.

![alt text](./images/datapipeline/s3-createfolder.png)

4. Navigate into the `2025_05_21` folder and create 2 subfolders: `html_data` and `topics_mandates_data`

![alt text](./images/datapipeline/s3-subfolders.png)

5. Navigate into the `html_data` folder and upload the `xlsx` file that contains the html urls. The file name can be anything. **You must also note down the s3 URI of the file** by selecting the file and clicking on the `Copy S3 URI` button.

![alt text](./images/datapipeline/s3-htmlupload.png)

6. Navigate into the `topics_mandates_data` folder and upload the `csv` files that contains the topics and mandates data. The file name must be `new_topics.cvs`, `new_mandates.csv`, and `new_subcategories.csv`. You do not need to note down the s3 URI of the files.

![alt text](./images/datapipeline/s3-topicupload.png)

7. Run this command to trigger the data pipeline, using the AWS CLI:

```bash
aws glue start-job-run \
    --job-name 'DFO-DataPipeline-clean-and-ingest-html' \
    --arguments '{"--batch_id": "<your-batch-id>", "--html_urls_path": "<your-html-data-s3-uri>", "--pipeline_mode": "full_update", 
    "--topic_modelling_mode": "retrain"}' \
    --profile <your-aws-profile-name>
```

Please remember to replace `<your-html-data-s3-uri>` , with the actual s3 URI of the files, and `<your-batch-id>` with the actual batch id that you used to name the batch folder earlier. For `pipeline_mode`, you can choose between `full_update`, `html_only` or `topics_only`. For first time deployment, you must use `full_update`.

Example:

```bash
aws glue start-job-run \
    --job-name 'DFO-DataPipeline-clean-and-ingest-html' \
    --arguments '{"--batch_id": "2025_05_21", "--html_urls_path": "s3://smartsearch-dataupload/batches/2025_05_21/html_data/new_html_urls.xlsx", "--pipeline_mode": "full_update", "--topic_modelling_mode": "retrain"}' \
    --profile myprofile
```

The data pipeline will take a while to run, so you can go ahead and build the AWS Amplify app while you wait.

#### Please note

For future runs of the data pipeline, you can choose between:

- `html_only` if you only upload new html urls `xlsx` file, which means you only want to update the html data
- `topics_only` if you only upload new topics or mandates `csv` files, which means you only want to update the topics or mandates data
- `full_update` if you have new html urls and topics or mandates to ingest, which means you want to update both the html data and the topics or mandates data

For example, if you only have new html urls to ingest for batch `2025_06_01`, you just need to upload the new `xlsx` file to the `html_data` folder.

Similarly, if you only have new topics or mandates to ingest for batch `2025_06_01`, you just need to upload the new `csv` files to the `topics_mandates_data` folder. Y

If you have **BOTH** new html urls and topics or mandates to ingest for batch `2025_06_01`, do it as if it is a fresh deployment (`full_update`).

**Note for the Topic Modelling mode**:

By default, the data pipeline will use `retrain` for the `topic_modelling_mode`  to signify that you want to retrain the BERTopic model every time you run the data pipeline. You can also choose to use `predict` to use the existing BERTopic model and just classify new documents. For first time deployment, you must use `retrain`. For more information on the topic modelling mode, please refer to the [Topic Modelling](./deepdive/topicModelling.md) documentation.

### Task 2: Build AWS Amplify App

1. Log in to AWS console, and navigate to **AWS Amplify**. You can do so by typing `Amplify` in the search bar at the top.
2. From `All apps`, click `<stack-prefix>-Amplify-admin`.
3. Then click `main` under `branches`
4. Click `run job` and wait for the build to complete.
5. You now have access to the `Amplify App ID` and the public domain name to use the web app.
6. From `All apps`, click `<stack-prefix>-Amplify-public` and repeat steps 3-5.
![](./images/DFO-Amplify-admin.png)
![](./images/DFO-Amplify-admin-run-job.png)
![](./images/DFO-Amplify-no-deploy.png)

You can now navigate to the web app URL to see your application in action.

## Cleanup

### Taking down the deployed stack

To take down the deployed stack for a fresh redeployment in the future, navigate to AWS Cloudformation on the AWS Console, click on the stack and hit Delete.

Please wait for the stacks in each step to be properly deleted before deleting the stack downstream.

Also make sure to delete secrets in Secrets Manager.
