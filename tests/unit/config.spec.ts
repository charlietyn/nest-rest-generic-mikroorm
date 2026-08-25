import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../src/config/rest-generic.config.js';

describe('mergeConfig', () => {
  it('deep merges config sections', () => {
    const cfg = mergeConfig({ filtering: { maxDepth: 3 } });
    expect(cfg.filtering.maxDepth).toBe(3);
    expect(cfg.filtering.maxConditions).toBe(100);
  });
});
