import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { registerRestEntity } from '../src/index.js';
import { Category } from './category.entity.js';

export const Product = defineEntity({
  name: 'Product',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    price: p.decimal(),
    category: p.manyToOne(Category),
    deletedAt: p.datetime().nullable(),
  }),
});

export type Product = InferEntity<typeof Product>;

registerRestEntity<Product>(Product, {
  model: 'Product',
  primaryKey: 'id',
  relations: ['category'],
  allowedFields: ['id', 'name', 'price', 'deletedAt'],
  hiddenFields: [],
  softDeleteField: 'deletedAt',
  defaultPageSize: 20,
});
