# Couchlist v9.1 — local test environment fix

This patch makes Vitest load the repository-root `.env` before test modules are
imported. Previously, `TEST_DATABASE_URL` could be present in `.env` but Vitest
never loaded that file, so integration tests fell back to a password-less local
PostgreSQL URL and failed SCRAM authentication.

The loader is intentionally tiny and dependency-free. Existing process
environment variables take precedence, so CI or hosted test environments can
still inject their own values.

`TEST_DATABASE_URL` is now documented in `.env.example`. It must always point to
a disposable local test database, never the production/Railway database.
