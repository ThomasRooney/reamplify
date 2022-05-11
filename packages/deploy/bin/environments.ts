import { RemovalPolicy } from 'aws-cdk-lib';
import type { CDKPipelineStackProps } from '../lib/stack/cdkPipelineStack';
import '../lib/construct/customResourceProviderPatch';

export const devEnvProps: CDKPipelineStackProps = {
  hostedZone: {
    hostedZoneId: 'Z032381829H0CHJU1UB3B',
    zoneName: 'dev.reamplify.io',
  },
  appName: 'reamplify',
  live: true,
  sso: {
    domain: 'CUSTOM',
  },
  // uncomment to add HTTP basic auth: it's recommended to add something like this on non-prod environments
  // passwordProtect: {
  //   user: 'reamplify',
  //   pw: 'dev',
  // },
  disableUserAccess: false,
  includeEventLambdas: true,
  workspace: 'dev',
  env: {
    region: 'eu-west-2',
    account: '805337131662',
  },
  stateAssetRemovalPolicy: RemovalPolicy.DESTROY,
  deploy: {
    owner: 'ThomasRooney',
    connectionArn:
      'arn:aws:codestar-connections:eu-west-1:805337131662:connection/639a94a0-b8c8-4fbc-96f9-19e53d5f75c8',
    repo: 'reamplify',
    branch: 'master',
    requiresApproval: true,
    enable: true,
  },
} as const;

export const prodHomepage = {
  workspace: 'homepage',
  live: true,
  appName: 'reamplify',
  disableUserAccess: false,
  includeEventLambdas: true,
  stateAssetRemovalPolicy: RemovalPolicy.DESTROY,
  hostedZone: {
    hostedZoneId: 'Z0578516JV9U8ZHDBK18',
    zoneName: 'reamplify.io',
  },
  deploy: {
    owner: 'ThomasRooney',
    connectionArn:
      'arn:aws:codestar-connections:eu-west-2:805615297525:connection/288fbcd0-10f4-4ee8-a490-a9c692fe61c8',
    repo: 'reamplify',
    branch: 'master',
    requiresApproval: true,
    enable: true,
  },
  env: {
    region: 'eu-west-2',
    account: '805615297525',
  },
} as const;

export const environments = {
  dev: devEnvProps,
};
