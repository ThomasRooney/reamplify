import Amplify, { Hub } from '@aws-amplify/core';
import { Auth } from '@aws-amplify/auth';

import * as config from './env';

if (process.env.NODE_ENV === 'development') {
  Amplify.Logger.LOG_LEVEL = 'DEBUG';

  Hub.listen(/.*/, ({ channel, payload }) => console.debug(`[hub::${channel}::${payload.event}]`, payload));
}

Amplify.configure({
  ...config,
  API: {
    graphql_headers: async () => {
      const session = await Auth.currentSession();
      return {
        Authorization: session.getIdToken().getJwtToken(),
      };
    },
  },
});
