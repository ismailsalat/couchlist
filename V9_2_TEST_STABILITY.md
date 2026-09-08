# Couchlist v9.2 — deterministic integration tests

Couchlist integration tests intentionally share one disposable PostgreSQL database (`couchlist_test`). Vitest normally runs test files in parallel, which allowed multiple suites to migrate/reset the same database at the same time. That produced intermittent duplicate-enum, missing-table, and account-deletion failures even though the application code was correct.

## Change

`vitest.config.ts` now sets `fileParallelism: false`.

This keeps the integration suites serialized against the shared test database. It does not change production behavior, database schema, API behavior, or the Couchlist application.

The test suite is intentionally a little slower in exchange for being deterministic and easy to maintain.
