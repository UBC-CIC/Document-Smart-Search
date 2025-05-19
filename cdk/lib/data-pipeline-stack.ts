import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Effect, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';
import { VpcStack } from './vpc-stack';

export class DataPipelineStack extends cdk.Stack {
  public readonly dataUploadBucket: s3.Bucket;
  public readonly glueBucket: s3.Bucket;
  public readonly glueConnection: glue.CfnConnection;

  constructor(scope: Construct, id: string, vpcStack: VpcStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket for data uploads with batch structure
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

    // Create a security group for Glue
    const glueSecurityGroup = new ec2.SecurityGroup(this, 'GlueSecurityGroup', {
      vpc: vpcStack.vpc,
      description: 'Security group for Glue jobs',
      allowAllOutbound: true,
    });

    // Allow inbound access from Glue to RDS and OpenSearch
    glueSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcStack.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access'
    );

    glueSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpcStack.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow OpenSearch access'
    );

    // Create Glue network connection
    this.glueConnection = new glue.CfnConnection(this, 'GlueVpcConnection', {
      catalogId: this.account,
      connectionInput: {
        name: `${id}-glue-vpc-connection`,
        description: 'VPC connection for Glue jobs',
        connectionType: 'NETWORK',
        physicalConnectionRequirements: {
          availabilityZone: vpcStack.vpc.availabilityZones[0],
          securityGroupIdList: [glueSecurityGroup.securityGroupId],
          subnetId: vpcStack.vpc.privateSubnets[0].subnetId,
        },
      },
    });

    // Add necessary permissions to Glue role
    glueJobRole.addToPolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeVpcAttribute',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeRouteTables',
      ],
      resources: ['*'],
    }));

    // Add S3 access
    glueJobRole.addToPolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        this.dataUploadBucket.bucketArn,
        `${this.dataUploadBucket.bucketArn}/*`,
        this.glueBucket.bucketArn,
        `${this.glueBucket.bucketArn}/*`,
      ],
    }));

    const PYTHON_VER = "3.9";
    const GLUE_VER = "3.0";
    const MAX_CONCURRENT_RUNS = 1;
    const MAX_RETRIES = 0;
    const MAX_CAPACITY = 1;
    const TIMEOUT = 170;
    const PYTHON_LIBS = "psycopg[binary]==3.2.6,boto3==1.38.1,langchain==0.3.12,langchain-community==0.3.12,langchain-aws==0.2.21,opensearch-py==2.5.0,pandas==2.2.3,numpy==1.26.4,scikit-learn==1.6.1,rank-bm25==0.2.2,aiohttp==3.11.10,beautifulsoup4==4.12.3,bertopic==0.16.2,langdetect==1.0.9"

    // Create all Glue jobs with parameters
    const jobs = {
      cleanAndIngestHtml: new glue.CfnJob(this, "clean_and_ingest_html", {
        name: "clean_and_ingest_html",
        role: glueJobRole.roleArn,
        command: {
          name: "pythonshell",
          pythonVersion: PYTHON_VER,
          scriptLocation: `s3://${this.glueBucket.bucketName}/glue/scripts/clean_and_ingest_html.py`,
        },
        executionProperty: { maxConcurrentRuns: MAX_CONCURRENT_RUNS },
        maxRetries: MAX_RETRIES,
        maxCapacity: MAX_CAPACITY,
        timeout: TIMEOUT,
        glueVersion: GLUE_VER,
        defaultArguments: {
          "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
          "--additional-python-modules": PYTHON_LIBS,
          "library-set": "analytics",
          "--html_urls_path": "",  // Will be set at runtime
          "--batch_id": "",        // Will be set at runtime
        },
      }),

      ingestTopicsAndMandates: new glue.CfnJob(this, "ingest_topics_and_mandates", {
        name: "ingest_topics_and_mandates",
        role: glueJobRole.roleArn,
        command: {
          name: "pythonshell",
          pythonVersion: PYTHON_VER,
          scriptLocation: `s3://${this.glueBucket.bucketName}/glue/scripts/ingest_topics_and_mandates.py`,
        },
        executionProperty: { maxConcurrentRuns: MAX_CONCURRENT_RUNS },
        maxRetries: MAX_RETRIES,
        maxCapacity: MAX_CAPACITY,
        timeout: TIMEOUT,
        glueVersion: GLUE_VER,
        defaultArguments: {
          "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
          "--additional-python-modules": PYTHON_LIBS,
          "library-set": "analytics",
          "--topics_path": "",     // Will be set at runtime
          "--mandates_path": "",   // Will be set at runtime
          "--subcategories_path": "", // Will be set at runtime
          "--batch_id": "",        // Will be set at runtime
        },
      }),

      vectorLlmCategorization: new glue.CfnJob(this, "vector_llm_categorization", {
        name: "vector_llm_categorization",
        role: glueJobRole.roleArn,
        command: {
          name: "pythonshell",
          pythonVersion: PYTHON_VER,
          scriptLocation: `s3://${this.glueBucket.bucketName}/glue/scripts/vector_llm_categorization.py`,
        },
        executionProperty: { maxConcurrentRuns: MAX_CONCURRENT_RUNS },
        maxRetries: MAX_RETRIES,
        maxCapacity: MAX_CAPACITY,
        timeout: TIMEOUT,
        glueVersion: GLUE_VER,
        defaultArguments: {
          "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
          "--additional-python-modules": PYTHON_LIBS,
          "library-set": "analytics",
          "--batch_id": "",        // Will be set at runtime
        },
      }),

      sqlIngestion: new glue.CfnJob(this, "sql_ingestion", {
        name: "sql_ingestion",
        role: glueJobRole.roleArn,
        command: {
          name: "pythonshell",
          pythonVersion: PYTHON_VER,
          scriptLocation: `s3://${this.glueBucket.bucketName}/glue/scripts/sql_ingestion.py`,
        },
        executionProperty: { maxConcurrentRuns: MAX_CONCURRENT_RUNS },
        maxRetries: MAX_RETRIES,
        maxCapacity: MAX_CAPACITY,
        timeout: TIMEOUT,
        glueVersion: GLUE_VER,
        defaultArguments: {
          "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
          "--additional-python-modules": PYTHON_LIBS,
          "library-set": "analytics",
          "--batch_id": "",        // Will be set at runtime
        },
      }),

      topicModelling: new glue.CfnJob(this, "topic_modelling", {
        name: "topic_modelling",
        role: glueJobRole.roleArn,
        command: {
          name: "pythonshell",
          pythonVersion: PYTHON_VER,
          scriptLocation: `s3://${this.glueBucket.bucketName}/glue/scripts/topic_modelling.py`,
        },
        executionProperty: { maxConcurrentRuns: MAX_CONCURRENT_RUNS },
        maxRetries: MAX_RETRIES,
        maxCapacity: MAX_CAPACITY,
        timeout: TIMEOUT,
        glueVersion: GLUE_VER,
        defaultArguments: {
          "--extra-py-files": `s3://${this.glueBucket.bucketName}/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`,
          "--additional-python-modules": PYTHON_LIBS,
          "library-set": "analytics",
          "--batch_id": "",        // Will be set at runtime
        },
      }),
    };

    // Create the workflow
    const workflow = new glue.CfnWorkflow(this, "DataPipelineWorkflow", {
      name: "data-pipeline-workflow",
      description: "Workflow for processing and categorizing documents",
    });

    // Create triggers for the workflow
    const startTrigger = new glue.CfnTrigger(this, "StartTrigger", {
      name: "start-trigger",
      type: "ON_DEMAND",
      workflowName: workflow.name,
      actions: [
        {
          jobName: jobs.cleanAndIngestHtml.name,
        },
        {
          jobName: jobs.ingestTopicsAndMandates.name,
        },
      ],
    });

    const vectorLlmTrigger = new glue.CfnTrigger(this, "VectorLlmTrigger", {
      name: "vector-llm-trigger",
      type: "CONDITIONAL",
      workflowName: workflow.name,
      predicate: {
        conditions: [
          {
            jobName: jobs.cleanAndIngestHtml.name,
            state: "SUCCEEDED",
            logicalOperator: "EQUALS",
          },
          {
            jobName: jobs.ingestTopicsAndMandates.name,
            state: "SUCCEEDED",
            logicalOperator: "EQUALS",
          },
        ],
        logical: "AND",
      },
      actions: [
        {
          jobName: jobs.vectorLlmCategorization.name,
        },
      ],
    });

    const sqlIngestionTrigger = new glue.CfnTrigger(this, "SqlIngestionTrigger", {
      name: "sql-ingestion-trigger",
      type: "CONDITIONAL",
      workflowName: workflow.name,
      predicate: {
        conditions: [
          {
            jobName: jobs.vectorLlmCategorization.name,
            state: "SUCCEEDED",
            logicalOperator: "EQUALS",
          },
        ],
      },
      actions: [
        {
          jobName: jobs.sqlIngestion.name,
        },
      ],
    });

    const topicModellingTrigger = new glue.CfnTrigger(this, "TopicModellingTrigger", {
      name: "topic-modelling-trigger",
      type: "CONDITIONAL",
      workflowName: workflow.name,
      predicate: {
        conditions: [
          {
            jobName: jobs.sqlIngestion.name,
            state: "SUCCEEDED",
            logicalOperator: "EQUALS",
          },
        ],
      },
      actions: [
        {
          jobName: jobs.topicModelling.name,
        },
      ],
    });

    // Set dependencies
    startTrigger.addDependency(workflow);
    vectorLlmTrigger.addDependency(workflow);
    sqlIngestionTrigger.addDependency(workflow);
    topicModellingTrigger.addDependency(workflow);

    // Apply removal policy to all resources
    Object.values(jobs).forEach(job => job.applyRemovalPolicy(RemovalPolicy.DESTROY));
    workflow.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}

