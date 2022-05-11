import * as AWS from 'aws-sdk';
import { StackSummary } from 'aws-sdk/clients/cloudformation';
import { App, Tags } from 'aws-cdk-lib';
import { AnyTable, tables } from '@reamplify/schema/lib/models/tables';
import type { IndexConfiguration } from '@reamplify/schema/lib/tableConfig';
import { environments } from '../bin/environments';
import { tableConfigToTableStack } from '../lib/stackbuilder/tableConfigToTableStack';
import { CDKPipelineStackProps } from '../lib/stack/cdkPipelineStack';

const assertValid = (workspace: any): keyof typeof environments => {
  if (workspace in environments) {
    return workspace;
  }
  throw new Error(`could not find ${workspace} in ${Object.keys(environments)}`);
};

function deleteIndex(
  app: App,
  environmentsProps: CDKPipelineStackProps,
  table: AnyTable,
  cfTemplate: any,
  dynamodbTable: any,
  index: any
) {
  const currentSecondaryIndexes: IndexConfiguration<any>[] = dynamodbTable?.Properties?.GlobalSecondaryIndexes?.map(
    cfToIndexConfig
  ).filter((ind: any) => ind.name !== index.IndexName);
  tableConfigToTableStack({
    ...environmentsProps,
    stackName: `${environmentsProps.appName}-${environmentsProps.workspace}-${table.name}-Table`,
    scope: app,
    tableData: {
      ...table,
      index: currentSecondaryIndexes.reduce((acc, cur) => {
        acc[cur.name] = cur;
        return acc;
      }, {} as any),
    },
  });
}
function createIndex(
  app: App,
  environmentsProps: CDKPipelineStackProps,
  table: AnyTable,
  cfTemplate: any,
  dynamodbTable: any,
  index: any
) {
  const currentSecondaryIndexes: IndexConfiguration<any>[] =
    dynamodbTable?.Properties?.GlobalSecondaryIndexes?.map(cfToIndexConfig) || [];
  tableConfigToTableStack({
    ...environmentsProps,
    stackName: `${environmentsProps.appName}-${environmentsProps.workspace}-${table.name}-Table`,
    scope: app,
    tableData: {
      ...table,
      index: currentSecondaryIndexes.concat(index).reduce((acc, cur) => {
        acc[cur.name] = cur;
        return acc;
      }, {} as any),
    },
  });
}

function cfToIndexConfig(cfIndexConfiguration: any): IndexConfiguration<any> {
  if (!cfIndexConfiguration) {
    return cfIndexConfiguration;
  }

  const sortKey: string | undefined = cfIndexConfiguration.KeySchema?.[1]?.AttributeName;

  return {
    fields: [cfIndexConfiguration.KeySchema[0].AttributeName, ...(sortKey?.split('#') || [])],
    name: cfIndexConfiguration.IndexName,
    partitionKey: cfIndexConfiguration.KeySchema[0].AttributeName,
    ...(sortKey ? { sortKey } : {}),
  };
}

async function run(arg: any) {
  console.log(`Invoking iterative-dynamodb-db-index-update with environment ${arg}`);
  const app = new App();
  const workspace = assertValid(arg);

  console.log(`Accessing ${workspace} via aws profile named ${environments[workspace].env.account}`);
  const credentials = new AWS.SharedIniFileCredentials({ profile: environments[workspace].env.account });
  await new Promise((resolve, reject) => {
    credentials.get((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(undefined);
      }
    });
  });
  console.log(`Access granted to ${workspace}`);
  AWS.config.credentials = credentials;
  AWS.config.region = environments[workspace].env.region;
  const cloudformation = new AWS.CloudFormation();
  Tags.of(app).add('user:Application', environments[workspace].appName);

  const stackSummaries: StackSummary[] = [];
  let nextToken: string | undefined;
  do {
    const stackResp = await cloudformation
      .listStacks({
        NextToken: nextToken,
      })
      .promise();
    stackSummaries.push(...(stackResp.StackSummaries || []));
    nextToken = stackResp.NextToken;
  } while (nextToken);

  for (const table of tables) {
    const stackName = `${environments[workspace].appName}-${workspace}-${table.name}-Table`;
    const stackSummary = stackSummaries.find((summary) => summary.StackName === stackName);
    if (!stackSummary) {
      console.error(`could not find stack with name = ${stackName}`);
      continue;
    }
    const getTemplateResp = await cloudformation
      .getTemplate({
        StackName: stackName,
      })
      .promise();
    if (!getTemplateResp.TemplateBody) {
      throw new Error(`expected TemplateBody with stackName ${stackName}`);
    }
    const templateBody = JSON.parse(getTemplateResp.TemplateBody);
    const dynamodbTable: any = Object.values(templateBody?.Resources || {}).find(
      (resource: any) => resource.Type === 'AWS::DynamoDB::Table'
    );
    if (!dynamodbTable) {
      console.error(`could not find dynamodb table in ${stackName}`);
      continue;
    }
    const currentSecondaryIndexes = dynamodbTable?.Properties?.GlobalSecondaryIndexes || [];
    // ignore local secondary indexes
    const desiredSecondaryIndexes: IndexConfiguration<any>[] = Object.values(table.index).filter(
      (index) => index.fields[0] !== table.partitionKey.name
    );
    const mustDelete: any[] = currentSecondaryIndexes.filter((currentIndex: any) => {
      const { IndexName, KeySchema } = currentIndex;
      const matchingDesired = desiredSecondaryIndexes.find((index) => index.name === IndexName);
      if (!matchingDesired) {
        return true;
      }
      const partitionKey = KeySchema[0].AttributeName;
      if (matchingDesired.partitionKey !== partitionKey) {
        return true;
      }
      if (KeySchema.length === 1 && matchingDesired.sortKey) {
        return true;
      }
      if (KeySchema.length === 2) {
        const sortKey = KeySchema[1].AttributeName;
        if (!matchingDesired.sortKey === sortKey) {
          return true;
        }
      }
      if (KeySchema.length > 2) {
        throw new Error('unexpected KeySchema');
      }
      return false;
    });
    const mustCreate: IndexConfiguration<any>[] = desiredSecondaryIndexes.filter((currentIndex) => {
      const matchingExists = currentSecondaryIndexes.find((index: any) => currentIndex.name === index.IndexName);
      if (!matchingExists) {
        return true;
      }
      const partitionKey = matchingExists.KeySchema[0].AttributeName;
      if (currentIndex.partitionKey !== partitionKey) {
        return true;
      }
      if (matchingExists.KeySchema.length === 1 && currentIndex.sortKey) {
        return true;
      }

      if (matchingExists.KeySchema.length === 2) {
        const sortKey = matchingExists.KeySchema[1].AttributeName;
        if (!currentIndex.sortKey === sortKey) {
          return true;
        }
      }
      if (matchingExists.KeySchema.length > 2) {
        throw new Error('unexpected KeySchema');
      }

      return false;
    });
    if (mustDelete.length + mustCreate.length === 0) {
      console.log(`✓ ${table.name}`);
      tableConfigToTableStack({
        ...environments[workspace],
        stackName: `${environments[workspace].appName}-${environments[workspace].workspace}-${table.name}-Table`,
        scope: app,
        tableData: table,
      });
    } else if (mustDelete.length) {
      console.log(
        `${mustDelete.reduce((acc) => acc + '-', '')}${mustCreate.reduce((acc) => acc + '+', '')} ${table.name}`
      );
      deleteIndex(app!, environments[workspace], table, getTemplateResp, dynamodbTable, mustDelete.pop());
    } else if (mustCreate.length) {
      console.log(`${mustCreate.reduce((acc) => acc + '+', '')} ${table.name}`);
      createIndex(app!, environments[workspace], table, getTemplateResp, dynamodbTable, mustCreate.pop());
    }
  }
}

run(process.argv[2]);
