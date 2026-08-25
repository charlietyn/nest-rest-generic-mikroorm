# Migration from `rest-generic-class`

## Naming and API

The main public service methods retain the Laravel names (`list_all`, `get_one`, `update_multiple`, `destroybyid`) for compatibility. Camel-case aliases are available where the sibling NestJS packages already expose them.

## Model configuration

Laravel static constants such as `MODEL`, `RELATIONS`, `FIELD_KEY_UPDATE`, hierarchy metadata and field visibility become `@RestGenericEntity({...})` metadata.

## Query parameters

The observable request vocabulary is preserved: `relations`, `_nested`, `soft_delete`, `attr`/`eq`, `select`, `pagination`, `orderby`, `oper`, and `hierarchy`.

## Transactions

Controller-level `DB::beginTransaction()` is replaced by service-level `EntityManager.transactional()`. This is intentional: the transaction belongs around persistence logic and naturally composes with MikroORM's Unit of Work.

## Validation

Laravel `BaseFormRequest` and model scenario validation are not translated literally. Nest applications should use DTOs + ValidationPipe for HTTP validation and override `beforeCreate` / `beforeUpdate` for model-aware business checks.

## Soft delete

Declare `softDeleteField: 'deletedAt'`. Normal reads add `deletedAt = null`; `soft_delete: true` selects deleted rows; `soft_delete: false` disables that implicit criterion.

## Relations

Declare allowed relations. A request such as `relations=category:id,name` is translated into `populate` + partial `fields`, without triggering population from the serializer.
