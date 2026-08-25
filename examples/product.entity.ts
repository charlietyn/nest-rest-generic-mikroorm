import { Entity, ManyToOne, PrimaryKey, Property, type Rel } from '@mikro-orm/core';
import { RestGenericEntity } from '../src/types/entity-options.js';
import { Category } from './category.entity.js';

@RestGenericEntity<Product>({
  model: 'Product',
  primaryKey: 'id',
  relations: ['category'],
  allowedFields: ['id', 'name', 'price', 'deletedAt'],
  hiddenFields: [],
  softDeleteField: 'deletedAt',
  defaultPageSize: 20,
})
@Entity()
export class Product {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property({ type: 'decimal' })
  price!: string;

  @ManyToOne(() => Category)
  category!: Rel<Category>;

  @Property({ nullable: true })
  deletedAt?: Date | null;
}
