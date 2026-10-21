# nest-rest-generic-mikroorm

MikroORM implementation of the `rest-generic-class` family for NestJS.

It keeps the compact architecture and public vocabulary of the TypeORM and Sequelize siblings while using MikroORM natively: EntityManager, EntityRepository, Unit of Work, Identity Map, `populate`, partial `fields`, criteria filters and `transactional()`.

## Requirements

- Node.js 24 LTS or newer
- NestJS 11
- MikroORM 6 or 7 (`@mikro-orm/core`, `@mikro-orm/nestjs`)

New to the codebase? Start with **[docs/GUIDE_FOR_JUNIORS.md](docs/GUIDE_FOR_JUNIORS.md)**.

## Install

```bash
npm install @charlietyn/nest-rest-generic-mikroorm @mikro-orm/core @mikro-orm/nestjs @mikro-orm/postgresql
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

REST metadata is attached to an entity in whichever style your MikroORM version
uses. Both forms write to the same registry, so the rest of the library does not
care which one you picked.

**MikroORM 7** — decorators were removed from `@mikro-orm/core`, so entities are
declared with `defineEntity` and registered with `registerRestEntity`:

```ts
import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { registerRestEntity } from '@charlietyn/nest-rest-generic-mikroorm';

export const Product = defineEntity({
  name: 'Product',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    price: p.decimal(),
    category: p.manyToOne(Category),
    deletedAt: p.datetime().nullable(),
  }),
});
export type Product = InferEntity<typeof Product>;

registerRestEntity<Product>(Product, {
  model: 'Product',
  primaryKey: 'id',
  relations: ['category'],
  allowedFields: ['id', 'name', 'price', 'deletedAt'],
  softDeleteField: 'deletedAt',
});
```

**MikroORM 6** — the class decorator still works:

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

> A self-referencing relation must defer the whole property —
> `parent: () => p.manyToOne(Node).nullable()`. Passing the arrow to `manyToOne`
> instead (`p.manyToOne(() => Node)`) resolves the entity name to `''` and entity
> discovery fails.

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

Boolean query keys (`soft_delete`, `_nested`, `cache`, `hierarchy`) are coerced
from their string form, so `?soft_delete=true` behaves the same as a JSON body
carrying a real boolean.

### The `regexp` operator is opt-in

`regexp` / `not regexp` compile a caller-supplied pattern with `new RegExp(...)`,
which lets a crafted request hang the event loop. They are supported but **not**
in `DEFAULT_ALLOWED_OPERATORS`. Enable them only for trusted endpoints:

```ts
GenericRestModule.forRoot({
  filtering: {
    allowedOperators: [...DEFAULT_ALLOWED_OPERATORS, 'regexp', 'not regexp'],
  },
})
```

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

- `docs/GUIDE_FOR_JUNIORS.md` — start here
- `docs/PARITY_MATRIX.md`
- `docs/ARCHITECTURE.md`
- `docs/MIGRATION_FROM_LARAVEL.md`
- `docs/INTENTIONAL_DIFFERENCES.md`
- `docs/VERIFICATION.md`
