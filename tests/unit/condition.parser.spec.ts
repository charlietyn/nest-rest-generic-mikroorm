import { describe, expect, it } from 'vitest';
import { parseCondition } from '../../src/query/condition.parser.js';

describe('parseCondition', () => {
  it('parses scalar conditions', () => {
    expect(parseCondition('name|=|John')).toEqual({ field: 'name', operator: '=', value: 'John' });
  });
  it('preserves separators inside values', () => {
    expect(parseCondition('url|=|a|b').value).toBe('a|b');
  });
  it('decodes arrays', () => {
    expect(parseCondition('id|in|[1,2]').value).toEqual([1, 2]);
  });
  it('parses null operators without value', () => {
    expect(parseCondition('deletedAt|null')).toEqual({ field: 'deletedAt', operator: 'null' });
  });
});
