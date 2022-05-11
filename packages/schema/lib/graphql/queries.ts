/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getUser = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const listUsers = /* GraphQL */ `
  query ListUsers(
    $id: ID
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listUsers(
      id: $id
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        id
        email
        preferred_name
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;
export const userByEmail = /* GraphQL */ `
  query UserByEmail(
    $email: String!
    $sortDirection: ModelSortDirection
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
  ) {
    userByEmail(
      email: $email
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        email
        preferred_name
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;
export const getTodoItem = /* GraphQL */ `
  query GetTodoItem($id: ID!) {
    getTodoItem(id: $id) {
      id
      description
      done
      rank
      createdAt
      updatedAt
      owner
    }
  }
`;
export const listTodoItems = /* GraphQL */ `
  query ListTodoItems(
    $id: ID
    $filter: ModelTodoItemFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listTodoItems(
      id: $id
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        id
        description
        done
        rank
        createdAt
        updatedAt
        owner
      }
      nextToken
    }
  }
`;
export const todoItemByOwner = /* GraphQL */ `
  query TodoItemByOwner(
    $owner: ID!
    $sortDirection: ModelSortDirection
    $filter: ModelTodoItemFilterInput
    $limit: Int
    $nextToken: String
  ) {
    todoItemByOwner(
      owner: $owner
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        description
        done
        rank
        createdAt
        updatedAt
        owner
      }
      nextToken
    }
  }
`;
export const shallowGetUser = /* GraphQL */ `
  query ShallowGetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowListUsers = /* GraphQL */ `
  query ShallowListUsers(
    $id: ID
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listUsers(
      id: $id
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        id
        email
        preferred_name
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;
export const shallowUserByEmail = /* GraphQL */ `
  query ShallowUserByEmail(
    $email: String!
    $sortDirection: ModelSortDirection
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
  ) {
    userByEmail(
      email: $email
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        email
        preferred_name
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;
export const shallowGetTodoItem = /* GraphQL */ `
  query ShallowGetTodoItem($id: ID!) {
    getTodoItem(id: $id) {
      id
      description
      done
      rank
      createdAt
      updatedAt
      owner
    }
  }
`;
export const shallowListTodoItems = /* GraphQL */ `
  query ShallowListTodoItems(
    $id: ID
    $filter: ModelTodoItemFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listTodoItems(
      id: $id
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
        id
        description
        done
        rank
        createdAt
        updatedAt
        owner
      }
      nextToken
    }
  }
`;
export const shallowTodoItemByOwner = /* GraphQL */ `
  query ShallowTodoItemByOwner(
    $owner: ID!
    $sortDirection: ModelSortDirection
    $filter: ModelTodoItemFilterInput
    $limit: Int
    $nextToken: String
  ) {
    todoItemByOwner(
      owner: $owner
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        description
        done
        rank
        createdAt
        updatedAt
        owner
      }
      nextToken
    }
  }
`;
