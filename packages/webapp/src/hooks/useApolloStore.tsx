import React, {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnyModel, AnyTable } from '@reamplify/schema/lib/models/tables';
import cuid from 'cuid';
import { ApolloCache, DocumentNode, gql, useApolloClient, useQuery } from '@apollo/client';
import { QueryResult } from '@apollo/client/react/types/types';
import { useAuth } from '../contexts/AmplifyAuth';
import { equivalent } from '@reamplify/schema/lib/typeUtils';
import { TableConfig } from '@reamplify/schema/lib/tableConfig';
import { gqlResponseToModel } from '@reamplify/schema/lib/partialTypes';
import {
  DerivedSubscriptionConfig,
  DynamoDBCondition,
  DynamoDBFilterPredicatesGroup,
  DynamoDBFilterPredicatesSet,
  DynamoDBPredicate,
  DynamoDBSort,
  evaluateSortPredicate,
  implicit_false,
  implicit_true,
  isPredicate,
  isPredicateObj,
  PredicateAllSymbol,
  PredicateNoneSymbol,
  SortDirection,
  validatePredicate,
  generateSubscription,
} from '@reamplify/schema/lib/predicate';
import { gqlErrToString } from '../gql';

type SubscribeApolloState = {
  subscribe: (ref: any, config: DerivedSubscriptionConfig<any>, query: DocumentNode) => void;
  unsubscribe: (ref: any) => void;
};

const ApolloStateContext = createContext<SubscribeApolloState>(undefined as any);

const useApolloStateMachine = (
  subscriptions: AnyTable[],
  handler: (modelName: string, operation: 'create' | 'update' | 'delete', cache: ApolloCache<object>, data: any) => void
) => {
  const client = useApolloClient();
  const auth = useAuth();
  const activeSubscriptions = useRef<Record<string, { username: string | undefined; subscriptions: any[] }>>({});

  useEffect(() => {
    for (const table of subscriptions) {
      if (!(table.name in activeSubscriptions.current)) {
        let subscriptionAuth: any = { owner: undefined, groupOwner: undefined };
        if (table.ownerR) {
          subscriptionAuth.owner = auth.user?.username;
        }

        const createSubscription = client
          .subscribe({
            query: gql(generateSubscription(table, table.subscription.onCreate, subscriptionAuth)),
          })
          .subscribe((observer) => {
            const newItem = observer.data[table.subscription.onCreate];
            handler(table.name, 'create', client.cache, newItem);
          });
        const updateSubscription = client
          .subscribe({
            query: gql(generateSubscription(table, table.subscription.onUpdate, subscriptionAuth)),
          })
          .subscribe((observer) => {
            const newItem = observer.data[table.subscription.onUpdate];
            handler(table.name, 'update', client.cache, newItem);
          });
        const deleteSubscription = client
          .subscribe({
            query: gql(generateSubscription(table, table.subscription.onDelete, subscriptionAuth)),
          })
          .subscribe((observer) => {
            const newItem = observer.data[table.subscription.onDelete];
            handler(table.name, 'delete', client.cache, newItem);
          });
        activeSubscriptions.current[table.name] = {
          username: auth.user?.username,
          subscriptions: [createSubscription, updateSubscription, deleteSubscription],
        };
      }
    }
    return () => {
      for (const tableName of Object.keys(activeSubscriptions.current)) {
        const table = activeSubscriptions.current[tableName];
        if (table.username !== auth.user?.username) {
          table.subscriptions.forEach((subscription) => {
            subscription.unsubscribe();
          });
          delete activeSubscriptions.current[tableName];
        }
      }
    };
  }, [auth.user?.username, subscriptions]);

  return client;
};
function getTables(subscriptionConfig: SubscriptionConfig<any, any, any>) {
  const a = [subscriptionConfig.table];
  if (subscriptionConfig.subKey) {
    for (const subTable of Object.values(subscriptionConfig.subKey)) {
      if (subTable) {
        a.push(...getTables(subTable));
      }
    }
  }
  return a;
}

function getPredicates<M extends AnyModel>(conditionPredicate: DynamoDBPredicate<M>): DynamoDBFilterPredicatesGroup<M> {
  return {
    predicates: [conditionPredicate],
    type: 'and',
  };
}

export const ApolloLiveQueryBridge: FC<{ children: ReactNode }> = (props: { children: ReactNode }) => {
  const state = useRef<{
    subscriptions: Record<string, Set<string>>;
    refs: Record<string, DerivedSubscriptionConfig<any> & { query: DocumentNode }>;
    queries: Record<string, DerivedSubscriptionConfig<any> & { query: DocumentNode }>;
    tables: Record<string, TableConfig<any>>;
  }>({
    subscriptions: {},
    refs: {},
    queries: {},
    tables: {},
  });
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const allSubscriptionNames = Object.keys(activeSubscriptions).join(',');
  const tablesToSubscribeTo = useMemo(
    () => Object.keys(state.current.subscriptions).map((k) => state.current.tables[k]),
    [allSubscriptionNames]
  );

  const changedDataCallback = useCallback(
    (modelName: string, operation: 'create' | 'update' | 'delete', cache: ApolloCache<object>, data: any): void => {
      if (!state.current.subscriptions[modelName]) {
        return;
      }
      if (operation === 'update') {
        return;
      }
      const queries = state.current.subscriptions[modelName];
      queries.forEach((query) => {
        const config = state.current.queries[query];
        if (!config.allModels.includes(modelName)) {
          return;
        }
        const existingResponse: any = cache.readQuery({ query: config.query });
        const selectionSetKey: string = (config.query?.definitions?.[0] as any)?.selectionSet?.selections?.[0].name
          ?.value;
        if (!existingResponse || !(selectionSetKey in existingResponse)) {
          return;
        }

        const newQueryResponse = reEvaluatePredicateAgainstCache(
          config,
          existingResponse[selectionSetKey],
          modelName,
          state.current.tables,
          operation,
          cache,
          undefined,
          data
        );
        if (newQueryResponse && !equivalent(newQueryResponse, existingResponse[selectionSetKey])) {
          cache.writeQuery({ query: config.query, data: { [selectionSetKey]: newQueryResponse } });
        }
      });
    },
    []
  );

  const client = useApolloStateMachine(tablesToSubscribeTo, changedDataCallback);
  const subscribe = useCallback((ref: any, config: DerivedSubscriptionConfig<any>, query: DocumentNode) => {
    const allTables: TableConfig<any>[] = getTables(config);
    for (const table of allTables) {
      const modelName = table.name;
      if (!(modelName in state.current.subscriptions)) {
        state.current.subscriptions[modelName] = new Set();
        setActiveSubscriptions((cur) => cur.concat(modelName));
      }

      if (!(ref in state.current.refs)) {
        state.current.refs[ref] = { query, ...config };
      }
      const queryString = query.loc!.source.body;
      state.current.queries[queryString] = { query, ...config };
      state.current.subscriptions[modelName].add(queryString);

      if (!(modelName in state.current.tables)) {
        state.current.tables[modelName] = table;
      }
    }
  }, []);
  const unsubscribe = useCallback(
    (ref: any) => {
      // unsubscribe is on a delay so we get a scrolling-window of subscriptions
      // const config = state.current.refs[ref];
      if (!(ref in state.current.refs)) {
        return;
      }
      // const allTables: TableConfig<any>[] = getTables(config);
      delete state.current.refs[ref];
      // for (const table of allTables) {
      // const modelName = table.name;
      // const subscription = state.current.subscriptions[modelName];
      // subscription.delete(ref);
      // TODO: add something like this back in when apollo https://github.com/apollographql/apollo-client/issues/7060 closed
      // There is currently no way of forcing an "invalidation" of the cache that keeps user data around,
      // that also forces fetchPolicy cache-and-network on next time the same query is executed.
      // Note:
      // We might be able to find a workaround that provides a fetchPolicy based on if the table is hydrated or not.
      // This would require maintaining a mapping of [(table, predicates) => hydrated] where hydrated is true IF the subscription
      // has been kept live between renders.
      // if (subscription.size === 0) {
      //   // invalidate the entry in the cache, as we'll need to repeat the request when we need go to this bit of app
      //   // a more efficient alternative to this would be keeping the subscription alive for a given time period...
      //   delete state.current.subscriptions[modelName];
      //   delete state.current.subscriptions[modelName];
      //   setActiveSubscriptions((cur) =>
      //     cur.splice(
      //       cur.findIndex((c) => c === modelName),
      //       1
      //     )
      //   );
      // }
      // }
    },
    [client]
  );
  return <ApolloStateContext.Provider value={{ subscribe, unsubscribe }}>{props.children}</ApolloStateContext.Provider>;
};

type ItemResponse<T> = { loaded: boolean; item: T | undefined; error: string | undefined };
type ItemResponses<T> = { loaded: boolean; items: T[]; error: string | undefined };

function getAssociatedModels(config: SubscriptionConfig<any>): string[] {
  return [config.table.name].concat(
    config.subKey ? Object.values(config.subKey).flatMap((subConfig: any) => getAssociatedModels(subConfig)) : []
  );
}

export function implicitToDerived<T extends AnyModel & Record<string, any>>(
  config: SubscriptionConfig<T>,
  isList: boolean,
  id: string | undefined
): DerivedSubscriptionConfig<T> {
  if (isList) {
    return {
      conditionPredicate: config.conditionPredicate ?? PredicateAllSymbol,
      limit: config.limit ?? 100,
      list: true,
      disableSubscribe: config.disableSubscribe ?? false,
      sortDirection: config.sortDirection ?? 'DESC',
      sortPredicate: config.sortPredicate ?? [],
      subKey: config.subKey
        ? Object.entries(config.subKey).reduce((acc, cur) => {
            acc[cur[0]] = implicitToDerived(cur[1], Boolean(cur[1].list), undefined);
            return acc;
          }, {} as any)
        : undefined,
      table: config.table,
      allModels: getAssociatedModels(config),
    };
  } else {
    return {
      conditionPredicate:
        config.conditionPredicate ??
        (id !== undefined ? ({ id: ['eq', id] } as DynamoDBFilterPredicatesSet<T>) : PredicateAllSymbol),
      limit: config.limit ?? 1,
      list: false,
      disableSubscribe: config.disableSubscribe ?? false,
      sortDirection: config.sortDirection ?? 'DESC',
      sortPredicate: config.sortPredicate ?? [],
      subKey: config.subKey
        ? Object.entries(config.subKey).reduce((acc, cur) => {
            acc[cur[0]] = implicitToDerived(cur[1], Boolean(cur[1].list), undefined);
            return acc;
          }, {} as any)
        : undefined,
      table: config.table,
      allModels: getAssociatedModels(config),
    };
  }
}

export const useApolloStoreWithId = <T extends AnyModel>(
  configOrTable: SubscriptionConfig<T> | TableConfig<T>,
  id: string | undefined
): ItemResponse<T> => {
  const { subscribe, unsubscribe } = useContext(ApolloStateContext);
  const config: DerivedSubscriptionConfig<T> = useMemo(() => {
    if (typeof (configOrTable as SubscriptionConfig<T>).table?.name === 'undefined') {
      return implicitToDerived({ table: configOrTable as TableConfig<T> }, false, id);
    } else {
      return implicitToDerived(configOrTable as SubscriptionConfig<T>, false, id);
    }
  }, [configOrTable, id]);

  const derivedFieldSet = useMemo(() => calculateFieldSet(config), [config]);

  const query: DocumentNode = useMemo(() => {
    return gql(`query Get${config.table.name} {
      ${config.table.query.get}(id: ${JSON.stringify(id)}) { ${derivedFieldSet} }
    }`);
  }, [id, config.table]);

  const ref = useRef(cuid()).current;

  useEffect(() => {
    if (id) {
      subscribe(ref, config, query);
      return () => {
        unsubscribe(ref);
      };
    }
    return;
  }, [id, config, query]);

  const response: QueryResult<any, any> = useQuery<any, { id: string | undefined }>(query, {
    skip: id === undefined,
  });

  return useMemo(() => {
    if (response.loading) {
      return {
        loaded: false,
        item: undefined,
        error: undefined,
      };
    }
    if (response.error) {
      const err = response.error;
      const errMessage = gqlErrToString(err);
      return {
        loaded: true,
        error: errMessage,
        item: undefined,
      };
    }
    const responseData = gqlResponseToModel<T>(response.data?.[config.table.query.get], config.table);
    if (Array.isArray(responseData)) {
      throw new Error(`unexpected response type ${JSON.stringify(responseData)} for config ${JSON.stringify(config)}`);
    }
    return {
      loaded: true,
      error: undefined,
      item: responseData,
    };
  }, [response]);
};

export function reEvaluatePredicateAgainstCache(
  config: DerivedSubscriptionConfig<any>,
  currentResponse: any,
  modelName: string,
  tables: Record<string, TableConfig<AnyModel>>,
  operation: 'create' | 'update' | 'delete',
  cache: ApolloCache<object>,
  currentModel: any,
  data: any
): any {
  if (config.conditionPredicate === PredicateNoneSymbol) {
    return undefined;
  }
  // seemingly unnecessary, as the cache is already denormalized and subscription updates are replaced automatically.
  if (operation === 'update') {
    return undefined;
  }

  if (config.table.name === modelName) {
    const responseToModel = gqlResponseToModel(data, config.table);
    let matches;
    if (config.conditionPredicate === PredicateAllSymbol) {
      matches = true;
    } else {
      let conditionPredicate: DynamoDBPredicate<any>;
      if (typeof config.conditionPredicate === 'function') {
        conditionPredicate = (config.conditionPredicate as (arg0: any) => DynamoDBPredicate<any>)(currentModel);
      } else {
        conditionPredicate = config.conditionPredicate;
      }
      const predicates = getPredicates(conditionPredicate);
      const { predicates: predicateObjs, type } = predicates;
      matches = validatePredicate(responseToModel, type, predicateObjs);
    }
    if (matches) {
      if (config.list) {
        if (!currentResponse.items || !Array.isArray(currentResponse.items)) {
          return;
        }
        if (operation === 'create') {
          const nextSet = currentResponse.items
            .filter((item: any) => item[config.table.primaryKey] !== data[config.table.primaryKey])
            .concat(data);
          return {
            ...currentResponse,
            items: evaluateSortPredicate(config.sortPredicate, config.sortDirection, config.limit, nextSet),
          };
        }
        if (operation === 'delete') {
          const nextSet = currentResponse.items.filter(
            (item: any) => item[config.table.primaryKey] !== data[config.table.primaryKey]
          );
          return {
            ...currentResponse,
            items: evaluateSortPredicate(config.sortPredicate, config.sortDirection, config.limit, nextSet),
          };
        }
        return undefined;
      } else {
        return { ...currentResponse, ...data };
      }
    }
  }

  let isChange = false;
  if (!config.subKey) {
    return undefined;
  }
  for (const [subKey, subSubscriptionConfig] of Object.entries(config.subKey)) {
    if (config.list) {
      if (!currentResponse.items || !Array.isArray(currentResponse.items)) {
        continue;
      }
      for (let i = 0; i < currentResponse.items.length; i++) {
        const item = currentResponse.items[i];
        const subCurrentResponse = item[subKey];
        if (!subCurrentResponse || !subSubscriptionConfig) {
          continue;
        }
        const subKeyMatch = reEvaluatePredicateAgainstCache(
          subSubscriptionConfig,
          subCurrentResponse,
          modelName,
          tables,
          operation,
          cache,
          gqlResponseToModel(item, tables[modelName]),
          data
        );
        if (subKeyMatch) {
          isChange = true;
          currentResponse = {
            ...currentResponse,
            items: [
              ...currentResponse.items.slice(0, i),
              { ...currentResponse.items[i], [subKey]: subKeyMatch },
              ...currentResponse.items.slice(i + 1),
            ],
          };
        }
      }
    } else {
      if (!(subKey in currentResponse) || !subSubscriptionConfig) {
        continue;
      }
      const subCurrentResponse = currentResponse[subKey];
      const subKeyMatch = reEvaluatePredicateAgainstCache(
        subSubscriptionConfig,
        subCurrentResponse,
        modelName,
        tables,
        operation,
        cache,
        gqlResponseToModel(currentResponse),
        data
      );
      if (subKeyMatch) {
        isChange = true;
        currentResponse = { ...currentResponse, [subKey]: subKeyMatch };
      }
    }
  }
  if (isChange) {
    return currentResponse;
  }

  return undefined;
}

export type SubscriptionConfig<
  T extends AnyModel & Record<string, any>,
  J extends (AnyModel & Record<string, any>) | undefined = undefined,
  MustList extends true | false | implicit_true | implicit_false = implicit_false
> = MustList extends true
  ? {
      table: TableConfig<T>;
      limit?: number;
      list: true;
      disableSubscribe?: boolean;
      sortDirection?: SortDirection;
      sortPredicate?: DynamoDBSort<T>;
      conditionPredicate?: J extends undefined
        ? DynamoDBCondition<T>
        : DynamoDBCondition<T> | ((parent: J) => DynamoDBCondition<T>);
      subKey?: {
        [K in keyof T]?: SubscriptionConfig<
          T[K] extends AnyModel | undefined | null ? Required<T>[K] : T[K][0],
          T,
          T[K] extends AnyModel | undefined | null ? false : true
        >;
      };
    }
  : MustList extends false
  ? {
      table: TableConfig<T>;
      limit?: number;
      list: false;
      disableSubscribe?: boolean;
      sortDirection?: SortDirection;
      sortPredicate?: DynamoDBSort<T>;
      conditionPredicate?: J extends undefined
        ? DynamoDBCondition<T>
        : DynamoDBCondition<T> | ((parent: J) => DynamoDBCondition<T>);
      subKey?: {
        [K in keyof T]?: SubscriptionConfig<
          T[K] extends AnyModel | undefined | null ? Required<T>[K] : T[K][0],
          T,
          T[K] extends AnyModel | undefined | null ? false : true
        >;
      };
    }
  : MustList extends implicit_true | implicit_false
  ? {
      table: TableConfig<T>;
      limit?: number;
      disableSubscribe?: boolean;
      sortDirection?: SortDirection;
      sortPredicate?: DynamoDBSort<T>;
      conditionPredicate?: J extends undefined
        ? DynamoDBCondition<T>
        : DynamoDBCondition<T> | ((parent: J) => DynamoDBCondition<T>);
      subKey?: {
        [K in keyof T]?: SubscriptionConfig<
          T[K] extends AnyModel | undefined | null ? Required<T>[K] : T[K][0],
          T,
          T[K] extends AnyModel | undefined | null ? false : true
        >;
      };
    }
  : never;

function calculateFieldSet<T extends AnyModel & Record<string, any>>(tableConfig: DerivedSubscriptionConfig<T>) {
  let nested: string;
  if (tableConfig.list) {
    nested = `items { ${tableConfig.table.fieldSet}`;
  } else {
    nested = tableConfig.table.fieldSet;
  }
  if (tableConfig.subKey) {
    for (const key of Object.keys(tableConfig.subKey)) {
      const subSubcription: any = tableConfig.subKey[key];
      const { sortDirection, limit, list } = subSubcription;
      nested += ` ${key}${list ? `(limit: ${limit}, sortDirection: ${sortDirection})` : ''}
          { ${calculateFieldSet(subSubcription)} } `;
    }
  }
  if (tableConfig.list) {
    nested += '} nextToken';
  }
  return nested;
}

function conditionMatchesIndex<T extends AnyModel>(
  conditionPredicate: DynamoDBCondition<T>,
  index: {
    query?: { name: string; argument: string };
  }
): boolean {
  if (conditionPredicate === PredicateAllSymbol || conditionPredicate === PredicateNoneSymbol) {
    return false;
  }
  if (isPredicateObj(conditionPredicate)) {
    const predicateEntries = Object.entries(conditionPredicate);
    if (
      index.query &&
      predicateEntries.length === 1 &&
      predicateEntries[0][0] === index.query.argument &&
      predicateEntries[0][1][0] === 'eq'
    ) {
      return true;
    }
  }
  return false;
}

function getPredicateGSIValue<T extends AnyModel>(
  conditionPredicate: DynamoDBCondition<T>,
  index: {
    query?: { name: string; argument: string };
  }
): string | undefined {
  if (conditionPredicate === PredicateAllSymbol || conditionPredicate === PredicateNoneSymbol) {
    return undefined;
  }
  if (isPredicateObj(conditionPredicate)) {
    const predicateEntries = Object.entries(conditionPredicate);
    if (
      index.query &&
      predicateEntries.length === 1 &&
      predicateEntries[0][0] === index.query.argument &&
      predicateEntries[0][1][0] === 'eq'
    ) {
      return predicateEntries[0][1][1];
    }
  }
  return undefined;
}

export const useApolloStore = <T extends AnyModel & Record<string, any>>(
  configOrTable: SubscriptionConfig<T, undefined, implicit_true> | TableConfig<T>
): ItemResponses<T> => {
  const { subscribe, unsubscribe } = useContext(ApolloStateContext);
  const auth = useAuth();
  const subscriptionConfig: DerivedSubscriptionConfig<T> = useMemo(() => {
    if (typeof (configOrTable as SubscriptionConfig<T>).table?.name === 'undefined') {
      return implicitToDerived({ table: configOrTable as TableConfig<T> }, true, undefined);
    } else {
      return implicitToDerived(configOrTable as SubscriptionConfig<T>, true, undefined);
    }
  }, [configOrTable]);

  const ref = useRef(cuid()).current;

  const listQuery = useMemo(() => {
    const maybeGSI = Object.values(subscriptionConfig.table.index).reduce<
      { name: string; argument: Extract<keyof T, string>; fields: ReadonlyArray<Extract<keyof T, string>> } | undefined
    >((cur, index) => {
      if (!index.query) {
        return cur;
      }
      // prefer specific GSI
      if (cur && cur.argument !== 'owner') {
        return cur;
      }
      // if GSI specifically matches conditionPredicate, prefer that
      if (
        subscriptionConfig.conditionPredicate &&
        conditionMatchesIndex(subscriptionConfig.conditionPredicate, index)
      ) {
        return { ...index.query, fields: index.fields };
      }
      if (cur && cur.argument === 'owner') {
        return cur;
      }
      if (index.query && index.query.argument === 'owner') {
        return { ...index.query, fields: index.fields };
      }
      return cur;
    }, undefined);
    if (maybeGSI) {
      return { ...maybeGSI, gsi: true };
    }
    return {
      name: subscriptionConfig.table.query.list,
      gsi: false,
      argument: '',
      fields: [],
    };
  }, [subscriptionConfig]);

  const gqlArg: string | undefined = useMemo(() => {
    if (listQuery.argument === 'owner') {
      return auth.user?.username;
    } else if (listQuery.gsi) {
      return getPredicateGSIValue(subscriptionConfig.conditionPredicate, { query: listQuery });
    }
    return undefined;
  }, [auth, listQuery]);

  const derivedFieldSet = useMemo(() => calculateFieldSet(subscriptionConfig), [subscriptionConfig]);

  const query = useMemo(() => {
    return gql(`query Query${subscriptionConfig.table.name}${ref} {
      ${listQuery.name}${
      listQuery.argument
        ? `(${listQuery.argument}: ${JSON.stringify(gqlArg)}${
            listQuery.fields.length < 2 || subscriptionConfig.sortDirection === 'ASC' ? '' : ', sortDirection: DESC'
          })`
        : ''
    }
       { ${derivedFieldSet} }
  }`);
  }, [listQuery, gqlArg, derivedFieldSet]);

  const response: QueryResult<any, any> = useQuery<any, { id: string | undefined }>(query, {
    skip: listQuery.gsi ? gqlArg === undefined : false,
  });

  useEffect(() => {
    if (subscriptionConfig && !subscriptionConfig.disableSubscribe) {
      subscribe(ref, subscriptionConfig, query);
      return () => {
        unsubscribe(ref);
      };
    }
    return;
  }, [subscriptionConfig, query]);

  return useMemo(() => {
    if (response.loading) {
      return {
        loaded: false,
        items: [],
        error: undefined,
      };
    }
    if (response.error) {
      const err = response.error;
      const errMessage = gqlErrToString(err);
      return {
        loaded: true,
        error: errMessage,
        items: [],
      };
    }
    if (!response.data) {
      return {
        loaded: false,
        items: [],
        error: undefined,
      };
    }
    let responseItems = gqlResponseToModel<T[]>(response.data?.[listQuery.name], subscriptionConfig.table);
    if (!Array.isArray(responseItems)) {
      throw new Error(`expected multiple items in response for listQuery ${listQuery.name}`);
    }
    if (subscriptionConfig.conditionPredicate && isPredicate(subscriptionConfig.conditionPredicate)) {
      const predicates = getPredicates(subscriptionConfig.conditionPredicate);
      const { predicates: predicateObjs, type } = predicates;
      responseItems = responseItems.filter((item) => {
        return validatePredicate(item, type, predicateObjs);
      });
    }
    if (subscriptionConfig.sortPredicate) {
      responseItems = evaluateSortPredicate(
        subscriptionConfig.sortPredicate,
        subscriptionConfig.sortDirection,
        subscriptionConfig.limit,
        responseItems
      );
    }
    return {
      loaded: true,
      error: undefined,
      items: responseItems,
    };
  }, [response]);
};
