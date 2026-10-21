import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { registerRestEntity } from '../src/index.js';

/**
 * MikroORM 7 defines entities with `defineEntity` - decorators were removed from
 * `@mikro-orm/core`. REST metadata is attached with `registerRestEntity`.
 *
 * On MikroORM 6 the equivalent is the decorator pair:
 *
 * ```ts
 * @RestGenericEntity<Category>({ model: 'Category', allowedFields: ['id', 'name'] })
 * @Entity()
 * export class Category {
 *   @PrimaryKey() id!: number;
 *   @Property() name!: string;
 * }
 * ```
 */
export const Category = defineEntity({
  name: 'Category',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
  }),
});

export type Category = InferEntity<typeof Category>;

registerRestEntity<Category>(Category, {
  model: 'Category',
  primaryKey: 'id',
  allowedFields: ['id', 'name'],
});
