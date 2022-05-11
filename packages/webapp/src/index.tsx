import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AmplifyAuth from './contexts/AmplifyAuth';
import { AppSyncAuthApolloProvider } from './contexts/Apollo';
import './amplify';
import { ApolloLiveQueryBridge } from './hooks/useApolloStore';
import { LoggedInLayout } from './components/Layout';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <AmplifyAuth>
      <AppSyncAuthApolloProvider>
        <ApolloLiveQueryBridge>
          <LoggedInLayout>
            <App />
          </LoggedInLayout>
        </ApolloLiveQueryBridge>
      </AppSyncAuthApolloProvider>
    </AmplifyAuth>
  </React.StrictMode>
);
