import * as cdk from 'aws-cdk-lib';
import {
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
  ClientAttributes,
  IUserPool,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Duration, Names, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { HostedZoneAttributes } from 'aws-cdk-lib/aws-route53';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as r53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as CustomResources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { VerifySesDomain } from './ses-verify-identities';
import { UserS3DataStack } from '../stack/userS3DataStack';
import { CommonConfiguration } from '../stack/reamplifyEnvironment';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ReamplifyLambdaFunction } from './reamplifyLambdaFunction';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { reamplifyLambdas } from '../lambda';

export interface SSODeployConfiguration {
  sso: {
    migratedUserPoolArn?: string;
    domain: 'CUSTOM' | 'NONE' | 'COGNITO';
    googleClientSecret?: string;
    amazonClientId?: string;
    amazonClientSecret?: string;
    googleClientId?: string;
  };
}

export interface ReamplifyUserPoolProps extends SSODeployConfiguration {
  workspace: string;
  hostedZone: HostedZoneAttributes;
  stateAssetRemovalPolicy: RemovalPolicy;
  assets: UserS3DataStack;
  env: {
    region: string;
    account: string;
  };
}

// Disabled for release: enable this to handle SSO via Google/Amazon/Facebook etc.
export const externalProviders: UserPoolClientIdentityProvider[] = [
  /*UserPoolClientIdentityProvider.GOOGLE*/
];

export const userpoolChangeAPICall = (
  userPool: IUserPool,
  emailConfigurationSourceArn: string,
  emailConfigurationFrom: string,
  Triggers?: {
    PreAuthentication?: string;
    PreSignUp: string;
    PostConfirmation: string;
    DefineAuthChallenge?: string;
    VerifyAuthChallengeResponse?: string;
    CreateAuthChallenge?: string;
  },
  alwaysExecute?: boolean
) => ({
  region: userPool.env.region,
  service: 'CognitoIdentityServiceProvider',
  action: 'updateUserPool',
  parameters: {
    UserPoolId: userPool.userPoolId,
    EmailConfiguration: {
      EmailSendingAccount: 'DEVELOPER',
      From: emailConfigurationFrom,
      ReplyToEmailAddress: `support@reamplify.io`,
      SourceArn: emailConfigurationSourceArn, // SES integration is only available in us-east-1, us-west-2, eu-west-1
    },
    AutoVerifiedAttributes: ['email'],
    AccountRecoverySetting: {
      RecoveryMechanisms: [
        {
          Name: 'verified_email',
          Priority: 1,
        },
      ],
    },
    ...(Triggers ? { LambdaConfig: { ...Triggers } } : {}),
  },
  physicalResourceId: alwaysExecute
    ? CustomResources.PhysicalResourceId.of(new Date().toISOString())
    : CustomResources.PhysicalResourceId.of(userPool.userPoolId),
});

export class ReamplifyUserPool extends Construct {
  public readonly scopes: string[];
  public readonly userPool: IUserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly identityPoolProvider: string;
  public readonly identityPool: CfnIdentityPool;
  public readonly authRole: iam.IRole;
  public readonly domainName: string;
  private userPoolDomain?: UserPoolDomain;
  props: cdk.StackProps & ReamplifyUserPoolProps & CommonConfiguration;

  constructor(scope: Stack, id: string, props: cdk.StackProps & ReamplifyUserPoolProps & CommonConfiguration) {
    super(scope, id);
    this.props = props;
    const environmentWebDomain = `https://${props.hostedZone.zoneName}/`;

    const hostedZone = r53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', props.hostedZone);

    const identity = new VerifySesDomain(this, 'DomainIdentity', {
      domainName: props.hostedZone.zoneName,
      hostedZoneName: hostedZone.zoneName,
      addDkimRecords: true,
      region: 'eu-west-1',
    });

    let userPool: IUserPool;
    if (!props.sso.migratedUserPoolArn) {
      userPool = new UserPool(this, `${props.workspace}-reamplify-user-pool`, {
        userPoolName: `${props.workspace}.${props.appName}`,
        selfSignUpEnabled: true,
        passwordPolicy: {
          tempPasswordValidity: Duration.days(3),
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: false,
        },
        signInAliases: { email: true },
        standardAttributes: {
          email: {
            required: true,
            mutable: true,
          },
          preferredUsername: {
            required: true,
            mutable: true,
          },
        },
        autoVerify: {
          email: true,
        },
      });
      userPool.applyRemovalPolicy(props.stateAssetRemovalPolicy);
      userPool.node.addDependency(identity);
    } else {
      userPool = UserPool.fromUserPoolArn(this, `UserPool`, props.sso.migratedUserPoolArn);
    }

    const emailConfigurationSourceArn = `arn:aws:ses:eu-west-1:${props.env!.account!}:identity/${identity.domainName}`;
    const emailConfigurationFrom = `Reamplify.io <no-reply@${props.hostedZone.zoneName}>`;

    new LogGroup(this, 'RejectionLogGroup', {
      removalPolicy: props.stateAssetRemovalPolicy,
      logGroupName: '/aws/lambda/' + reamplifyLambdas['userpool/rejectDownForMaintainence.ts'].name(props),
      retention: reamplifyLambdas['userpool/rejectDownForMaintainence.ts'].retention,
    });

    const currentlyOngoingMigrationFunction = new ReamplifyLambdaFunction(this, 'PreAuthenticationFunction', {
      ...props,
      lambdaConfig: `userpool/rejectDownForMaintainence.ts`,
    });
    currentlyOngoingMigrationFunction.grantInvoke(new ServicePrincipal('cognito-idp.amazonaws.com'));

    this.store('userpool_down_for_maintainence_function_arn', currentlyOngoingMigrationFunction.functionArn);
    this.store('userpool_email_configuration_source_arn', emailConfigurationSourceArn);
    this.store('userpool_email_configuration_from', emailConfigurationFrom);

    let Triggers;
    if (props.disableUserAccess) {
      Triggers = {
        PreSignUp: currentlyOngoingMigrationFunction.functionArn,
        PostConfirmation: currentlyOngoingMigrationFunction.functionArn,
        PreAuthentication: currentlyOngoingMigrationFunction.functionArn,
      };
    }

    const userpoolChange = userpoolChangeAPICall(
      userPool,
      emailConfigurationSourceArn,
      emailConfigurationFrom,
      Triggers
    );

    const updateUserPool = new CustomResources.AwsCustomResource(this, 'UpdateUserPool', {
      resourceType: 'Custom::UpdateUserPool',
      onCreate: userpoolChange,
      onUpdate: userpoolChange,
      policy: CustomResources.AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          resources: ['*'],
          actions: ['*'],
        }),
      ]),
    });
    updateUserPool.node.addDependency(identity);

    this.scopes = ['aws.cognito.signin.user.admin', 'email', 'openid', 'phone', 'profile'];

    this.userPool = userPool;

    const userPoolClient = userPool.addClient(`${id}-reamplify-client`, {
      userPoolClientName: `web-id-client.${props.workspace}.${props.appName}`,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO, ...externalProviders],
      oAuth: {
        callbackUrls: [environmentWebDomain, 'http://localhost:3100/'],
        logoutUrls: [environmentWebDomain, 'http://localhost:3100/'],
      },
      readAttributes: new ClientAttributes().withStandardAttributes({
        email: true,
        emailVerified: true,
        preferredUsername: true,
      }),
    });

    const authDomainName = `auth.${props.hostedZone.zoneName}`;
    const uid: string = Names.uniqueId(userPool).toLowerCase();

    if (props.sso.domain === 'CUSTOM') {
      const certificateArn = ssm.StringParameter.fromStringParameterName(
        this,
        'CertificateArnSSM',
        `/${props.appName}/${props.workspace}/CertificateArn`
      ).stringValue;

      const certificate = Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

      this.userPoolDomain = userPool.addDomain(`${props.workspace}-custom-domain`, {
        customDomain: {
          domainName: authDomainName,
          certificate,
        },
      });
      new r53.ARecord(this, 'UserPoolUserPoolClientAliasRecord', {
        zone: hostedZone,
        recordName: authDomainName,
        target: r53.RecordTarget.fromAlias(new r53Targets.UserPoolDomainTarget(this.userPoolDomain)),
      });
      this.domainName = this.userPoolDomain.baseUrl();
    } else if (props.sso.domain === 'COGNITO') {
      this.userPoolDomain = userPool.addDomain(`${props.workspace}-reamplify-domain`, {
        cognitoDomain: {
          domainPrefix: `${props.appName}-${props.workspace}-${uid.slice(uid.length - 7)}`,
        },
      });
      this.domainName = this.userPoolDomain.baseUrl();
    } else {
      this.domainName = `https://${authDomainName}`;
    }
    this.userPoolClient = userPoolClient;
    this.identityPoolProvider = `cognito-idp.${props.env!.region!}.amazonaws.com/${userPool.userPoolId}`;
    const identityPool = new CfnIdentityPool(this, `${id}-reamplify-identity-pool`, {
      identityPoolName: `${props.workspace}_${props.appName}_identity_pool`,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: this.identityPoolProvider,
        },
      ],
      allowUnauthenticatedIdentities: false,
    });
    this.identityPool = identityPool;

    const cfnAuthRole = new iam.CfnRole(this, `${props.workspace}-Auth-Role`, {
      assumeRolePolicyDocument: {
        Statement: [
          {
            Effect: iam.Effect.ALLOW,
            Action: ['sts:AssumeRoleWithWebIdentity', 'sts:TagSession'],
            Condition: {
              StringEquals: {
                'cognito-identity.amazonaws.com:aud': identityPool.getAtt('Ref'),
              },
              'ForAnyValue:StringLike': {
                'cognito-identity.amazonaws.com:amr': 'authenticated',
              },
            },
            Principal: {
              Federated: 'cognito-identity.amazonaws.com',
            },
          },
        ],
      },
    });
    this.authRole = iam.Role.fromRoleArn(this, 'authRole', cfnAuthRole.attrArn);
    this.authRole.node.addDependency(cfnAuthRole);

    new CfnIdentityPoolRoleAttachment(this, `${id}-role-map`, {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: this.authRole.roleArn,
      },
    });

    this.store('aws_cognito_identity_pool_id', this.identityPool.ref);
    this.store('aws_cognito_identity_pool_provider', this.identityPoolProvider);
    this.store('aws_cognito_region', this.userPool.env.region);
    this.store('aws_cognito_domain', this.domainName);
    this.store('aws_cognito_scope', this.scopes.join(','));
    this.store('aws_user_pools_id', this.userPool.userPoolId);
    this.store('aws_user_pools_web_client_id', this.userPoolClient.userPoolClientId);
  }

  private store(id: string, value: string): void {
    new ssm.StringParameter(this, id, {
      parameterName: `/${this.props.appName}/${this.props.workspace}/${id}`,
      stringValue: value,
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
