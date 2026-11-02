/**
 * Driver error inspection.
 *
 * Drizzle wraps a driver error in its own error and puts the original on
 * `cause`, so checking `error.code` on what was thrown finds nothing. Every
 * place that relies on a constraint to detect a duplicate — a second account
 * for one address, a second pending suggestion for one domain, a repeat
 * report — must therefore walk the cause chain.
 *
 * Getting this wrong is quiet: the insert still fails, but it surfaces as an
 * unhandled error instead of the "already exists" answer the caller expects.
 */

/** PostgreSQL SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === code
  );
}

/** True when this error, or anything it wraps, is a unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  // Bounded, so a self-referential cause cannot loop.
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (hasCode(current, UNIQUE_VIOLATION)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
