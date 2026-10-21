import {
  DynamicModule,
  Global,
  Module,
  type InjectionToken,
  type OptionalFactoryDependency,
  type Provider,
} from '@nestjs/common';
import {
  DEFAULT_CONFIG,
  REST_GENERIC_CONFIG,
  mergeConfig,
  type DeepPartial,
  type RestGenericConfig,
} from '../config/rest-generic.config.js';
import { MemoryCacheStore, RgcCacheService, type CacheStore } from '../cache/cache.service.js';

export interface GenericRestModuleOptions extends DeepPartial<RestGenericConfig> {
  cacheStore?: CacheStore;
  global?: boolean;
}

/** Internal token holding the resolved options of {@link GenericRestModule.forRootAsync}. */
const RESOLVED_ASYNC_OPTIONS = Symbol.for('nest-rest-generic-mikroorm:async-options');

@Global()
@Module({})
export class GenericRestModule {
  static forRoot(options: GenericRestModuleOptions = {}): DynamicModule {
    const merged = mergeConfig(options);
    const providers: Provider[] = [
      { provide: REST_GENERIC_CONFIG, useValue: merged },
      {
        provide: RgcCacheService,
        useFactory: () => new RgcCacheService(options.cacheStore ?? new MemoryCacheStore(), merged),
      },
    ];
    return {
      module: GenericRestModule,
      global: options.global ?? true,
      providers,
      exports: [REST_GENERIC_CONFIG, RgcCacheService],
    };
  }

  static forRootAsync(options: {
    inject?: (InjectionToken | OptionalFactoryDependency)[];
    useFactory: (...args: never[]) => Promise<GenericRestModuleOptions> | GenericRestModuleOptions;
    global?: boolean;
  }): DynamicModule {
    // The factory runs once behind its own token so both the config and the cache
    // store come from the same resolved options; resolving it twice would drop a
    // custom `cacheStore` and silently fall back to the in-memory one.
    const resolvedProvider: Provider = {
      provide: RESOLVED_ASYNC_OPTIONS,
      inject: options.inject ?? [],
      useFactory: (...args: never[]) => options.useFactory(...args),
    };
    const configProvider: Provider = {
      provide: REST_GENERIC_CONFIG,
      inject: [RESOLVED_ASYNC_OPTIONS],
      useFactory: (resolved: GenericRestModuleOptions) => mergeConfig(resolved),
    };
    const cacheProvider: Provider = {
      provide: RgcCacheService,
      inject: [RESOLVED_ASYNC_OPTIONS, REST_GENERIC_CONFIG],
      useFactory: (resolved: GenericRestModuleOptions, config: RestGenericConfig) =>
        new RgcCacheService(resolved.cacheStore ?? new MemoryCacheStore(), config),
    };
    return {
      module: GenericRestModule,
      global: options.global ?? true,
      providers: [resolvedProvider, configProvider, cacheProvider],
      exports: [REST_GENERIC_CONFIG, RgcCacheService],
    };
  }
}

export { DEFAULT_CONFIG };
