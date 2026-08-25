import { DynamicModule, Global, Module, type Provider } from '@nestjs/common';
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
    inject?: unknown[];
    useFactory: (...args: never[]) => Promise<GenericRestModuleOptions> | GenericRestModuleOptions;
    global?: boolean;
  }): DynamicModule {
    const configProvider: Provider = {
      provide: REST_GENERIC_CONFIG,
      inject: options.inject ?? [],
      useFactory: async (...args: never[]) => mergeConfig(await options.useFactory(...args)),
    };
    const cacheProvider: Provider = {
      provide: RgcCacheService,
      inject: [REST_GENERIC_CONFIG],
      useFactory: (config: RestGenericConfig) => new RgcCacheService(new MemoryCacheStore(), config),
    };
    return {
      module: GenericRestModule,
      global: options.global ?? true,
      providers: [configProvider, cacheProvider],
      exports: [REST_GENERIC_CONFIG, RgcCacheService],
    };
  }
}

export { DEFAULT_CONFIG };
