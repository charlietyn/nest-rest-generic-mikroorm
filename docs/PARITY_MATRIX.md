# Laravel → NestJS/MikroORM Parity Matrix

Status vocabulary: `ANALYZED`, `DESIGNED`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, `INTENTIONAL_DIFFERENCE`.

> The statuses below describe design intent. For what has actually been
> executed - install, lint, typecheck, build and the 26-test suite - see
> [VERIFICATION.md](VERIFICATION.md). Rows covered by executable tests today:
> RGC-001..013 (CRUD/bulk), RGC-014..023 (filters), RGC-026/027 (pagination),
> RGC-028 (hierarchy), RGC-035 (field policy), RGC-040 (serialization).

| ID | Laravel capability | Evidence / source area | NestJS + MikroORM design | Status |
|---|---|---|---|---|
| RGC-001 | Generic list_all | BaseService / sibling BaseService | `BaseService.list_all()` + MikroORM `find()` | IMPLEMENTED |
| RGC-002 | Generic get_one | BaseService | `get_one()` + `findOne()` | IMPLEMENTED |
| RGC-003 | show(id) | RestController/BaseService | `show()` with PK criteria | IMPLEMENTED |
| RGC-004 | create single | BaseService | Unit-of-Work `persist().flush()` inside `transactional()` | IMPLEMENTED |
| RGC-005 | create bulk | BaseService | batched entities, one transaction / one flush stream | IMPLEMENTED |
| RGC-006 | update | BaseService | managed entity + `assign()` + flush | IMPLEMENTED |
| RGC-007 | update_multiple | BaseService | managed entities in one transaction | IMPLEMENTED |
| RGC-008 | destroy | RestController/BaseService | configurable soft-delete field or physical remove | IMPLEMENTED |
| RGC-009 | bulk delete | RestController/BaseService | batch criteria, no per-row query for hard delete | IMPLEMENTED |
| RGC-010 | restore | Laravel soft-delete additions | clear configured soft-delete field | IMPLEMENTED |
| RGC-011 | restore multiple | Laravel controller | batch fetch + one flush | IMPLEMENTED |
| RGC-012 | force delete | Laravel controller | physical remove | IMPLEMENTED |
| RGC-013 | force delete multiple | Laravel controller | `nativeDelete` batch | IMPLEMENTED |
| RGC-014 | attr / eq equality filters | process_request / BaseService | validated FilterQuery criteria | IMPLEMENTED |
| RGC-015 | oper dynamic filters | HasDynamicFilter / QueryBuilderPipeline | parsed AST → MikroORM criteria | IMPLEMENTED |
| RGC-016 | AND / OR groups | HasDynamicFilter | `$and` / `$or` criteria | IMPLEMENTED |
| RGC-017 | relation filters | relation-aware oper tree | nested criteria | IMPLEMENTED |
| RGC-018 | max filter depth | config filtering.max_depth | enforced in translator | IMPLEMENTED |
| RGC-019 | max condition count | config filtering.max_conditions | enforced in translator | IMPLEMENTED |
| RGC-020 | operator whitelist | config allowed_operators | typed/config whitelist | IMPLEMENTED |
| RGC-021 | relation whitelist | RELATIONS contract | `@RestGenericEntity({ relations })` | IMPLEMENTED |
| RGC-022 | relation field selection | `relation:id,name` | dotted MikroORM `fields` paths | IMPLEMENTED |
| RGC-023 | root select | `select` | MikroORM `fields` | IMPLEMENTED |
| RGC-024 | ordering | HasDynamicOrderBy | MikroORM `orderBy` | IMPLEMENTED |
| RGC-025 | nested ordering | dot notation | validated nested `orderBy` | IMPLEMENTED |
| RGC-026 | length-aware pagination | PaginationCoordinator | `findAndCount` | IMPLEMENTED |
| RGC-027 | cursor/infinity pagination | CursorPaginator | keyset on primary key | IMPLEMENTED |
| RGC-028 | hierarchy | HierarchyCoordinator | breadth-first batched hierarchy engine | IMPLEMENTED |
| RGC-029 | query cache | CacheCoordinator | cache store abstraction + model version invalidation | IMPLEMENTED |
| RGC-030 | per-method cache TTL | Laravel config | config + request/service override | IMPLEMENTED |
| RGC-031 | cache vary headers | Laravel config | CacheContext vary header hash | IMPLEMENTED |
| RGC-032 | cache invalidation after writes | CacheCoordinator | model version bump | IMPLEMENTED |
| RGC-033 | Excel export | ModelExport / ExportCoordinator | optional `exceljs` adapter | IMPLEMENTED |
| RGC-034 | PDF export | ExportCoordinator | optional `pdfkit` adapter | IMPLEMENTED |
| RGC-035 | field restrictions by role | permission support | metadata + strip helper | IMPLEMENTED |
| RGC-036 | DB error parsing | DatabaseErrorParser | driver-message classification → Nest exceptions | IMPLEMENTED |
| RGC-037 | inherited generic controller actions | RestController | abstract decorated base controller inherited by concrete controllers | IMPLEMENTED |
| RGC-038 | query/body request normalization | RestController::process_request | `processRequest()` | IMPLEMENTED |
| RGC-039 | bulk-id request shapes | resolveBulkIds | raw array / `{ids}` / entity keyed | IMPLEMENTED |
| RGC-040 | serializer without lazy SQL | Eloquent json serialization semantics | `wrap(entity).toObject()` only; no population from serializer | IMPLEMENTED |
| RGC-041 | hidden fields | model/resource behavior | entity metadata whitelist/hidden fields | IMPLEMENTED |
| RGC-042 | request-scoped EntityManager | MikroORM requirement | caller-provided/request-context EM; no global mutable EM | DESIGNED |
| RGC-043 | Unit of Work / Identity Map | MikroORM native model | managed entities and `flush()` | IMPLEMENTED |
| RGC-044 | Laravel model scenarios/self_validate | BaseModel/BaseFormRequest | Nest DTO/Pipe remains application-level; service hooks `beforeCreate/beforeUpdate` | INTENTIONAL_DIFFERENCE |
| RGC-045 | Laravel PARENT inheritance persistence | BaseService parent save helpers | not emulated; entity relations/composition should model inheritance explicitly | INTENTIONAL_DIFFERENCE |
| RGC-046 | Spatie-specific permission model/controllers | permission subsystem | generic role-field API only; framework-specific Spatie semantics not copied | INTENTIONAL_DIFFERENCE |
| RGC-047 | Mongo-specific Eloquent relation extensions | BaseModelMongo / MongoHasMany | out of SQL MikroORM core package scope; MikroORM Mongo can be separate adapter | INTENTIONAL_DIFFERENCE |
| RGC-048 | request middleware injection/transform chain | Laravel middleware | Nest Pipes/Interceptors are extension points; no global mutation | INTENTIONAL_DIFFERENCE |
| RGC-049 | validation rules querying DB | Laravel Rules | recommended DTO validators / custom async validators using EM | DESIGNED |
| RGC-050 | strict unsafe property protection | security requirement | blocks prototype-sensitive paths + field/relation whitelist | IMPLEMENTED |

## Verification note

This matrix distinguishes code presence from executed verification. `VERIFIED` is intentionally not used unless installation, typecheck and runtime tests pass in a dependency-complete environment.
