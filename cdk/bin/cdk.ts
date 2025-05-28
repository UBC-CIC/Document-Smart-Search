#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Tags } from "aws-cdk-lib";
import { AmplifyStack }     from "../lib/amplify-stack";
import { ApiGatewayStack }  from "../lib/api-gateway-stack";
import { DatabaseStack }    from "../lib/database-stack";
import { VpcStack }         from "../lib/vpc-stack";
import { OpenSearchStack }  from "../lib/opensearch-stack";
import { DBFlowStack }      from "../lib/dbFlow-stack";
import { DataPipelineStack } from "../lib/data-pipeline-stack";
import { WafShieldStack }   from "../lib/waf-shield-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION,
};

const StackPrefix = app.node.tryGetContext("StackPrefix");

// 1) VPC
const vpcStack = new VpcStack(app, `${StackPrefix}-VpcStack`, { env });

// 2) RDS
const dbStack = new DatabaseStack(app, `${StackPrefix}-Database`, vpcStack, { env });

// 3) OpenSearch
const osStack = new OpenSearchStack(
  app,
  `${StackPrefix}-OpenSearch`,
  vpcStack,
  { env }
);

// 4) API Gateway
const apiStack = new ApiGatewayStack(app, `${StackPrefix}-Api`, dbStack, vpcStack, osStack, { env });

// 5) DBFlow (wires in the RDS _and_ the OpenSearch initializers)
const dbFlowStack = new DBFlowStack(
  app,
  `${StackPrefix}-DBFlow`,
  vpcStack,
  dbStack,
  apiStack,
  osStack,          
  { env }
);

// 6) Amplify
const amplifyStack = new AmplifyStack(app, `${StackPrefix}-Amplify`, apiStack, { env });

// 7) Data Pipeline
const dataPipelineStack = new DataPipelineStack(app, `${StackPrefix}-DataPipeline`, vpcStack, dbStack, osStack, { env });

// 8) WAF and Shield Protection
const wafShieldStack = new WafShieldStack(app, `${StackPrefix}-WafShield`, {
  env,
  apiGateway: apiStack.api,
});

// Add dependencies
wafShieldStack.addDependency(apiStack);

Tags.of(app).add("app", "DFO-Smart-Search");