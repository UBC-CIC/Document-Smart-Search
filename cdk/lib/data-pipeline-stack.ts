import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import { Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';

export class DataPipelineStack extends cdk.Stack {
  public readonly dataUploadBucket: s3.Bucket;
  public readonly glueBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket for data uploads for admin
    this.dataUploadBucket = new s3.Bucket(this, 'DataUploadBucket', {
      bucketName: `data-upload-bucket`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Create S3 bucket for Glue scripts and custom modules
    this.glueBucket = new s3.Bucket(this, 'GlueScriptsBucket', {
      bucketName: `glue-bucket`,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Upload existing Glue scripts to the scripts bucket
    new s3deploy.BucketDeployment(this, 'DeployGlueScripts', {
      sources: [s3deploy.Source.asset('./glue/')],
      destinationBucket: this.glueBucket,
      destinationKeyPrefix: 'glue',
    });

    // Create an IAM role for Glue jobs
    const roleName = 'AWSGlueServiceRole-datapipeline';
    const glueJobRole = new iam.Role(this, 'GlueJobRole', {
      roleName: roleName,
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      description: 'Role used by AWS Glue for data pipeline processing',
    });

    glueJobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
    );
    glueJobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess')
    );
    glueJobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess')
    );
    glueJobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueServiceRole')
    );
    glueJobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
    );

    const PYTHON_VER = "3.9";
    const GLUE_VER = "3.0";
    const MAX_CONCURRENT_RUNS = 1;
    const MAX_RETRIES = 0; // no retries, only execute once
    const MAX_CAPACITY = 1; // 1 DPU, max capacity
    const TIMEOUT = 170; // 170 min timeout duration
    const PYTHON_LIBS = "psycopg[binary]==3.2.6,boto3==1.38.1,langchain==0.3.12,langchain-community==0.3.12,langchain-aws==0.2.21,opensearch-py==2.5.0,pandas==2.2.3,numpy==1.26.4,scikit-learn==1.6.1,rank-bm25==0.2.2,aiohttp==3.11.10,beautifulsoup4==4.12.3,bertopic==0.16.2,langdetect==1.0.9"

    // Glue Job: extract syllabus metadata
    const glueJob1Name = "clean_and_ingest_html";
    const glueJob1 = new glue.CfnJob(this, glueJob1Name, {
      name: glueJob1Name,
      role: glueJobRole.roleArn,
      command: {
        name: "pythonshell",
        pythonVersion: PYTHON_VER,
        scriptLocation:
          "s3://" + this.glueBucket.bucketName + "/glue/scripts/clean_and_ingest_html.py",
      },
      executionProperty: {
        maxConcurrentRuns: MAX_CONCURRENT_RUNS,
      },
      maxRetries: MAX_RETRIES,
      maxCapacity: MAX_CAPACITY,
      timeout: TIMEOUT,
      glueVersion: GLUE_VER,
      defaultArguments: {
        "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
        "--additional-python-modules": PYTHON_LIBS,
        "library-set": "analytics",
      },
    });

    // Glue Job: extract syllabus metadata
    const glueJob2Name = "topic_modelling";
    const glueJob2 = new glue.CfnJob(this, glueJob2Name, {
      name: glueJob2Name,
      role: glueJobRole.roleArn,
      command: {
        name: "pythonshell",
        pythonVersion: PYTHON_VER,
        scriptLocation:
          "s3://" + this.glueBucket.bucketName + "/glue/scripts/topic_modelling.py",
      },
      executionProperty: {
        maxConcurrentRuns: MAX_CONCURRENT_RUNS,
      },
      maxRetries: MAX_RETRIES,
      maxCapacity: MAX_CAPACITY,
      timeout: TIMEOUT,
      glueVersion: GLUE_VER,
      defaultArguments: {
        "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
        "--additional-python-modules": PYTHON_LIBS,
        "library-set": "analytics",
      },
    });

    glueJob1.applyRemovalPolicy(RemovalPolicy.DESTROY);
    glueJob2.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}

