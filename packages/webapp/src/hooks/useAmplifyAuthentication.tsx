import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { Auth, CognitoUser } from '@aws-amplify/auth';

import { Hub } from '@aws-amplify/core';
import { CognitoHostedUIIdentityProvider } from '@aws-amplify/auth';

export const useAmplifyAuthentication = () => {
  const [user, setUser] = useState<{ username: string; attributes: { email: string } } | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshState = useCallback(
    () =>
      new Promise<CognitoUser>((resolve, reject) => {
        setIsLoading(true);

        Auth.currentAuthenticatedUser({ bypassCache: true })
          .then(async (user: CognitoUser) => {
            setIsAuthenticated(_isAuthenticated(user));
            if ((user as any)?.refreshSessionIfPossible) {
              await (user as any).refreshSessionIfPossible();
            }
            setError(null);
            setIsLoading(false);
            return Auth.currentUserInfo();
          })
          .then((user) => {
            setUser(user);
            resolve(user);
          })
          .catch((err) => {
            setUser(undefined);
            setIsAuthenticated(false);
            if (err === 'not authenticated') {
              setError(null);
            } else {
              setError(err);
            }
            setIsLoading(false);
            reject();
          });
      }),
    []
  );

  // Make sure our state is loaded before first render
  useLayoutEffect(() => {
    refreshState().catch(console.error);
  }, [refreshState]);

  // Subscribe to auth events
  useEffect(() => {
    const handler = ({ payload }: { payload: { event: string } }) => {
      switch (payload.event) {
        case 'configured':
        case 'signIn':
        case 'signIn_failure':
        case 'signOut':
          refreshState();
          break;

        default:
          break;
      }
    };

    Hub.listen('auth', handler);

    return () => {
      Hub.remove('auth', handler);
    };
  }, [refreshState]);

  const signIn = useCallback(() => {
    Auth.federatedSignIn({ provider: CognitoHostedUIIdentityProvider.Cognito }).catch((err) => {
      setError(err);
    });
  }, []);

  const signOut = useCallback(() => {
    return Auth.signOut()
      .then(() => refreshState())
      .catch((err: any) => {
        setError(err);
      });
  }, [refreshState]);

  return {
    isAuthenticated,
    isLoading,
    user,
    error,
    signIn,
    signOut,
    refreshState,
  };
};

const _isAuthenticated = (user: any) => {
  if (
    !user ||
    !user.signInUserSession ||
    !user.signInUserSession.isValid ||
    !user.signInUserSession.accessToken ||
    !user.signInUserSession.accessToken.getExpiration
  ) {
    return false;
  }

  const session = user.signInUserSession;
  const isValid = session.isValid() || false;

  const sessionExpiry = new Date(session.accessToken.getExpiration() * 1000);
  const isExpired = new Date() > sessionExpiry;

  return isValid && !isExpired;
};
