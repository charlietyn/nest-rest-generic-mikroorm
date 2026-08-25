import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BaseService, REST_GENERIC_CONFIG, RgcCacheService, type RestGenericConfig } from '../src/index.js';
import { Product } from './product.entity.js';

@Injectable()
export class ProductService extends BaseService<Product> {
  constructor(
    em: EntityManager,
    @Inject(REST_GENERIC_CONFIG) config: RestGenericConfig,
    cache: RgcCacheService,
  ) {
    super(em, Product, config, cache);
  }
}
