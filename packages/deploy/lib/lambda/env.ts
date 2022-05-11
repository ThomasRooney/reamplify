import AWS from 'aws-sdk';
import logger from './logger';

let logged: Record<string, boolean> = {};

export function assertEnv(key: string): string {
  if (process.env[key] !== undefined) {
    if (!logged[key]) {
      logged[key] = true;
      logger.log('env', key, 'resolved by process.env as', process.env[key]!);
    }
    return process.env[key]!;
  }
  throw new Error(`expected environment variable ${key}`);
}

export const assertEnvOrSSM = async (key: string, shouldThrow = true): Promise<string> => {
  const workspace = assertEnv('workspace');
  const appName = assertEnv('appName');

  if (process.env[key] !== undefined) {
    logger.log('env', key, 'resolved by process.env as', process.env[key]!);
    return Promise.resolve(process.env[key]!);
  } else {
    const SSMLocation = `/${appName}/${workspace}/${key}`;
    logger.log('env', key, 'resolving via SSM at', SSMLocation);

    const SSM = new AWS.SSM();
    try {
      const ssmResponse = await SSM.getParameter({
        Name: SSMLocation,
      }).promise();
      if (!ssmResponse.Parameter || !ssmResponse.Parameter.Value) {
        throw new Error(`env ${key} missing`);
      }
      logger.log('env', key, 'resolved by SSM as', ssmResponse.Parameter.Value);
      process.env[key] = ssmResponse.Parameter.Value;
      return ssmResponse.Parameter.Value;
    } catch (e) {
      logger.error(`SSM.getParameter({Name: ${SSMLocation}}):`, e);
      if (shouldThrow) {
        throw e;
      }
      return '';
    }
  }
};

export const writeSSM = async (key: string, value: string): Promise<void> => {
  const workspace = assertEnv('workspace');
  const appName = assertEnv('appName');

  const SSMLocation = `/${appName}/${workspace}/${key}`;
  logger.log('env', key, 'writing to SSM at', SSMLocation, 'value', value);

  const SSM = new AWS.SSM();
  await SSM.putParameter({
    Name: SSMLocation,
    Value: value,
    Overwrite: true,
    DataType: 'text',
    Tier: 'Standard',
    Type: 'String',
  }).promise();
};
