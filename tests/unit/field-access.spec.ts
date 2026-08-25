import { describe, expect, it } from 'vitest';
import { RestGenericEntity } from '../../src/types/entity-options.js';
import { getDeniedFieldsForUser, stripDeniedFields } from '../../src/security/field-access.js';

@RestGenericEntity<Model>({ fieldsByRole: { admin: ['secret'], editor: ['internal'] } })
class Model { secret?: string; internal?: string; name?: string; }

describe('field access', () => {
  it('computes denied fields', () => {
    expect(getDeniedFieldsForUser(Model, { roles: ['admin'] })).toContain('internal');
  });
  it('strips denied payload properties', () => {
    expect(stripDeniedFields({ name: 'n', secret: 'x' }, ['secret'])).toEqual({ name: 'n' });
  });
});
