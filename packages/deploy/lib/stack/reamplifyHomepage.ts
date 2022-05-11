import * as cdk from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import { HomepagePipeline } from '../construct/homepagePipeline';
import { Construct } from 'constructs';
import { CommonConfiguration } from './reamplifyEnvironment';

export function mask(str: string) {
  return str.replace(/_/g, '0');
}

export interface PwProtect {
  passwordProtect?: { pw: string; user: string };
}
export interface HomepageDeployConfiguration {
  deploy: {
    enable: boolean;
    requiresApproval: boolean;
    branch: string;
    connectionArn: string;
    owner: string;
    repo: string;
  };
}
export interface HostedZoneConfiguration {
  hostedZone: { hostedZoneId: string; zoneName: string };
}

export interface HomepageCommonConfiguration {
  workspace: string;
  live: boolean;
  env: { region: string; account: string };
}

export class ReamplifyHomepage extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: PwProtect &
      CommonConfiguration &
      HomepageDeployConfiguration &
      HostedZoneConfiguration &
      HomepageCommonConfiguration
  ) {
    super(scope, id, props);
    Tags.of(this).add('stack', 'Homepage');
    new HomepagePipeline(this, 'HomepagePipeline', props);
  }
}
