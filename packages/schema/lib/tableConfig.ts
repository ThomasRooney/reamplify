export type IndexConfiguration<T> = {
  readonly name: string;
  readonly partitionKey: Extract<keyof T, string>;
  readonly sortKey?: string;
  readonly fields: ReadonlyArray<Extract<keyof T, string>>;
  readonly query?: {
    readonly name: string;
    readonly argument: Extract<keyof T, string>;
  };
};

export interface TableConfig<T extends Record<string, any>> {
  readonly name: string;
  readonly primaryKey: Extract<keyof T, string>;
  readonly partitionKey: {
    readonly name: Extract<keyof T, string>;
    readonly type: 'string';
  };
  readonly streamConfiguration?: 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES' | 'KEYS_ONLY';
  readonly ownerIndex?: string;
  readonly ownerR: boolean;
  readonly ownerRW: boolean;
  readonly index: {
    readonly [I in string]: IndexConfiguration<T>;
  };
  readonly primitives: {
    readonly [P in keyof T extends string ? keyof T : never as T[P] extends string | number | boolean | null | undefined
      ? P
      : never]: string;
  };
  readonly primitiveTypes: {
    readonly [P in keyof T extends string ? keyof T : never as T[P] extends string | number | boolean | null | undefined
      ? P
      : never]: 'string' | 'number' | 'boolean';
  };
  readonly mandatory: {
    readonly [P in keyof NonNullable<T>]: string;
  };
  readonly connections: {
    readonly [C in keyof T extends string ? keyof T : never]?: {
      readonly list: boolean;
      readonly table: string;
    };
  };
  readonly s3ObjectKeys: ReadonlyArray<ReadonlyArray<string>>;
  readonly query: {
    readonly get: string;
    readonly list: string;
  };
  readonly mutation: {
    readonly create: string;
    readonly update: string;
    readonly delete: string;
  };
  readonly subscription: {
    readonly onCreate: string;
    readonly onUpdate: string;
    readonly onDelete: string;
  };
  readonly fieldSet: string;
}
