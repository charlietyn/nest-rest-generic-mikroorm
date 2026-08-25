import type { EntityName } from '@mikro-orm/core';

export interface RelationDefinition {
  name: string;
  fields?: readonly string[];
  maxDepth?: number;
}

export interface RestEntityOptions<T extends object = object> {
  model?: string;
  primaryKey?: keyof T & string;
  fieldKeyUpdate?: keyof T & string;
  relations?: readonly (keyof T & string | RelationDefinition)[];
  allowedFields?: readonly (keyof T & string)[];
  hiddenFields?: readonly (keyof T & string)[];
  fieldsByRole?: Readonly<Record<string, readonly (keyof T & string)[]>>;
  hierarchyParentField?: keyof T & string;
  softDeleteField?: keyof T & string;
  defaultPageSize?: number;
  entity?: EntityName<T>;
}

const registry = new WeakMap<Function, RestEntityOptions<object>>();

export function RestGenericEntity<T extends object>(options: RestEntityOptions<T> = {}): ClassDecorator {
  return (target) => {
    registry.set(target as Function, options as RestEntityOptions<object>);
  };
}

export function getRestEntityOptions<T extends object>(entity: EntityName<T>): RestEntityOptions<T> {
  if (typeof entity !== 'function') return {};
  return (registry.get(entity) ?? {}) as RestEntityOptions<T>;
}
