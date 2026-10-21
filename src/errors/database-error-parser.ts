import { BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export interface ParsedDatabaseError {
  kind: 'unique' | 'foreign_key' | 'not_null' | 'check' | 'database';
  message: string;
  constraint?: string;
}

export function parseDatabaseError(error: unknown): ParsedDatabaseError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('unique') || lower.includes('duplicate')) return { kind: 'unique', message };
  if (lower.includes('foreign key')) return { kind: 'foreign_key', message };
  if (lower.includes('not null')) return { kind: 'not_null', message };
  if (lower.includes('check constraint')) return { kind: 'check', message };
  return { kind: 'database', message };
}

export function toHttpException(error: unknown): HttpException {
  const parsed = parseDatabaseError(error);
  switch (parsed.kind) {
    case 'unique': return new ConflictException('A record with the same unique value already exists.');
    case 'foreign_key': return new ConflictException('The operation violates a relationship constraint.');
    case 'not_null':
    case 'check': return new BadRequestException('The supplied data violates a database constraint.');
    default: return new InternalServerErrorException('Database operation failed.');
  }
}
