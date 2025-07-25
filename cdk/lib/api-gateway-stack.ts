import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  Function,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";
import { OpenSearchStack } from "./opensearch-stack";
import { parse, stringify } from "yaml";
import { Fn } from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { createCognitoResources } from "./api-gateway-helpers/cognito";
import { createS3Buckets } from "./api-gateway-helpers/s3";
import { createLayers } from "./api-gateway-helpers/layers";
import { createRolesAndPolicies } from "./api-gateway-helpers/roles";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { table } from "console";
import * as logs from "aws-cdk-lib/aws-logs";

export class ApiGatewayStack extends cdk.Stack {
  private readonly api: apigateway.SpecRestApi;
  public readonly appClient: cognito.UserPoolClient;
  public readonly userPool: cognito.UserPool;
  public readonly identityPool: cognito.CfnIdentityPool;
  private readonly layerList: { [key: string]: LayerVersion };
  public readonly stageARN_APIGW: string;
  public readonly apiGW_basedURL: string;
  public readonly secret: secretsmanager.ISecret;
  public getEndpointUrl = () => this.api.url;
  public getUserPoolId = () => this.userPool.userPoolId;
  public getUserPoolClientId = () => this.appClient.userPoolClientId;
  public getIdentityPoolId = () => this.identityPool.ref;
  public addLayer = (name: string, layer: LayerVersion) =>
    (this.layerList[name] = layer);
  public getLayers = () => this.layerList;
  constructor(
    scope: Construct,
    id: string,
    db: DatabaseStack,
    vpcStack: VpcStack,
    osStack: OpenSearchStack,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const osEndpoint = ssm.StringParameter.valueForStringParameter(
      this,
      `/${osStack.stackName}/opensearch/host`
    );
    const osUserSecretArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${osStack.stackName}/opensearch/user/secretArn`
    );
    const osAdminSecretArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${osStack.stackName}/opensearch/admin/secretArn`
    );

    this.layerList = {};

    const { jwt, postgres, psycopgLayer, opensearchLayer } = createLayers(
      this,
      id
    );
    this.layerList["psycopg2"] = psycopgLayer;
    this.layerList["postgres"] = postgres;
    this.layerList["jwt"] = jwt;
    this.layerList["opensearchLayer"] = opensearchLayer;

    // powertoolsLayer does not follow the format of layerList
    const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      `${id}-PowertoolsLayer`,
      `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV2:78`
    );

    this.layerList["psycopg2"] = psycopgLayer;
    this.layerList["postgres"] = postgres;
    this.layerList["jwt"] = jwt;

    const { userPool, appClient, identityPool, secret } =
      createCognitoResources(this, id);

    this.userPool = userPool;
    this.appClient = appClient;
    this.identityPool = identityPool;
    this.secret = secret;

    // Create roles and policies
    const createPolicyStatement = (actions: string[], resources: string[]) => {
      return new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: actions,
        resources: resources,
      });
    };

    /**
     * Load OpenAPI file into API Gateway using REST API
     */
    // Read OpenAPI file and load file to S3
    const asset = new Asset(this, "SampleAsset", {
      path: "OpenAPI_Swagger_Definition.yaml",
    });

    const data = Fn.transform("AWS::Include", { Location: asset.s3ObjectUrl });

    // Create the API Gateway REST API
    this.api = new apigateway.SpecRestApi(this, `${id}-APIGateway`, {
      apiDefinition: apigateway.AssetApiDefinition.fromInline(data),
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      restApiName: `${id}-API`,
      deploy: true,
      cloudWatchRole: true,
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: true,
        stageName: "prod",
        methodOptions: {
          "/*/*": {
            throttlingRateLimit: 100,
            throttlingBurstLimit: 200,
          },
        },
      },
    });

    this.stageARN_APIGW = this.api.deploymentStage.stageArn;
    this.apiGW_basedURL = this.api.urlForPath();

    // Waf Firewall
    const waf = new wafv2.CfnWebACL(this, `${id}-waf`, {
      description: "waf for DFO",
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "DFO-firewall",
      },
      rules: [
        {
          name: "AWS-AWSManagedRulesCommonRuleSet",
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWS-AWSManagedRulesCommonRuleSet",
          },
        },
        {
          name: "LimitRequests1000",
          priority: 2,
          action: {
            block: {},
          },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "LimitRequests1000",
          },
        },
      ],
    });
    const wafAssociation = new wafv2.CfnWebACLAssociation(
      this,
      `${id}-waf-association`,
      {
        resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${this.api.restApiId}/stages/${this.api.deploymentStage.stageName}`,
        webAclArn: waf.attrArn,
      }
    );

    wafAssociation.node.addDependency(this.api.deploymentStage);

    const { adminRole, unauthenticatedRole } = createRolesAndPolicies(
      this,
      id,
      this.identityPool.ref,
      this.api.restApiId,
      this.region,
      this.account
    );
    const adminGroup = new cognito.CfnUserPoolGroup(this, `${id}-AdminGroup`, {
      groupName: "admin",
      userPoolId: this.userPool.userPoolId,
      roleArn: adminRole.roleArn,
    });

    const lambdaRole = new iam.Role(this, `${id}-postgresLambdaRole`, {
      roleName: `${id}-postgresLambdaRole`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Grant access to Secret Manager
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Inline policy to allow AdminAddUserToGroup action
    const adminAddUserToGroupPolicyLambda = new iam.Policy(
      this,
      `${id}-adminAddUserToGroupPolicyLambda`,
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "cognito-idp:AdminAddUserToGroup",
              "cognito-idp:AdminRemoveUserFromGroup",
              "cognito-idp:AdminGetUser",
              "cognito-idp:AdminListGroupsForUser",
            ],
            resources: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.userPool.userPoolId}`,
            ],
          }),
        ],
      }
    );

    // Attach the inline policy to the role
    lambdaRole.attachInlinePolicy(adminAddUserToGroupPolicyLambda);

    // Attach roles to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, `${id}-IdentityPoolRoles`, {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: adminRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    const lambdaUserFunction = new lambda.Function(this, `${id}-userFunction`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "userFunction.handler",
      timeout: Duration.seconds(900),
      vpc: vpcStack.vpc,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        USER_POOL: this.userPool.userPoolId,
      },
      functionName: `${id}-userFunction`,
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    });

    lambdaUserFunction.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaUserFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });

    const cfnLambda_user = lambdaUserFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnLambda_user.overrideLogicalId("userFunction");

    const lambdaAdminFunction = new lambda.Function(
      this,
      `${id}-adminFunction`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lambda/adminFunction"),
        handler: "adminFunction.handler",
        timeout: Duration.seconds(900),
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
        },
        functionName: `${id}-adminFunction`,
        memorySize: 512,
        layers: [postgres],
        role: lambdaRole,
      }
    );

    lambdaAdminFunction.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaAdminFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    const cfnLambda_Admin = lambdaAdminFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnLambda_Admin.overrideLogicalId("adminFunction");

    const coglambdaRole = new iam.Role(this, `${id}-cognitoLambdaRole`, {
      roleName: `${id}-cognitoLambdaRole`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const logRole = new iam.Role(this, `${id}-logRole`, {
      roleName: `${id}-logRole`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    logRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    logRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to Secret Manager
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Grant permission to add users to an IAM group
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:AddUserToGroup"],
        resources: [
          `arn:aws:iam::${this.account}:user/*`,
          `arn:aws:iam::${this.account}:group/*`,
        ],
      })
    );

    // Inline policy to allow AdminAddUserToGroup action
    const adminAddUserToGroupPolicy = new iam.Policy(
      this,
      `${id}-AdminAddUserToGroupPolicy`,
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "cognito-idp:AdminAddUserToGroup",
              "cognito-idp:AdminRemoveUserFromGroup",
              "cognito-idp:AdminGetUser",
              "cognito-idp:AdminListGroupsForUser",
            ],
            resources: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.userPool.userPoolId}`,
            ],
          }),
        ],
      }
    );

    // Attach the inline policy to the role
    coglambdaRole.attachInlinePolicy(adminAddUserToGroupPolicy);

    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // Secrets Manager
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    const AutoSignupLambda = new lambda.Function(
      this,
      `${id}-addAdminOnSignUp`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lambda/lib"),
        handler: "addAdminOnSignUp.handler",
        timeout: Duration.seconds(300),
        environment: {
          SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
        },
        vpc: vpcStack.vpc,
        functionName: `${id}-addAdminOnSignUp`,
        memorySize: 128,
        layers: [postgres],
        role: coglambdaRole,
      }
    );

    //cognito auto assign authenticated users to the admin group

    this.userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      AutoSignupLambda
    );

    new cdk.CfnOutput(this, `${id}-UserPoolIdOutput`, {
      value: this.userPool.userPoolId,
      description: "The ID of the Cognito User Pool",
    });

    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/*`],
      })
    );

    const preSignupLambda = new lambda.Function(this, "preSignupLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "preSignup.handler",
      timeout: Duration.seconds(300),
      environment: {
        ALLOWED_EMAIL_DOMAINS: "/DFO/AllowedEmailDomains",
      },
      vpc: vpcStack.vpc,
      functionName: `${id}-preSignupLambda`,
      memorySize: 128,
      role: coglambdaRole,
    });

    this.userPool.addTrigger(
      cognito.UserPoolOperation.PRE_SIGN_UP,
      preSignupLambda
    );

    // **
    //  *
    //  * Create Lambda for Admin Authorization endpoints
    //  */
    const authorizationFunction = new lambda.Function(
      this,
      `${id}-admin-authorization-api-gateway`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lambda/adminAuthorizerFunction"),
        handler: "adminAuthorizerFunction.handler",
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_COGNITO_CREDENTIALS: this.secret.secretName,
        },
        functionName: `${id}-adminLambdaAuthorizer`,
        memorySize: 512,
        layers: [jwt],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    authorizationFunction.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    // Change Logical ID to match the one decleared in YAML file of Open API
    const apiGW_authorizationFunction = authorizationFunction.node
      .defaultChild as lambda.CfnFunction;
    apiGW_authorizationFunction.overrideLogicalId("adminLambdaAuthorizer");

    const jwtSecret = new secretsmanager.Secret(this, `${id}-JwtSecret`, {
      secretName: `${id}-DFO-JWTSecret`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "jwtSecret",
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    const userAuthFunction = new lambda.Function(
      this,
      `${id}-user-authorization-api-gateway`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lambda/userAuthorizerFunction"),
        handler: "userAuthorizerFunction.handler",
        timeout: Duration.seconds(300),
        memorySize: 256,
        layers: [jwt],
        role: lambdaRole,
        environment: {
          JWT_SECRET: jwtSecret.secretArn,
        },
        functionName: `${id}-userLambdaAuthorizer`,
      }
    );

    jwtSecret.grantRead(userAuthFunction);

    const publicTokenLambda = new lambda.Function(
      this,
      `${id}-PublicTokenFunction`,
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "publicTokenFunction.handler",
        layers: [jwt],
        code: lambda.Code.fromAsset("lambda/publicTokenFunction"),
        environment: {
          JWT_SECRET: jwtSecret.secretArn,
        },
        timeout: Duration.seconds(30),
        memorySize: 128,
        role: lambdaRole,
      }
    );

    jwtSecret.grantRead(publicTokenLambda);

    // Add the permission to the Lambda function's policy to allow API Gateway access
    publicTokenLambda.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    // Change Logical ID to match the one decleared in YAML file of Open API
    const apiGW_publicTokenFunction = publicTokenLambda.node
      .defaultChild as lambda.CfnFunction;
    apiGW_publicTokenFunction.overrideLogicalId("PublicTokenFunction");

    // Add the permission to the Lambda function's policy to allow API Gateway access
    userAuthFunction.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    // Change Logical ID to match the one decleared in YAML file of Open API
    const apiGW_userauthorizationFunction = userAuthFunction.node
      .defaultChild as lambda.CfnFunction;
    apiGW_userauthorizationFunction.overrideLogicalId("userLambdaAuthorizer");

    // Create parameters for Bedrock LLM ID, Embedding Model ID, and Table Name in Parameter Store
    const bedrockLLMParameter = new ssm.StringParameter(
      this,
      "BedrockLLMParameter",
      {
        parameterName: `/${id}/DFO/BedrockLLMId`,
        description: "Parameter containing the Bedrock LLM ID",
        stringValue: "meta.llama3-3-70b-instruct-v1:0",
      }
    );

    const embeddingModelParameter = new ssm.StringParameter(
      this,
      "EmbeddingModelParameter",
      {
        parameterName: `/${id}/DFO/EmbeddingModelId`,
        description: "Parameter containing the Embedding Model ID",
        stringValue: "amazon.titan-embed-text-v2:0",
      }
    );

    const tableNameParameter = new ssm.StringParameter(
      this,
      "TableNameParameter",
      {
        parameterName: `/${id}/DFO/TableName`,
        description: "Parameter containing the DynamoDB table name",
        stringValue: "DynamoDB-Conversation-Table",
      }
    );

    const opensearchHostParameter = new ssm.StringParameter(
      this,
      "OpensearchHostParameter",
      {
        parameterName: `/${id}/DFO/OpensearchHost`,
        description: "Opensearch host",
        stringValue: osStack.domain.domainEndpoint,
      }
    );

    const opensearchSecretParamName = new ssm.StringParameter(
      this,
      "OpensearchSecretParamName",
      {
        parameterName: `/${id}/DFO/OpensearchSecretParamName`,
        description: "Opensearch secret parameter name",
        stringValue: osStack.adminSecret.secretArn,
      }
    );

    const SummaryLLMParameter = new ssm.StringParameter(
      this,
      "SummaryModelParamName",
      {
        parameterName: `/${id}/DFO/SummaryModelParamName`,
        description: "Summary LLM model parameter name",
        stringValue: "meta.llama3-70b-instruct-v1:0",
      }
    );

    const indexNameParameter = new ssm.StringParameter(
      this,
      "IndexNameParameter",
      {
        parameterName: `/${id}/DFO/IndexName`,
        description: "Opensearch index name",
        stringValue: "dfo-html-full-index",
      }
    );

    const dfoMandateFullIndexNameParameter = new ssm.StringParameter(
      this,
      "DfoMandateFullIndexNameParameter",
      {
        parameterName: `/${id}/DFO/DfoMandateFullIndexName`,
        description: "DFO Mandate full index name",
        stringValue: "dfo-mandate-full-index",
      }
    );

    const dfoHtmlFullIndexNameParameter = new ssm.StringParameter(
      this,
      "DfoHtmlFullIndexNameParameter",
      {
        parameterName: `/${id}/DFO/DfoHtmlFullIndexName`,
        description: "DFO HTML full index name",
        stringValue: "dfo-html-full-index",
      }
    );

    const bedrockInferenceProfileParameter = new ssm.StringParameter(
      this,
      "BedrockInferenceProfileParameter",
      {
        parameterName: `/${id}/DFO/BedrockInferenceProfile`,
        description: "Bedrock inference profile for text generation",
        stringValue: "us.meta.llama3-3-70b-instruct-v1:0",
      }
    );

    const dfoTopicFullIndexNameParameter = new ssm.StringParameter(
      this,
      "DfoTopicFullIndexNameParameter",
      {
        parameterName: `/${id}/DFO/DfoTopicFullIndexName`,
        description: "DFO Topic full index name",
        stringValue: "dfo-topic-full-index",
      }
    );

    /**
     * Create Lambda with container image for text generation workflow in RAG pipeline
     */
    const textGenFunc = new lambda.DockerImageFunction(
      this,
      `${id}-TextGenFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/text_generation",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc, // Pass the VPC
        functionName: `${id}-TextGenFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: opensearchSecretParamName.parameterName,
          OPENSEARCH_INDEX_NAME: indexNameParameter.parameterName,
          RDS_SEC: db.secretPathAdminName,
          DFO_HTML_FULL_INDEX_NAME: dfoHtmlFullIndexNameParameter.parameterName,
          DFO_MANDATE_FULL_INDEX_NAME:
            dfoMandateFullIndexNameParameter.parameterName,
          BEDROCK_INFERENCE_PROFILE:
            bedrockInferenceProfileParameter.parameterName,
          INDEX_NAME: indexNameParameter.parameterName,
          DFO_TOPIC_FULL_INDEX_NAME:
            dfoTopicFullIndexNameParameter.parameterName,
        },
      }
    );

    bedrockLLMParameter.grantRead(textGenFunc);
    embeddingModelParameter.grantRead(textGenFunc);
    tableNameParameter.grantRead(textGenFunc);
    opensearchHostParameter.grantRead(textGenFunc);
    indexNameParameter.grantRead(textGenFunc);
    dfoHtmlFullIndexNameParameter.grantRead(textGenFunc);
    dfoMandateFullIndexNameParameter.grantRead(textGenFunc);
    bedrockInferenceProfileParameter.grantRead(textGenFunc);
    dfoTopicFullIndexNameParameter.grantRead(textGenFunc);

    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnTextGenDockerFunc = textGenFunc.node
      .defaultChild as lambda.CfnFunction;
    cfnTextGenDockerFunc.overrideLogicalId("TextGenLambdaDockerFunction");

    // Add the permission to the Lambda function's policy to allow API Gateway access
    textGenFunc.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });

    // Custom policy statement for Bedrock access
    const bedrockPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["bedrock:InvokeModel", "bedrock:InvokeEndpoint"],
      resources: [
        "arn:aws:bedrock:" +
          this.region +
          "::foundation-model/meta.llama3-3-70b-instruct-v1:0",
        "arn:aws:bedrock:" +
          this.region +
          "::foundation-model/amazon.titan-embed-text-v2:0",
      ],
    });

    const bedrockGuardrailPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:ApplyGuardrail",
        "bedrock:InvokeModel",
        "bedrock:InvokeEndpoint",
        "bedrock:ListGuardrails",
        "bedrock:CreateGuardrail",
        "bedrock:CreateGuardrailVersion",
        "bedrock:DescribeGuardrail",
        "bedrock:GetGuardrail",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: ["*"],
    });

    const openSearchPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["es:ESHttpGet", "es:ESHttpPut"],
      resources: [
        `arn:aws:es:${this.region}:${this.account}:domain/${osStack.domain.domainName}/*`,
      ],
    });

    // Attach the custom Bedrock policy to Lambda function
    textGenFunc.addToRolePolicy(bedrockPolicyStatement);

    textGenFunc.addToRolePolicy(openSearchPolicyStatement);

    textGenFunc.addToRolePolicy(bedrockGuardrailPolicyStatement);

    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          bedrockLLMParameter.parameterArn,
          embeddingModelParameter.parameterArn,
          tableNameParameter.parameterArn,
          opensearchHostParameter.parameterArn,
          opensearchSecretParamName.parameterArn,
          indexNameParameter.parameterArn,
          dfoHtmlFullIndexNameParameter.parameterArn,
          dfoMandateFullIndexNameParameter.parameterArn,
          bedrockInferenceProfileParameter.parameterArn,
          dfoTopicFullIndexNameParameter.parameterArn,
        ],
      })
    );

    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/meta.llama3-3-70b-instruct-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/meta.llama3-70b-instruct-v1:0`,
        ],
      })
    );

    // Restrict Secrets Manager access
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${db.secretPathTableCreator.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    // DynamoDB table-specific permissions
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/DynamoDB-Conversation-Table`,
        ],
      })
    );

    // DynamoDB ListTables requires wildcard resource
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:ListTables"],
        resources: ["*"],
      })
    );

    /**
     *
     * Create Lambda with container image for text generation workflow in RAG pipeline
     */
    const docDetailViewFunction = new lambda.DockerImageFunction(
      this,
      `${id}-DocDetailViewFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/docDetailViewFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-DocDetailViewFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: opensearchSecretParamName.parameterName,
          OPENSEARCH_INDEX_NAME: indexNameParameter.parameterName,
          RDS_SEC: db.secretPathAdminName,
          DFO_HTML_FULL_INDEX_NAME: dfoHtmlFullIndexNameParameter.parameterName,
          DFO_MANDATE_FULL_INDEX_NAME:
            dfoMandateFullIndexNameParameter.parameterName,
          BEDROCK_INFERENCE_PROFILE:
            bedrockInferenceProfileParameter.parameterName,
          INDEX_NAME: indexNameParameter.parameterName,
          DFO_TOPIC_FULL_INDEX_NAME:
            dfoTopicFullIndexNameParameter.parameterName,
        },
      }
    );

    bedrockLLMParameter.grantRead(docDetailViewFunction);
    embeddingModelParameter.grantRead(docDetailViewFunction);
    tableNameParameter.grantRead(docDetailViewFunction);
    opensearchHostParameter.grantRead(docDetailViewFunction);
    opensearchSecretParamName.grantRead(docDetailViewFunction);
    indexNameParameter.grantRead(docDetailViewFunction);
    dfoHtmlFullIndexNameParameter.grantRead(docDetailViewFunction);
    dfoMandateFullIndexNameParameter.grantRead(docDetailViewFunction);
    bedrockInferenceProfileParameter.grantRead(docDetailViewFunction);
    dfoTopicFullIndexNameParameter.grantRead(docDetailViewFunction);

    const cfnDocDetailViewFunc = docDetailViewFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnDocDetailViewFunc.overrideLogicalId("DocDetailDockerFunction");
    docDetailViewFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    docDetailViewFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    docDetailViewFunction.role?.addToPrincipalPolicy(openSearchPolicyStatement);
    docDetailViewFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    const hybridSearchFunction = new lambda.DockerImageFunction(
      this,
      `${id}-HybridSearchFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/hybridSearchFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-HybridSearchFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: osStack.adminSecret.secretArn,
          OPENSEARCH_INDEX_NAME: indexNameParameter.parameterName,
        },
      }
    );

    bedrockLLMParameter.grantRead(hybridSearchFunction);
    embeddingModelParameter.grantRead(hybridSearchFunction);
    tableNameParameter.grantRead(hybridSearchFunction);
    opensearchHostParameter.grantRead(hybridSearchFunction);
    opensearchSecretParamName.grantRead(hybridSearchFunction);
    indexNameParameter.grantRead(hybridSearchFunction);

    const cfnHybridSearchFunc = hybridSearchFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnHybridSearchFunc.overrideLogicalId("HybridSearchLambdaDockerFunction");
    hybridSearchFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    hybridSearchFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    hybridSearchFunction.role?.addToPrincipalPolicy(openSearchPolicyStatement);
    hybridSearchFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    const similaritySearchFunction = new lambda.DockerImageFunction(
      this,
      `${id}-SimilaritySearchFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/similaritySearchFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-SimilaritySearchFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: opensearchSecretParamName.parameterName,
          INDEX_NAME: indexNameParameter.parameterName,
        },
      }
    );

    bedrockLLMParameter.grantRead(similaritySearchFunction);
    embeddingModelParameter.grantRead(similaritySearchFunction);
    tableNameParameter.grantRead(similaritySearchFunction);
    opensearchHostParameter.grantRead(similaritySearchFunction);
    opensearchSecretParamName.grantRead(similaritySearchFunction);
    indexNameParameter.grantRead(similaritySearchFunction);

    const cfnSimilaritySearchFunc = similaritySearchFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnSimilaritySearchFunc.overrideLogicalId("SimilaritySearchDockerFunction");
    similaritySearchFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    similaritySearchFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    similaritySearchFunction.role?.addToPrincipalPolicy(
      openSearchPolicyStatement
    );
    similaritySearchFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    const chartAnalyticsFunction = new lambda.DockerImageFunction(
      this,
      `${id}-ChartAnalyticsFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/chartAnalyticsFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-ChartAnalyticsFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          RDS_SEC: db.secretPathAdminName,
        },
      }
    );
    const cfnChartAnalytics = chartAnalyticsFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnChartAnalytics.overrideLogicalId("ChartAnalyticsDockerFunction");
    chartAnalyticsFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    chartAnalyticsFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    chartAnalyticsFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
        ],
      })
    );

    const topicsFunction = new lambda.DockerImageFunction(
      this,
      `${id}-TopicsFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/relatedDocumentsFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-TopicsFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
        },
      }
    );
    const cfnTopicsFunction = topicsFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnTopicsFunction.overrideLogicalId("GetTopicsFunction");
    topicsFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    topicsFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    topicsFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
        ],
      })
    );

    const userFiltersFunction = new lambda.DockerImageFunction(
      this,
      `${id}-UserFiltersFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/userFiltersFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-UserFiltersFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: opensearchSecretParamName.parameterName,
          RDS_SEC: db.secretPathAdminName,
        },
      }
    );

    bedrockLLMParameter.grantRead(userFiltersFunction);
    embeddingModelParameter.grantRead(userFiltersFunction);
    tableNameParameter.grantRead(userFiltersFunction);
    opensearchHostParameter.grantRead(userFiltersFunction);
    opensearchSecretParamName.grantRead(userFiltersFunction);

    const cfnUserFiltersFunc = userFiltersFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnUserFiltersFunc.overrideLogicalId("userFiltersDockerFunction");
    userFiltersFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    userFiltersFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    userFiltersFunction.role?.addToPrincipalPolicy(openSearchPolicyStatement);
    userFiltersFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    const llmAnalysisFunction = new lambda.DockerImageFunction(
      this,
      `${id}-LlmAnalysisFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset(
          "./lambda/llmAnalysisFunction",
          {
            platform: Platform.LINUX_AMD64,
          }
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-LlmAnalysisFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          SUMMARY_LLM_MODEL_ID: SummaryLLMParameter.parameterName,
          EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
          TABLE_NAME_PARAM: tableNameParameter.parameterName,
          INDEX_NAME: indexNameParameter.parameterName,
          OPENSEARCH_HOST: opensearchHostParameter.parameterName,
          OPENSEARCH_SEC: opensearchSecretParamName.parameterName,
        },
      }
    );

    bedrockLLMParameter.grantRead(llmAnalysisFunction);
    embeddingModelParameter.grantRead(llmAnalysisFunction);
    tableNameParameter.grantRead(llmAnalysisFunction);
    opensearchHostParameter.grantRead(llmAnalysisFunction);
    opensearchSecretParamName.grantRead(llmAnalysisFunction);
    indexNameParameter.grantRead(llmAnalysisFunction);
    SummaryLLMParameter.grantRead(llmAnalysisFunction);

    const cfnLlmAnalysisFunc = llmAnalysisFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnLlmAnalysisFunc.overrideLogicalId("ExpertAnalysisDockerFunction");
    llmAnalysisFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    llmAnalysisFunction.role?.addToPrincipalPolicy(bedrockPolicyStatement);
    llmAnalysisFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/meta.llama3-70b-instruct-v1:0`,
        ],
      })
    );
    llmAnalysisFunction.role?.addToPrincipalPolicy(openSearchPolicyStatement);
    llmAnalysisFunction.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${db.secretPathAdminName}*`,
          `${db.secretPathUser.secretArn}*`,
          `${osStack.adminSecret.secretArn}*`,
        ],
      })
    );

    /**
     * Create Lambda function to get messages for a session
     */
    const getMessagesFunction = new lambda.Function(
      this,
      `${id}-GetMessagesFunction`,
      {
        runtime: lambda.Runtime.PYTHON_3_9,
        code: lambda.Code.fromAsset("lambda/getMessages"), // Update the path to match your folder structure
        handler: "getMessagesFunction.lambda_handler",
        timeout: Duration.seconds(300),
        memorySize: 128,
        vpc: vpcStack.vpc, // Ensure it's in the correct VPC if needed
        environment: {
          TABLE_NAME: "DynamoDB-Conversation-Table", // Use the correct DynamoDB table name
          REGION: this.region,
        },
        functionName: `${id}-GetMessagesFunction`,
        logRetention: logs.RetentionDays.THREE_MONTHS,
        layers: [psycopgLayer, powertoolsLayer], // Add layers if needed
        role: coglambdaRole, // Ensure the role has the necessary permissions for DynamoDB
      }
    );

    // Add the necessary permissions to the coglambdaRole
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:ListTables", // Allow listing of all DynamoDB tables
          "dynamodb:Query", // Allow querying on specific table
        ],
        resources: ["*"], // Set to "*" as ListTables does not support table-specific ARNs
      })
    );

    // Attach an additional policy that allows querying on the specific DynamoDB table
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/DynamoDB-Conversation-Table`,
        ],
      })
    );

    // Override the Logical ID if needed
    const cfnGetMessagesFunction = getMessagesFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnGetMessagesFunction.overrideLogicalId("GetMessagesFunction");

    getMessagesFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/DynamoDB-Conversation-Table`,
        ],
      })
    );

    const getMessagesIntegration = new apigateway.LambdaIntegration(
      getMessagesFunction,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    const getMessagesResource = this.api.root.addResource(
      "conversation_messages"
    );
    getMessagesResource.addMethod("GET", getMessagesIntegration, {
      requestParameters: {
        "method.request.querystring.session_id": true,
      },
      authorizationType: apigateway.AuthorizationType.IAM, // Adjust if you use a different auth mechanism
    });

    getMessagesFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/conversation_messages`,
    });

    getMessagesFunction.addPermission("AllowApiGatewayInvokeUser", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/get_messages`,
    });
  }
}
