import * as lambda from 'aws-cdk-lib/aws-lambda';
import { reamplifyLambdas } from '../lambda';
import { Duration } from 'aws-cdk-lib';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { table_suffix } from '../stackbuilder/tableConfigToTableStack';
import { IEventSource } from 'aws-cdk-lib/aws-lambda/lib/event-source';
import * as path from 'path';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class ReamplifyLambdaFunction extends lambda.Function {
  constructor(
    scope: Construct,
    id: string,
    props: {
      appName: string;
      lambdaConfig: keyof typeof reamplifyLambdas;
      workspace: string;
      timeout?: Duration;
      memorySize?: number;
      reservedConcurrentExecutions?: number;
      unreservedConcurrency?: boolean;
      events?: IEventSource[];
      grantTables?: ITable[];
      environment?: Record<string, string>;
    }
  ) {
    super(scope, id, {
      functionName: reamplifyLambdas[props.lambdaConfig].name(props),
      code: Code.fromAsset(path.dirname(reamplifyLambdas[props.lambdaConfig].output)),
      runtime: Runtime.NODEJS_12_X,
      timeout: props.timeout ?? Duration.seconds(30),
      memorySize: props.memorySize ?? 256,
      reservedConcurrentExecutions: props.unreservedConcurrency ? undefined : props.reservedConcurrentExecutions ?? 1,
      environment: {
        appName: props.appName,
        workspace: props.workspace,
        table_suffix: table_suffix(props),
        ...(props.environment ?? {}),
      },
      logRetention: reamplifyLambdas[props.lambdaConfig].retention,
      events: props.events,
      handler: 'index.handler',
    });
    this.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.env.region}:${this.env.account}:parameter/${props.appName}/${props.workspace}/*`,
        ],
      })
    );
    if (props.grantTables) {
      this.addToRolePolicy(
        new iam.PolicyStatement({
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
            ...props.grantTables.map((res) => [res.tableArn, res.tableArn + '/*']).reduce((a, b) => a.concat(...b), []),
          ],
        })
      );
    }
  }
}
