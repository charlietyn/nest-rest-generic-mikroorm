# Intentional differences from Laravel

1. **No synthetic Eloquent Active Record API.** MikroORM remains Data Mapper + Unit of Work.
2. **Transactions live in services**, not controllers.
3. **DTO/Pipe validation replaces BaseFormRequest/model scenarios.**
4. **PARENT persistence is not reproduced as hidden inheritance.** Model explicit relations/composition instead.
5. **Spatie-specific permission internals are not embedded.** The reusable field-policy portion is preserved.
6. **Mongo Eloquent extensions are not part of this SQL-focused package.**
7. **Vitest replaces Jest** because MikroORM 7 is pure ESM and Vitest is a cleaner ESM-native test runner.
8. **Soft delete is explicit metadata**, rather than assuming an ORM trait.
