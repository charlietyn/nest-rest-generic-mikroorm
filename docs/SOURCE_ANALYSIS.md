# Source and project-conversation analysis

## Repositories inspected

- `charlietyn/rest-generic-class` (`main`, tree `1830029684c770f25a4a4fa2f8d271394de46f39`)
- `charlietyn/nest-rest-generic-typeorm` (`main`, tree `9d6aac42856abc0a13cf50356a40e476b76d7c1f`)
- `charlietyn/nest-rest-generic-sequelize` (`main`, tree `beecaa8dfa9a56ea660b8734dfa099de27315abb`)
- `charlietyn/nest-rest-generic-mikroorm`: existed but was empty at analysis time.

## Project decisions applied

The project conversations establish a compact, generic, Laravel-inspired architecture for NestJS. The implementation therefore avoids DDD folders (`domain`, `application`, `infrastructure`), use-case classes, and repository wrappers that would grow mechanically with each feature. Controllers inherit generic actions from a base controller, services remain generic, and functionality is grouped by practical concern (`base`, `query`, `cache`, `security`, etc.).

The TypeORM and Sequelize siblings are treated as ecosystem references for naming and public API, not as semantic authorities over MikroORM. MikroORM's Data Mapper, Unit of Work, Identity Map, request-scoped EntityManager and population model take precedence where ORM behavior differs.

## Laravel evidence used

The Laravel repository exposes a `RestController` that normalizes `relations`, `_nested`, `soft_delete`, `attr`/`eq`, `select`, `pagination`, `orderby`, `oper` and `hierarchy`; generic CRUD/bulk/restore/force-delete/export actions; and explicit database transactions. `BaseService` composes query, relation, pagination, hierarchy, export and cache coordinators, supports dynamic filtering/order, cache overrides, relation whitelists, hierarchy and model-level validation hooks. The configuration defines maximum filter depth/conditions, a strict relation policy, operator whitelist, cache TTLs/vary headers, validation cache and permission contracts.

## Sibling evidence used

Both NestJS siblings use the same compact organization: `base`, `cache`, `config`, `errors`, `export`, `hierarchy`, `interfaces`, `module`, `query`, `security`, and `index.ts`. Their service contracts retain snake-case Laravel method names while adding Nest/TypeScript-friendly aliases. The ORM-specific translator is the main area that changes between TypeORM and Sequelize.
