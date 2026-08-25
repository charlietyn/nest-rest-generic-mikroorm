import type { EntityName } from '@mikro-orm/core';
import { getRestEntityOptions } from '../types/entity-options.js';

export interface RoleAwareUser {
  roles?: readonly (string | { name?: string })[];
}

export function getUserRoleNames(user?: RoleAwareUser | null): string[] {
  return (user?.roles ?? [])
    .map((role) => typeof role === 'string' ? role : role.name)
    .filter((role): role is string => Boolean(role));
}

export function getDeniedFieldsForUser<T extends object>(
  entity: EntityName<T>,
  user?: RoleAwareUser | null,
): string[] {
  const map = getRestEntityOptions(entity).fieldsByRole;
  if (!map) return [];
  const roles = getUserRoleNames(user);
  const denied = new Set<string>();
  for (const [role, fields] of Object.entries(map)) {
    if (!roles.includes(role)) fields.forEach((field) => denied.add(String(field)));
  }
  return [...denied];
}

export function stripDeniedFields<P extends Record<string, unknown>>(
  payload: P | P[],
  denied: readonly string[],
): P | P[] {
  const strip = (item: P): P => {
    const clone = { ...item };
    denied.forEach((field) => Reflect.deleteProperty(clone, field));
    return clone;
  };
  return Array.isArray(payload) ? payload.map(strip) : strip(payload);
}
