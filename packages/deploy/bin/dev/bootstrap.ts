import { devEnvProps } from '../environments';
import { App } from 'aws-cdk-lib';
import { ReamplifyChatOps } from '../../lib/stack/reamplifyChatOps';
import { UserPoolStack } from '../../lib/stack/reamplifyUserPool';
import { UserS3DataStack } from '../../lib/stack/userS3DataStack';
import { ReamplifyGlobalStaticFrontend } from '../../lib/stack/reamplifyGlobalStaticFrontend';

export const app = new App();

new ReamplifyChatOps(app, devEnvProps.appName + '-' + devEnvProps.workspace + '-ChatOps', {
  workspace: devEnvProps.workspace,
  slack: {
    slackChannelId: 'C03E000NR1V',
    slackWorkspaceId: 'T02U2REPY5Q',
    slackChannelConfigurationName: 'dev-reamplify-chatops',
  },
  stackName: devEnvProps.appName + '-' + devEnvProps.workspace + '-ChatOps',
  appName: devEnvProps.appName,
  env: devEnvProps.env,
});

const userS3Data = new UserS3DataStack(app, devEnvProps.appName + '-' + devEnvProps.workspace + `-UserS3Data`, {
  ...devEnvProps,
  stackName: devEnvProps.appName + '-' + devEnvProps.workspace + `-UserS3Data`,
});

new ReamplifyGlobalStaticFrontend(app, devEnvProps.appName + '-' + devEnvProps.workspace + '-FrontendStaticSite', {
  ...devEnvProps,
  stackName: devEnvProps.appName + '-' + devEnvProps.workspace + '-FrontendStaticSite',
  siteDomain: devEnvProps.hostedZone.zoneName,
  live: devEnvProps.live,
  addWWW: false,
  appRegion: devEnvProps.env.region,
  env: {
    region: 'us-east-1',
    account: devEnvProps.env.account,
  },
});

new UserPoolStack(app, devEnvProps.appName + '-' + devEnvProps.workspace + '-UserPool', {
  ...devEnvProps,
  assets: userS3Data,
  stackName: devEnvProps.appName + '-' + devEnvProps.workspace + '-UserPool',
});
