export type RestOperator =
  | '=' | '!=' | '<>' | '<' | '>' | '<=' | '>='
  | 'like' | 'not like' | 'ilike' | 'not ilike'
  | 'in' | 'not in' | 'notin'
  | 'between' | 'not between' | 'notbetween'
  | 'null' | 'not null' | 'notnull'
  | 'exists' | 'not exists'
  | 'date' | 'not date' | 'notdate'
  | 'regexp' | 'not regexp';

export interface FilteringConfig {
  maxDepth: number;
  maxConditions: number;
  strictRelations: boolean;
  validateFields: boolean;
  allowedOperators: readonly RestOperator[];
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  ttlByMethod: Readonly<Record<string, number>>;
  cacheableMethods: readonly string[];
  varyHeaders: readonly string[];
  prefix: string;
}

export interface SerializationConfig {
  maxDepth: number;
  omitUndefined: boolean;
}

export interface RestGenericConfig {
  filtering: FilteringConfig;
  cache: CacheConfig;
  serialization: SerializationConfig;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends readonly (infer U)[]
    ? readonly U[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export const REST_GENERIC_CONFIG = Symbol.for('nest-rest-generic-mikroorm:config');

export const DEFAULT_ALLOWED_OPERATORS: readonly RestOperator[] = [
  '=', '!=', '<>', '<', '>', '<=', '>=',
  'like', 'not like', 'ilike', 'not ilike',
  'in', 'not in', 'notin',
  'between', 'not between', 'notbetween',
  'null', 'not null', 'notnull',
  'exists', 'not exists',
  'date', 'not date', 'notdate',
  'regexp', 'not regexp',
];

export const DEFAULT_CONFIG: RestGenericConfig = {
  filtering: {
    maxDepth: 5,
    maxConditions: 100,
    strictRelations: true,
    validateFields: true,
    allowedOperators: DEFAULT_ALLOWED_OPERATORS,
  },
  cache: {
    enabled: false,
    ttl: 60,
    ttlByMethod: { list_all: 60, get_one: 30 },
    cacheableMethods: ['list_all', 'get_one'],
    varyHeaders: ['Accept-Language', 'X-Tenant-Id'],
    prefix: 'rgc:v2',
  },
  serialization: {
    maxDepth: 8,
    omitUndefined: true,
  },
};

export function mergeConfig(partial?: DeepPartial<RestGenericConfig>): RestGenericConfig {
  if (!partial) {
    return structuredClone(DEFAULT_CONFIG);
  }
  return {
    filtering: { ...DEFAULT_CONFIG.filtering, ...(partial.filtering ?? {}) },
    cache: {
      ...DEFAULT_CONFIG.cache,
      ...(partial.cache ?? {}),
      ttlByMethod: {
        ...DEFAULT_CONFIG.cache.ttlByMethod,
        ...((partial.cache?.ttlByMethod as Record<string, number> | undefined) ?? {}),
      },
    },
    serialization: { ...DEFAULT_CONFIG.serialization, ...(partial.serialization ?? {}) },
  };
}
