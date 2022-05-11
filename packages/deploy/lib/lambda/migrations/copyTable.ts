import AWS from 'aws-sdk';
import { Key } from 'aws-sdk/clients/dynamodb';
import logger from '../logger';

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TOTAL_LAMBDA_DURATION_MS = Number(process.env.TOTAL_LAMBDA_DURATION_MS);

if (!TOTAL_LAMBDA_DURATION_MS) {
  throw new Error('missing env TOTAL_LAMBDA_DURATION_MS');
}
export const wait = async (time: number): Promise<void> => {
  await new Promise((res) => {
    setTimeout(res, time);
  });
};

export interface CopyTableLambdaEvent {
  source: {
    tableName: string;
  };
  destination: {
    tableName: string;
  };
  count: number[];
  lastEvaluatedKey: (Key | undefined)[];
  segments: number[];
  totalSegments: number;
  estimatedTotalRecords: number;
}

async function retryLoop<T, J>(
  pF: (arg?: J) => Promise<T | undefined | null>,
  number: number,
  failMessage: string,
  arg?: J
): Promise<T> {
  let e: any;
  for (let i = 0; i < number; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await pF(arg);
      if (result) {
        return result;
      }
    } catch (err) {
      e = err;
      // eslint-disable-next-line no-await-in-loop
      await wait(100 * i);
    }
  }
  if (e) {
    throw new Error(`${failMessage}: ${e.toString()}`);
  }
  throw new Error(failMessage);
}

export const handler = async (event: CopyTableLambdaEvent) => {
  logger.log('CopyTableFn Event=', JSON.stringify(event));
  const startTime = new Date();
  if (event.segments.length !== event.lastEvaluatedKey?.length || event.segments.length !== event.count.length) {
    throw new Error(`expected event.segments.length === event.lastEvaluatedKey.length`);
  }

  await Promise.all(
    event.segments.map(async (segment, index) => {
      let count = event.count[index];
      const estimatedMaxCount = Math.ceil(event.estimatedTotalRecords / event.totalSegments);
      let fractionTimeUsed = 0;
      let LastEvaluatedKey: Key | undefined = event.lastEvaluatedKey[index];
      do {
        const results = await retryLoop(
          (lastEvaluatedKey: Key | undefined) =>
            dynamodb
              .scan({
                Select: 'ALL_ATTRIBUTES',
                TableName: event.source.tableName,
                Limit: 25,
                Segment: segment,
                TotalSegments: event.totalSegments,
                ExclusiveStartKey: lastEvaluatedKey,
              })
              .promise(),
          8,
          `failed to invoke dynamodb.scan on ${event.source.tableName}`,
          LastEvaluatedKey
        );

        if (results && results.Items && results.Items.length) {
          // eslint-disable-next-line no-await-in-loop
          await retryLoop(
            () =>
              dynamodb
                .batchWrite({
                  RequestItems: {
                    [event.destination.tableName]: results.Items!.map((item) => ({
                      PutRequest: {
                        Item: item,
                      },
                    })),
                  },
                })
                .promise(),
            8,
            `failed to invoke dynamodb.batchWrite on ${event.destination.tableName}`
          );
          count += results.Items.length;
        }
        LastEvaluatedKey = results.LastEvaluatedKey;
        logger.log(
          `[${event.source.tableName} => ${event.destination.tableName}][${segment}] ${
            (count / estimatedMaxCount) * 100
          }% ${JSON.stringify(results.LastEvaluatedKey)}`
        );
        fractionTimeUsed = (new Date().valueOf() - startTime.valueOf()) / TOTAL_LAMBDA_DURATION_MS;
      } while (LastEvaluatedKey && fractionTimeUsed < 0.75);

      if (LastEvaluatedKey) {
        const nextEvent: CopyTableLambdaEvent = {
          ...event,
          segments: [segment],
          count: [count],
          lastEvaluatedKey: [LastEvaluatedKey],
        };
        logger.log(
          `[${event.source.tableName} => ${event.destination.tableName}][${segment}] ${
            (count / estimatedMaxCount) * 100
          }%: ${fractionTimeUsed * 100}% of ${TOTAL_LAMBDA_DURATION_MS / 1000}s duration used.`
        );
        logger.log('nextEvent', nextEvent);
      } else {
        logger.log(
          `[${event.source.tableName} => ${event.destination.tableName}][${segment}] done (${
            (new Date().valueOf() - startTime.valueOf()) / 1000
          }s)`
        );
      }
    })
  );

  return;
};
