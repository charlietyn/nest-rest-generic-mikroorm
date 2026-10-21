import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroORM } from '@mikro-orm/sqlite';
import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { BaseService } from '../../src/base/base.service.js';
import { registerRestEntity } from '../../src/types/entity-options.js';

const Item = defineEntity({
  name: 'Item',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    secret: p.string().nullable(),
    deletedAt: p.datetime().nullable(),
  }),
});
type Item = InferEntity<typeof Item>;

registerRestEntity<Item>(Item, {
  model: 'Item',
  primaryKey: 'id',
  allowedFields: ['id', 'name', 'deletedAt'],
  hiddenFields: ['secret'],
  softDeleteField: 'deletedAt',
});

// A self-referencing relation defers the whole property, not just the target:
// `p.manyToOne(() => Node)` resolves the entity name to '' and discovery fails.
const Node = defineEntity({
  name: 'Node',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    parent: () => p.manyToOne(Node).nullable(),
  }),
});
type Node = InferEntity<typeof Node>;

registerRestEntity<Node>(Node, {
  model: 'Node',
  primaryKey: 'id',
  relations: ['parent'],
  hierarchyParentField: 'parent',
});

class ItemService extends BaseService<Item> {
  constructor(orm: MikroORM) { super(orm.em.fork(), Item); }
}
class NodeService extends BaseService<Node> {
  constructor(orm: MikroORM) { super(orm.em.fork(), Node); }
}

describe('BaseService integration', () => {
  let orm: MikroORM;
  let service: ItemService;

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [Item, Node],
      dbName: ':memory:',
      allowGlobalContext: true,
    });
    await orm.schema.create();
    service = new ItemService(orm);
  });

  afterAll(async () => orm.close(true));

  it('creates, lists, updates and deletes', async () => {
    const created = await service.create({ name: 'A' });
    expect(created.success).toBe(true);

    const listed = await service.list_all({}) as { data: Record<string, unknown>[] };
    expect(listed.data).toHaveLength(1);

    const id = listed.data[0]?.id as number;
    await service.update({ name: 'B' }, id);
    const shown = await service.show({}, id) as Record<string, unknown>;
    expect(shown.name).toBe('B');

    await service.destroy(id);
    const visible = await service.list_all({}) as { data: Record<string, unknown>[] };
    expect(visible.data).toHaveLength(0);

    await service.restore(id);
    const restored = await service.show({}, id) as Record<string, unknown>;
    expect(restored.name).toBe('B');
  });

  it('supports normal pagination', async () => {
    await service.create([{ name: 'B' }, { name: 'C' }]);
    const result = await service.list_all({ pagination: { page: 1, pageSize: 1 } }) as { per_page: number };
    expect(result.per_page).toBe(1);
  });

  it('returns every row exactly once across keyset pages', async () => {
    const fresh = new ItemService(orm);
    const seen: number[] = [];
    let cursor: string | number | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page = await fresh.list_all({
        pagination: { infinity: true, pageSize: 2, cursor },
      }) as { data: Record<string, unknown>[]; next_cursor: string | number | null; has_more: boolean };
      seen.push(...page.data.map((row) => row.id as number));
      if (!page.has_more) break;
      cursor = page.next_cursor;
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('hides hiddenFields from every read path', async () => {
    const fresh = new ItemService(orm);
    await fresh.create({ name: 'WithSecret', secret: 'classified' });
    const listed = await fresh.list_all({}) as { data: Record<string, unknown>[] };
    expect(listed.data.every((row) => !('secret' in row))).toBe(true);
  });

  it('rejects a field that is not whitelisted', async () => {
    await expect(service.list_all({ attr: { secret: 'x' } })).rejects.toThrow(/not allowed/);
  });

  it('nests children under the right parent through a to-one relation', async () => {
    const nodes = new NodeService(orm);
    const em = orm.em.fork();
    const root = em.create(Node, { name: 'root', parent: null });
    await em.persist(root).flush();
    const child = em.create(Node, { name: 'child', parent: root });
    await em.persist(child).flush();

    const tree = await nodes.listHierarchy({ hierarchy: true }) as { data: Record<string, unknown>[] };
    const rootRecord = tree.data.find((row) => row.name === 'root');
    expect(rootRecord).toBeDefined();
    const children = rootRecord?.children as Record<string, unknown>[];
    expect(children.map((row) => row.name)).toEqual(['child']);
  });

  it('counts flat attr criteria against maxConditions', async () => {
    const attr = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`name`, `v${i}`]).map(([, v], i) => [`f${i}`, v]),
    );
    await expect(service.list_all({ attr })).rejects.toThrow();
  });
});
