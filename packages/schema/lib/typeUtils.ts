interface Omit {
  <T extends object, K extends [...(keyof T)[]]>(obj: T, ...keys: K): {
    [K2 in Exclude<keyof T, K[number]>]: T[K2];
  };
}

export const omit: Omit = (obj, ...keys) => {
  const ret = {} as {
    [K in keyof typeof obj]: typeof obj[K];
  };
  let key: keyof typeof obj;
  for (key in obj) {
    if (!keys.includes(key)) {
      ret[key] = obj[key];
    }
  }
  return ret;
};

type withDefaultKeys = {
  owner?: any;
  groupOwner?: any;
  createdAt?: any;
  updatedAt?: any;
  _deleted?: any;
  __typename?: any;
  _lastChangedAt?: any;
} & object;
export function omitDefaultKeys<T extends withDefaultKeys, K extends keyof T>(obj: T, ...keys: K[]) {
  return omit(
    obj,
    'owner',
    'groupOwner',
    '__typename',
    'createdAt',
    'updatedAt',
    '_deleted',
    '_lastChangedAt',
    ...keys
  );
}

export function pick<T, K extends keyof T>(
  obj: T,
  ...keys: K[]
): {
  [P in K]: NonNullable<T[P]>;
} {
  const ret: any = {};
  keys.forEach((key) => {
    ret[key] = obj[key] ? obj[key] : undefined;
  });
  return ret;
}

function deepEqual(a: any, b: any) {
  if (a === b) return true;

  if (a && b && typeof a == 'object' && typeof b == 'object') {
    if (a.constructor !== b.constructor) return false;

    var length, i, keys;
    if (Array.isArray(a)) {
      length = a.length;
      if (length != b.length) return false;
      for (i = length; i-- !== 0; ) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }

    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- !== 0; ) if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;

    for (i = length; i-- !== 0; ) {
      var key = keys[i];

      if (!deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  // true if both NaN, false otherwise
  return a !== a && b !== b;
}

// Check if two objects are equivalent, ignoring null/undefined values
export function equivalent(a: any, b: any) {
  const aClean = nilToDeleted(a);
  const bClean = nilToDeleted(b);
  return deepEqual(aClean, bClean);
}

// Magic value used by AWS to represent a sparse index.
// This gets set automatically when a create/update is done with an owner that has no attribute.
export const AWS_NONE_VALUE = '___xamznone____';

export const NONE_VALUE = '____reamplify_none____';

export function undefinedToNull(input: any): any {
  if (input && typeof input === 'object') {
    const shallowCopy: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) {
        shallowCopy[k] = null;
      } else {
        shallowCopy[k] = undefinedToNull(v);
      }
    }
    return shallowCopy;
  }
  return input;
}

export function nilToDeleted<T>(input: T): T {
  if (input && typeof input === 'object') {
    const shallowCopy: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && v !== null) {
        shallowCopy[k] = nilToDeleted(v);
      }
    }
    return shallowCopy;
  }
  return input;
}

export function clone<T extends object>(obj: T): T {
  if (typeof obj == 'function') {
    return obj;
  }
  var result = Array.isArray(obj) ? [] : {};
  for (var key in obj) {
    var value = obj[key];
    var type = {}.toString.call(value).slice(8, -1);
    if (type == 'Array' || type == 'Object') {
      // @ts-ignore
      result[key] = clone(value);
    } else if (type == 'Date') {
      // @ts-ignore
      result[key] = new Date(value.getTime());
    } else if (type == 'RegExp') {
      // @ts-ignore
      result[key] = RegExp(value.source, getRegExpFlags(value));
    } else {
      // @ts-ignore
      result[key] = value;
    }
  }
  // @ts-ignore
  return result;
}

function getRegExpFlags(regExp: any): string {
  if (typeof regExp.source.flags == 'string') {
    return regExp.source.flags;
  } else {
    const flags: string[] = [];
    regExp.global && flags.push('g');
    regExp.ignoreCase && flags.push('i');
    regExp.multiline && flags.push('m');
    regExp.sticky && flags.push('y');
    regExp.unicode && flags.push('u');
    return flags.join('');
  }
}

export function extract(obj: any, path: readonly string[]): any[] {
  if (!path.length) {
    return Array.isArray(obj) ? obj : [obj];
  }

  if (Array.isArray(obj)) {
    return obj.flatMap((item) => extract(item, path));
  } else if (typeof obj == 'object' && obj !== null) {
    const head = path[0];
    if (obj[head] === undefined) {
      return [];
    }
    return extract(obj[head], path.slice(1));
  }
  return [];
}
