import { EntitySchema } from '@mikro-orm/core';
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

/**
 * Options are keyed by identity, so both halves of MikroORM's entity API work:
 * a decorated class (v6 style) and an `EntitySchema` produced by `defineEntity`
 * (v7 style) are each valid keys. A schema is registered under both itself and
 * its linked class so a lookup from either side hits the same entry.
 */
const registry = new WeakMap<object, RestEntityOptions<object>>();

/**
 * `EntitySchema.is` and `EntitySchema.REGISTRY` are MikroORM 7 additions. The
 * package supports v6 too, so both are probed defensively and fall back to a
 * duck-typed check rather than throwing on an older core.
 */
function isSchema(value: unknown): value is EntitySchema {
  if (value == null || typeof value !== 'object') return false;
  const guard = (EntitySchema as { is?: (item: unknown) => boolean }).is;
  if (typeof guard === 'function') {
    try { return guard.call(EntitySchema, value); } catch { /* fall through */ }
  }
  return value instanceof EntitySchema || '_meta' in value;
}

function schemaForClass(entity: object): EntitySchema | undefined {
  try {
    const reg = (EntitySchema as { REGISTRY?: Map<unknown, EntitySchema> }).REGISTRY;
    return reg?.get(entity);
  } catch {
    return undefined;
  }
}

function linkedClass(schema: EntitySchema): object | undefined {
  // `meta` is populated at construction time by defineEntity/EntitySchema, but a
  // hand-built schema may not carry a class until discovery runs.
  try {
    return (schema.meta?.class as object | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Attaches REST metadata to an entity. Works with an `EntitySchema` (including
 * anything returned by `defineEntity`) and with a plain entity class.
 *
 * Prefer this on MikroORM 7, where decorators no longer exist.
 */
export function registerRestEntity<T extends object>(
  entity: EntityName<T>,
  options: RestEntityOptions<T> = {},
): void {
  const stored = options as unknown as RestEntityOptions<object>;
  if (typeof entity === 'string') return;
  if (isSchema(entity)) {
    registry.set(entity, stored);
    const cls = linkedClass(entity);
    if (cls) registry.set(cls, stored);
    return;
  }
  registry.set(entity as object, stored);
}

/**
 * Class-decorator form of {@link registerRestEntity}, kept for MikroORM 6 style
 * entities declared with `@Entity()`. On MikroORM 7 use `registerRestEntity`.
 */
export function RestGenericEntity<T extends object>(options: RestEntityOptions<T> = {}): ClassDecorator {
  return (target) => {
    registerRestEntity(target as unknown as EntityName<T>, options);
  };
}

export function getRestEntityOptions<T extends object>(entity: EntityName<T>): RestEntityOptions<T> {
  const found = lookup(entity);
  return (found ?? {}) as unknown as RestEntityOptions<T>;
}

function lookup<T extends object>(entity: EntityName<T>): RestEntityOptions<object> | undefined {
  if (entity == null || typeof entity === 'string') return undefined;

  if (isSchema(entity)) {
    const direct = registry.get(entity);
    if (direct) return direct;
    const cls = linkedClass(entity);
    return cls ? registry.get(cls) : undefined;
  }

  if (typeof entity !== 'function' && typeof entity !== 'object') return undefined;

  const direct = registry.get(entity as object);
  if (direct) return direct;

  // The entity was registered as a schema but looked up by its class (or vice
  // versa); MikroORM keeps that link in EntitySchema.REGISTRY.
  const schema = schemaForClass(entity as object);
  return schema ? registry.get(schema) : undefined;
}

/** Human-readable model name for an entity, used in messages and cache keys. */
export function resolveEntityName<T extends object>(entity: EntityName<T>): string {
  if (typeof entity === 'string') return entity;
  if (isSchema(entity)) {
    const name = entity.name;
    if (typeof name === 'string') return name;
    return entity.meta?.className ?? 'Entity';
  }
  if (typeof entity === 'function') return entity.name;
  return 'Entity';
}
