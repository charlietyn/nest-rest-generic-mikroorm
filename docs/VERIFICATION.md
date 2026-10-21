# Verification status

Last run: 2026-08-26, on Windows 11, Node.js v24.14.0 / npm 11.17.0, against the
dependency tree resolved by `npm install` (MikroORM 7.1.13, NestJS 11, Vitest 3.2.7).

## Executed and passing

| Step | Command | Result |
|---|---|---|
| Dependency install | `npm install` | PASS — 353 packages |
| Lint | `npm run lint` | PASS — 0 problems |
| Typecheck | `npm run typecheck` | PASS — 0 errors |
| Build | `npm run build` | PASS — emits `dist/` |
| Unit tests | `vitest run tests/unit` | PASS — 19 tests |
| Integration tests (SQLite in memory) | `vitest run tests/integration` | PASS — 7 tests |
| Full suite | `npm test` | PASS — 26 tests / 6 files |

## What the previous status said, and what actually happened

The earlier revision of this file honestly recorded that nothing could be
verified: the environment had no network, so `npm install` never completed and
the typecheck stopped at the unresolved-module boundary.

Running it for real surfaced a defect that a parse-only pass could not see: **the
package did not compile at all.** `npm run build` failed with 39 TypeScript
errors. The root cause was that MikroORM 7 removed the entity decorators
(`@Entity`, `@Property`, `@PrimaryKey`, `@ManyToOne`) from `@mikro-orm/core`,
while `examples/` and the integration test were written against the MikroORM 6
decorator API that `package.json` did not declare.

That is the value of this file: a status of "unverified" is not a formality.

## Coverage notes

The integration suite exercises the CRUD lifecycle, soft delete and restore,
offset pagination, keyset pagination ordering, `hiddenFields` stripping, field
whitelist rejection, hierarchy nesting through a to-one relation, and the
`maxConditions` budget. The unit suite covers condition parsing, relation
parsing, config merging, field-access policy, and query-string coercion.

Not yet covered by executable tests: Excel/PDF export (needs the optional peers
exercised end to end), `forRootAsync` wiring, and the cache `varyHeaders` key
derivation.
