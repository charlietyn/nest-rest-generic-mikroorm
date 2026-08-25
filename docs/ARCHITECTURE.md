# Architecture

The library deliberately follows the compact architecture of the sibling packages and the user's generic Laravel-style organization. It does **not** introduce Domain/Application/Infrastructure layers, use-cases, repositories-over-repositories, or DDD ceremony.

## Layers that actually exist

`RestController` → `BaseService` → `MikroOrmQueryTranslator` / `EntityRepository` → MikroORM Unit of Work.

Cross-cutting helpers are grouped by purpose: cache, serialization, export, security, hierarchy and errors.

## MikroORM-native decisions

- `EntityManager` and `EntityRepository` are injected/obtained from Nest/MikroORM.
- Writes use managed entities, `assign`, `persist`, `remove`, `flush`, and `transactional`.
- No Active Record façade is simulated.
- Serialization never calls `populate` and therefore never creates hidden SQL.
- Dynamic filters become a validated criteria AST before reaching MikroORM.
- Relations and selectable fields are whitelisted through entity metadata.
- Cursor pagination is keyset-based on the configured primary key.
- Soft delete is explicit through a configured nullable field because MikroORM has no universal Eloquent `SoftDeletes` contract.
