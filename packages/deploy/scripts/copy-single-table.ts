import * as AWS from 'aws-sdk';
// @ts-ignore
process.env.TOTAL_LAMBDA_DURATION_MS = String(6000000);
AWS.config.region = 'eu-west-2';
const credentials = new AWS.ChainableTemporaryCredentials({
  params: { RoleArn: 'arn:aws:iam::805337131662:role/AdminFromRootAccount', RoleSessionName: 'CopySession' },
});
AWS.config.credentials = credentials;

import { handler as copyTable } from '../lib/lambda/migrations/copyTable';

async function run() {
  try {
    await new Promise((resolve, reject) => {
      credentials.get((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(undefined);
        }
      });
    });
  } catch (e: any) {
    console.error(`Failure:`, e.message);
    return;
  }
  await copyTable({
    source: {
      tableName: 'User.dev',
    },
    destination: {
      tableName: 'User.test',
    },
    segments: [0, 1, 2, 3, 4],
    lastEvaluatedKey: [undefined, undefined, undefined, undefined, undefined],
    totalSegments: 5,
    count: [0, 0, 0, 0, 0],
    estimatedTotalRecords: 1257,
  });
}
run();
