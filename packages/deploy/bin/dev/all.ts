import { createReamplifyEnvironment } from '../../lib/app/reamplify';
import { devEnvProps } from '../environments';
import { App } from 'aws-cdk-lib';

export const app = new App();

createReamplifyEnvironment(app, {
  ...devEnvProps,
});
