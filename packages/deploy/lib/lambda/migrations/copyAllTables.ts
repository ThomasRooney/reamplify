import AWS from 'aws-sdk';
import logger from '../logger';
import { tables } from '@reamplify/schema/lib/models/tables';
import { handler as actualCopyTable, CopyTableLambdaEvent } from './copyTable';

const dynamodb = new AWS.DynamoDB();
const lambda = new AWS.Lambda();

const COPY_TABLE_LAMBDA_NAME = process.env.COPY_TABLE_LAMBDA_NAME;
const EXPECTED_DESTINATION_TABLE_SUFFIX = process.env.EXPECTED_DESTINATION_TABLE_SUFFIX;
// Most of the time in lambda is actually spent waiting for http calls. Better to run multiple segments on one lambda.
const MAX_SEGMENTS_PER_LAMBDA = 4;

interface CopyAllWithSuffixEvent {
  sourceSuffix: string;
  destinationSuffix: string;
  totalSegments: number;
  inline: boolean;
}

async function createCopyJob(
  sourceTableName: string,
  destinationTableName: string,
  maxParallelism: number
): Promise<CopyTableLambdaEvent[] | undefined> {
  const sourceTableDescription = await dynamodb
    .describeTable({
      TableName: sourceTableName,
    })
    .promise();

  const itemCount = Number(sourceTableDescription.Table?.ItemCount || 1);

  const totalSegments = Math.min(Math.ceil(itemCount / 100), maxParallelism);
  const jobs: CopyTableLambdaEvent[] = [];
  // If we want to execute job over 10 segments
  // allSegments = [0,1,...9]
  const allSegments = [...Array(totalSegments)].map((_, i) => i);
  const allKeys = [...Array(totalSegments)].map(() => undefined);
  const allCounts = [...Array(totalSegments)].map(() => 0);
  for (let segment = 0; segment < totalSegments; segment += MAX_SEGMENTS_PER_LAMBDA) {
    const segmentsInThisJob = allSegments.slice(segment, segment + MAX_SEGMENTS_PER_LAMBDA);
    const keysInThisJob = allKeys.slice(segment, segment + MAX_SEGMENTS_PER_LAMBDA);
    const countsInThisJob = allCounts.slice(segment, segment + MAX_SEGMENTS_PER_LAMBDA);
    jobs.push({
      source: {
        tableName: sourceTableName,
      },
      destination: {
        tableName: destinationTableName,
      },
      count: countsInThisJob,
      lastEvaluatedKey: keysInThisJob,
      segments: segmentsInThisJob,
      totalSegments: totalSegments,
      estimatedTotalRecords: itemCount,
    });
  }
  return jobs;
}

export const handler = async (event: CopyAllWithSuffixEvent) => {
  logger.log('CopyAllWithSuffix Event=', JSON.stringify(event));
  if (EXPECTED_DESTINATION_TABLE_SUFFIX && event.destinationSuffix !== EXPECTED_DESTINATION_TABLE_SUFFIX) {
    throw new Error(
      `EXPECTED_DESTINATION_TABLE_SUFFIX=${EXPECTED_DESTINATION_TABLE_SUFFIX} not equal to provided event.destinationSuffix=${event.destinationSuffix}`
    );
  }
  let TableNames: string[] = [];
  let allTablesResp;
  do {
    allTablesResp = await dynamodb
      .listTables({
        ExclusiveStartTableName: TableNames[TableNames.length - 1],
      })
      .promise();
    if (allTablesResp.TableNames) {
      TableNames.push(...allTablesResp.TableNames);
    }
  } while (allTablesResp.TableNames && allTablesResp.TableNames.length);

  if (!TableNames || !TableNames.length) {
    return;
  }

  const jobs: CopyTableLambdaEvent[] = (
    await Promise.all(
      tables.map(async (table) => {
        const matchingSource = TableNames.filter((t) => t === table.name + event.sourceSuffix);
        const matchingDestination = TableNames.filter((t) => t === table.name + event.destinationSuffix);
        if (matchingSource.length === 1 && matchingDestination.length === 1) {
          return createCopyJob(matchingSource[0], matchingDestination[0], event.totalSegments);
        }
        return undefined;
      })
    )
  )
    .flat()
    .filter((j): j is CopyTableLambdaEvent => Boolean(j));
  if (event.inline) {
    await Promise.all(jobs.map((job) => actualCopyTable(job)));
  } else {
    if (!COPY_TABLE_LAMBDA_NAME) {
      throw new Error(`missing env variable "COPY_TABLE_LAMBDA_NAME"`);
    } else {
      logger.log(`env variable "COPY_TABLE_LAMBDA_NAME" resolved as ${COPY_TABLE_LAMBDA_NAME}`);
    }
    await Promise.all(
      jobs.map(async (job) => {
        try {
          const response = await lambda
            .invoke({
              FunctionName: COPY_TABLE_LAMBDA_NAME,
              InvocationType: 'Event',
              Payload: JSON.stringify(job),
            })
            .promise();
          logger.log(`invoke ${COPY_TABLE_LAMBDA_NAME} with`, job, 'success', response);
        } catch (e) {
          logger.error(`invoke ${COPY_TABLE_LAMBDA_NAME} with`, job, 'error', e);
        }
      })
    );
  }
  return;
};
