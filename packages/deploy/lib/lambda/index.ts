import path from 'path';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';
import { CommonConfiguration } from '../stack/reamplifyEnvironment';

const commonExternals = ['aws-sdk'];

export const reamplifyLambdas = {
  'deploy/frontendPostDeploy.ts': {
    input: path.resolve(__dirname, 'deploy', 'frontendPostDeploy.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'deploy', 'frontendPostDeploy', 'index.js'),
    name: (props: { workspace: string; appName: string }) =>
      props.appName + '-' + props.workspace + '-' + 'Deploy' + '-' + 'CreateS3CDNInvalidation',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'deploy',
    enabled: () => true,
    external: commonExternals,
  },
  'migrations/copyTable.ts': {
    input: path.resolve(__dirname, 'migrations', 'copyTable.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'migrations', 'copyTable', 'index.js'),
    name: (props: { workspace: string; appName: string }) => props.appName + '-' + props.workspace + '-' + 'CopyTable',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'app',
    enabled: () => true,
    external: commonExternals,
  },
  'migrations/copyAllTables.ts': {
    input: path.resolve(__dirname, 'migrations', 'copyAllTables.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'migrations', 'copyAllTables', 'index.js'),
    name: (props: { workspace: string; appName: string }) =>
      props.appName + '-' + props.workspace + '-' + 'CopyAllTable',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'app',
    enabled: () => true,
    external: commonExternals,
  },
  'todoItem/delete.ts': {
    input: path.resolve(__dirname, 'todo', 'delete.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'todoDelete', 'index.js'),
    name: (props: { workspace: string; appName: string }) => props.appName + '-' + props.workspace + '-' + 'TodoDelete',
    retention: RetentionDays.ONE_WEEK,
    eventBased: true,
    batchingWindow: Duration.seconds(1),
    scope: 'app',
    enabled: () => true,
    external: commonExternals,
  },
  'userpool/postConfirmation.ts': {
    input: path.resolve(__dirname, 'userpool', 'postConfirmation.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'userpool', 'postConfirmation', 'index.js'),
    name: (props: { workspace: string; appName: string }) =>
      props.appName + '-' + props.workspace + '-' + 'UserPool' + '-' + 'PostConfirmation',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'app',
    enabled: () => true,
    external: commonExternals,
  },
  'userpool/preSignup.ts': {
    input: path.resolve(__dirname, 'userpool', 'preSignup.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'userpool', 'preSignup', 'index.js'),
    name: (props: { workspace: string; appName: string }) =>
      props.appName + '-' + props.workspace + '-' + 'UserPool' + '-' + 'PreSignup',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'app',
    enabled: () => true,
    external: commonExternals,
  },
  'userpool/rejectDownForMaintainence.ts': {
    input: path.resolve(__dirname, 'userpool', 'rejectDownForMaintainence.ts'),
    output: path.resolve(__dirname, '..', '..', 'lambda.out', 'userpool', 'rejectDownForMaintainence', 'index.js'),
    name: (props: { workspace: string; appName: string }) =>
      props.appName + '-' + props.workspace + '-' + 'UserPool' + '-' + 'RejectDownForMaintainence',
    retention: RetentionDays.ONE_YEAR,
    eventBased: false,
    batchingWindow: undefined,
    scope: 'userpool',
    enabled: (props: CommonConfiguration) => props.disableUserAccess,
    external: commonExternals,
  },
} as const;
