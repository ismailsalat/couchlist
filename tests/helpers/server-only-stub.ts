/**
 * Stands in for Next's `server-only` package under Vitest.
 *
 * The real package throws when imported outside a server bundle, which would
 * make every server module untestable in isolation. The guarantee it enforces
 * is a build-time one; nothing about these tests weakens it in the app.
 */
export {};
