import { Stack, StackProps, RemovalPolicy, SecretValue, CfnOutput, CustomResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";

import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import * as path from "path";

import { VpcStack } from "./vpc-stack";

export class OpenSearchStack extends Stack {
  public readonly openSearchDomain: opensearch.Domain;
  public readonly comparisonOpenSearchDomain: opensearch.Domain;
  public readonly secretPathAdmin: secretsmanager.Secret;
  public readonly comparisonSecretPathAdmin: secretsmanager.Secret;
  public readonly secretPathUser: secretsmanager.Secret;
  public readonly comparisonSecretPathUser: secretsmanager.Secret;
  public readonly openSearchEndpoint: string;
  public readonly comparisonOpenSearchEndpoint: string;
  public readonly domainID: string;
  public readonly comparisonDomainID: string;

  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    props?: StackProps
  ) {
    super(scope, id, props);

    this.domainID = id;
    this.comparisonDomainID = id + "-comparison";
    
    // Create secrets for OpenSearch credentials
    this.secretPathAdmin = new secretsmanager.Secret(this, "OpenSearchAdminSecret", {
      secretName: `${id}-opensearch/admin/credentials`,
      description: "Admin credentials for OpenSearch",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    
    this.secretPathUser = new secretsmanager.Secret(this, "OpenSearchUserSecret", {
      secretName: `${id}-opensearch/user/credentials`,
      description: "User credentials for OpenSearch",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dfouser" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create comparison domain secrets (similar setup)
    this.comparisonSecretPathAdmin = new secretsmanager.Secret(this, "ComparisonOpenSearchAdminSecret", {
      secretName: `${this.comparisonDomainID}-opensearch/admin/credentials`,
      description: "Admin credentials for comparison OpenSearch domain",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    
    this.comparisonSecretPathUser = new secretsmanager.Secret(this, "ComparisonOpenSearchUserSecret", {
      secretName: `${this.comparisonDomainID}-opensearch/user/credentials`,
      description: "User credentials for comparison OpenSearch domain",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dfouser" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create a security group for OpenSearch
    const openSearchSg = new ec2.SecurityGroup(this, "OpenSearchSecurityGroup", {
      vpc: vpcStack.vpc,
      description: "Security group for OpenSearch domain",
      allowAllOutbound: true,
    });
    
    openSearchSg.addIngressRule(
      ec2.Peer.ipv4(vpcStack.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      "Allow HTTPS from VPC"
    );

    // Create the OpenSearch domain
    this.openSearchDomain = new opensearch.Domain(this, "OpenSearchDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc: vpcStack.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [openSearchSg],
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: "t3.medium.search",
      },
      ebs: {
        volumeSize: 100,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      zoneAwareness: {
        enabled: true,
        availabilityZoneCount: 2,
      },
      logging: {
        appLogEnabled: true,
        slowSearchLogEnabled: true,
        slowIndexLogEnabled: true,
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
      enforceHttps: true,
      fineGrainedAccessControl: {
        masterUserName: this.secretPathAdmin.secretValueFromJson("username").unsafeUnwrap(),
        masterUserPassword: this.secretPathAdmin.secretValueFromJson("password"),
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    
    this.openSearchEndpoint = `https://${this.openSearchDomain.domainEndpoint}`;

    // Create the comparison OpenSearch domain with similar configuration
    this.comparisonOpenSearchDomain = new opensearch.Domain(this, "ComparisonOpenSearchDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc: vpcStack.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [openSearchSg],
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: "t3.medium.search",
      },
      ebs: {
        volumeSize: 100,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      zoneAwareness: {
        enabled: true,
        availabilityZoneCount: 2,
      },
      logging: {
        appLogEnabled: true,
        slowSearchLogEnabled: true,
        slowIndexLogEnabled: true,
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
      enforceHttps: true,
      fineGrainedAccessControl: {
        masterUserName: this.comparisonSecretPathAdmin.secretValueFromJson("username").unsafeUnwrap(),
        masterUserPassword: this.comparisonSecretPathAdmin.secretValueFromJson("password"),
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    
    this.comparisonOpenSearchEndpoint = `https://${this.comparisonOpenSearchDomain.domainEndpoint}`;

    // Create Lambda function for initializing OpenSearch with schemas and hybrid search
    const initializerLambda = new lambda.Function(this, 'OpenSearchInitializer', {
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/opensearch-initializer')),
      handler: 'index.handler',
      timeout: Duration.minutes(5),
      environment: {
        OPENSEARCH_ENDPOINT: this.openSearchDomain.domainEndpoint,
        COMPARISON_OPENSEARCH_ENDPOINT: this.comparisonOpenSearchDomain.domainEndpoint,
        ADMIN_SECRET_ARN: this.secretPathAdmin.secretArn,
        COMPARISON_ADMIN_SECRET_ARN: this.comparisonSecretPathAdmin.secretArn,
        USER_SECRET_ARN: this.secretPathUser.secretArn,
        COMPARISON_USER_SECRET_ARN: this.comparisonSecretPathUser.secretArn,
        TOPIC_INDEX_NAME: 'dfo-topics',
        MANDATE_INDEX_NAME: 'dfo-mandates',
        HTML_INDEX_NAME: 'dfo-html-documents',
        VECTOR_DIMENSION: '1024'
      },
      vpc: vpcStack.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [openSearchSg],
    });

    // Grant Lambda permissions to access OpenSearch domains and secrets
    this.openSearchDomain.grantReadWrite(initializerLambda);
    this.comparisonOpenSearchDomain.grantReadWrite(initializerLambda);
    this.secretPathAdmin.grantRead(initializerLambda);
    this.comparisonSecretPathAdmin.grantRead(initializerLambda);
    this.secretPathUser.grantRead(initializerLambda);
    this.comparisonSecretPathUser.grantRead(initializerLambda);
    
    // Add user creation permissions
    initializerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "es:ESHttp*"
        ],
        resources: [
          `${this.openSearchDomain.domainArn}/*`,
          `${this.comparisonOpenSearchDomain.domainArn}/*`
        ]
      })
    );

    // Create a custom resource to trigger the initializer Lambda
    const provider = new cr.Provider(this, 'OpenSearchInitializerProvider', {
      onEventHandler: initializerLambda,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const initializeOpenSearch = new CustomResource(this, 'InitializeOpenSearch', {
      serviceToken: provider.serviceToken,
      properties: {
        // Add timestamp to force deployment on every update
        timestamp: new Date().toISOString(),
      }
    });

    // Export outputs
    new CfnOutput(this, 'OpenSearchEndpoint', {
      value: this.openSearchEndpoint,
      description: 'OpenSearch domain endpoint',
    });

    new CfnOutput(this, 'ComparisonOpenSearchEndpoint', {
      value: this.comparisonOpenSearchEndpoint,
      description: 'Comparison OpenSearch domain endpoint',
    });
  }
}