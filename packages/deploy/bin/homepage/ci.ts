import { App } from 'aws-cdk-lib';

import { ReamplifyHomepage } from '../../lib/stack/reamplifyHomepage';
import { prodHomepage } from '../environments';
export const app = new App();

new ReamplifyHomepage(app, prodHomepage.appName + '-' + prodHomepage.workspace + '-Homepage', prodHomepage);
