import { environments } from '../bin/environments';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  await Promise.all(
    Object.values(environments).map(async (environment) => {
      try {
        const roleArn = `arn:aws:iam::${environment.env.account}:role/AdminFromRootAccount`;
        console.log(`Accessing ${environment.workspace} via ${roleArn}`);

        const credentials = new AWS.ChainableTemporaryCredentials({
          masterCredentials: new AWS.SharedIniFileCredentials({ profile: 'resilientsoftware' }),
          params: {
            RoleArn: `arn:aws:iam::${environment.env.account}:role/AdminFromRootAccount`,
            RoleSessionName: 'SyncEnvironmentSession',
          },
        });
        process.env.AWS_REGION = environment.env.region;
        AWS.config.credentials = credentials;
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
          console.error(`Failure with environment ${environment.appName}/${environment.workspace}:`, e.message);
          return;
        }
        console.log(`Access granted to ${environment.appName}/${environment.workspace} via ${roleArn}`);
        const ssmParameterLocation = `/${environment.appName}/${environment.workspace}/DEPLOY_CONFIG`;

        const ssm = new AWS.SSM({ credentials });
        console.log(`Resolving ${ssmParameterLocation} via SSM`);
        const ssmValue = await ssm
          .getParameter({
            Name: ssmParameterLocation,
          })
          .promise();
        console.log(`Got ${ssmParameterLocation} as ${JSON.stringify(ssmValue)}`);

        const parsed = JSON.parse(ssmValue.Parameter!.Value!);

        const envPath = path.resolve(__dirname, '..', 'env');
        const outputPath = path.resolve(envPath, `${environment.workspace}.json`);
        if (!fs.existsSync(envPath)) {
          fs.mkdirSync(envPath);
        }
        fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
        console.log(`Successfully downloaded ${ssmParameterLocation} into ${outputPath}`);
      } catch (e) {
        console.error(`Failure with environment ${environment.workspace}:`, e);
      }
    })
  );
}
run();
