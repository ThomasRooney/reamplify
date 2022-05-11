import * as AWS from 'aws-sdk';
process.env.AWS_REGION = 'eu-west-2';
process.env.workspace = 'dev';
process.env.appName = 'reamplify';
process.env.table_suffix = '.reamplify.dev';
process.env.aws_appsync_region = 'eu-west-2';

const credentials = new AWS.ChainableTemporaryCredentials({
  params: { RoleArn: 'arn:aws:iam::805337131662:role/AdminFromRootAccount', RoleSessionName: 'TestSession' },
});
AWS.config.credentials = credentials;
import { handler } from './postConfirmation';

it('execute', async () => {
  await new Promise((resolve) => credentials.refresh(resolve));

  await handler(
    {
      version: '1',
      region: 'eu-west-2',
      userPoolId: 'eu-west-2_53gkPBE5h',
      userName: 'cd719080-2c63-42ef-9b41-8628ae450adc',
      callerContext: {
        awsSdkVersion: 'aws-sdk-unknown-unknown',
        clientId: '19eas0i8gujcp3fa2rf4ph7lbb',
      },
      triggerSource: 'PostConfirmation_ConfirmForgotPassword',
      request: {
        userAttributes: {
          sub: 'cd719080-2c63-42ef-9b41-8628ae450adc',
          email_verified: 'true',
          'cognito:user_status': 'CONFIRMED',
          'cognito:email_alias': 'thomas.c.rooney@gmail.com',
          preferred_username: 'T',
          email: 'thomas.c.rooney@gmail.com',
        },
      },
      response: {},
    },
    undefined as any,
    undefined as any
  );
}, 1200000);
