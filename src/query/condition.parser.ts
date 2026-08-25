import { BadRequestException } from '@nestjs/common';
import type { RestOperator } from '../config/rest-generic.config.js';

export interface ParsedCondition {
  field: string;
  operator: RestOperator;
  value?: unknown;
}

export function maybeJson<T>(value: T | string | null | undefined): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value as T;
  }
}

export function parseCondition(raw: string): ParsedCondition {
  const parts = raw.split('|');
  if (parts.length < 2) {
    throw new BadRequestException(`Invalid condition "${raw}". Expected field|operator|value.`);
  }
  const field = parts.shift()?.trim() ?? '';
  const operator = (parts.shift()?.trim().toLowerCase() ?? '=') as RestOperator;
  const joined = parts.join('|').trim();
  if (!field) throw new BadRequestException('Filter field cannot be empty.');

  if (['null', 'not null', 'notnull', 'exists', 'not exists'].includes(operator)) {
    return { field, operator };
  }

  const value = decodeValue(joined);
  return { field, operator, value };
}

function decodeValue(value: string): unknown {
  if (value === '') return '';
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
