import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as shield from 'aws-cdk-lib/aws-shield';

interface WafShieldStackProps extends cdk.StackProps {
  apiGateway: apigateway.RestApi;
  env?: { account: string; region: string };
}

export class WafShieldStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WafShieldStackProps) {
    super(scope, id, props);

    // Create WAF Web ACL for API Gateway
    const apiWafAcl = new wafv2.CfnWebACL(this, 'ApiWafAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'DfoApiWaf',
        sampledRequestsEnabled: true,
      },
      rules: [
        // Rate limiting rule - 100 requests per 5 minutes per IP
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
            },
          },
        },
        // AWS Managed Rules - Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        // AWS Managed Rules - SQL Injection Rule Set
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesSQLiRuleSet',
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
        },
        // AWS Managed Rules - Known Bad Inputs Rule Set
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
      ],
    });

    // Associate WAF Web ACL with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
      resourceArn: props.apiGateway.deploymentStage.stageArn,
      webAclArn: apiWafAcl.attrArn,
    });

    // Enable AWS Shield Advanced protection for API Gateway
    new shield.CfnProtection(this, 'ApiGatewayShieldProtection', {
      name: `${id}-ApiGateway-Shield`,
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${props.apiGateway.restApiId}/stages/${props.apiGateway.deploymentStage.stageName}`,
    });

    // Output the API WAF ACL ARN
    new cdk.CfnOutput(this, 'ApiWafAclArn', {
      value: apiWafAcl.attrArn,
      description: 'API Gateway WAF Web ACL ARN',
    });
  }
}