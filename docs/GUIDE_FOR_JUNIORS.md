# Guía para juniors

Esta guía asume que sabes TypeScript y algo de NestJS, pero **nada** de esta
librería ni de MikroORM. Al terminar deberías poder crear un endpoint REST
completo y entender qué pasa por dentro.

> El resto de la documentación está en inglés. Esta guía está en español a
> propósito, porque es material de incorporación al equipo.

---

## 1. Qué problema resuelve

Escribir un CRUD REST es repetitivo: listar con filtros, paginar, ordenar, traer
relaciones, ocultar campos, borrar en suave, restaurar, exportar. En un proyecto
con 40 entidades acabas copiando el mismo controlador 40 veces.

Esta librería te da dos clases base:

- **`BaseService<T>`** — toda la lógica de datos (listar, crear, actualizar, borrar…).
- **`RestController<T>`** — todas las rutas HTTP ya cableadas a ese servicio.

Tú heredas de ellas y declaras **metadatos** sobre tu entidad. No escribes el CRUD.

La clave es que el cliente puede filtrar, ordenar y paginar **desde la URL**, sin
que tú programes cada combinación. Y —esto es lo importante— sin que pueda pedir
campos o relaciones que tú no hayas autorizado.

---

## 2. El modelo mental

Una petición HTTP recorre siempre el mismo camino:

```
GET /products?oper={"and":["price|>=|10"]}
        │
        ▼
  RestController            ← recibe la query, la normaliza (processRequest)
        │
        ▼
  BaseService               ← decide: ¿caché? ¿jerarquía? ¿paginación?
        │
        ▼
  MikroOrmQueryTranslator   ← VALIDA y traduce la query a criterios de MikroORM
        │
        ▼
  EntityRepository          ← MikroORM ejecuta el SQL
        │
        ▼
  serializeEntity           ← quita campos ocultos antes de responder
```

Dos ideas que conviene interiorizar desde el principio:

1. **El traductor es la frontera de seguridad.** Nada llega a MikroORM sin pasar
   por su validación (profundidad, número de condiciones, operadores permitidos,
   relaciones y campos en lista blanca).
2. **El serializador es la frontera de salida.** Ningún campo marcado como oculto
   sale en la respuesta, venga de donde venga.

---

## 3. Tu primer endpoint, paso a paso

### Paso 1 — Registra el módulo una vez, en el `AppModule`

```ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GenericRestModule } from '@charlietyn/nest-rest-generic-mikroorm';

@Module({
  imports: [
    MikroOrmModule.forRoot({ /* tu configuración de base de datos */ }),
    GenericRestModule.forRoot({
      filtering: { maxDepth: 5, maxConditions: 100 },
      cache: { enabled: false },
    }),
  ],
})
export class AppModule {}
```

`GenericRestModule` es `@Global()` por defecto: registra el token de configuración
y el servicio de caché para toda la aplicación.

### Paso 2 — Declara la entidad y sus metadatos REST

Con MikroORM 7 (los decoradores ya no existen en `@mikro-orm/core`):

```ts
import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { registerRestEntity } from '@charlietyn/nest-rest-generic-mikroorm';
import { Category } from './category.entity.js';

export const Product = defineEntity({
  name: 'Product',
  properties: (p) => ({
    id: p.integer().primary(),
    name: p.string(),
    price: p.decimal(),
    cost: p.decimal(),                    // interno: no queremos exponerlo
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
  hiddenFields: ['cost'],
  softDeleteField: 'deletedAt',
  defaultPageSize: 20,
});
```

Con MikroORM 6, lo mismo con el decorador `@RestGenericEntity({...})` sobre la
clase. Escriben en el mismo registro; el resto de la librería no nota diferencia.

### Paso 3 — El servicio

```ts
import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  BaseService, REST_GENERIC_CONFIG, RgcCacheService,
  type RestGenericConfig,
} from '@charlietyn/nest-rest-generic-mikroorm';
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
```

Eso es todo. No escribes ningún método.

### Paso 4 — El controlador

```ts
import { Controller } from '@nestjs/common';
import { RestController } from '@charlietyn/nest-rest-generic-mikroorm';
import { Product } from './product.entity.js';
import { ProductService } from './product.service.js';

@Controller('products')
export class ProductController extends RestController<Product> {
  constructor(service: ProductService) { super(service); }
}
```

### Paso 5 — El módulo de la feature

```ts
@Module({
  imports: [MikroOrmModule.forFeature([Product, Category])],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
```

Con esas ~40 líneas ya tienes estas rutas funcionando:

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/products` | Lista con filtros, orden y paginación |
| `GET` | `/products/one` | Devuelve un único registro según filtros |
| `GET` | `/products/:id` | Devuelve por id (404 si no existe) |
| `POST` | `/products` | Crea uno o varios |
| `PUT` | `/products/:id` | Actualiza uno |
| `PATCH` | `/products/multiple` | Actualiza varios |
| `DELETE` | `/products/:id` | Borra (suave si hay `softDeleteField`) |
| `POST` | `/products/delete-by-id` | Borra varios |
| `POST` | `/products/:id/restore` | Restaura uno |
| `POST` | `/products/restore-multiple` | Restaura varios |
| `DELETE` | `/products/:id/force` | Borra físicamente |
| `POST` | `/products/force-delete-multiple` | Borra físicamente varios |
| `GET` | `/products/export/excel` | Exporta a Excel |
| `GET` | `/products/export/pdf` | Exporta a PDF |

---

## 4. El lenguaje de consulta

Todo se pasa por query string. Las claves son siempre las mismas.

### `attr` (o `eq`) — igualdad simple

```http
GET /products?attr={"name":"Teclado"}
GET /products?attr={"id":[1,2,3]}          → un array se traduce a IN
```

### `oper` — filtros con operadores

La hoja del filtro es un string con tres partes: `campo|operador|valor`.

```http
GET /products?oper={"and":["price|>=|10","name|like|%tecla%"]}
GET /products?oper={"or":["price|<|5","price|>|100"]}
```

Se pueden anidar grupos y navegar por relaciones:

```json
{ "and": ["price|>=|10", { "category": { "and": ["name|=|Periféricos"] } }] }
```

Operadores disponibles:

| Familia | Operadores |
|---|---|
| Comparación | `=` `!=` `<>` `<` `>` `<=` `>=` |
| Texto | `like` `not like` `ilike` `not ilike` |
| Conjuntos | `in` `not in` `notin` |
| Rangos | `between` `not between` `notbetween` |
| Nulos | `null` `not null` `notnull` `exists` `not exists` |
| Fechas | `date` `not date` `notdate` |
| Regex | `regexp` `not regexp` — **desactivados por defecto**, ver §6 |

El valor se interpreta como JSON si puede: `id|in|[1,2]` da un array de verdad.
Si el valor contiene `|`, no pasa nada: solo se parten los dos primeros
separadores, así que `url|=|a|b` guarda `a|b`.

### `relations` — traer relaciones

```http
GET /products?relations=category                  → CSV
GET /products?relations=["category"]              → JSON
GET /products?relations=["category:id,name"]      → solo esos campos de la relación
GET /products?relations=all                       → todas las declaradas en metadatos
```

### `select` — elegir columnas

```http
GET /products?select=id,name
GET /products?select=*            → todas (es el valor por defecto)
```

### `orderby` — ordenación

```http
GET /products?orderby=[{"price":"desc"},{"name":"asc"}]
```

### `pagination` — dos modos

Por página (devuelve totales):

```http
GET /products?pagination={"page":2,"pageSize":20}
```

```json
{ "data": [...], "current_page": 2, "per_page": 20, "total": 137, "last_page": 7 }
```

Por cursor / scroll infinito (más eficiente en tablas grandes):

```http
GET /products?pagination={"infinity":true,"pageSize":20,"cursor":40}
```

```json
{ "data": [...], "per_page": 20, "next_cursor": 60, "has_more": true }
```

El cursor avanza sobre la clave primaria. Si no indicas `orderby`, se fuerza el
orden por clave primaria ascendente: sin un orden determinista el cursor
repetiría o se saltaría filas.

`pageSize` está limitado a 500. Si no lo mandas, se usa `defaultPageSize` de la
entidad, y si tampoco está, 15.

### `soft_delete` — qué hacer con los borrados

Solo aplica si la entidad declara `softDeleteField`.

| Valor | Resultado |
|---|---|
| ausente / `null` | solo los **vivos** (comportamiento por defecto) |
| `true` | solo los **borrados** |
| `false` | **todos**, vivos y borrados |

```http
GET /products?soft_delete=true
```

Los booleanos se leen también en su forma de texto (`true`, `1`, `on`, `yes` y
sus contrarios), porque una query string no tiene tipos.

### `hierarchy` — árboles

Requiere `hierarchyParentField` en los metadatos.

```http
GET /categories?hierarchy=true
GET /categories?hierarchy={"max_depth":3,"children_key":"hijos"}
```

Devuelve los raíces con sus descendientes anidados. Cada nivel es **una** consulta,
no una por nodo.

### `cache`, `cache_ttl`

```http
GET /products?cache=true&cache_ttl=120
GET /products?cache=false          → salta la caché aunque esté activada
```

---

## 5. Referencia de metadatos de entidad

Todo lo que puedes pasar a `registerRestEntity` / `@RestGenericEntity`:

| Opción | Para qué sirve |
|---|---|
| `model` | Nombre lógico. Aparece en mensajes de error y en las claves de caché. Por defecto, el nombre de la entidad. |
| `primaryKey` | Clave primaria. Por defecto `'id'`. |
| `fieldKeyUpdate` | Campo por el que busca `update()` si no quieres que sea la PK (por ejemplo un `uuid`). |
| `relations` | **Lista blanca** de relaciones que el cliente puede pedir o filtrar. |
| `allowedFields` | **Lista blanca** de campos filtrables/seleccionables. Si está vacía, no se valida. |
| `hiddenFields` | Campos que **nunca** salen en una respuesta. |
| `fieldsByRole` | Campos que solo ve un rol concreto. Ver §6. |
| `hierarchyParentField` | Campo que apunta al padre. Habilita `?hierarchy=`. |
| `softDeleteField` | Campo de fecha nullable que marca el borrado suave. |
| `defaultPageSize` | Tamaño de página por defecto de esta entidad. |

---

## 6. El modelo de seguridad (léelo entero)

Es la parte donde más fácil es equivocarse.

### Lo que sí te protege

**Lista blanca de relaciones.** Con `strictRelations: true` (por defecto), pedir
una relación no declarada devuelve 400. Evita que alguien navegue a
`?relations=["owner.paymentMethods"]` y se lleve datos de otra tabla.

**Lista blanca de campos.** Con `validateFields: true` y `allowedFields` no vacío,
filtrar por un campo no declarado devuelve 400.

> ⚠️ **`allowedFields` vacío desactiva la validación.** No es una lista vacía que
> lo prohíba todo: es "no configurado", y entonces cualquier campo es filtrable.
> Si te importa, decláralo.

**Campos ocultos.** `hiddenFields` se aplica en el serializador, así que cubre
listados, `show`, jerarquías y exportaciones por igual.

**Rutas de campo peligrosas.** Cualquier ruta que contenga `__proto__`,
`prototype` o `constructor` se rechaza, para evitar contaminación de prototipo.

**Límites de complejidad.** `maxDepth` (5) limita el anidamiento y `maxConditions`
(100) el número total de condiciones, contando tanto `oper` como `attr`.

**Campos por rol.** Para restringir por usuario:

```ts
registerRestEntity<Product>(Product, {
  fieldsByRole: { admin: ['cost'], finance: ['margin'] },
});

// En tu controlador o interceptor:
const limpio = this.service.stripForUser(payload, request.user);
```

La semántica: un campo listado bajo un rol se elimina para todo el que **no**
tenga ese rol.

> ⚠️ `stripForUser` **no se aplica solo**. `BaseService` te da el método, pero
> eres tú quien decide dónde llamarlo, porque la librería no sabe de dónde sale tu
> usuario autenticado.

### Lo que NO te protege

- **No hay autenticación ni autorización de ruta.** Pon tus guards de Nest.
- **`regexp` está desactivado por defecto** y así debería quedarse en endpoints
  públicos: compila una expresión regular que manda el cliente, y un patrón
  malicioso puede bloquear el event loop (ReDoS). Si lo activas, que sea en un
  endpoint autenticado.
- **La caché en memoria no tiene límite de tamaño.** `MemoryCacheStore` está bien
  para desarrollo y un solo proceso. En producción, implementa `CacheStore` sobre
  Redis.
- **El cuerpo de escritura no se valida.** `create()` y `update()` aceptan lo que
  les llegue. Usa DTOs con `class-validator` y `ValidationPipe`.

---

## 7. Configuración

Valores por defecto (`DEFAULT_CONFIG`):

```ts
{
  filtering: {
    maxDepth: 5,
    maxConditions: 100,
    strictRelations: true,
    validateFields: true,
    allowedOperators: DEFAULT_ALLOWED_OPERATORS,  // sin regexp
  },
  cache: {
    enabled: false,
    ttl: 60,
    ttlByMethod: { list_all: 60, get_one: 30 },
    cacheableMethods: ['list_all', 'get_one'],
    varyHeaders: ['Accept-Language', 'X-Tenant-Id'],
    prefix: 'rgc:v2',
  },
  serialization: { maxDepth: 8, omitUndefined: true },
}
```

Configuración asíncrona (por ejemplo leyendo de `ConfigService`):

```ts
GenericRestModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    cache: { enabled: config.get('CACHE_ENABLED') === 'true' },
    cacheStore: new RedisCacheStore(config.get('REDIS_URL')),
  }),
});
```

---

## 8. Personalizar el comportamiento

### Hooks antes de escribir

```ts
@Injectable()
export class ProductService extends BaseService<Product> {
  protected override async beforeCreate(payload: Record<string, unknown>) {
    return { ...payload, slug: slugify(String(payload.name)) };
  }

  protected override async beforeUpdate(payload: Record<string, unknown>, entity: Product) {
    if (payload.price != null && entity.deletedAt) {
      throw new BadRequestException('No se puede cambiar el precio de un producto borrado.');
    }
    return payload;
  }
}
```

### Activar caché solo en un servicio

```ts
export class ProductService extends BaseService<Product> {
  protected override cacheable = true;
  protected override cacheTtl = 300;
  protected override cacheableOperations = ['list_all'];
}
```

### Añadir rutas propias

Hereda de `RestController` y añade métodos normales de Nest. Ojo con el orden:
una ruta literal debe declararse **antes** que `@Get(':id')`, o `:id` la capturará.

```ts
@Controller('products')
export class ProductController extends RestController<Product> {
  constructor(private readonly products: ProductService) { super(products); }

  @Get('destacados')          // ⚠️ debe ir antes que el :id heredado
  featured() { return this.products.list_all({ attr: { featured: true } }); }
}
```

### Nombres de métodos: `snake_case` y `camelCase`

`list_all` y `listAll`, `get_one` y `getOne`, `update_multiple` y `updateMultiple`
son el mismo método. Los nombres en `snake_case` vienen del proyecto Laravel
original y se conservan para no romper a quien migra. En código nuevo usa el que
prefieras, pero sé consistente.

---

## 9. Cómo funciona la caché

1. Se construye una clave con: operación + modelo + **versión del modelo** +
   parámetros + cabeceras de `varyHeaders`. Todo se serializa de forma estable
   (claves ordenadas) y se hashea con SHA-256.
2. Tras cualquier escritura, `bump(model)` incrementa la versión de ese modelo.
   Las claves viejas dejan de coincidir: no hace falta borrar nada.

Esto significa que una entrada obsoleta no se sirve nunca, pero sigue ocupando
memoria hasta que expira su TTL. Con Redis y TTL configurado no es problema.

Para usar Redis, implementa la interfaz:

```ts
export class RedisCacheStore implements CacheStore {
  async get<T>(key: string): Promise<T | undefined> { /* ... */ }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}
```

y pásala como `cacheStore` en `forRoot` / `forRootAsync`.

---

## 10. Exportar a Excel y PDF

`exceljs` y `pdfkit` son dependencias **opcionales**. Si no las instalas y alguien
llama al endpoint, obtienes un error explicativo, no un fallo de arranque.

```bash
npm install exceljs pdfkit
```

Las columnas se eligen así, en este orden: `?columns=` → `?select=` → las claves
de la primera fila.

```http
GET /products/export/excel?columns=id,name,price&filename=catalogo.xlsx
```

La exportación ignora la paginación a propósito: exporta todo lo que casa con el
filtro. Con tablas grandes, filtra.

---

## 11. Errores frecuentes

**`Relation "x" is not allowed`** — falta declararla en `relations` de los
metadatos, o hay una errata.

**`Field "x" is not allowed`** — igual, pero con `allowedFields`.

**`Entity '' was not discovered ... (used in X.parent)`** — relación
autorreferenciada mal declarada. Difiere la propiedad entera:
`parent: () => p.manyToOne(Node).nullable()`, no `p.manyToOne(() => Node)`.

**`X does not support soft deletes`** — llamaste a `restore()` sin
`softDeleteField` en los metadatos.

**Los filtros no se aplican y salen todos los registros** — comprueba que mandas
JSON válido en `oper`/`attr`. Si el JSON no parsea, el valor se trata como texto
plano.

**El decorador `@RestGenericEntity` no hace nada en MikroORM 7** — correcto: en v7
las entidades no son clases decoradas. Usa `registerRestEntity`.

**`?soft_delete=true` no cambiaba nada** — era un bug real, corregido: los
booleanos de la query string ahora se convierten. Si lo ves en una versión
anterior, es eso.

---

## 12. Ejecutar el proyecto

```bash
npm install
npm run lint        # ESLint con reglas de tipos
npm run typecheck   # tsc --noEmit
npm test            # Vitest: unitarios + integración con SQLite en memoria
npm run build       # compila a dist/
```

Los tests de integración levantan una base SQLite en memoria: no necesitas
ninguna base de datos instalada.

Para entender el código, léelo en este orden:

1. `src/interfaces/filter-params.interface.ts` — el vocabulario de la query.
2. `src/base/rest.controller.ts` — las rutas y `processRequest`.
3. `src/query/mikroorm.translator.ts` — el corazón: validación y traducción.
4. `src/base/base.service.ts` — las operaciones.
5. El resto (`cache`, `export`, `hierarchy`, `security`) son piezas de apoyo.

---

## 13. Glosario de MikroORM

| Término | Qué significa |
|---|---|
| **EntityManager (EM)** | La sesión con la base de datos. Rastrea qué entidades has cargado y qué ha cambiado. |
| **Unit of Work** | El EM acumula cambios y los escribe todos juntos en `flush()`. Por eso no hay un `save()` por entidad. |
| **Identity Map** | Si cargas dos veces la misma fila, obtienes **el mismo objeto** en memoria. |
| **`flush()`** | Vuelca a la base de datos todo lo pendiente. |
| **`persist()`** | Marca una entidad nueva para insertar. No ejecuta SQL todavía. |
| **`populate`** | Cargar relaciones (el `JOIN`/consulta extra). Es lo que hace `?relations=`. |
| **`fields`** | Selección parcial de columnas. Es lo que hace `?select=`. |
| **Data Mapper** | Las entidades son objetos tontos; el EM hace la persistencia. Lo contrario de Active Record (Eloquent), donde `$model->save()` vive en el modelo. |
