import { Stack, StackProps, RemovalPolicy, SecretValue, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";

import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

import { VpcStack } from "./vpc-stack";

export class DatabaseStack extends Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly secretPathAdminName: string;
  public readonly rdsProxyEndpointAdmin: string;
  public readonly secretPathUser: secretsmanager.Secret;
  public readonly secretPathTableCreator: secretsmanager.Secret;
  public readonly rdsProxyEndpoint: string;
  public readonly rdsProxyEndpointTableCreator: string;
  public readonly databaseID: string;

  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    props?: StackProps
  ) {
    super(scope, id, props);

    this.databaseID = id;
    /**
     *
     * Retrive a secrete from Secret Manager
     * aws secretsmanager create-secret --name DFOSecrets --secret-string '{\"DB_Username\":\"DB-USERNAME\"}' --profile <your-profile-name>
     */
    const secret = secretmanager.Secret.fromSecretNameV2(
      this,
      "ImportedSecrets",
      "DFOSecrets"
    );
    /**
     *
     * Create Empty Secret Manager
     * Secrets will be populate at initalization of data
     */
    this.secretPathAdminName = `${id}-DFO/credentials/DbCredential`; // Name in the Secret Manager to store DB credentials
    const secretPathUserName = `${id}-DFO/userCredentials/DbCredential`;
    // this is the secret for the user, which is used to read/write to the database, but not to create tables
    this.secretPathUser = new secretsmanager.Secret(this, secretPathUserName, {
      secretName: secretPathUserName,
      description: "Secrets for clients to connect to RDS",
      removalPolicy: RemovalPolicy.DESTROY,
      secretObjectValue: {
        username: SecretValue.unsafePlainText("applicationUsername"), // this will change later at runtime
        password: SecretValue.unsafePlainText("applicationPassword"), // in the initializer
      },
    });

    // this is the secret for the table creator, which is used to create the tables in the database
    const secretPathTableCreator = `${id}-DFO/userCredentials/rdsTableCreator`;
    this.secretPathTableCreator = new secretsmanager.Secret(
      this,
      secretPathTableCreator,
      {
        secretName: secretPathTableCreator,
        description: "Secrets for TableCreator to connect to RDS",
        removalPolicy: RemovalPolicy.DESTROY,
        secretObjectValue: {
          username: SecretValue.unsafePlainText("applicationUsername"), // this will change later at runtime
          password: SecretValue.unsafePlainText("applicationPassword"), // in the initializer
        },
      }
    );
    const parameterGroup = new rds.ParameterGroup(this, `rdsParameterGroup`, {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      description: "Empty parameter group", // Might need to change this later
      parameters: {
        "rds.force_ssl": "0",
      },
    });

    /**
     *
     * Create an RDS with Postgres database in an isolated subnet
     */
    this.dbInstance = new rds.DatabaseInstance(this, `database`, {
      vpc: vpcStack.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MEDIUM
      ),
      credentials: rds.Credentials.fromUsername(
        secret.secretValueFromJson("DB_Username").unsafeUnwrap(),
        {
          secretName: this.secretPathAdminName,
        }
      ),
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 115,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: true,
      deletionProtection: true,
      databaseName: "DFO",
      publiclyAccessible: false,
      cloudwatchLogsRetention: logs.RetentionDays.INFINITE,
      cloudwatchLogsExports: ["postgresql", "upgrade"],
      storageEncrypted: true,
      monitoringInterval: Duration.seconds(60),
      parameterGroup: parameterGroup,
    });

    this.dbInstance.connections.securityGroups.forEach(function (
      securityGroup
    ) {
      // 10.0.0.0/16 match the cidr range in vpc stack
      securityGroup.addIngressRule(
        ec2.Peer.ipv4("10.0.0.0/16"),
        ec2.Port.tcp(5432),
        "Postgres Ingress"
      );
    });

    const rdsProxyRole = new iam.Role(this, `DBProxyRoleRDS`, {
      assumedBy: new iam.ServicePrincipal("rds.amazonaws.com"),
    });

    rdsProxyRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["rds-db:connect"],
      })
    );

    // /**
    //  *
    //  * Create an RDS proxy that sit between lambda and RDS
    //  */
    const rdsProxy = this.dbInstance.addProxy(id + "-proxy", {
      secrets: [this.secretPathUser!],
      vpc: vpcStack.vpc,
      role: rdsProxyRole,
      securityGroups: this.dbInstance.connections.securityGroups,
      requireTLS: false,
    });
    const rdsProxyTableCreator = this.dbInstance.addProxy(id + "+proxy", {
      secrets: [this.secretPathTableCreator!],
      vpc: vpcStack.vpc,
      role: rdsProxyRole,
      securityGroups: this.dbInstance.connections.securityGroups,
      requireTLS: false,
    });

    const secretPathAdmin = secretmanager.Secret.fromSecretNameV2(
      this,
      "AdminSecret",
      this.secretPathAdminName
    );

    const rdsProxyAdmin = this.dbInstance.addProxy(id + "-proxy-admin", {
      secrets: [secretPathAdmin],
      vpc: vpcStack.vpc,
      role: rdsProxyRole,
      securityGroups: this.dbInstance.connections.securityGroups,
      requireTLS: false,
    });

    // Workaround for bug where TargetGroupName is not set but required
    let targetGroup = rdsProxy.node.children.find((child: any) => {
      return child instanceof rds.CfnDBProxyTargetGroup;
    }) as rds.CfnDBProxyTargetGroup;

    targetGroup.addPropertyOverride("TargetGroupName", "default");

    let targetGroupTableCreator = rdsProxyTableCreator.node.children.find(
      (child: any) => {
        return child instanceof rds.CfnDBProxyTargetGroup;
      }
    ) as rds.CfnDBProxyTargetGroup;

    targetGroup.addPropertyOverride("TargetGroupName", "default");
    targetGroupTableCreator.addPropertyOverride("TargetGroupName", "default");

    this.dbInstance.grantConnect(rdsProxyRole);
    this.rdsProxyEndpoint = rdsProxy.endpoint;
    this.rdsProxyEndpointTableCreator = rdsProxyTableCreator.endpoint;

    targetGroup.addPropertyOverride("TargetGroupName", "default");

    this.rdsProxyEndpointAdmin = rdsProxyAdmin.endpoint;
  }
}
