import * as AWS from 'aws-sdk';
import { reamplifyLambdas } from '../lib/lambda';

process.env.TOTAL_LAMBDA_DURATION_MS = String(6000000);
process.env.COPY_TABLE_LAMBDA_NAME = reamplifyLambdas['migrations/copyTable.ts'].name({
  workspace: 'test',
  appName: 'reamplify',
});
AWS.config.region = 'eu-west-2';
const credentials = new AWS.ChainableTemporaryCredentials({
  params: { RoleArn: 'arn:aws:iam::805337131662:role/AdminFromRootAccount', RoleSessionName: 'CopySession' },
});
AWS.config.credentials = credentials;

import { handler as copyTable } from '../lib/lambda/migrations/copyAllTables';

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
    sourceSuffix: 'Table.dev',
    destinationSuffix: '.dev',
    totalSegments: 50,
    inline: true,
  });
}
run();
