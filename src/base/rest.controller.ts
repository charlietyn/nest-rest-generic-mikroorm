import {
  Body, Delete, Get, Headers, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import type { Primary } from '@mikro-orm/core';
import type { BaseService } from './base.service.js';
import type { FilterParams } from '../interfaces/filter-params.interface.js';

export abstract class RestController<T extends object> {
  protected constructor(protected readonly service: BaseService<T>) {}

  @Get()
  index(
    @Query() query: FilterParams,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<unknown> {
    return this.service.list_all(processRequest(query), true, { headers: normalizeHeaders(headers) });
  }

  @Get('one')
  getOne(
    @Query() query: FilterParams,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<unknown> {
    return this.service.get_one(processRequest(query), true, { headers: normalizeHeaders(headers) });
  }

  @Get(':id')
  show(@Param('id') id: Primary<T>, @Query() query: FilterParams): Promise<unknown> {
    return this.service.show(processRequest(query), id);
  }

  @Post()
  store(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: Primary<T>, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.service.update(body, id);
  }

  @Patch('multiple')
  updateMultiple(@Body() body: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown> {
    const values = Array.isArray(body)
      ? body
      : (Object.values(body).find(Array.isArray) as Record<string, unknown>[] | undefined) ?? [];
    return this.service.update_multiple(values);
  }

  @Delete(':id')
  destroy(@Param('id') id: Primary<T>): Promise<unknown> {
    return this.service.destroy(id);
  }

  @Post('delete-by-id')
  deleteById(@Body() body: unknown): Promise<unknown> {
    return this.service.destroybyid(resolveBulkIds(body));
  }

  @Post(':id/restore')
  restore(@Param('id') id: Primary<T>): Promise<unknown> {
    return this.service.restore(id);
  }

  @Post('restore-multiple')
  restoreMultiple(@Body() body: unknown): Promise<unknown> {
    return this.service.restoreById(resolveBulkIds(body));
  }

  @Delete(':id/force')
  forceDelete(@Param('id') id: Primary<T>): Promise<unknown> {
    return this.service.forceDelete(id);
  }

  @Post('force-delete-multiple')
  forceDeleteMultiple(@Body() body: unknown): Promise<unknown> {
    return this.service.forceDeleteById(resolveBulkIds(body));
  }

  @Get('export/excel')
  exportExcel(@Query() query: FilterParams): Promise<unknown> {
    return this.service.exportExcel(processRequest(query));
  }

  @Get('export/pdf')
  exportPdf(@Query() query: FilterParams): Promise<unknown> {
    return this.service.exportPdf(processRequest(query));
  }
}

export function processRequest(input: FilterParams): FilterParams {
  const attr = input.attr ?? input.eq ?? null;
  return {
    relations: input.relations ?? null,
    _nested: input._nested ?? false,
    soft_delete: input.soft_delete ?? null,
    attr,
    select: input.select ?? '*',
    pagination: input.pagination ?? null,
    orderby: input.orderby ?? null,
    oper: input.oper ?? null,
    hierarchy: input.hierarchy ?? null,
    cache: input.cache,
    cache_ttl: input.cache_ttl,
    columns: input.columns,
    filename: input.filename,
  };
}

export function resolveBulkIds(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const object = body as Record<string, unknown>;
    if (Array.isArray(object.ids)) return object.ids;
    const firstArray = Object.values(object).find(Array.isArray);
    if (Array.isArray(firstArray)) return firstArray;
  }
  return [body];
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : value]),
  );
}
