import { BackedDataSource, IGraphqlApi } from '@aws-cdk/aws-appsync-alpha';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { CfnDataSource } from 'aws-cdk-lib/aws-appsync';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class ReamplifyDynamoDbDataSource extends BackedDataSource {
  constructor(
    scope: Construct,
    id: string,
    props: {
      api: IGraphqlApi;
      table: ITable;
      dynamoDbConfig?: Pick<CfnDataSource.DynamoDBConfigProperty, 'versioned' | 'deltaSyncConfig'>;
    }
  ) {
    super(
      scope,
      id,
      { api: props.api },
      {
        type: 'AMAZON_DYNAMODB',
        dynamoDbConfig: {
          tableName: props.table.tableName,
          awsRegion: props.table.stack.region,
          ...(props.dynamoDbConfig || {}),
        },
      }
    );
    props.table.grantReadWriteData(this);
  }
}

export class ReamplifyLambdaDataSource extends BackedDataSource {
  constructor(
    scope: Construct,
    id: string,
    props: {
      api: IGraphqlApi;
      lambdaFunction: IFunction;
    }
  ) {
    super(
      scope,
      id,
      { api: props.api },
      {
        type: 'AWS_LAMBDA',
        lambdaConfig: {
          lambdaFunctionArn: props.lambdaFunction.functionArn,
        },
      }
    );
    props.lambdaFunction.grantInvoke(this);
  }
}
