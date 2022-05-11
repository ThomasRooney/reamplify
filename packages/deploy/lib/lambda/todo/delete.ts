import { getUser } from '@reamplify/schema/lib/graphql/queries';
import { deleteTodoItemResponseKey, getUserResponseKey } from '@reamplify/schema/lib/graphql/tags';
import { UserModel, TodoItemModel } from '@reamplify/schema/lib/models';
import {
  Mutation,
  MutationDeleteItemArgs,
  MutationDeleteTodoItemArgs,
  QueryGetUserArgs,
} from '@reamplify/schema/lib/types';
import { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { apiAssert } from '../gql';
import logger from '../logger';
import { assertEnv } from '../env';
import AWS from 'aws-sdk';
import { TodoItemTableConfig } from '@reamplify/schema/lib/models/tables';
import { deleteTodoItem } from '@reamplify/schema/lib/graphql/mutations';

const dynamodb = new AWS.DynamoDB.DocumentClient();
const tableSuffix = assertEnv('table_suffix');

export const handler: AppSyncResolverHandler<MutationDeleteItemArgs, Mutation['deleteItem']> = async (event, context) =>
  logger.catchFatal<TodoItemModel>(async (): Promise<TodoItemModel> => {
    logger.log('TodoItemDelete event=', JSON.stringify(event));

    const username: string | undefined = (event.identity as AppSyncIdentityCognito)?.username;
    if (!username) {
      throw new Error(`unexpected identity ${event.identity}: expected username attribute`);
    }

    const { todoItemID } = event.arguments;

    if (!todoItemID) {
      throw new Error(`missing argument todoItemID`);
    }

    // Example 1: Using graphQL in lambda
    const user = await apiAssert<UserModel, QueryGetUserArgs>({
      query: getUser,
      key: getUserResponseKey,
      variables: {
        id: username,
      },
    });

    // Example 2: Using DynamoDB in lambda
    const existingRecord = await dynamodb
      .get({ TableName: TodoItemTableConfig.name + tableSuffix, Key: { id: todoItemID } })
      .promise();

    const subject = existingRecord.Item as TodoItemModel | undefined;

    if (!subject) {
      throw new Error(`subject ${todoItemID} not found`);
    }

    if (subject.owner !== user.id) {
      throw new Error('unauthorized');
    }

    // Example 3: Update DynamoDB with GraphQL in a lambda
    return await apiAssert<TodoItemModel, MutationDeleteTodoItemArgs>({
      query: deleteTodoItem,
      key: deleteTodoItemResponseKey,
      variables: {
        input: {
          id: todoItemID,
        },
      },
    });
  });
