import { describe, expect, it } from 'vitest';
import { normalizeRelations } from '../../src/query/relations.parser.js';

describe('normalizeRelations', () => {
  it('supports relation fieldsets', () => {
    expect(normalizeRelations(['category:id,name'])).toEqual([
      { relation: 'category', fields: ['id', 'name'] },
    ]);
  });
  it('supports CSV', () => {
    expect(normalizeRelations('category,owner')).toHaveLength(2);
  });
  it('supports JSON array', () => {
    expect(normalizeRelations('["category"]')[0]?.relation).toBe('category');
  });
});
