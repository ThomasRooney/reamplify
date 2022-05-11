import { CDKPipelineStack } from '../../lib/stack/cdkPipelineStack';
import { devEnvProps } from '../environments';
import { App } from 'aws-cdk-lib';

export const app = new App();

new CDKPipelineStack(app, devEnvProps.appName + '-' + devEnvProps.workspace + '-Pipeline', {
  ...devEnvProps,
});
