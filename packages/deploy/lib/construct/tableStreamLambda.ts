import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { reamplifyLambdas } from '../lambda';
import { ReamplifyLambdaFunction } from './reamplifyLambdaFunction';
import { ReamplifyTableConfigStack } from '../stackbuilder/tableConfigToTableStack';

export interface TableStreamLambdaProps {
  appsyncAPIArn: string;
  lambdaConfig: keyof typeof reamplifyLambdas;
  graphqlUrl: string;
  appsyncRegion: string;
  reservedConcurrentExecutions?: number;
  unreservedConcurrency?: boolean;
  batchingWindow?: Duration;
  tableEventSources: ReamplifyTableConfigStack[];
  workspace: string;
  appName: string;
  memorySize?: number;
  grantTables: ITable[];
  environment?: Record<string, string>;
}

export class TableStreamLambda extends Construct {
  public readonly function: lambda.Function;
  constructor(scope: Construct, id: string, props: TableStreamLambdaProps) {
    super(scope, id);
    if (!props.tableEventSources.length) {
      throw new Error(`required prop tableEventSources  ${props.tableEventSources}`);
    }

    const deadLetterQueue = new Queue(this, `DLQ`, {
      queueName: `${id}-${props.appName}-${props.workspace}-DLQ`,
      deliveryDelay: Duration.millis(0),
      retentionPeriod: Duration.days(7),
    });

    this.function = new ReamplifyLambdaFunction(this, 'Lambda', {
      ...props,
      timeout: Duration.seconds(120),
      memorySize: props.memorySize || 256,
      environment: {
        aws_appsync_graphqlEndpoint: props.graphqlUrl || '',
        aws_appsync_region: props.appsyncRegion || '',
        ...(props.environment || {}),
      },
    });

    for (const tableSource of props.tableEventSources) {
      this.function.addEventSourceMapping(`StreamEventSourceMapping-${tableSource.config.name}`, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 64,
        bisectBatchOnError: true,
        maxBatchingWindow: reamplifyLambdas[props.lambdaConfig].batchingWindow ?? Duration.seconds(1),
        onFailure: new SqsDlq(deadLetterQueue),
        retryAttempts: 6,
        eventSourceArn: tableSource.table.tableStreamArn,
      });
      tableSource.table.grantStreamRead(this.function);
    }

    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [props.appsyncAPIArn + '/*'],
      })
    );
  }
}
