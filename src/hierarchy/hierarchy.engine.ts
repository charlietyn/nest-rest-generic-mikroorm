import type { EntityName, EntityRepository, FilterQuery } from '@mikro-orm/core';
import type { HierarchyConfig } from '../interfaces/filter-params.interface.js';

export interface TreeRecord extends Record<string, unknown> {}

export class HierarchyEngine<T extends object> {
  constructor(
    private readonly repo: EntityRepository<T>,
    private readonly entity: EntityName<T>,
    private readonly primaryKey: string,
    private readonly parentField: string,
  ) {}

  async buildFromRoots(roots: T[], config: HierarchyConfig): Promise<TreeRecord[]> {
    const childrenKey = config.children_key ?? 'children';
    const maxDepth = config.max_depth ?? 10;
    const rootRecords = roots.map((entity) => ({ ...(entity as object) } as TreeRecord));
    let parents = rootRecords;
    for (let depth = 0; depth < maxDepth && parents.length; depth++) {
      const ids = parents.map((row) => row[this.primaryKey]).filter((id) => id != null);
      if (!ids.length) break;
      const children = await this.repo.find(
        { [this.parentField]: { $in: ids } } as FilterQuery<T>,
      );
      const records = children.map((entity: T) => ({ ...(entity as object) } as TreeRecord));
      const byParent = new Map<unknown, TreeRecord[]>();
      for (const child of records) {
        const parentId = child[this.parentField];
        const list = byParent.get(parentId) ?? [];
        list.push(child);
        byParent.set(parentId, list);
      }
      for (const parent of parents) {
        const nested = byParent.get(parent[this.primaryKey]) ?? [];
        if (nested.length || config.include_empty_children !== false) parent[childrenKey] = nested;
      }
      parents = records;
    }
    return rootRecords;
  }
}
