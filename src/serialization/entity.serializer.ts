import { wrap } from '@mikro-orm/core';
import type { EntityName } from '@mikro-orm/core';
import { getRestEntityOptions } from '../types/entity-options.js';

export function serializeEntity<T extends object>(entityName: EntityName<T>, entity: T): Record<string, unknown> {
  const raw = wrap(entity).toObject() as Record<string, unknown>;
  const options = getRestEntityOptions(entityName);
  const hidden = new Set<string>((options.hiddenFields ?? []).map(String));
  const allowed = options.allowedFields ? new Set<string>(options.allowedFields.map(String)) : null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (hidden.has(key)) continue;
    if (allowed && !allowed.has(key)) continue;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function serializeMany<T extends object>(entityName: EntityName<T>, entities: readonly T[]): Record<string, unknown>[] {
  return entities.map((entity) => serializeEntity(entityName, entity));
}
