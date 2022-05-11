export type Maybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  AWSDateTime: string;
  AWSDate: string;
  AWSTime: string;
  AWSTimestamp: number;
  AWSEmail: string;
  AWSURL: string;
};

export type AuthProvider = 'apiKey' | 'iam' | 'oidc' | 'userPools' | 'function';

export type AuthRule = {
  allow: AuthStrategy;
  provider?: Maybe<AuthProvider>;
  identityClaim?: Maybe<Scalars['String']>;
  groupClaim?: Maybe<Scalars['String']>;
  ownerField?: Maybe<Scalars['String']>;
  groupsField?: Maybe<Scalars['String']>;
  groups?: Maybe<Array<Maybe<Scalars['String']>>>;
  operations?: Maybe<Array<Maybe<ModelOperation>>>;
};

export type AuthStrategy = 'owner' | 'groups' | 'private' | 'public' | 'custom';

export type CreateTodoItemInput = {
  id?: Maybe<Scalars['ID']>;
  description: Scalars['String'];
  done: Scalars['Boolean'];
  rank: Scalars['String'];
  createdAt?: Maybe<Scalars['AWSDateTime']>;
  updatedAt?: Maybe<Scalars['AWSDateTime']>;
  owner?: Maybe<Scalars['ID']>;
};

export type CreateUserInput = {
  id?: Maybe<Scalars['ID']>;
  email: Scalars['String'];
  preferred_name: Scalars['String'];
  createdAt?: Maybe<Scalars['AWSDateTime']>;
  updatedAt?: Maybe<Scalars['AWSDateTime']>;
};

export type DeleteTodoItemInput = {
  id: Scalars['ID'];
};

export type DeleteUserInput = {
  id: Scalars['ID'];
};

export type ModelAttributeTypes =
  | 'binary'
  | 'binarySet'
  | 'bool'
  | 'list'
  | 'map'
  | 'number'
  | 'numberSet'
  | 'string'
  | 'stringSet'
  | '_null';

export type ModelBooleanInput = {
  ne?: Maybe<Scalars['Boolean']>;
  eq?: Maybe<Scalars['Boolean']>;
  attributeExists?: Maybe<Scalars['Boolean']>;
  attributeType?: Maybe<ModelAttributeTypes>;
};

export type ModelFloatInput = {
  ne?: Maybe<Scalars['Float']>;
  eq?: Maybe<Scalars['Float']>;
  le?: Maybe<Scalars['Float']>;
  lt?: Maybe<Scalars['Float']>;
  ge?: Maybe<Scalars['Float']>;
  gt?: Maybe<Scalars['Float']>;
  between?: Maybe<Array<Maybe<Scalars['Float']>>>;
  attributeExists?: Maybe<Scalars['Boolean']>;
  attributeType?: Maybe<ModelAttributeTypes>;
};

export type ModelIdInput = {
  ne?: Maybe<Scalars['ID']>;
  eq?: Maybe<Scalars['ID']>;
  le?: Maybe<Scalars['ID']>;
  lt?: Maybe<Scalars['ID']>;
  ge?: Maybe<Scalars['ID']>;
  gt?: Maybe<Scalars['ID']>;
  contains?: Maybe<Scalars['ID']>;
  notContains?: Maybe<Scalars['ID']>;
  between?: Maybe<Array<Maybe<Scalars['ID']>>>;
  beginsWith?: Maybe<Scalars['ID']>;
  attributeExists?: Maybe<Scalars['Boolean']>;
  attributeType?: Maybe<ModelAttributeTypes>;
  size?: Maybe<ModelSizeInput>;
};

export type ModelIntInput = {
  ne?: Maybe<Scalars['Int']>;
  eq?: Maybe<Scalars['Int']>;
  le?: Maybe<Scalars['Int']>;
  lt?: Maybe<Scalars['Int']>;
  ge?: Maybe<Scalars['Int']>;
  gt?: Maybe<Scalars['Int']>;
  between?: Maybe<Array<Maybe<Scalars['Int']>>>;
  attributeExists?: Maybe<Scalars['Boolean']>;
  attributeType?: Maybe<ModelAttributeTypes>;
};

export type ModelMutationMap = {
  create?: Maybe<Scalars['String']>;
  update?: Maybe<Scalars['String']>;
  delete?: Maybe<Scalars['String']>;
};

export type ModelOperation = 'create' | 'update' | 'delete' | 'read';

export type ModelQueryMap = {
  get?: Maybe<Scalars['String']>;
  list?: Maybe<Scalars['String']>;
};

export type ModelSizeInput = {
  ne?: Maybe<Scalars['Int']>;
  eq?: Maybe<Scalars['Int']>;
  le?: Maybe<Scalars['Int']>;
  lt?: Maybe<Scalars['Int']>;
  ge?: Maybe<Scalars['Int']>;
  gt?: Maybe<Scalars['Int']>;
  between?: Maybe<Array<Maybe<Scalars['Int']>>>;
};

export type ModelSortDirection = 'ASC' | 'DESC';

export type ModelStringInput = {
  ne?: Maybe<Scalars['String']>;
  eq?: Maybe<Scalars['String']>;
  le?: Maybe<Scalars['String']>;
  lt?: Maybe<Scalars['String']>;
  ge?: Maybe<Scalars['String']>;
  gt?: Maybe<Scalars['String']>;
  contains?: Maybe<Scalars['String']>;
  notContains?: Maybe<Scalars['String']>;
  between?: Maybe<Array<Maybe<Scalars['String']>>>;
  beginsWith?: Maybe<Scalars['String']>;
  attributeExists?: Maybe<Scalars['Boolean']>;
  attributeType?: Maybe<ModelAttributeTypes>;
  size?: Maybe<ModelSizeInput>;
};

export type ModelSubscriptionLevel = 'off' | 'public' | 'on';

export type ModelSubscriptionMap = {
  onCreate?: Maybe<Array<Maybe<Scalars['String']>>>;
  onUpdate?: Maybe<Array<Maybe<Scalars['String']>>>;
  onDelete?: Maybe<Array<Maybe<Scalars['String']>>>;
  level?: Maybe<ModelSubscriptionLevel>;
};

export type ModelTodoItemConditionInput = {
  description?: Maybe<ModelStringInput>;
  done?: Maybe<ModelBooleanInput>;
  rank?: Maybe<ModelStringInput>;
  createdAt?: Maybe<ModelStringInput>;
  updatedAt?: Maybe<ModelStringInput>;
  owner?: Maybe<ModelIdInput>;
  and?: Maybe<Array<Maybe<ModelTodoItemConditionInput>>>;
  or?: Maybe<Array<Maybe<ModelTodoItemConditionInput>>>;
  not?: Maybe<ModelTodoItemConditionInput>;
};

export type ModelTodoItemConnection = {
  __typename?: 'ModelTodoItemConnection';
  items: Array<Maybe<TodoItem>>;
  nextToken?: Maybe<Scalars['String']>;
};

export type ModelTodoItemFilterInput = {
  id?: Maybe<ModelIdInput>;
  description?: Maybe<ModelStringInput>;
  done?: Maybe<ModelBooleanInput>;
  rank?: Maybe<ModelStringInput>;
  createdAt?: Maybe<ModelStringInput>;
  updatedAt?: Maybe<ModelStringInput>;
  owner?: Maybe<ModelIdInput>;
  and?: Maybe<Array<Maybe<ModelTodoItemFilterInput>>>;
  or?: Maybe<Array<Maybe<ModelTodoItemFilterInput>>>;
  not?: Maybe<ModelTodoItemFilterInput>;
};

export type ModelUserConditionInput = {
  email?: Maybe<ModelStringInput>;
  preferred_name?: Maybe<ModelStringInput>;
  createdAt?: Maybe<ModelStringInput>;
  updatedAt?: Maybe<ModelStringInput>;
  and?: Maybe<Array<Maybe<ModelUserConditionInput>>>;
  or?: Maybe<Array<Maybe<ModelUserConditionInput>>>;
  not?: Maybe<ModelUserConditionInput>;
};

export type ModelUserConnection = {
  __typename?: 'ModelUserConnection';
  items: Array<Maybe<User>>;
  nextToken?: Maybe<Scalars['String']>;
};

export type ModelUserFilterInput = {
  id?: Maybe<ModelIdInput>;
  email?: Maybe<ModelStringInput>;
  preferred_name?: Maybe<ModelStringInput>;
  createdAt?: Maybe<ModelStringInput>;
  updatedAt?: Maybe<ModelStringInput>;
  and?: Maybe<Array<Maybe<ModelUserFilterInput>>>;
  or?: Maybe<Array<Maybe<ModelUserFilterInput>>>;
  not?: Maybe<ModelUserFilterInput>;
};

export type Mutation = {
  __typename?: 'Mutation';
  deleteItem?: Maybe<TodoItem>;
  createUser?: Maybe<User>;
  updateUser?: Maybe<User>;
  deleteUser?: Maybe<User>;
  createTodoItem?: Maybe<TodoItem>;
  updateTodoItem?: Maybe<TodoItem>;
  deleteTodoItem?: Maybe<TodoItem>;
};

export type MutationDeleteItemArgs = {
  todoItemID: Scalars['ID'];
};

export type MutationCreateUserArgs = {
  input: CreateUserInput;
  condition?: Maybe<ModelUserConditionInput>;
};

export type MutationUpdateUserArgs = {
  input: UpdateUserInput;
  condition?: Maybe<ModelUserConditionInput>;
};

export type MutationDeleteUserArgs = {
  input: DeleteUserInput;
  condition?: Maybe<ModelUserConditionInput>;
};

export type MutationCreateTodoItemArgs = {
  input: CreateTodoItemInput;
  condition?: Maybe<ModelTodoItemConditionInput>;
};

export type MutationUpdateTodoItemArgs = {
  input: UpdateTodoItemInput;
  condition?: Maybe<ModelTodoItemConditionInput>;
};

export type MutationDeleteTodoItemArgs = {
  input: DeleteTodoItemInput;
  condition?: Maybe<ModelTodoItemConditionInput>;
};

export type Query = {
  __typename?: 'Query';
  getUser?: Maybe<User>;
  listUsers?: Maybe<ModelUserConnection>;
  userByEmail?: Maybe<ModelUserConnection>;
  getTodoItem?: Maybe<TodoItem>;
  listTodoItems?: Maybe<ModelTodoItemConnection>;
  todoItemByOwner?: Maybe<ModelTodoItemConnection>;
};

export type QueryGetUserArgs = {
  id: Scalars['ID'];
};

export type QueryListUsersArgs = {
  id?: Maybe<Scalars['ID']>;
  filter?: Maybe<ModelUserFilterInput>;
  limit?: Maybe<Scalars['Int']>;
  nextToken?: Maybe<Scalars['String']>;
  sortDirection?: Maybe<ModelSortDirection>;
};

export type QueryUserByEmailArgs = {
  email: Scalars['String'];
  sortDirection?: Maybe<ModelSortDirection>;
  filter?: Maybe<ModelUserFilterInput>;
  limit?: Maybe<Scalars['Int']>;
  nextToken?: Maybe<Scalars['String']>;
};

export type QueryGetTodoItemArgs = {
  id: Scalars['ID'];
};

export type QueryListTodoItemsArgs = {
  id?: Maybe<Scalars['ID']>;
  filter?: Maybe<ModelTodoItemFilterInput>;
  limit?: Maybe<Scalars['Int']>;
  nextToken?: Maybe<Scalars['String']>;
  sortDirection?: Maybe<ModelSortDirection>;
};

export type QueryTodoItemByOwnerArgs = {
  owner: Scalars['ID'];
  sortDirection?: Maybe<ModelSortDirection>;
  filter?: Maybe<ModelTodoItemFilterInput>;
  limit?: Maybe<Scalars['Int']>;
  nextToken?: Maybe<Scalars['String']>;
};

export type Subscription = {
  __typename?: 'Subscription';
  onCreateUser?: Maybe<User>;
  onUpdateUser?: Maybe<User>;
  onDeleteUser?: Maybe<User>;
  onCreateTodoItem?: Maybe<TodoItem>;
  onUpdateTodoItem?: Maybe<TodoItem>;
  onDeleteTodoItem?: Maybe<TodoItem>;
};

export type SubscriptionOnCreateUserArgs = {
  id?: Maybe<Scalars['String']>;
};

export type SubscriptionOnUpdateUserArgs = {
  id?: Maybe<Scalars['String']>;
};

export type SubscriptionOnDeleteUserArgs = {
  id?: Maybe<Scalars['String']>;
};

export type SubscriptionOnCreateTodoItemArgs = {
  owner?: Maybe<Scalars['String']>;
};

export type SubscriptionOnUpdateTodoItemArgs = {
  owner?: Maybe<Scalars['String']>;
};

export type SubscriptionOnDeleteTodoItemArgs = {
  owner?: Maybe<Scalars['String']>;
};

export type TimestampConfiguration = {
  createdAt?: Maybe<Scalars['String']>;
  updatedAt?: Maybe<Scalars['String']>;
};

export type TodoItem = {
  __typename?: 'TodoItem';
  id: Scalars['ID'];
  description: Scalars['String'];
  done: Scalars['Boolean'];
  rank: Scalars['String'];
  createdAt: Scalars['AWSDateTime'];
  updatedAt: Scalars['AWSDateTime'];
  owner?: Maybe<Scalars['ID']>;
};

export type UpdateTodoItemInput = {
  id: Scalars['ID'];
  description?: Maybe<Scalars['String']>;
  done?: Maybe<Scalars['Boolean']>;
  rank?: Maybe<Scalars['String']>;
  createdAt?: Maybe<Scalars['AWSDateTime']>;
  updatedAt?: Maybe<Scalars['AWSDateTime']>;
  owner?: Maybe<Scalars['ID']>;
};

export type UpdateUserInput = {
  id: Scalars['ID'];
  email?: Maybe<Scalars['String']>;
  preferred_name?: Maybe<Scalars['String']>;
  createdAt?: Maybe<Scalars['AWSDateTime']>;
  updatedAt?: Maybe<Scalars['AWSDateTime']>;
};

export type User = {
  __typename?: 'User';
  id: Scalars['ID'];
  email: Scalars['String'];
  preferred_name: Scalars['String'];
  createdAt: Scalars['AWSDateTime'];
  updatedAt: Scalars['AWSDateTime'];
};
