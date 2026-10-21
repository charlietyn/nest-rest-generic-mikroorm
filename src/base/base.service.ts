import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  EntityManager,
  EntityName,
  EntityRepository,
  FilterQuery,
  FindOptions,
  Primary,
} from '@mikro-orm/core';
import type { CacheContext, RgcCacheService } from '../cache/cache.service.js';
import type { RestGenericConfig } from '../config/rest-generic.config.js';
import { DEFAULT_CONFIG } from '../config/rest-generic.config.js';
import { ExportService, type ExportFile, type ExportOptions } from '../export/export.service.js';
import { HierarchyEngine } from '../hierarchy/hierarchy.engine.js';
import type {
  CursorPaginatedResult,
  DataResult,
  PaginatedResult,
  WriteItemResult,
  WriteResult,
} from '../interfaces/service-result.interface.js';
import type { FilterParams, PaginationParams } from '../interfaces/filter-params.interface.js';
import { maybeJson } from '../query/condition.parser.js';
import { MikroOrmQueryTranslator } from '../query/mikroorm.translator.js';
import { serializeEntity, serializeMany } from '../serialization/entity.serializer.js';
import { getDeniedFieldsForUser, stripDeniedFields, type RoleAwareUser } from '../security/field-access.js';
import { getRestEntityOptions, resolveEntityName } from '../types/entity-options.js';

/**
 * MikroORM 7 narrows `FilterQuery` and `EntityData` through per-entity index and
 * property metadata. Those conditional types cannot be satisfied from an
 * unbounded generic `T`, so the base service talks to the ORM through these
 * structural views while keeping its own public signatures precise.
 */
interface LooseRepository<T> {
  find(where: unknown, options?: unknown): Promise<T[]>;
  findOne(where: unknown, options?: unknown): Promise<T | null>;
  findAndCount(where: unknown, options?: unknown): Promise<[T[], number]>;
  create(data: unknown): T;
  assign(entity: T, data: unknown, options?: unknown): T;
}

interface LooseEntityManager<T> {
  getRepository(entity: unknown): LooseRepository<T>;
  find(entity: unknown, where: unknown, options?: unknown): Promise<T[]>;
  findOne(entity: unknown, where: unknown, options?: unknown): Promise<T | null>;
  assign(entity: T, data: unknown, options?: unknown): T;
  persist(entity: T | T[]): { flush(): Promise<void> };
  remove(entity: T): { flush(): Promise<void> };
  flush(): Promise<void>;
  nativeDelete(entity: unknown, where: unknown): Promise<number>;
  transactional<R>(cb: (em: LooseEntityManager<T>) => Promise<R>): Promise<R>;
}

export abstract class BaseService<T extends object> {
  protected readonly repo: EntityRepository<T>;
  protected readonly translator: MikroOrmQueryTranslator<T>;
  protected readonly primaryKey: string;
  protected readonly modelName: string;
  protected cacheable: boolean | null = null;
  protected cacheTtl: number | null = null;
  protected cacheableOperations: string[] = [];

  /** Structural view of {@link repo}; see {@link LooseRepository}. */
  private readonly rows: LooseRepository<T>;
  /** Structural view of {@link em}; see {@link LooseEntityManager}. */
  private readonly store: LooseEntityManager<T>;

  constructor(
    protected readonly em: EntityManager,
    protected readonly entity: EntityName<T>,
    protected readonly config: RestGenericConfig = DEFAULT_CONFIG,
    protected readonly cache?: RgcCacheService,
  ) {
    this.repo = em.getRepository(entity);
    this.rows = this.repo;
    this.store = em as unknown as LooseEntityManager<T>;
    const entityOptions = getRestEntityOptions(entity);
    this.primaryKey = entityOptions.primaryKey ?? 'id';
    this.modelName = entityOptions.model ?? resolveEntityName(entity);
    this.translator = new MikroOrmQueryTranslator(em, entity, config);
  }

  async list_all(params: FilterParams = {}, toJson = true, ctx?: CacheContext): Promise<unknown> {
    if (this.cache && this.shouldCache('list_all', params)) {
      return this.cache.remember('list_all', this.modelName, params, ctx, this.resolveTtl(params), () => this.listAllRaw(params, toJson));
    }
    return this.listAllRaw(params, toJson);
  }

  listAll(params?: FilterParams, toJson?: boolean, ctx?: CacheContext): Promise<unknown> {
    return this.list_all(params, toJson, ctx);
  }

  private async listAllRaw(params: FilterParams, toJson: boolean): Promise<unknown> {
    const hierarchy = maybeJson(params.hierarchy);
    if (hierarchy) return this.listHierarchy(params, toJson);
    const { where, options } = this.translator.build(params);
    const pagination = maybeJson<PaginationParams>(params.pagination);
    if (pagination) return this.paginate(where, options, pagination);
    const rows = await this.rows.find(where, options);
    return toJson ? { data: serializeMany(this.entity, rows) } : rows;
  }

  async get_one(params: FilterParams = {}, toJson = true, ctx?: CacheContext): Promise<unknown> {
    if (this.cache && this.shouldCache('get_one', params)) {
      return this.cache.remember('get_one', this.modelName, params, ctx, this.resolveTtl(params), () => this.getOneRaw(params, toJson));
    }
    return this.getOneRaw(params, toJson);
  }

  getOne(params?: FilterParams, toJson?: boolean, ctx?: CacheContext): Promise<unknown> {
    return this.get_one(params, toJson, ctx);
  }

  private async getOneRaw(params: FilterParams, toJson: boolean): Promise<unknown> {
    const { where, options } = this.translator.build(params);
    const row = await this.rows.findOne(where, options);
    if (!row) return toJson ? { data: null } : {};
    return toJson ? { data: serializeEntity(this.entity, row) } : row;
  }

  async show(params: FilterParams, id: Primary<T>): Promise<unknown> {
    const { where, options } = this.translator.build({ ...params, pagination: null, orderby: null });
    const finalWhere = andWhere(where, { [this.primaryKey]: id } as FilterQuery<T>);
    const row = await this.rows.findOne(finalWhere, options);
    if (!row) throw new NotFoundException(`${this.modelName} with id ${String(id)} not found.`);
    return serializeEntity(this.entity, row);
  }

  async create(params: Record<string, unknown> | readonly Record<string, unknown>[]): Promise<WriteResult<Record<string, unknown>>> {
    const modelKey = this.modelName.toLowerCase();
    const payload = Array.isArray(params)
      ? params
      : (params as Record<string, unknown>)[modelKey] ?? params;
    const list = Array.isArray(payload) ? payload : [payload];
    if (!list.length || list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new BadRequestException('Params must be an object or an array of objects.');
    }
    const result = await this.store.transactional(async (em) => {
      const repo = em.getRepository(this.entity);
      const created: T[] = [];
      for (const raw of list as Record<string, unknown>[]) {
        const prepared = await this.beforeCreate(raw);
        created.push(repo.create(prepared));
      }
      // One flush for the whole batch: generated columns and defaults are only
      // readable afterwards, so serialization happens once the write completed.
      await em.persist(created).flush();
      const models: WriteItemResult<Record<string, unknown>>[] = created.map((entity) => ({
        success: true,
        model: serializeEntity(this.entity, entity),
      }));
      return list.length === 1
        ? { success: true, model: models[0]?.model }
        : { success: true, models };
    });
    this.bumpCache();
    return result;
  }

  async update(attributes: Record<string, unknown>, id: Primary<T>): Promise<WriteResult<Record<string, unknown>>> {
    const key = getRestEntityOptions(this.entity).fieldKeyUpdate ?? this.primaryKey;
    const result = await this.store.transactional(async (em) => {
      const repo = em.getRepository(this.entity);
      const entity = await repo.findOne({ [key]: id });
      if (!entity) throw new NotFoundException(`${this.modelName} with ${key} ${String(id)} not found.`);
      const prepared = await this.beforeUpdate(attributes, entity);
      repo.assign(entity, stripKey(prepared, key), { mergeObjectProperties: true });
      await em.flush();
      return { success: true, model: serializeEntity(this.entity, entity) };
    });
    this.bumpCache();
    return result;
  }

  async update_multiple(list: readonly Record<string, unknown>[]): Promise<WriteResult<Record<string, unknown>>> {
    const result = await this.store.transactional(async (em) => {
      const repo = em.getRepository(this.entity);
      const updated: { index: number; entity: T }[] = [];
      const models: WriteItemResult<Record<string, unknown>>[] = [];
      let success = true;
      for (const item of list) {
        const id = item[this.primaryKey] as Primary<T> | undefined;
        if (id == null) {
          success = false;
          models.push({ success: false, message: `Missing ${this.primaryKey}.` });
          continue;
        }
        const entity = await repo.findOne({ [this.primaryKey]: id });
        if (!entity) {
          success = false;
          models.push({ success: false, message: `Record ${String(id)} not found.` });
          continue;
        }
        const prepared = await this.beforeUpdate(item, entity);
        repo.assign(entity, stripKey(prepared, this.primaryKey), { mergeObjectProperties: true });
        updated.push({ index: models.length, entity });
        models.push({ success: true });
      }
      await em.flush();
      // Serialize after the flush so persisted values (defaults, triggers) show up.
      for (const { index, entity } of updated) {
        models[index] = { success: true, model: serializeEntity(this.entity, entity) };
      }
      return { success, models };
    });
    this.bumpCache();
    return result;
  }

  updateMultiple(list: readonly Record<string, unknown>[]): Promise<WriteResult<Record<string, unknown>>> {
    return this.update_multiple(list);
  }

  async destroy(id: Primary<T>): Promise<WriteResult<Record<string, unknown>>> {
    const softField = getRestEntityOptions(this.entity).softDeleteField;
    const result = await this.store.transactional(async (em) => {
      const repo = em.getRepository(this.entity);
      const entity = await repo.findOne({ [this.primaryKey]: id });
      if (!entity) throw new NotFoundException(`${this.modelName} with id ${String(id)} not found.`);
      if (softField) {
        repo.assign(entity, { [softField]: new Date() });
        await em.flush();
      } else {
        await em.remove(entity).flush();
      }
      return { success: true, model: serializeEntity(this.entity, entity) };
    });
    this.bumpCache();
    return result;
  }

  async destroybyid(ids: unknown): Promise<WriteResult> {
    const list = normalizeIds(ids);
    await this.store.transactional(async (em) => {
      const softField = getRestEntityOptions(this.entity).softDeleteField;
      if (softField) {
        const rows = await em.find(this.entity, { [this.primaryKey]: { $in: list } });
        rows.forEach((row) => em.assign(row, { [softField]: new Date() }));
        await em.flush();
      } else {
        await em.nativeDelete(this.entity, { [this.primaryKey]: { $in: list } });
      }
    });
    this.bumpCache();
    return { success: true };
  }

  destroyById(ids: unknown): Promise<WriteResult> { return this.destroybyid(ids); }

  async restore(id: Primary<T>): Promise<WriteResult<Record<string, unknown>>> {
    const field = this.requireSoftDeleteField();
    const result = await this.store.transactional(async (em) => {
      const row = await em.findOne(this.entity, { [this.primaryKey]: id });
      if (!row) throw new NotFoundException(`${this.modelName} with id ${String(id)} not found.`);
      em.assign(row, { [field]: null });
      await em.flush();
      return { success: true, model: serializeEntity(this.entity, row) };
    });
    this.bumpCache();
    return result;
  }

  async restoreById(ids: unknown): Promise<WriteResult> {
    const field = this.requireSoftDeleteField();
    const list = normalizeIds(ids);
    await this.store.transactional(async (em) => {
      const rows = await em.find(this.entity, { [this.primaryKey]: { $in: list } });
      rows.forEach((row) => em.assign(row, { [field]: null }));
      await em.flush();
    });
    this.bumpCache();
    return { success: true };
  }

  async forceDelete(id: Primary<T>): Promise<WriteResult> {
    await this.store.transactional(async (em) => {
      const row = await em.findOne(this.entity, { [this.primaryKey]: id });
      if (!row) throw new NotFoundException(`${this.modelName} with id ${String(id)} not found.`);
      await em.remove(row).flush();
    });
    this.bumpCache();
    return { success: true };
  }

  async forceDeleteById(ids: unknown): Promise<WriteResult> {
    const list = normalizeIds(ids);
    // Wrapped like every other write path, so a bulk force-delete is atomic.
    await this.store.transactional(async (em) => {
      await em.nativeDelete(this.entity, { [this.primaryKey]: { $in: list } });
    });
    this.bumpCache();
    return { success: true };
  }

  async exportData(params: FilterParams): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
    const withoutPagination = { ...params, pagination: null };
    const result = await this.list_all(withoutPagination) as DataResult<Record<string, unknown>[]>;
    const data = result.data ?? [];
    const columns = resolveColumns(params, data);
    return { data, columns };
  }

  async exportExcel(params: FilterParams, options: ExportOptions = {}): Promise<ExportFile> {
    const { data, columns } = await this.exportData(params);
    return ExportService.toExcel(data, columns, { filename: params.filename ?? options.filename ?? 'export.xlsx' });
  }

  async exportPdf(params: FilterParams, options: ExportOptions = {}): Promise<ExportFile> {
    const { data, columns } = await this.exportData(params);
    return ExportService.toPdf(data, columns, { filename: params.filename ?? options.filename ?? 'export.pdf', title: options.title ?? this.modelName });
  }

  getDeniedFields(user?: RoleAwareUser | null): string[] { return getDeniedFieldsForUser(this.entity, user); }

  stripForUser<P extends Record<string, unknown>>(payload: P | P[], user?: RoleAwareUser | null): P | P[] {
    return stripDeniedFields(payload, this.getDeniedFields(user));
  }

  async listHierarchy(params: FilterParams, toJson = true): Promise<unknown> {
    const options = getRestEntityOptions(this.entity);
    if (!options.hierarchyParentField) throw new BadRequestException(`${this.modelName} has no hierarchyParentField.`);
    const hierarchyInput = params.hierarchy;
    const hierarchy = hierarchyInput === true || hierarchyInput === false || hierarchyInput == null
      ? {}
      : (maybeJson<Record<string, unknown>>(hierarchyInput as string | Record<string, unknown>) ?? {});
    const queryParams = { ...params, hierarchy: null, pagination: null };
    const { where, options: findOptions } = this.translator.build(queryParams);
    const roots = await this.rows.find(where, findOptions);
    const engine = new HierarchyEngine<T>(this.rows, this.entity, this.primaryKey, options.hierarchyParentField);
    const tree = await engine.buildFromRoots(roots, hierarchy);
    return toJson ? { data: tree } : tree;
  }

  /** Override to shape a payload before insert; may be async in a subclass. */
  protected beforeCreate(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return Promise.resolve(payload); }
  /** Override to shape a payload before update; may be async in a subclass. */
  protected beforeUpdate(payload: Record<string, unknown>, _entity: T): Promise<Record<string, unknown>> { return Promise.resolve(payload); }

  protected defaultPageSize(): number { return getRestEntityOptions(this.entity).defaultPageSize ?? 15; }

  private async paginate(
    where: FilterQuery<T>,
    options: FindOptions<T, never>,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Record<string, unknown>> | CursorPaginatedResult<Record<string, unknown>>> {
    const perPage = Math.max(1, Math.min(500, toPositiveInt(pagination.pageSize ?? pagination.pagesize) ?? this.defaultPageSize()));
    if (pagination.infinity === true) {
      const cursorWhere = pagination.cursor == null
        ? where
        : andWhere(where, { [this.primaryKey]: { $gt: pagination.cursor } } as FilterQuery<T>);
      // Keyset pagination is only stable under a deterministic order, and the
      // cursor compares against the primary key - so that is the order we force
      // unless the caller asked for one explicitly.
      const orderBy = options.orderBy ?? { [this.primaryKey]: 'asc' };
      const rows = await this.rows.find(cursorWhere, { ...options, orderBy, limit: perPage + 1 });
      const hasMore = rows.length > perPage;
      const page = rows.slice(0, perPage);
      const last = page.at(-1) as Record<string, unknown> | undefined;
      return {
        data: serializeMany(this.entity, page),
        per_page: perPage,
        next_cursor: hasMore ? (last?.[this.primaryKey] as string | number | undefined) ?? null : null,
        has_more: hasMore,
      };
    }
    const current = Math.max(1, toPositiveInt(pagination.page) ?? 1);
    const [rows, total] = await this.rows.findAndCount(where, {
      ...options,
      limit: perPage,
      offset: (current - 1) * perPage,
    });
    return {
      data: serializeMany(this.entity, rows),
      current_page: current,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  private shouldCache(operation: string, params: FilterParams): boolean {
    if (params.cache === false || this.cacheable === false) return false;
    // An explicit `cache=true` on the request opts in, matching `cache=false`
    // opting out; otherwise fall back to the service flag and global config.
    const enabled = params.cache === true || this.cacheable === true || this.config.cache.enabled;
    if (!enabled) return false;
    const operations = this.cacheableOperations.length ? this.cacheableOperations : [...this.config.cache.cacheableMethods];
    return operations.includes(operation);
  }

  private resolveTtl(params: FilterParams): number | null {
    return toPositiveInt(params.cache_ttl) ?? this.cacheTtl;
  }

  private bumpCache(): void { this.cache?.bump(this.modelName); }

  private requireSoftDeleteField(): string {
    const field = getRestEntityOptions(this.entity).softDeleteField;
    if (!field) throw new BadRequestException(`${this.modelName} does not support soft deletes.`);
    return field;
  }
}

function andWhere<T extends object>(a: FilterQuery<T>, b: FilterQuery<T>): FilterQuery<T> {
  if (!a || Object.keys(a).length === 0) return b;
  return { $and: [a, b] } as FilterQuery<T>;
}

/** Identifier columns are matched on, never assigned from the payload. */
function stripKey(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  if (!(key in payload)) return payload;
  const clone = { ...payload };
  Reflect.deleteProperty(clone, key);
  return clone;
}

function toPositiveInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function normalizeIds(ids: unknown): unknown[] {
  if (Array.isArray(ids)) return ids;
  if (typeof ids === 'string') {
    try {
      const parsed = JSON.parse(ids) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return ids.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  if (ids && typeof ids === 'object' && Array.isArray((ids as { ids?: unknown[] }).ids)) return (ids as { ids: unknown[] }).ids;
  return [ids];
}

function resolveColumns(params: FilterParams, data: readonly Record<string, unknown>[]): string[] {
  if (params.columns) return Array.isArray(params.columns) ? params.columns : String(params.columns).split(',').map((v) => v.trim());
  if (params.select && params.select !== '*') return Array.isArray(params.select) ? params.select : String(params.select).split(',').map((v) => v.trim());
  return data[0] ? Object.keys(data[0]) : [];
}
