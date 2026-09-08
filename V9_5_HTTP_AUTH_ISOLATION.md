# Couchlist v9.5 — HTTP test auth isolation

This release fixes the final HTTP test-harness issue found on Windows.

## Root cause

The HTTP integration server inherited the developer's real root `.env`. In private-beta setups, `TEST_MODE=true` and `TEST_USER_IDS` contains the developer's real Discord accounts. The HTTP suite uses synthetic test accounts, so the dev-login route correctly rejected them with HTTP 403 before the actual assertions could run.

## Fix

The spawned HTTP test server now explicitly owns its test environment:

- `ENVIRONMENT=test`
- `NODE_ENV=production` (required by `next start`)
- `TEST_MODE=false`
- empty `TEST_USER_IDS` / `TEST_GUILD_IDS`
- `ALLOW_DEV_LOGIN=true`
- the disposable `TEST_DATABASE_URL` is still used

This keeps the test suite independent from a developer's private-beta allowlist without changing production behavior.

A unit regression test also verifies that stale allowlist IDs cannot restrict users when `TEST_MODE=false`.

No database migration, runtime dependency, Railway setting, bot behavior, or product feature changed.
