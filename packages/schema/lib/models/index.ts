export interface TodoItemModel {
  id: string;
  description: string;
  done: boolean;
  rank: string;
  createdAt: string;
  updatedAt: string;
  owner?: string;
}

export interface UserModel {
  id: string;
  email: string;
  preferred_name: string;
  createdAt: string;
  updatedAt: string;
}
