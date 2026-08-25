import { BadRequestException } from '@nestjs/common';

export interface ParsedRelation {
  relation: string;
  fields: string[] | null;
}

export function normalizeRelations(input: unknown): ParsedRelation[] {
  if (input == null || input === '' || input === false) return [];
  let value: unknown = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try { value = JSON.parse(trimmed) as unknown; } catch { value = trimmed.includes(',') ? trimmed.split(',') : [trimmed]; }
  }
  if (!Array.isArray(value)) throw new BadRequestException('relations must be an array, CSV string, JSON array, or "all".');
  return value.map((item) => {
    if (typeof item !== 'string') throw new BadRequestException('Every relation must be a string.');
    const [relationRaw, fieldList] = item.split(':', 2);
    const relation = relationRaw?.trim();
    if (!relation) throw new BadRequestException('Relation name cannot be empty.');
    return {
      relation,
      fields: fieldList ? fieldList.split(',').map((f) => f.trim()).filter(Boolean) : null,
    };
  });
}
