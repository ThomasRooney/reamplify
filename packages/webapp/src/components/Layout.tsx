import type { CognitoUser } from '@aws-amplify/auth';
import React from 'react';
import styled from 'styled-components';
import { useApolloStoreWithId } from '../hooks/useApolloStore';
import { UserTableConfig } from '@reamplify/schema/lib/models/tables';
import { UserModel } from '@reamplify/schema/lib/models';
import { useAuth } from '../contexts/AmplifyAuth';

const CentralBox = styled.div`
  display: flex;
  min-height: 100vh;
  overflow: hidden;
  justify-content: center;
  align-items: center;
  width: 100%;
`;

const TopBox = styled.div`
  display: flex;
  min-height: 100vh;
  overflow: hidden;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
`;

const RootApp = styled.div`
  display: flex;
  justify-content: center;
  min-width: 230px;
  max-width: 550px;
  margin: 0 auto;
`;
const Box = styled.div`
  display: flex;
`;
const CenteredBox = styled.div`
  display: flex;
  align-items: center;
`;

const TopBar = styled.div`
  display: flex;
  background-color: aliceblue;
  justify-content: space-between;
  box-shadow: 0px 2px 5px 1px rgb(0 0 0 / 30%);
`;

const Name = styled.span`
  padding: 1rem;
  display: flex;
  background-color: aliceblue;
`;

const Title = styled.h2`
  display: flex;
  font-family: monospace;
  padding: 1rem;
  margin: 0;
  background-color: aliceblue;
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: fit-content;
`;

export function SkeletonLayout(props: { children: React.ReactNode }) {
  return (
    <CentralBox>
      <Box>{props.children}</Box>
    </CentralBox>
  );
}

export function LoggedInLayout(props: { children: React.ReactNode }) {
  const auth = useAuth();
  const user = useApolloStoreWithId<UserModel>(UserTableConfig, auth.user?.username);

  return (
    <>
      <TopBar>
        <Title>Reamplify Demo</Title>
        <Box>
          <Name>{user.item?.preferred_name}</Name>
          <CenteredBox>
            <LogoutButton onClick={auth.signOut}>Logout</LogoutButton>
          </CenteredBox>
        </Box>
      </TopBar>
      <RootApp>{props.children}</RootApp>
    </>
  );
}
