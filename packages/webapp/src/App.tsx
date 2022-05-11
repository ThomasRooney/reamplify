import React, { useCallback, useMemo, useState } from 'react';
import './App.css';
import LoadingScreen from './components/LoadingScreen';
import styled from 'styled-components';
import { gql, gqlErrToString } from './gql';
import { TodoItemModel } from '@reamplify/schema/lib/models';
import {
  CreateTodoItemInput,
  MutationCreateTodoItemArgs,
  MutationDeleteItemArgs,
  MutationUpdateTodoItemArgs,
  UpdateTodoItemInput,
} from '@reamplify/schema/lib/types';
import { useApolloStore } from './hooks/useApolloStore';
import { TodoItemTableConfig } from '@reamplify/schema/lib/models/tables';
import { LexoRank } from 'lexorank';
import { createTodoItem, deleteItem, updateTodoItem } from '@reamplify/schema/lib/graphql/mutations';
import {
  FullSizeBox,
  TodoInput,
  TodoItemList,
  TodoItemBox,
  TodoHeader,
  TodoMain,
  ToggleCheckbox,
  DestroyButton,
  TodoItemLabel,
  FlexBox,
} from './components/TodoComponents';

export const TodoItem = (props: { item: TodoItemModel }) => {
  const [isLoading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const handleDone = useCallback(async () => {
    try {
      setLoading(true);
      const update: UpdateTodoItemInput = {
        id: props.item.id,
        done: !props.item.done,
      };
      await gql<TodoItemModel, MutationUpdateTodoItemArgs>(updateTodoItem, { input: update });
      setError(undefined);
    } catch (e: any) {
      setError(gqlErrToString(e));
    } finally {
      setLoading(false);
    }
  }, [props.item]);

  const handleDestroy = useCallback(async () => {
    try {
      setLoading(true);
      await gql<TodoItemModel, MutationDeleteItemArgs>(deleteItem, { todoItemID: props.item.id });
      setError(undefined);
    } catch (e: any) {
      setError(gqlErrToString(e));
    } finally {
      setLoading(false);
    }
  }, [props.item]);

  return (
    <>
      <TodoItemBox>
        {!isLoading && (
          <>
            <FlexBox>
              <ToggleCheckbox checked={props.item.done} type="checkbox" onClick={handleDone} />
              <TodoItemLabel>{props.item.description}</TodoItemLabel>
            </FlexBox>
            <DestroyButton onClick={handleDestroy} />
          </>
        )}

        {isLoading && <LoadingScreen />}
      </TodoItemBox>
      {error && <Error>{error}</Error>}
    </>
  );
};

export const TodoItems = () => {
  const { items: existingItems } = useApolloStore<TodoItemModel>(TodoItemTableConfig);
  const sortedItems = useMemo(() => [...existingItems].sort((a, b) => a.rank.localeCompare(b.rank)), [existingItems]);

  return (
    <TodoItemList>
      {sortedItems.map((item) => (
        <TodoItem key={item.id} item={item} />
      ))}
    </TodoItemList>
  );
};

const Title = styled.h1`
  color: #b83f45;
  font-size: 80px;
  text-align: center;
`;

const Error = styled.p`
  color: red;
`;

export const TodoInputWrapper = () => {
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { items: existingItems } = useApolloStore<TodoItemModel>(TodoItemTableConfig);
  const sortedExistingItems = useMemo(
    () => [...existingItems].sort((a, b) => a.rank.localeCompare(b.rank)),
    [existingItems]
  );

  const handleChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    setCurrentInput(e.currentTarget.value);
  }, []);
  const handleSubmit = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      const text = e.currentTarget.value;
      if (e.key === 'Enter') {
        try {
          setLoading(true);
          let nextRank: string;
          if (sortedExistingItems.length > 0) {
            nextRank = LexoRank.parse(sortedExistingItems[sortedExistingItems.length - 1].rank)
              .genNext()
              .format();
          } else {
            nextRank = LexoRank.middle().format();
          }
          const newItem: CreateTodoItemInput = {
            description: text.trim(),
            done: false,
            rank: nextRank,
          };
          await gql<TodoItemModel, MutationCreateTodoItemArgs>(createTodoItem, { input: newItem });
          setCurrentInput('');
          setError(undefined);
        } catch (e: any) {
          setError(gqlErrToString(e));
        } finally {
          setLoading(false);
        }
      }
    },
    [sortedExistingItems]
  );
  return (
    <>
      <TodoInput
        type="text"
        autoFocus
        placeholder="What needs to be done?"
        value={currentInput}
        onChange={handleChange}
        onKeyDown={handleSubmit}
      />
      {isLoading && <LoadingScreen />}
      {error && <Error>{error}</Error>}
    </>
  );
};

function App() {
  return (
    <FullSizeBox>
      <TodoHeader>
        <Title>todos</Title>
        <TodoInputWrapper />
      </TodoHeader>
      <TodoMain>
        <TodoItems />
      </TodoMain>
    </FullSizeBox>
  );
}

export default App;
