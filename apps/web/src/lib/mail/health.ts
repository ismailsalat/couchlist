import 'server-only';

export { explainMailFailure } from '@couchlist/shared';

/**
 * What outbound email has actually been doing.
 *
 * A failed send already writes a log line, but nobody reads logs until they
 * suspect something, and the symptom here is silence: a person waits for a
 * code that never comes and the operator has no idea. This keeps the last
 * outcome where a moderator will see it, with the provider's own words.
 *
 * In memory on purpose. It resets on deploy, needs no migration, and is a
 * diagnostic rather than a record — the log is the record.
 */

export interface MailAttempt {
  at: Date;
  ok: boolean;
  /** The provider's own explanation, trimmed. Operators only. */
  detail?: string;
  status?: number;
}

const MAX_REMEMBERED = 10;
const recent: MailAttempt[] = [];

export function recordMailAttempt(attempt: MailAttempt): void {
  recent.unshift(attempt);
  if (recent.length > MAX_REMEMBERED) recent.length = MAX_REMEMBERED;
}

export function recentMailAttempts(): MailAttempt[] {
  return [...recent];
}

export function lastMailFailure(): MailAttempt | undefined {
  return recent.find((attempt) => !attempt.ok);
}
