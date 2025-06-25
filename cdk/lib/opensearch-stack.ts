import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import { VpcStack } from "./vpc-stack";

export class OpenSearchStack extends Stack {
  public readonly domain: opensearch.Domain;
  public readonly adminSecret: secrets.Secret;
  public readonly userSecret: secrets.Secret;
  public readonly osHostParam: ssm.StringParameter;

  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    props?: StackProps
  ) {
    super(scope, id, props);

    // 1) Admin & User secrets
    this.adminSecret = new secrets.Secret(this, "OSAdminSecret", {
      secretName: `${id}-opensearch/admin/credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        // excludePunctuation: true,
        passwordLength: 16,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.userSecret = new secrets.Secret(this, "OSUserSecret", {
      secretName: `${id}-opensearch/user/credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dfouser" }),
        generateStringKey: "password",
        // excludePunctuation: true,
        passwordLength: 16,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 2) Security Group for OpenSearch
    const osSg = new ec2.SecurityGroup(this, "OpenSearchSG", {
      vpc: vpcStack.vpc,
      description: "Allow HTTPS from VPC",
      allowAllOutbound: true,
    });
    osSg.addIngressRule(
      ec2.Peer.ipv4(vpcStack.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      "OpenSearch HTTPS"
    );

    // 3) The OpenSearch Domain
    this.domain = new opensearch.Domain(this, "OpenSearchDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc: vpcStack.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [osSg],
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: "t3.medium.search",
        multiAzWithStandbyEnabled: false,
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
      encryptionAtRest: { enabled: true },
      enforceHttps: true,
      removalPolicy: RemovalPolicy.DESTROY,
      // uncomment to enable fine-grained access control with username/password
      fineGrainedAccessControl: {
        masterUserName: "admin", // this.adminSecret.secretValueFromJson("username").toString(),
        masterUserPassword: this.adminSecret.secretValueFromJson("password"),
      },
    });

    // ✅ Add access policy AFTER domain creation
    this.domain.addAccessPolicies(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ["es:*"],
        resources: [`${this.domain.domainArn}/*`],
      })
    );

    // 4) Persist endpoint & secret ARNs into SSM (namespaced by stack id)
    this.osHostParam = new ssm.StringParameter(this, "OSHostParam", {
      parameterName: `/${id}/opensearch/host`,
      stringValue: this.domain.domainEndpoint,
    });

    new ssm.StringParameter(this, "OSAdminSecretArnParam", {
      parameterName: `/${id}/opensearch/admin/secretArn`,
      stringValue: this.adminSecret.secretArn,
    });

    new ssm.StringParameter(this, "OSUserSecretArnParam", {
      parameterName: `/${id}/opensearch/user/secretArn`,
      stringValue: this.userSecret.secretArn,
    });

    // // temporary workaround to still retain the cloudformation output
    // const temp_output = new CfnOutput(this, "will-be-removed-soon", {
    //   value: `arn:aws:secretsmanager:${this.region}:${this.account}:secret:DFO-OpenSearch-opensearch/user/credentials-BDQmoA`,
    //   exportName: `DFO-OpenSearch:ExportsOutputRefOSUserSecretE72D1A391AA26852`
    // });
    // temp_output.overrideLogicalId("ExportsOutputRefOSUserSecretE72D1A391AA26852");
  }
}
