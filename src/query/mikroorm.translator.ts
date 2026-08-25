import { BadRequestException } from '@nestjs/common';
import type {
  EntityManager,
  EntityName,
  FilterQuery,
  FindOptions,
  QueryOrderMap,
} from '@mikro-orm/core';
import type { RestGenericConfig, RestOperator } from '../config/rest-generic.config.js';
import type { FilterParams, OperCondition, OperNode, OrderByEntry } from '../interfaces/filter-params.interface.js';
import { getRestEntityOptions } from '../types/entity-options.js';
import { maybeJson, parseCondition } from './condition.parser.js';
import { normalizeRelations } from './relations.parser.js';

type Criteria = Record<string, unknown>;

export class MikroOrmQueryTranslator<T extends object> {
  private conditionCount = 0;

  constructor(
    private readonly em: EntityManager,
    private readonly entity: EntityName<T>,
    private readonly config: RestGenericConfig,
  ) {}

  build(params: FilterParams): { where: FilterQuery<T>; options: FindOptions<T, never> } {
    this.conditionCount = 0;
    const whereParts: Criteria[] = [];
    const attr = maybeJson<Record<string, unknown>>(params.attr ?? params.eq ?? undefined);
    if (attr && typeof attr === 'object') whereParts.push(this.validateFlatCriteria(attr));
    const oper = maybeJson<OperNode | OperCondition[]>(params.oper);
    if (oper) whereParts.push(this.translateOper(oper, 0));

    const soft = this.softDeleteCriteria(params.soft_delete);
    if (soft) whereParts.push(soft);

    const where = mergeAnd(whereParts) as FilterQuery<T>;
    const options: FindOptions<T, never> = {};

    let relations = normalizeRelations(params.relations);
    if (relations.length === 1 && relations[0]?.relation === 'all') {
      const allowed = getRestEntityOptions(this.entity).relations ?? [];
      relations = allowed.map((r) => ({ relation: typeof r === 'string' ? r : r.name, fields: null }));
    }
    if (relations.length) {
      this.assertRelations(relations.map((r) => r.relation));
      options.populate = relations.map((r) => r.relation) as never;
      if (params._nested === true) options.populateWhere = where as never;
    }

    const fields = this.buildFields(params, relations);
    if (fields.length) options.fields = fields as never;
    const orderBy = this.buildOrderBy(params.orderby);
    if (orderBy.length) options.orderBy = orderBy as QueryOrderMap<T>[];

    return { where, options };
  }

  private buildFields(params: FilterParams, relations: ReturnType<typeof normalizeRelations>): string[] {
    const selected = normalizeCsv(params.select);
    const fields = selected.length && selected[0] !== '*' ? [...selected] : [];
    for (const relation of relations) {
      for (const field of relation.fields ?? []) fields.push(`${relation.relation}.${field}`);
    }
    fields.forEach((f) => this.assertFieldPath(f, true));
    return [...new Set(fields)];
  }

  private buildOrderBy(input: FilterParams['orderby']): OrderByEntry[] {
    const value = maybeJson<OrderByEntry[]>(input);
    if (!value) return [];
    if (!Array.isArray(value)) throw new BadRequestException('orderby must be an array.');
    for (const entry of value) {
      for (const field of Object.keys(entry)) this.assertFieldPath(field, true);
    }
    return value;
  }

  private translateOper(node: OperNode | OperCondition[], depth: number): Criteria {
    if (depth > this.config.filtering.maxDepth) throw new BadRequestException('Filter nesting depth exceeded.');
    const normalized: OperNode = Array.isArray(node) ? { and: node } : node;
    const result: Criteria = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (key === 'and' || key === 'or') {
        const list = Array.isArray(value) ? value : [value];
        const translated = list.filter((v): v is OperCondition => v !== undefined).map((v) => this.translateCondition(v, depth + 1));
        result[key === 'and' ? '$and' : '$or'] = translated;
      } else {
        this.assertRelation(key);
        result[key] = this.translateOper(value as OperNode | OperCondition[], depth + 1);
      }
    }
    return result;
  }

  private translateCondition(condition: OperCondition, depth: number): Criteria {
    if (++this.conditionCount > this.config.filtering.maxConditions) throw new BadRequestException('Maximum number of filter conditions exceeded.');
    if (typeof condition !== 'string') return this.translateOper(condition, depth);
    const parsed = parseCondition(condition);
    this.assertFieldPath(parsed.field, false);
    if (!this.config.filtering.allowedOperators.includes(parsed.operator)) {
      throw new BadRequestException(`Operator "${parsed.operator}" is not allowed.`);
    }
    return pathCriteria(parsed.field, operatorCriteria(parsed.operator, parsed.value));
  }

  private validateFlatCriteria(criteria: Record<string, unknown>): Criteria {
    const out: Criteria = {};
    for (const [field, value] of Object.entries(criteria)) {
      this.assertFieldPath(field, false);
      out[field] = Array.isArray(value) ? { $in: value } : value;
    }
    return out;
  }

  private softDeleteCriteria(mode: boolean | null | undefined): Criteria | null {
    const field = getRestEntityOptions(this.entity).softDeleteField;
    if (!field) return null;
    if (mode === false) return null;
    if (mode === true) return { [field]: { $ne: null } };
    return { [field]: null };
  }

  private assertRelations(relations: readonly string[]): void { relations.forEach((relation) => this.assertRelation(relation)); }

  private assertRelation(path: string): void {
    const allowed = getRestEntityOptions(this.entity).relations ?? [];
    const top = path.split('.')[0] ?? '';
    const names = allowed.map((r) => typeof r === 'string' ? r : r.name);
    if (this.config.filtering.strictRelations && !names.includes(top)) {
      throw new BadRequestException(`Relation "${top}" is not allowed.`);
    }
  }

  private assertFieldPath(path: string, allowRelation: boolean): void {
    if (path.includes('__proto__') || path.includes('prototype') || path.includes('constructor')) {
      throw new BadRequestException('Unsafe field path.');
    }
    const [top, ...rest] = path.split('.');
    if (!top) throw new BadRequestException('Field path cannot be empty.');
    if (rest.length) {
      if (!allowRelation) this.assertRelation(top);
      else this.assertRelation(top);
      return;
    }
    const configured = getRestEntityOptions(this.entity).allowedFields;
    if (this.config.filtering.validateFields && configured?.length && !configured.map(String).includes(top)) {
      throw new BadRequestException(`Field "${top}" is not allowed.`);
    }
  }
}

function normalizeCsv(input: unknown): string[] {
  if (input == null) return [];
  if (Array.isArray(input)) return input.map(String).map((v) => v.trim()).filter(Boolean);
  return String(input).split(',').map((v) => v.trim()).filter(Boolean);
}

function mergeAnd(parts: Criteria[]): Criteria {
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0] ?? {};
  return { $and: parts };
}

function pathCriteria(path: string, value: unknown): Criteria {
  const segments = path.split('.');
  let current: unknown = value;
  for (let i = segments.length - 1; i >= 0; i--) current = { [segments[i]!]: current };
  return current as Criteria;
}

function operatorCriteria(operator: RestOperator, value: unknown): unknown {
  switch (operator) {
    case '=': return value;
    case '!=':
    case '<>': return { $ne: value };
    case '<': return { $lt: value };
    case '>': return { $gt: value };
    case '<=': return { $lte: value };
    case '>=': return { $gte: value };
    case 'like': return { $like: value };
    case 'not like': return { $not: { $like: value } };
    case 'ilike': return { $ilike: value };
    case 'not ilike': return { $not: { $ilike: value } };
    case 'in': return { $in: asArray(value) };
    case 'not in':
    case 'notin': return { $nin: asArray(value) };
    case 'between': {
      const [a, b] = asArray(value);
      return { $gte: a, $lte: b };
    }
    case 'not between':
    case 'notbetween': {
      const [a, b] = asArray(value);
      return { $not: { $gte: a, $lte: b } };
    }
    case 'null': return null;
    case 'not null':
    case 'notnull': return { $ne: null };
    case 'exists': return { $ne: null };
    case 'not exists': return null;
    case 'regexp': return { $re: value instanceof RegExp ? value : new RegExp(String(value)) };
    case 'not regexp': return { $not: { $re: value instanceof RegExp ? value : new RegExp(String(value)) } };
    case 'date': return value;
    case 'not date':
    case 'notdate': return { $ne: value };
    default: return value;
  }
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((v) => v.trim());
  return [value];
}
