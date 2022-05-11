import type { Handler } from 'aws-lambda';
import { tables } from '@reamplify/schema/lib/models/tables';
import AWS from 'aws-sdk';
import type { AttributeMap, Key, QueryOutput } from 'aws-sdk/clients/dynamodb';
import { assertEnv } from '../env';
import logger from '../logger';

interface MigrateOwners {
  oldOwner?: string;
  newOwner?: string;
}

export const tableSuffix = assertEnv('table_suffix');

type MigrateMode = 'owner_CHANGE';

const getMode = (ownership: MigrateOwners): MigrateMode => {
  if (ownership.oldOwner && ownership.newOwner) {
    return 'owner_CHANGE';
  }

  throw new Error(`unexpected mode: ${JSON.stringify(ownership)}`);
};

export async function migrateOwners(ownership: MigrateOwners): Promise<number> {
  const mode = getMode(ownership);
  logger.log(`migration job in mode ${mode}: ${JSON.stringify(ownership)}`);
  switch (mode) {
    case 'owner_CHANGE':
      return ownerChange(ownership.oldOwner!, ownership.newOwner!);
  }
}

export const handler: Handler<MigrateOwners, string> = async (event) => {
  logger.log('MigrateOwners Event=', JSON.stringify(event));

  const migratedRecords = await migrateOwners(event);

  const outputMsg = `migrated ${migratedRecords} records`;
  logger.log(outputMsg);

  return outputMsg;
};
async function ownerChange(oldOwner: string, newOwner: string): Promise<number> {
  const relevantTables = tables.filter((table) => table.ownerR);
  const dynamodb = new AWS.DynamoDB.DocumentClient();

  let rowsModified = 0;
  for (const table of relevantTables) {
    const dynamodbTableName = table.name + tableSuffix;
    let LastEvaluatedKey: Key | undefined = undefined;
    do {
      const results: QueryOutput = await dynamodb
        .query({
          ProjectionExpression: '#id',
          IndexName: table.ownerIndex,
          Select: 'SPECIFIC_ATTRIBUTES',
          TableName: dynamodbTableName,
          KeyConditionExpression: '#owner = :owner',
          ExclusiveStartKey: LastEvaluatedKey,
          ExpressionAttributeNames: {
            '#id': table.primaryKey,
            '#owner': 'owner',
          },
          ExpressionAttributeValues: {
            ':owner': oldOwner,
          },
        })
        .promise();
      const keys = results.Items?.map((item: AttributeMap) => item[table.primaryKey]) || [];
      for (const key of keys) {
        await dynamodb
          .update({
            ExpressionAttributeNames: {
              '#owner': 'owner',
            },
            ExpressionAttributeValues: {
              ':newOwner': newOwner,
            },
            Key: { [table.primaryKey]: key },
            ReturnValues: 'NONE',
            TableName: dynamodbTableName,
            UpdateExpression: 'SET #owner = :newOwner',
          })
          .promise();
      }
      rowsModified += keys.length;
      LastEvaluatedKey = results.LastEvaluatedKey;
    } while (LastEvaluatedKey);
  }
  return rowsModified;
}
