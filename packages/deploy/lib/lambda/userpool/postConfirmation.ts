import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { createUser, deleteUser } from '@reamplify/schema/lib/graphql/mutations';
import {
  CreateUserInput,
  DeleteUserInput,
  MutationCreateUserArgs,
  QueryUserByEmailArgs,
} from '@reamplify/schema/lib/types';
import {
  createUserResponseKey,
  deleteUserResponseKey,
  userByEmailResponseKey,
} from '@reamplify/schema/lib/graphql/tags';
import { api } from '../gql';
import { UserModel } from '@reamplify/schema/lib/models';
import { userByEmail } from '@reamplify/schema/lib/graphql/queries';
import { migrateOwners } from '../migrations/migrateOwners';
import { nilToDeleted, omitDefaultKeys } from '@reamplify/schema/lib/typeUtils';
import AWS from 'aws-sdk';
import logger from '../logger';

export const handler: PostConfirmationTriggerHandler = async (event) =>
  await logger.catchFatal(async () => {
    console.log('PostConfirmation event=', JSON.stringify(event));
    const cognito = new AWS.CognitoIdentityServiceProvider();

    const email = event.request.userAttributes.email;
    if (!email) {
      return event;
    }
    const userPoolId = event.userPoolId;
    const maybeUser = await api<UserModel[], QueryUserByEmailArgs>({
      query: userByEmail,
      variables: { email: email },
      key: userByEmailResponseKey,
      verbose: true,
    });
    if (!maybeUser || maybeUser.length === 0) {
      const createUserInput: CreateUserInput = {
        id: event.userName,
        email,
        preferred_name: event.request.userAttributes.preferred_username,
      };
      const createUserResp = await api<UserModel, MutationCreateUserArgs>({
        mutation: createUser,
        variables: { input: createUserInput },
        key: createUserResponseKey,
        verbose: true,
      });
      if (!createUserResp) {
        throw new Error(`createUser didn't respond with user: ${createUserResp}`);
      }
    } else if (maybeUser.length === 1 && maybeUser[0].id !== event.userName) {
      const { Users } = await cognito
        .listUsers({
          UserPoolId: userPoolId,
          AttributesToGet: ['email'],
          Filter: `email = "${email}"`,
        })
        .promise();
      if (Number(Users?.length) > 1) {
        throw new Error(`User already exists. Please login to existing user`);
      }
      const user = maybeUser[0]!;

      const createUserInput: CreateUserInput = {
        ...nilToDeleted(omitDefaultKeys(user)),
        email: email,
        id: event.userName,
        preferred_name: event.request.userAttributes.preferred_username,
      };
      await api<UserModel, { input: CreateUserInput }>({
        mutation: createUser,
        variables: { input: createUserInput },
        key: createUserResponseKey,
        verbose: true,
      });
      await migrateOwners({ oldOwner: user.id, newOwner: event.userName });
      await api<UserModel, { input: DeleteUserInput }>({
        mutation: deleteUser,
        variables: { input: { id: user.id } },
        key: deleteUserResponseKey,
        verbose: true,
      });
    } else if (maybeUser.length === 1 && maybeUser[0].id === event.userName) {
      return;
    } else if (maybeUser.length > 1) {
      throw new Error(
        `ConstraintError: more than one (n=${maybeUser.length}) users detected for email=${email}. Contact support`
      );
    }
    return event;
  });
