import type { EntityName } from '@mikro-orm/core';
import type { HierarchyConfig } from '../interfaces/filter-params.interface.js';
import { serializeEntity } from '../serialization/entity.serializer.js';

export type TreeRecord = Record<string, unknown>;

/** Minimal read surface the engine needs; an `EntityRepository` satisfies it. */
export interface HierarchyFinder<T> {
  find(where: unknown, options?: unknown): Promise<T[]>;
}

/** A primary key as it can be used to group children by parent. */
type EntityKey = string | number | bigint | null;

interface Node<T> {
  entity: T;
  record: TreeRecord;
}

export class HierarchyEngine<T extends object> {
  constructor(
    private readonly finder: HierarchyFinder<T>,
    private readonly entity: EntityName<T>,
    private readonly primaryKey: string,
    private readonly parentField: string,
  ) {}

  async buildFromRoots(roots: readonly T[], config: HierarchyConfig): Promise<TreeRecord[]> {
    const childrenKey = config.children_key ?? 'children';
    const maxDepth = config.max_depth ?? 10;
    const includeEmpty = config.include_empty_children !== false;

    let level: Node<T>[] = roots.map((entity) => this.toNode(entity));
    const rootRecords = level.map((node) => node.record);

    for (let depth = 0; depth < maxDepth && level.length; depth++) {
      const ids = level.map((node) => this.idOf(node.entity)).filter((id) => id != null);
      if (!ids.length) break;

      const children = await this.finder.find({ [this.parentField]: { $in: ids } });
      if (!children.length) {
        if (includeEmpty) level.forEach((node) => { node.record[childrenKey] = []; });
        break;
      }

      const nodes = children.map((entity) => this.toNode(entity));
      // Grouped by the *scalar* parent id: a to-one relation holds an entity or a
      // Reference, never the raw key, so comparing those objects to a parent's
      // primary key would never match. Keys are stringified so a numeric id and
      // its string form land in the same bucket.
      const byParent = new Map<string, TreeRecord[]>();
      for (const node of nodes) {
        const parentId = this.parentIdOf(node.entity);
        if (parentId == null) continue;
        const key = String(parentId);
        const bucket = byParent.get(key) ?? [];
        bucket.push(node.record);
        byParent.set(key, bucket);
      }

      for (const node of level) {
        const own = this.idOf(node.entity);
        const nested = own == null ? [] : byParent.get(String(own)) ?? [];
        if (nested.length || includeEmpty) node.record[childrenKey] = nested;
      }
      level = nodes;
    }
    return rootRecords;
  }

  /** Children go through the same field rules as any other response payload. */
  private toNode(entity: T): Node<T> {
    return { entity, record: serializeEntity(this.entity, entity) };
  }

  private idOf(entity: T): EntityKey {
    return asKey((entity as Record<string, unknown>)[this.primaryKey]);
  }

  private parentIdOf(entity: T): EntityKey {
    return unwrapId((entity as Record<string, unknown>)[this.parentField], this.primaryKey);
  }
}

/**
 * Resolves the key of a to-one relation value, which may be a scalar (when the
 * column is mapped directly), an entity instance, or a MikroORM `Reference`.
 */
function unwrapId(value: unknown, primaryKey: string): EntityKey {
  if (value == null) return null;
  if (typeof value !== 'object') return asKey(value);

  const holder = value as { unwrap?: () => unknown } & Record<string, unknown>;
  if (typeof holder.unwrap === 'function') {
    const inner = holder.unwrap();
    if (inner && typeof inner === 'object') return asKey((inner as Record<string, unknown>)[primaryKey]);
    return asKey(inner);
  }
  return asKey(holder[primaryKey]);
}

/** Primary keys are scalars; anything else cannot index the parent map. */
function asKey(value: unknown): EntityKey {
  switch (typeof value) {
    case 'string': return value;
    case 'number':
    case 'bigint': return value;
    default: return null;
  }
}
