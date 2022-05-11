import * as cdk from 'aws-cdk-lib';
import { Duration, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { table } from '@reamplify/schema/lib/models/tables';
import { ReamplifyTableConfigStack, table_suffix } from '../stackbuilder/tableConfigToTableStack';
import { GraphqlApi } from '@aws-cdk/aws-appsync-alpha';
import { ReamplifyLambdaFunction } from './reamplifyLambdaFunction';
import { ReamplifyCloudwatchMetricStack } from '../stack/reamplifyCloudwatch';
import { CommonConfiguration } from '../stack/reamplifyEnvironment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { externalProviders, userpoolChangeAPICall } from './userPool';
import * as CustomResources from 'aws-cdk-lib/custom-resources';
import resolverConfig from '@reamplify/schema/appsync/resolvers.json';

export interface AppsyncFunctionsProps {
  tables: Record<keyof typeof table, ReamplifyTableConfigStack>;
  metrics: ReamplifyCloudwatchMetricStack;
  appsyncAPI: GraphqlApi;
  workspace: string;
}

export interface AppSyncFunctionList {
  functions: Record<string, IFunction>;
}

export class AppsyncFunctions extends Construct implements AppSyncFunctionList {
  public readonly functions: Record<keyof typeof resolverConfig.functionNameToDataSourceName, IFunction>;
  public readonly props: cdk.StackProps & AppsyncFunctionsProps & CommonConfiguration;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AppsyncFunctionsProps & CommonConfiguration) {
    super(scope, id);

    this.props = props;
    Tags.of(this).add('construct', 'AppsyncFunctions');

    const accessEnvironmentTables = new PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:Update*',
        'dynamodb:Delete*',
        'dynamodb:PutItem',
        'dynamodb:Get*',
        'dynamodb:BatchWriteItem',
        'dynamodb:DescribeStream',
        'dynamodb:DescribeTable',
      ],
      resources: [
        ...Object.values(props.tables)
          .map((t) => t.table)
          .map((res) => [res.tableArn, res.tableArn + '/*'])
          .reduce((a, b) => a.concat(...b), []),
      ],
    });
    const copyAnyTableToDestination = new iam.Policy(this, 'AccessAllTablesPolicy', {
      statements: [
        accessEnvironmentTables,
        new PolicyStatement({
          actions: [
            'dynamodb:DescribeStream',
            'dynamodb:DescribeTable',
            'dynamodb:ListTables',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:Get*',
          ],
          resources: ['*'],
        }),
      ],
    });

    const userpoolId = this.get(`aws_user_pools_id`);

    const userPool = UserPool.fromUserPoolId(this, 'UserPool', userpoolId);

    const deleteItem = new ReamplifyLambdaFunction(this, 'TodoItemDelete', {
      ...props,
      lambdaConfig: `todoItem/delete.ts`,
      environment: {},
      grantTables: [props.tables.TodoItem.table],
    });
    deleteItem.addToRolePolicy(
      new PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [props.appsyncAPI.arn + '/*'],
      })
    );

    const preSignupFunction = new ReamplifyLambdaFunction(this, 'PreSignupLambda', {
      ...this.props,
      lambdaConfig: `userpool/preSignup.ts`,
      environment: {
        PROVIDERS: externalProviders.map((p) => p.name).join(','),
      },
    });
    preSignupFunction.grantInvoke(new ServicePrincipal('cognito-idp.amazonaws.com'));
    const postConfirmationFunction = new ReamplifyLambdaFunction(this, 'PostConfirmationLambda', {
      ...props,
      lambdaConfig: `userpool/postConfirmation.ts`,
      timeout: Duration.seconds(120),
      memorySize: 1024,
      environment: {},
      grantTables: [props.tables.User.table],
    });
    postConfirmationFunction.grantInvoke(new ServicePrincipal('cognito-idp.amazonaws.com'));

    preSignupFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'mergeUserFnPolicy', {
        statements: [
          new PolicyStatement({
            actions: ['cognito-idp:ListUsers'],
            resources: [userPool.userPoolArn],
          }),
          new PolicyStatement({
            actions: ['cognito-idp:AdminLinkProviderForUser'],
            resources: [userPool.userPoolArn],
          }),
        ],
      })
    );
    postConfirmationFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'createUserFn', {
        statements: [
          new PolicyStatement({
            actions: [
              'cognito-idp:ListUsers',
              'cognito-idp:AdminLinkProviderForUser',
              'cognito-idp:AdminUpdateUserAttributes',
            ],
            resources: [userPool.userPoolArn],
          }),
          new PolicyStatement({
            actions: ['appsync:GraphQL'],
            resources: [props.appsyncAPI.arn + '/*'],
          }),
          new PolicyStatement({
            actions: [
              'dynamodb:Query',
              'dynamodb:Scan',
              'dynamodb:Update*',
              'dynamodb:Delete*',
              'dynamodb:PutItem',
              'dynamodb:Get*',
              'dynamodb:DescribeStream',
              'dynamodb:DescribeTable',
            ],
            resources: [
              ...Object.values(props.tables)
                .map((res) => res.table)
                .map((res) => [res.tableArn, res.tableArn + '/*'])
                .reduce((a, b) => a.concat(...b), []),
            ],
          }),
        ],
      })
    );

    //
    if (!props.includeEventLambdas) {
      const maxTimeout = Duration.seconds(900);
      const copyTableFn = new ReamplifyLambdaFunction(this, 'CopyTableFn', {
        ...props,
        lambdaConfig: 'migrations/copyTable.ts',
        memorySize: 512,
        timeout: Duration.seconds(900),
        unreservedConcurrency: true,
        environment: {
          TOTAL_LAMBDA_DURATION_MS: maxTimeout.toMilliseconds().toString(),
        },
      });
      copyTableFn.role?.attachInlinePolicy(copyAnyTableToDestination);

      const copyAllTablesFn = new ReamplifyLambdaFunction(this, 'CopyAllTablesFn', {
        ...props,
        lambdaConfig: 'migrations/copyAllTables.ts',
        memorySize: 256,
        timeout: Duration.seconds(900),
        environment: {
          COPY_TABLE_LAMBDA_NAME: copyTableFn.functionName,
          EXPECTED_DESTINATION_TABLE_SUFFIX: table_suffix(props),
          TOTAL_LAMBDA_DURATION_MS: maxTimeout.toMilliseconds().toString(),
        },
      });
      copyTableFn.grantInvoke(copyAllTablesFn);
      copyAllTablesFn.role?.attachInlinePolicy(copyAnyTableToDestination);
    }

    const emailConfigurationFrom = this.get('userpool_email_configuration_from');
    const emailConfigurationSourceArn = this.get('userpool_email_configuration_source_arn');
    const currentlyOngoingMigrationFunction = this.get('userpool_down_for_maintainence_function_arn');

    const userpoolChange = userpoolChangeAPICall(
      userPool,
      emailConfigurationSourceArn,
      emailConfigurationFrom,
      props.disableUserAccess
        ? {
            PostConfirmation: currentlyOngoingMigrationFunction,
            PreSignUp: currentlyOngoingMigrationFunction,
            PreAuthentication: currentlyOngoingMigrationFunction,
          }
        : {
            PostConfirmation: postConfirmationFunction.functionArn,
            PreSignUp: preSignupFunction.functionArn,
          },
      false
    );

    new CustomResources.AwsCustomResource(this, 'UpdateUserPool', {
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
    this.functions = {
      deleteItemFn: deleteItem,
    };
  }

  private get(id: string): string {
    return ssm.StringParameter.fromStringParameterName(this, id, `/${this.props.appName}/${this.props.workspace}/${id}`)
      .stringValue;
  }
}
