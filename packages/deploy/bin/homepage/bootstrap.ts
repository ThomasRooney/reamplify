import { prodHomepage } from '../environments';
import { App } from 'aws-cdk-lib';
import { ReamplifyChatOps } from '../../lib/stack/reamplifyChatOps';
import { ReamplifyGlobalStaticFrontend } from '../../lib/stack/reamplifyGlobalStaticFrontend';

export const app = new App();

new ReamplifyChatOps(app, prodHomepage.appName + '-' + prodHomepage.workspace + '-ChatOps', {
  workspace: prodHomepage.workspace,
  slack: {
    slackChannelId: 'C03E000NR1V',
    slackWorkspaceId: 'T02U2REPY5Q',
    slackChannelConfigurationName: 'dev-reamplify-chatops',
  },
  stackName: prodHomepage.appName + '-' + prodHomepage.workspace + '-ChatOps',
  appName: prodHomepage.appName,
  env: prodHomepage.env,
});

new ReamplifyGlobalStaticFrontend(app, prodHomepage.appName + '-' + prodHomepage.workspace + '-FrontendStaticSite', {
  ...prodHomepage,
  stackName: prodHomepage.appName + '-' + prodHomepage.workspace + '-FrontendStaticSite',
  siteDomain: prodHomepage.hostedZone.zoneName,
  live: prodHomepage.live,
  addWWW: prodHomepage.live,
  appRegion: prodHomepage.env.region,
  env: {
    region: 'us-east-1',
    account: prodHomepage.env.account,
  },
});
