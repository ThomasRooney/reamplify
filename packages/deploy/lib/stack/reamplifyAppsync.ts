import { Construct } from 'constructs';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import {
  AuthorizationType,
  FieldLogLevel,
  GraphqlApi,
  NoneDataSource,
  Schema,
  UserPoolDefaultAction,
} from '@aws-cdk/aws-appsync-alpha';
import * as fs from 'fs';
const resolverConfig = require('@reamplify/schema/appsync/resolvers.json') as ResolverClassifierOutput;
import type { ResolverClassifierOutput } from '@reamplify/schema/src/transformSchema';
import path from 'path';
import { CommonConfiguration, HostedZoneConfiguration } from './reamplifyEnvironment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

export type AppsyncConfiguration = CommonConfiguration & HostedZoneConfiguration & CommonConfiguration;

export class ReamplifyAppsync extends Stack {
  public readonly appsyncAPI: GraphqlApi;
  // public readonly syncTable: ITable;
  public readonly noneDataSource: NoneDataSource;
  constructor(scope: Construct, id: string, props: AppsyncConfiguration & StackProps) {
    super(scope, id, props);
    Tags.of(this).add('stack', 'ReamplifyAppsync');
    Tags.of(this).add('workspace', props.workspace);
    const schemaFolder = path.dirname(require.resolve('@reamplify/schema'));
    const schemaFileLocation = path.resolve(schemaFolder, 'appsync', 'schema.graphql');
    if (!fs.existsSync(schemaFileLocation)) {
      throw new Error(`could not find compiled schema at ${schemaFileLocation}`);
    }
    const appsyncPath = path.resolve(schemaFolder, 'appsync');
    if (Object.entries(resolverConfig.pipelineFunctions).length && !fs.existsSync(appsyncPath)) {
      throw new Error(`could not find appsyncPipelineFunctionsFolderPath at ${appsyncPath}`);
    }

    const userpoolId = StringParameter.fromStringParameterName(
      this,
      'UserPoolArnSSM',
      `/${props.appName}/${props.workspace}/aws_user_pools_id`
    ).stringValue;
    const userPoolClientId = StringParameter.fromStringParameterName(
      this,
      'UserPoolWebClientSSM',
      `/${props.appName}/${props.workspace}/aws_user_pools_web_client_id`
    ).stringValue;

    const userpool = UserPool.fromUserPoolId(this, 'UserPoolRef', userpoolId);

    const appsyncAPI = new GraphqlApi(this, 'GraphqlApi', {
      name: `API.${props.workspace}.${props.appName}`,
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: userpool,
            appIdClientRegex: userPoolClientId,
            defaultAction: UserPoolDefaultAction.ALLOW,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: AuthorizationType.IAM,
          },
        ],
      },
      logConfig: {
        fieldLogLevel: FieldLogLevel.NONE,
      },
      schema: Schema.fromAsset(schemaFileLocation),
      xrayEnabled: false,
    });

    // only used for delta sync / amplify datastore
    // this.syncTable = new Table(this, 'DeltaSyncTable', {
    //   billingMode: BillingMode.PAY_PER_REQUEST,
    //   partitionKey: {
    //     name: 'ds_pk',
    //     type: AttributeType.STRING,
    //   },
    //   sortKey: {
    //     name: 'ds_sk',
    //     type: AttributeType.STRING,
    //   },
    //   timeToLiveAttribute: '_ttl',
    //   // the delta sync table is ephemeral -- no point in backups here
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   pointInTimeRecovery: false,
    // });
    new ssm.StringParameter(this, 'aws_appsync_region', {
      allowedPattern: '.*',
      description: `Parameter aws_appsync_region for workspace ${props.workspace}`,
      parameterName: `/${props.appName}/${props.workspace}/aws_appsync_region`,
      stringValue: appsyncAPI.env.region,
      tier: ssm.ParameterTier.STANDARD,
    });

    this.noneDataSource = appsyncAPI.addNoneDataSource('NoneDataSource');

    new ssm.StringParameter(this, 'aws_appsync_graphqlEndpoint', {
      allowedPattern: '.*',
      description: `Parameter aws_appsync_graphqlEndpoint for workspace ${props.workspace}`,
      parameterName: `/${props.appName}/${props.workspace}/aws_appsync_graphqlEndpoint`,
      stringValue: appsyncAPI.graphqlUrl,
      tier: ssm.ParameterTier.STANDARD,
    });

    this.appsyncAPI = appsyncAPI;

    this.exportValue(this.appsyncAPI.graphqlUrl);
  }
}
