import { createHash } from 'node:crypto';
import type { RestGenericConfig } from '../config/rest-generic.config.js';

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined> | T | undefined;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
}

interface MemoryEntry { value: unknown; expiresAt: number; }

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();
  get<T>(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value as T;
  }
  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  delete(key: string): void { this.entries.delete(key); }
}

export interface CacheContext { headers?: Readonly<Record<string, string | undefined>>; }

export class RgcCacheService {
  private readonly versions = new Map<string, number>();
  constructor(private readonly store: CacheStore, private readonly config: RestGenericConfig) {}

  async remember<T>(
    operation: string,
    model: string,
    params: Readonly<Record<string, unknown>>,
    context: CacheContext | undefined,
    ttl: number | null,
    factory: () => Promise<T>,
  ): Promise<T> {
    const key = this.key(operation, model, params, context);
    const hit = await this.store.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await factory();
    await this.store.set(key, value, ttl ?? this.config.cache.ttlByMethod[operation] ?? this.config.cache.ttl);
    return value;
  }

  bump(model: string): void {
    this.versions.set(model, (this.versions.get(model) ?? 0) + 1);
  }

  private key(operation: string, model: string, params: Readonly<Record<string, unknown>>, context?: CacheContext): string {
    const vary = Object.fromEntries(this.config.cache.varyHeaders.map((h) => [h.toLowerCase(), context?.headers?.[h.toLowerCase()] ?? '']));
    const payload = stableStringify({ operation, model, version: this.versions.get(model) ?? 0, params, vary });
    return `${this.config.cache.prefix}:${createHash('sha256').update(payload).digest('hex')}`;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(object[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
