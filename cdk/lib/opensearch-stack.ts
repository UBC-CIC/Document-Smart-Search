import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2        from "aws-cdk-lib/aws-ec2";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as secrets    from "aws-cdk-lib/aws-secretsmanager";
import * as ssm        from "aws-cdk-lib/aws-ssm";
import { VpcStack }    from "./vpc-stack";

export class OpenSearchStack extends Stack {
  public readonly domain: opensearch.Domain;
  public readonly adminSecret: secrets.Secret;
  public readonly userSecret:  secrets.Secret;

  constructor(scope: Construct, id: string, vpcStack: VpcStack, props?: StackProps) {
    super(scope, id, props);

    // 1) Admin & User secrets
    this.adminSecret = new secrets.Secret(this, "OSAdminSecret", {
      secretName: `${id}-opensearch/admin/credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.userSecret = new secrets.Secret(this, "OSUserSecret", {
      secretName: `${id}-opensearch/user/credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dfouser" }),
        generateStringKey: "password",
        excludePunctuation: true,
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
    this.domain = new opensearch.Domain(this, `${id}-smartsearch`, {
      version: opensearch.EngineVersion.OPENSEARCH_2_19,
      vpc: vpcStack.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [osSg],
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: "t3.medium.search",
        multiAzWithStandbyEnabled:  false,
      },
      ebs: {
        volumeSize: 100,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      logging: {
        appLogEnabled: true,
        slowSearchLogEnabled:true,
        slowIndexLogEnabled: true,
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      enforceHttps: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 4) Persist endpoint & secret ARNs into SSM (namespaced by stack id)
    new ssm.StringParameter(this, "OSHostParam", {
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
  }
}
