# Couchlist v9.3 — Windows HTTP test startup fix

This update only changes local startup/test plumbing. It does not change Couchlist product behavior, the database schema, or Railway data.

## Fixes

- The HTTP integration test now launches `npm.cmd` on Windows and `npm` elsewhere instead of assuming the Unix executable name works everywhere.
- The test resolves the project root with Node's `fileURLToPath`, avoiding Windows `/C:/...` file-URL path problems.
- If the child server cannot start, the test reports that startup failure immediately instead of silently waiting the full timeout.
- The web `start` script is now simply `next start`. Next.js reads Railway/local `PORT` from the environment, so the script no longer uses the Unix-only `${PORT:-3000}` shell expression.

These changes keep the same simple production architecture and remove two Windows-specific assumptions from the test/start path.
