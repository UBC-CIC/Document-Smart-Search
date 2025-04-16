import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export const createCognitoResources = (scope: Construct, id: string) => {
    const userPoolName = `${id}-UserPool`;
    const userPool = new cognito.UserPool(scope, `${id}-pool`, {
        userPoolName: userPoolName,
        signInAliases: {
            email: true,
        },
        selfSignUpEnabled: true,
        autoVerify: {
            email: true,
        },
        userVerification: {
            emailSubject: "You need to verify your email",
            emailBody:
                "Thanks for signing up to DFO Smart Search. \n Your verification code is {####}",
            emailStyle: cognito.VerificationEmailStyle.CODE,
        },
        passwordPolicy: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireDigits: true,
            requireSymbols: false,
        },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create app client
    const appClient = userPool.addClient(`${id}-pool`, {
        userPoolClientName: userPoolName,
        authFlows: {
            userPassword: true,
            custom: true,
            userSrp: true,
        },
    });

    const identityPool = new cognito.CfnIdentityPool(scope, `${id}-identity-pool`, {
        allowUnauthenticatedIdentities: true,
        identityPoolName: "DFOIdentityPool",
        cognitoIdentityProviders: [
            {
                clientId: appClient.userPoolClientId,
                providerName: userPool.userPoolProviderName,
            },
        ],
    });

    const secretsName = `${id}-DFO_Cognito_Secrets`;
    const secret = new secretsmanager.Secret(scope, secretsName, {
        secretName: secretsName,
        description: "Cognito Secrets for authentication",
        secretObjectValue: {
            VITE_COGNITO_USER_POOL_ID: cdk.SecretValue.unsafePlainText(
                userPool.userPoolId
            ),
            VITE_COGNITO_USER_POOL_CLIENT_ID: cdk.SecretValue.unsafePlainText(
                appClient.userPoolClientId
            ),
            VITE_AWS_REGION: cdk.SecretValue.unsafePlainText(cdk.Stack.of(scope).region),
            VITE_IDENTITY_POOL_ID: cdk.SecretValue.unsafePlainText(identityPool.ref),
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    return { userPool, appClient, identityPool, secret };
};