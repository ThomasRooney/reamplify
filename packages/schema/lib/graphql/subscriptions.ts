/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const onCreateUser = /* GraphQL */ `
  subscription OnCreateUser($id: String) {
    onCreateUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const onUpdateUser = /* GraphQL */ `
  subscription OnUpdateUser($id: String) {
    onUpdateUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const onDeleteUser = /* GraphQL */ `
  subscription OnDeleteUser($id: String) {
    onDeleteUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const onCreateTodoItem = /* GraphQL */ `
  subscription OnCreateTodoItem($owner: String) {
    onCreateTodoItem(owner: $owner) {
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
export const onUpdateTodoItem = /* GraphQL */ `
  subscription OnUpdateTodoItem($owner: String) {
    onUpdateTodoItem(owner: $owner) {
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
export const onDeleteTodoItem = /* GraphQL */ `
  subscription OnDeleteTodoItem($owner: String) {
    onDeleteTodoItem(owner: $owner) {
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
export const shallowOnCreateUser = /* GraphQL */ `
  subscription ShallowOnCreateUser($id: String) {
    onCreateUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowOnUpdateUser = /* GraphQL */ `
  subscription ShallowOnUpdateUser($id: String) {
    onUpdateUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowOnDeleteUser = /* GraphQL */ `
  subscription ShallowOnDeleteUser($id: String) {
    onDeleteUser(id: $id) {
      id
      email
      preferred_name
      createdAt
      updatedAt
    }
  }
`;
export const shallowOnCreateTodoItem = /* GraphQL */ `
  subscription ShallowOnCreateTodoItem($owner: String) {
    onCreateTodoItem(owner: $owner) {
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
export const shallowOnUpdateTodoItem = /* GraphQL */ `
  subscription ShallowOnUpdateTodoItem($owner: String) {
    onUpdateTodoItem(owner: $owner) {
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
export const shallowOnDeleteTodoItem = /* GraphQL */ `
  subscription ShallowOnDeleteTodoItem($owner: String) {
    onDeleteTodoItem(owner: $owner) {
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
