import { describe, expect, it } from 'vitest';
import { processRequest, resolveBulkIds } from '../../src/base/rest.controller.js';

describe('controller helpers', () => {
  it('merges legacy eq into attr', () => {
    expect(processRequest({ eq: { active: true } }).attr).toEqual({ active: true });
  });
  it('resolves ids body', () => {
    expect(resolveBulkIds({ ids: [1, 2] })).toEqual([1, 2]);
  });
});
