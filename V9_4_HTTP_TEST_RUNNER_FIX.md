# Couchlist v9.4 — HTTP test runner fix

This is a test-harness-only compatibility update.

## What changed

The HTTP integration test no longer launches the web app through `npm` or `npm.cmd`.
Instead it launches the Next.js CLI directly with `process.execPath` (the exact Node.js executable already running Vitest).

Why this is more stable:

- no Windows `.cmd` spawning edge cases
- no shell required
- no PATH lookup for `npm`
- paths containing spaces are handled by `spawn` argument arrays
- macOS/Linux and Windows use the same code path
- killing the test server now targets the actual Node/Next process instead of an npm wrapper

There are no product changes, database migrations, or new dependencies in v9.4.
