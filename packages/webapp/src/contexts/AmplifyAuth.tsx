import type { FC, ReactNode } from 'react';
import React, { createContext, useContext } from 'react';
import PropTypes from 'prop-types';
import { useAmplifyAuthentication } from '../hooks/useAmplifyAuthentication';
import { AmplifyProvider, Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import LoadingScreen from '../components/LoadingScreen';
import { LoggedInLayout, SkeletonLayout } from '../components/Layout';

interface AuthGuardProps {
  children?: ReactNode;
}

interface AuthState {
  authenticated: boolean;
  user: { username: string; attributes: { email: string } } | undefined;
}
export interface AuthContext extends AuthState {
  signOut: () => Promise<void>;
  refreshState: () => Promise<any>;
}

export const AuthContext = createContext<AuthContext>({
  authenticated: false,
  user: undefined,
  refreshState: async () => {
    throw new Error('Not logged in');
  },
  signOut: async () => {},
});

const AmplifyAuth: FC<AuthGuardProps> = ({ children }) => {
  const ampAuth = useAmplifyAuthentication();

  const signOut = async () => {
    await ampAuth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        authenticated: ampAuth.isAuthenticated,
        user: ampAuth.user,
        refreshState: ampAuth.refreshState,
        signOut: signOut,
      }}
    >
      {ampAuth.isAuthenticated && ampAuth.user ? (
        children
      ) : (
        <SkeletonLayout>
          <AmplifyProvider>
            <Authenticator loginMechanisms={['email']} signUpAttributes={['email', 'preferred_username']}>
              {() => <LoadingScreen />}
            </Authenticator>
          </AmplifyProvider>
        </SkeletonLayout>
      )}
    </AuthContext.Provider>
  );
};

AmplifyAuth.propTypes = {
  children: PropTypes.node,
};

export default AmplifyAuth;

export const useAuth = () => useContext(AuthContext);
