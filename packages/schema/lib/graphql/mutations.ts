/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const deleteItem = /* GraphQL */ `
  mutation DeleteItem($todoItemID: ID!) {
    deleteItem(todoItemID: $todoItemID) {
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
export const createUser = /* GraphQL */ `
  mutation CreateUser(
    $input: CreateUserInput!
    $condition: ModelUserConditionInput
  ) {
    createUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const updateUser = /* GraphQL */ `
  mutation UpdateUser(
    $input: UpdateUserInput!
    $condition: ModelUserConditionInput
  ) {
    updateUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const deleteUser = /* GraphQL */ `
  mutation DeleteUser(
    $input: DeleteUserInput!
    $condition: ModelUserConditionInput
  ) {
    deleteUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const createTodoItem = /* GraphQL */ `
  mutation CreateTodoItem(
    $input: CreateTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    createTodoItem(input: $input, condition: $condition) {
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
export const updateTodoItem = /* GraphQL */ `
  mutation UpdateTodoItem(
    $input: UpdateTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    updateTodoItem(input: $input, condition: $condition) {
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
export const deleteTodoItem = /* GraphQL */ `
  mutation DeleteTodoItem(
    $input: DeleteTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    deleteTodoItem(input: $input, condition: $condition) {
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
export const shallowDeleteItem = /* GraphQL */ `
  mutation ShallowDeleteItem($todoItemID: ID!) {
    deleteItem(todoItemID: $todoItemID) {
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
export const shallowCreateUser = /* GraphQL */ `
  mutation ShallowCreateUser(
    $input: CreateUserInput!
    $condition: ModelUserConditionInput
  ) {
    createUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowUpdateUser = /* GraphQL */ `
  mutation ShallowUpdateUser(
    $input: UpdateUserInput!
    $condition: ModelUserConditionInput
  ) {
    updateUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowDeleteUser = /* GraphQL */ `
  mutation ShallowDeleteUser(
    $input: DeleteUserInput!
    $condition: ModelUserConditionInput
  ) {
    deleteUser(input: $input, condition: $condition) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowCreateTodoItem = /* GraphQL */ `
  mutation ShallowCreateTodoItem(
    $input: CreateTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    createTodoItem(input: $input, condition: $condition) {
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
export const shallowUpdateTodoItem = /* GraphQL */ `
  mutation ShallowUpdateTodoItem(
    $input: UpdateTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    updateTodoItem(input: $input, condition: $condition) {
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
export const shallowDeleteTodoItem = /* GraphQL */ `
  mutation ShallowDeleteTodoItem(
    $input: DeleteTodoItemInput!
    $condition: ModelTodoItemConditionInput
  ) {
    deleteTodoItem(input: $input, condition: $condition) {
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
