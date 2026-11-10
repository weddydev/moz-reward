# Non-transactional migrations

Drizzle applies `drizzle/*.sql` in one transaction, and `CREATE INDEX CONCURRENTLY` cannot run inside one.
An index on a table that **already exists** therefore goes here (P0-18, ENGINEERING §6):

1. `pnpm db:generate` as usual. If the generated migration contains `CREATE INDEX` on an existing table,
   cut that statement out of it (the snapshot still records the index, so the next generate won't re-add it).
2. Add `drizzle/concurrent/NNNN_<name>.sql` (same number as the migration it belongs to) with exactly one
   statement: `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS "<name>" ON "<table>" (...);`
3. `pnpm db:migrate` applies it after the Drizzle migrations, outside a transaction, once
   (`drizzle.moz_concurrent_migrations`). A build that crashed leaves an INVALID index; the next run drops
   and rebuilds it.

`pnpm lint` (scripts/check-migrations.ts) enforces both sides. Indexes on tables created in the same
migration stay in the normal migration (the table is empty, nothing is blocked).
