import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Entity, MikroORM, PrimaryKey, Property } from '@mikro-orm/sqlite';
import type { SqliteDriver } from '@mikro-orm/sqlite';
import { BaseService } from '../../src/base/base.service.js';
import { RestGenericEntity } from '../../src/types/entity-options.js';

@RestGenericEntity<Item>({
  model: 'Item',
  primaryKey: 'id',
  allowedFields: ['id', 'name', 'deletedAt'],
  softDeleteField: 'deletedAt',
})
@Entity()
class Item {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @Property({ nullable: true }) deletedAt?: Date | null;
}

class ItemService extends BaseService<Item> {
  constructor(orm: MikroORM<SqliteDriver>) { super(orm.em.fork(), Item); }
}

describe('BaseService integration', () => {
  let orm: MikroORM<SqliteDriver>;
  let service: ItemService;

  beforeAll(async () => {
    orm = await MikroORM.init<SqliteDriver>({
      entities: [Item],
      dbName: ':memory:',
      allowGlobalContext: true,
    });
    await orm.schema.createSchema();
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
});
