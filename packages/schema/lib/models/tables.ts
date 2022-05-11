import type { TodoItemModel, UserModel } from './index';

import type { TableConfig } from '../tableConfig';

export type AnyModel = TodoItemModel | UserModel;
export const TodoItemTableConfig = {
  name: 'TodoItem',
  primaryKey: 'id',
  partitionKey: {
    name: 'id',
    type: 'string',
  },
  ownerIndex: 'todoItemByOwner',
  connections: {},
  ownerR: true,
  ownerRW: true,
  index: {
    todoItemByOwner: {
      name: 'todoItemByOwner',
      fields: ['owner'],
      partitionKey: 'owner',
      query: {
        name: 'todoItemByOwner',
        argument: 'owner',
      },
    },
  },
  primitives: {
    id: 'id',
    description: 'description',
    done: 'done',
    rank: 'rank',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    owner: 'owner',
  },
  primitiveTypes: {
    id: 'string',
    description: 'string',
    done: 'boolean',
    rank: 'string',
    createdAt: 'string',
    updatedAt: 'string',
    owner: 'string',
  },
  mandatory: {
    id: 'id',
    description: 'description',
    done: 'done',
    rank: 'rank',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  s3ObjectKeys: [],
  mutation: {
    create: 'createTodoItem',
    delete: 'deleteTodoItem',
    update: 'updateTodoItem',
  },
  query: {
    get: 'getTodoItem',
    list: 'listTodoItems',
  },
  subscription: {
    onCreate: 'onCreateTodoItem',
    onDelete: 'onDeleteTodoItem',
    onUpdate: 'onUpdateTodoItem',
  },
  fieldSet: 'id description done rank createdAt updatedAt owner',
  streamConfiguration: 'NEW_AND_OLD_IMAGES',
} as const;

export const UserTableConfig = {
  name: 'User',
  primaryKey: 'id',
  partitionKey: {
    name: 'id',
    type: 'string',
  },
  connections: {},
  ownerR: true,
  ownerRW: true,
  index: {
    userByEmail: {
      name: 'userByEmail',
      fields: ['email'],
      partitionKey: 'email',
      query: {
        name: 'userByEmail',
        argument: 'email',
      },
    },
  },
  primitives: {
    id: 'id',
    email: 'email',
    preferred_name: 'preferred_name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  primitiveTypes: {
    id: 'string',
    email: 'string',
    preferred_name: 'string',
    createdAt: 'string',
    updatedAt: 'string',
  },
  mandatory: {
    id: 'id',
    email: 'email',
    preferred_name: 'preferred_name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  s3ObjectKeys: [],
  mutation: {
    create: 'createUser',
    delete: 'deleteUser',
    update: 'updateUser',
  },
  query: {
    get: 'getUser',
    list: 'listUsers',
  },
  subscription: {
    onCreate: 'onCreateUser',
    onDelete: 'onDeleteUser',
    onUpdate: 'onUpdateUser',
  },
  fieldSet: 'id email preferred_name createdAt updatedAt',
  streamConfiguration: 'NEW_AND_OLD_IMAGES',
} as const;

export type AnyTable = TableConfig<TodoItemModel> | TableConfig<UserModel>;
export const tables: AnyTable[] = [
  <TableConfig<TodoItemModel>>TodoItemTableConfig,
  <TableConfig<UserModel>>UserTableConfig,
];

export const table = { TodoItem: TodoItemTableConfig, User: UserTableConfig } as const;
