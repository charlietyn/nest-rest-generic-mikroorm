import { describe, expect, it } from 'vitest';
import { processRequest, resolveBulkIds, toBoolean } from '../../src/base/rest.controller.js';

describe('controller helpers', () => {
  it('merges legacy eq into attr', () => {
    expect(processRequest({ eq: { active: true } }).attr).toEqual({ active: true });
  });
  it('resolves ids body', () => {
    expect(resolveBulkIds({ ids: [1, 2] })).toEqual([1, 2]);
  });
});

describe('query string coercion', () => {
  it('reads booleans from their string form', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean('on')).toBe(true);
    expect(toBoolean('off')).toBe(false);
  });

  it('leaves unknown values undefined instead of guessing', () => {
    expect(toBoolean('maybe')).toBeUndefined();
    expect(toBoolean('')).toBeUndefined();
    expect(toBoolean(undefined)).toBeUndefined();
  });

  // A query string carries no types: without coercion these arrive as "true"
  // and compare as neither true nor false, so the flags silently did nothing.
  it('coerces soft_delete arriving as a string', () => {
    expect(processRequest({ soft_delete: 'true' as unknown as boolean }).soft_delete).toBe(true);
    expect(processRequest({ soft_delete: 'false' as unknown as boolean }).soft_delete).toBe(false);
  });

  it('coerces _nested and cache flags arriving as strings', () => {
    expect(processRequest({ _nested: 'true' as unknown as boolean })._nested).toBe(true);
    expect(processRequest({ cache: 'false' as unknown as boolean }).cache).toBe(false);
    expect(processRequest({ cache: 'true' as unknown as boolean }).cache).toBe(true);
  });

  it('coerces cache_ttl to a number', () => {
    expect(processRequest({ cache_ttl: '90' as unknown as number }).cache_ttl).toBe(90);
  });

  it('defaults absent flags without inventing values', () => {
    const params = processRequest({});
    expect(params.soft_delete).toBeNull();
    expect(params._nested).toBe(false);
    expect(params.cache).toBeUndefined();
  });

  it('keeps a hierarchy config object intact while coercing the flag form', () => {
    expect(processRequest({ hierarchy: 'true' }).hierarchy).toBe(true);
    expect(processRequest({ hierarchy: { max_depth: 3 } }).hierarchy).toEqual({ max_depth: 3 });
  });
});
