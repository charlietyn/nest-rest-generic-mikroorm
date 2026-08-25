import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { RestGenericEntity } from '../src/types/entity-options.js';

@RestGenericEntity<Category>({
  model: 'Category',
  primaryKey: 'id',
  allowedFields: ['id', 'name'],
})
@Entity()
export class Category {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;
}
