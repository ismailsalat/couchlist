import { describeLastCheck } from '@couchlist/shared';

/**
 * When this listing was last looked at.
 *
 * A directory with no sign of upkeep reads as abandoned, and a reader has no
 * way to tell a link checked on Tuesday from one nobody has opened in two
 * years. This line is small and quiet, and it is the difference.
 *
 * The clock is read by the caller and the wording comes from a pure function
 * in the domain layer, so this renders the same sentence every time for the
 * same props.
 */
export function LastChecked({
  at,
  status,
  failures,
  now,
}: {
  at: Date | null;
  status: string | null;
  failures: number;
  now: Date;
}) {
  const note = describeLastCheck({ at, status, failures, now });
  if (!note) return null;

  return <p className="m-0 mt-3 text-xs text-muted">{note}</p>;
}
