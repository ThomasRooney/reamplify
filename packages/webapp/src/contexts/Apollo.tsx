import React, { ReactNode, useEffect, useState } from 'react';
import { aws_appsync_graphqlEndpoint, aws_appsync_region } from '../env';
import { ApolloClient, ApolloLink, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import { AUTH_TYPE, AuthOptions, createAuthLink } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import ApolloLinkTimeout from 'apollo-link-timeout';
import { Auth } from '@aws-amplify/auth';
const url = aws_appsync_graphqlEndpoint;
const region = aws_appsync_region;
const httpLink: ApolloLink = createHttpLink({ uri: url, fetch: fetch as any });

export function AppSyncAuthApolloProvider(props: { children: ReactNode }) {
  const [apolloClient, setApolloClient] = useState<ApolloClient<unknown> | undefined>(undefined);

  useEffect(() => {
    const authOptions: AuthOptions = {
      type: AUTH_TYPE.AMAZON_COGNITO_USER_POOLS,
      jwtToken: async () => {
        const session = await Auth.currentSession();
        return session.getIdToken().getJwtToken();
      },
    };
    const subscriptionLink: ApolloLink = createSubscriptionHandshakeLink({ url, region, auth: authOptions }, httpLink);
    const link = ApolloLink.from([
      new ApolloLinkTimeout(20000),
      createAuthLink({
        url,
        region,
        auth: authOptions,
      }),
      subscriptionLink,
    ]);

    const appsyncClient = new ApolloClient({
      link,
      cache: new InMemoryCache({ resultCaching: true, addTypename: true }),
    });

    setApolloClient(appsyncClient);
  }, []);
  if (!apolloClient) {
    return null;
  }

  return <ApolloProvider client={apolloClient}>{props.children}</ApolloProvider>;
}
