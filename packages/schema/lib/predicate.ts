import { AnyModel, AnyTable } from './models/tables';
import { TableConfig } from './tableConfig';

export function evaluateSortPredicate<T>(
  sortPredicate: DynamoDBSort<any>,
  sortDirection: SortDirection,
  limit: number,
  nextSet: T[]
): T[] {
  const predicates: DynamoDBSortPredicatesGroup<any> =
    Array.isArray(sortPredicate) && sortPredicate[0] !== undefined && Array.isArray(sortPredicate[0])
      ? (sortPredicate as DynamoDBSortPredicateObject<any>[])
      : [sortPredicate as DynamoDBSortPredicateObject<any>];

  const compareFn = (a: any, b: any): number => {
    for (const predicate of predicates) {
      const [field, sortDirection] = predicate;
      const sortMultiplier = sortDirection === 'ASC' ? 1 : -1;
      if (a[field] < b[field]) {
        return -1 * sortMultiplier;
      }
      if (a[field] > b[field]) {
        return 1 * sortMultiplier;
      }
    }
    return 0;
  };
  return nextSet.sort(compareFn).slice(0, limit);
}

export type AllOperators = NumberOperators<any> & StringOperators<any> & ArrayOperators<any>;
type MapTypeToOperands<T> = {
  number: NumberOperators<NonNullable<T>>;
  string: StringOperators<NonNullable<T>>;
  boolean: BooleanOperators<NonNullable<T>>;
  'number[]': ArrayOperators<number>;
  'string[]': ArrayOperators<string>;
  'boolean[]': ArrayOperators<boolean>;
};
type EqualityOperators<T> = {
  ne: T;
  eq: T;
};
type ScalarNumberOperators<T> = EqualityOperators<T> & {
  le: T;
  lt: T;
  ge: T;
  gt: T;
};
type NumberOperators<T> = ScalarNumberOperators<T> & {
  between: [T, T];
};
type StringOperators<T> = ScalarNumberOperators<T> & {
  beginsWith: T;
  contains: T;
  notContains: T;
};
type BooleanOperators<T> = EqualityOperators<T>;
type ArrayOperators<T> = {
  contains: T;
  notContains: T;
};
type TypeName<T> = T extends string
  ? 'string'
  : T extends number
  ? 'number'
  : T extends boolean
  ? 'boolean'
  : T extends string[]
  ? 'string[]'
  : T extends number[]
  ? 'number[]'
  : T extends boolean[]
  ? 'boolean[]'
  : never;
export type DynamoDBFilterExpressionGroups = 'and' | 'or' | 'not';
export const PredicateAllSymbol = Symbol('Match any record of the same __typename');
export const PredicateNoneSymbol = Symbol('Match no records');
export type PredicateAll = typeof PredicateAllSymbol;
export type PredicateNone = typeof PredicateNoneSymbol;
export type ConstPredicates = PredicateAll | PredicateNone;
export type DynamoDBFilterPredicateObject<T extends AnyModel, FT> = [keyof MapTypeToOperands<FT>[TypeName<FT>], any];
export type DynamoDBFilterPredicatesGroup<T extends AnyModel> = {
  type: DynamoDBFilterExpressionGroups;
  predicates: (DynamoDBPredicate<T> | DynamoDBFilterPredicatesGroup<T>)[];
};
export type DynamoDBFilterPredicatesSet<M extends AnyModel> = {
  [K in keyof M]?: DynamoDBFilterPredicateObject<M, NonNullable<M[K]>>;
};
export type DynamoDBPredicate<M extends AnyModel> = DynamoDBFilterPredicatesSet<M> | DynamoDBFilterPredicatesGroup<M>;
export type DynamoDBFilterExpression<M extends AnyModel> =
  | {
      and?: DynamoDBFilterExpression<M>;
      or?: DynamoDBFilterExpression<M>;
      not?: DynamoDBFilterExpression<M>;
    }
  | { [K in keyof M]?: { [T in keyof AllOperators]?: string } };

export function predicateToFilter<M extends AnyModel>(
  predicate: DynamoDBPredicate<M>
): DynamoDBFilterExpression<M> | undefined {
  // @ts-ignore
  if (predicate === PredicateAllSymbol || predicate === PredicateNoneSymbol) {
    return undefined;
  }

  if (isPredicateObj(predicate)) {
    return Object.entries(predicate).reduce((acc, [k, v]) => {
      if (Array.isArray(v) && v.length === 2) {
        acc[k] = {
          [v[0]]: v[1],
        };
        return acc;
      }
      acc[k] = predicateToFilter(v);
      return acc;
    }, {} as any);
  }

  if (isPredicateGroup(predicate)) {
    const { type, predicates } = predicate;
    return {
      [type]: Object.entries(predicates).reduce((acc, [k, v]) => {
        acc[k] = predicateToFilter(v);
        return acc;
      }, {} as any),
    };
  }
  return {};
}

export type DynamoDBCondition<M extends AnyModel> = ConstPredicates | DynamoDBPredicate<M>;
export type SortDirection = 'ASC' | 'DESC';
export type DynamoDBSortPredicateObject<T extends AnyModel> = [keyof T, SortDirection];
export type DynamoDBSortPredicatesGroup<T extends AnyModel> = DynamoDBSortPredicateObject<T>[];
export type DynamoDBSort<M extends AnyModel> = DynamoDBSortPredicatesGroup<M> | DynamoDBSortPredicateObject<M>;
export type DerivedSubscriptionConfig<
  T extends AnyModel & Record<string, any>,
  J extends (AnyModel & Record<string, any>) | undefined = undefined
> = {
  table: TableConfig<T>;
  limit: number;
  list: boolean;
  disableSubscribe: boolean;
  sortDirection: SortDirection;
  sortPredicate: DynamoDBSort<T>;
  conditionPredicate: J extends undefined
    ? DynamoDBCondition<T>
    : DynamoDBCondition<T> | ((parent: J) => DynamoDBCondition<T>);
  subKey?: {
    [K in keyof T]?: DerivedSubscriptionConfig<T[K] extends AnyModel ? T[K] : T[K][0], T>;
  };
  allModels: string[];
};

export function isPredicateObj<T extends AnyModel>(obj: DynamoDBPredicate<T>): obj is DynamoDBFilterPredicatesSet<T> {
  return obj && !isPredicateGroup(obj);
}

function isPredicateGroup<T extends AnyModel>(obj: DynamoDBPredicate<T>): obj is DynamoDBFilterPredicatesGroup<T> {
  return (
    obj &&
    (obj as DynamoDBFilterPredicatesGroup<T>).predicates !== undefined &&
    (obj as DynamoDBFilterPredicatesGroup<T>).type !== undefined
  );
}

export function isPredicate<T extends AnyModel>(obj: DynamoDBCondition<T>): obj is DynamoDBPredicate<T> {
  return obj && obj !== PredicateNoneSymbol && obj !== PredicateAllSymbol;
}

export const validatePredicate = <T extends AnyModel>(
  model: T,
  groupType: DynamoDBFilterExpressionGroups,
  predicatesOrGroups: DynamoDBPredicate<T>[]
): boolean => {
  let filterType: keyof Pick<any[], 'every' | 'some'>;
  let isNegation = false;

  if (predicatesOrGroups.length === 0) {
    return true;
  }

  switch (groupType) {
    case 'not':
      filterType = 'every';
      isNegation = true;
      break;
    case 'and':
      filterType = 'every';
      break;
    case 'or':
      filterType = 'some';
      break;
    default:
      throw new Error(`unsupported groupType=${groupType}`);
  }

  const result: boolean = predicatesOrGroups[filterType]((predicateOrGroup) => {
    if (isPredicateObj(predicateOrGroup)) {
      return Object.entries(predicateOrGroup).every(([field, [operator, operand]]) =>
        validatePredicateField(model[field as keyof T], operator, operand)
      );
    }

    if (isPredicateGroup(predicateOrGroup)) {
      const { type, predicates } = predicateOrGroup;
      return validatePredicate(model, type, predicates);
    }

    throw new Error('Not a predicate or group');
  });

  return isNegation ? !result : result;
};

function validatePredicateField<T>(value: T, operator: keyof AllOperators, operand: T | [T, T]) {
  switch (operator) {
    case 'ne':
      return value !== operand;
    case 'eq':
      return value === operand;
    case 'le':
      return value <= operand;
    case 'lt':
      return value < operand;
    case 'ge':
      return value >= operand;
    case 'gt':
      return value > operand;
    case 'between':
      const [min, max] = operand as [T, T];
      return value >= min && value <= max;
    case 'beginsWith':
      return (value as unknown as string).startsWith(operand as unknown as string);
    case 'contains':
      return (value as unknown as string).indexOf(operand as unknown as string) > -1;
    case 'notContains':
      return (value as unknown as string).indexOf(operand as unknown as string) === -1;
    default:
      throw new Error(`unexpected operand ${operator}`);
  }
}

export const implicitTrueSymbol = Symbol('implicit_true');
export const implicitFalseSymbol = Symbol('implicit_false');
export type implicit_true = typeof implicitTrueSymbol;
export type implicit_false = typeof implicitFalseSymbol;

export function generateSubscription(table: AnyTable, name: string, { owner }: { owner?: string } = {}): string {
  let arg = 'owner';
  if (!(table as any).primitives[arg]) {
    arg = 'id';
  }
  return `subscription ${name[0].toUpperCase() + name.slice(1)} {
    ${name}(${arg}: ${JSON.stringify(owner)}) { ${table.fieldSet} }
  }`;
}
