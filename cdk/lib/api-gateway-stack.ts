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
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

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
  public getLayers = () => this.layerList;  constructor(
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


    this.layerList = {};

    const { jwt, postgres, psycopgLayer, opensearchLayer } = createLayers(this, id);
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

    // Create parameters for Bedrock LLM ID, Embedding Model ID, and Table Name in Parameter Store
    const bedrockLLMParameter = new ssm.StringParameter(
      this,
      "BedrockLLMParameter",
      {
        parameterName: `/${id}/DFO/BedrockLLMId`,
        description: "Parameter containing the Bedrock LLM ID",
        stringValue: "meta.llama3-70b-instruct-v1:0",
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

    /**
     * Create Lambda with container image for text generation workflow in RAG pipeline
     */
    const textGenFunc = new lambda.DockerImageFunction(
      this,
      `${id}-TextGenFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset("./lambda/text_generation", {
          platform: Platform.LINUX_AMD64
        }),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc, // Pass the VPC
        functionName: `${id}-TextGenFunction`,
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
          "::foundation-model/meta.llama3-70b-instruct-v1:0",
        "arn:aws:bedrock:" +
          this.region +
          "::foundation-model/amazon.titan-embed-text-v2:0",
      ],
    });

    // Attach the custom Bedrock policy to Lambda function
    textGenFunc.addToRolePolicy(bedrockPolicyStatement);
    
    // TODO: Restrict this later!
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:*"],
        resources: ["arn:aws:ssm:*:*:parameter/*"],
      })
    );
    
    // TODO: Restrict this later!
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:*"],
        resources: ["*"],
      })
    );
    
    // Grant access to Secret Manager
    textGenFunc.addToRolePolicy(
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

    // Grant access to DynamoDB actions
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:ListTables",
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*`],
      })
    );
    // Grant access to SSM Parameter Store for specific parameters
    textGenFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          bedrockLLMParameter.parameterArn,
          embeddingModelParameter.parameterArn,
          tableNameParameter.parameterArn,
        ],
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
            code: lambda.DockerImageCode.fromImageAsset("./lambda/docDetailViewFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-DocDetailViewFunction`,
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
        const cfnDocDetailViewFunc = docDetailViewFunction.node.defaultChild as lambda.CfnFunction;
        cfnDocDetailViewFunc.overrideLogicalId("DocDetailDockerFunction");
        docDetailViewFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        docDetailViewFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

        const hybridSearchFunction = new lambda.DockerImageFunction(
          this,
          `${id}-HybridSearchFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/hybridSearchFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-HybridSearchFunction`,
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
        const cfnHybridSearchFunc = hybridSearchFunction.node.defaultChild as lambda.CfnFunction;
        cfnHybridSearchFunc.overrideLogicalId("HybridSearchLambdaDockerFunction");
        hybridSearchFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        hybridSearchFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

        
        const openSearchQueryFunction = new lambda.DockerImageFunction(
          this,
          `${id}-OpenSearchQueryFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/openSearchQueryFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-OpenSearchQueryFunction`,
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
        const cfnOpenSearchQueryFunc = openSearchQueryFunction.node.defaultChild as lambda.CfnFunction;
        cfnOpenSearchQueryFunc.overrideLogicalId("OpenSearchLambdaDockerFunction");
        openSearchQueryFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        openSearchQueryFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

        const similaritySearchFunction = new lambda.DockerImageFunction(
          this,
          `${id}-SimilaritySearchFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/similaritySearchFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-SimilaritySearchFunction`,
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
        const cfnSimilaritySearchFunc = similaritySearchFunction.node.defaultChild as lambda.CfnFunction;
        cfnSimilaritySearchFunc.overrideLogicalId("SimilaritySearchDockerFunction");
        similaritySearchFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        similaritySearchFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

        const chartAnalyticsFunction = new lambda.DockerImageFunction(
          this,
          `${id}-ChartAnalyticsFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/chartAnalyticsFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-ChartAnalyticsFunction`,
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
        const cfnChartAnalytics = chartAnalyticsFunction.node.defaultChild as lambda.CfnFunction;
        cfnChartAnalytics.overrideLogicalId("ChartAnalyticsDockerFunction");
        chartAnalyticsFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        chartAnalyticsFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

          const topicsFunction = new lambda.DockerImageFunction(
          this,
          `${id}-TopicsFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/relatedDocumentsFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-TopicsFunction`,
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
        const cfnTopicsFunction = topicsFunction.node.defaultChild as lambda.CfnFunction;
        cfnTopicsFunction.overrideLogicalId("GetTopicsFunction");
        topicsFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        topicsFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));

        const userFiltersFunction = new lambda.DockerImageFunction(
          this,
          `${id}-UserFiltersFunction`,
          {
            code: lambda.DockerImageCode.fromImageAsset("./lambda/userFiltersFunction", {
              platform: Platform.LINUX_AMD64
            }),
            memorySize: 512,
            timeout: cdk.Duration.seconds(300),
            vpc: vpcStack.vpc,
            functionName: `${id}-UserFiltersFunction`,
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
        const cfnUserFiltersFunc = userFiltersFunction.node.defaultChild as lambda.CfnFunction;
        cfnUserFiltersFunc.overrideLogicalId("userFiltersDockerFunction");
        userFiltersFunction.addPermission("AllowApiGatewayInvoke", {
          principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          action: "lambda:InvokeFunction",
          sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
        });
        userFiltersFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "secretsmanager:GetSecretValue",
            "ssm:GetParameter",
            "es:ESHttpGet",
            "es:ESHttpPost",
            "es:ESHttpPut",
            "es:ESHttpDelete"
          ],
          resources: ["*"],
        }));
    
    const llmAnalysisFunction = new lambda.DockerImageFunction(
      this,
      `${id}-LlmAnalysisFunction`,
      {
        code: lambda.DockerImageCode.fromImageAsset("./lambda/llmAnalysisFunction", {
          platform: Platform.LINUX_AMD64
        }),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: `${id}-LlmAnalysisFunction`,
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
    const cfnLlmAnalysisFunc = llmAnalysisFunction.node.defaultChild as lambda.CfnFunction;
    cfnLlmAnalysisFunc.overrideLogicalId("ExpertAnalysisDockerFunction");
    llmAnalysisFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });
    llmAnalysisFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "secretsmanager:GetSecretValue",
        "ssm:GetParameter",
        "es:ESHttpGet",
        "es:ESHttpPost",
        "es:ESHttpPut",
        "es:ESHttpDelete"
      ],
      resources: ["*"],
    }));

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
    
    
    // // 1) create the new Lambda
    // const searchFunction = new lambda.Function(this, `${id}-searchFunction`, {
    //   runtime: lambda.Runtime.PYTHON_3_11,
    //   code:    lambda.Code.fromAsset("lambda/searchFunction"),
    //   handler: "index.handler",
    //   timeout: Duration.seconds(10),
    //   memorySize: 128,
    //   vpc: vpcStack.vpc,
    //   layers: [ this.layerList["opensearchLayer"] ],
    //   environment: {
    //     OPENSEARCH_ENDPOINT: osEndpoint,
    //     OS_USER_SECRET_ARN: osUserSecretArn,
    //     REGION: this.region,
    //   },
    //   role: lambdaRole,
    // });

    // // 2) grant it permissions
    // osStack.domain.grantRead(searchFunction);
    // searchFunction.addToRolePolicy(new iam.PolicyStatement({
    //   actions: ["secretsmanager:GetSecretValue"],
    //   resources: [ osUserSecretArn ]
    // }));

    // // 3) hook it into API Gateway
    // const searchIntegration = new apigateway.LambdaIntegration(searchFunction, { proxy: true });
    // const searchResource    = this.api.root.addResource("search");
    // searchResource.addMethod("GET", searchIntegration, {
    //   authorizationType: apigateway.AuthorizationType.NONE,
    //   requestParameters: {
    //     "method.request.querystring.q": false
    //   }
    // });


  }
}