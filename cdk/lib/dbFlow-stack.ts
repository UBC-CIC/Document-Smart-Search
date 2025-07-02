import { Stack, StackProps, triggers } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";

// Service files import
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";

// Stack import
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";
import { ApiGatewayStack } from "./api-gateway-stack";
import { OpenSearchStack } from "./opensearch-stack";

export class DBFlowStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    db: DatabaseStack,
    apiStack: ApiGatewayStack,
    os: OpenSearchStack,
    props?: StackProps
  ) {
    super(scope, id, props);

    // common VPC‐lambda role + psycopg2 layer
    const psycopgLambdaLayer = apiStack.getLayers()["psycopg2"];
    const lambdaRole = new iam.Role(this, `${id}-lambda-vpc-role`, {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Role for all Lambda functions inside VPC",
    });
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
        ],
        resources: ["*"],
      })
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "es:ESHttpGet",
          "es:ESHttpPut",
          "es:ESHttpPost",
          "es:ESHttpDelete",
        ],
        resources: [`${os.domain.domainArn}/*`],
      })
    );

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
    );
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );

    // RDS initializer (runs once on deploy)
    new triggers.TriggerFunction(this, `${id}-triggerLambda`, {
      functionName: `${id}-initializerFunction`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: "initializer.handler",
      timeout: Duration.seconds(300),
      memorySize: 512,
      environment: {
        DB_SECRET_NAME: db.secretPathAdminName,
        DB_USER_SECRET_NAME: db.secretPathUser.secretName,
        DB_PROXY: db.secretPathTableCreator.secretName,
      },
      vpc: db.dbInstance.vpc,
      code: lambda.Code.fromAsset("lambda/initializer"),
      layers: [psycopgLambdaLayer],
      role: lambdaRole,
      executeOnHandlerChange: true,
    });

    // OpenSearch initializer (runs once on deploy)
    // only grab the Python 3.11–compatible OpenSearch layer
    const osPythonLayer = apiStack.getLayers()["opensearchLayer"];

    const osInitializer = new triggers.TriggerFunction(
      this,
      `${id}-os-triggerLambda`,
      {
        functionName: `${id}-osInitializerFunction`,
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "initializer.handler",
        timeout: Duration.seconds(300),
        memorySize: 256,
        environment: {
          OPENSEARCH_ENDPOINT: os.domain.domainEndpoint,
          TOPIC_INDEX_NAME: "dfo-topic-full-index",
          MANDATE_INDEX_NAME: "dfo-mandate-full-index",
          HTML_INDEX_NAME: "dfo-html-full-index",
          VECTOR_DIMENSION: "1024",
          AWS_REGION: this.region,
          OS_DOMAIN: os.domain.domainEndpoint,
          OS_SECRET_NAME: os.adminSecret.secretName,
        },
        vpc: db.dbInstance.vpc,
        code: lambda.Code.fromAsset("lambda/opensearch-initializer"),
        role: lambdaRole,
        layers: [osPythonLayer], // only the 3.11 layer
        executeOnHandlerChange: true,
      }
    );

    // allow the initializer to read/write your domain
    os.domain.grantReadWrite(osInitializer);
  }
}
