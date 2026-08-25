# nest-rest-generic-mikroorm

MikroORM implementation of the `rest-generic-class` family for NestJS.

It keeps the compact architecture and public vocabulary of the TypeORM and Sequelize siblings while using MikroORM natively: EntityManager, EntityRepository, Unit of Work, Identity Map, `populate`, partial `fields`, criteria filters and `transactional()`.

## Requirements

- Node.js 24 LTS or newer
- NestJS 11
- MikroORM 7
- `@mikro-orm/nestjs` 7

## Install

```bash
npm install nest-rest-generic-mikroorm @mikro-orm/core @mikro-orm/nestjs @mikro-orm/postgresql
```

Use the driver appropriate for your database.

## Root registration

```ts
@Module({
  imports: [
    MikroOrmModule.forRoot({...}),
    GenericRestModule.forRoot({
      filtering: { maxDepth: 5, maxConditions: 100 },
      cache: { enabled: false },
    }),
  ],
})
export class AppModule {}
```

## Entity

```ts
@RestGenericEntity<Product>({
  model: 'Product',
  primaryKey: 'id',
  relations: ['category'],
  allowedFields: ['id', 'name', 'price', 'deletedAt'],
  softDeleteField: 'deletedAt',
})
@Entity()
export class Product {
  @PrimaryKey() id!: number;
  @Property() name!: string;
}
```

## Service

```ts
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
```

## Controller inheritance

```ts
@Controller('products')
export class ProductController extends RestController<Product> {
  constructor(service: ProductService) {
    super(service);
  }
}
```

The controller inherits generic actions for list, one, show, create, update, bulk update, delete, restore, force delete and export. This intentionally matches the generic-controller approach used by the sibling packages.

## HTTP query contract

Supported keys:

- `attr` / `eq`
- `oper`
- `relations`
- `_nested`
- `select`
- `orderby`
- `pagination`
- `hierarchy`
- `soft_delete`
- `cache`, `cache_ttl`
- export `columns`, `filename`

Example:

```http
GET /products?relations=["category:id,name"]&oper={"and":["price|>=|10"]}&pagination={"page":1,"pageSize":20}
```

## Dynamic filtering

`oper` accepts leaf strings `field|operator|value`, logical groups and relation nodes. Input is validated against maximum depth/condition count, allowed operators, relation whitelist and optional field whitelist before criteria are handed to MikroORM.

## Serialization

Serialization uses MikroORM `wrap(entity).toObject()` on already-loaded entities only. It never performs population and therefore cannot create SQL merely because an API response is serialized.

## Caching

Caching is opt-in. A storage-neutral `CacheStore` interface and a default in-memory store are included. Cache keys can vary by headers and are invalidated by per-model version increments after successful writes.

## Testing

```bash
npm test
npm run typecheck
npm run build
npm run lint
```

The integration suite uses SQLite in memory.

## Documentation

- `docs/PARITY_MATRIX.md`
- `docs/ARCHITECTURE.md`
- `docs/MIGRATION_FROM_LARAVEL.md`
- `docs/INTENTIONAL_DIFFERENCES.md`
