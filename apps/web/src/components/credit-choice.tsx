import { CreditMode } from '@couchlist/shared';

/**
 * The contribution credit choice.
 *
 * Both options are stated plainly, including what Anonymous does and does not
 * mean: the public page shows no name, and moderators can still see who
 * submitted it. Pretending otherwise would be the wrong kind of promise.
 */
export function CreditChoice({
  displayName,
  defaultMode = CreditMode.CREDITED,
}: {
  displayName: string;
  defaultMode?: CreditMode;
}) {
  return (
    <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-semibold text-text">Public credit</legend>

      <label className="mt-1.5 flex cursor-pointer items-start gap-2.5">
        <input
          type="radio"
          name="creditMode"
          value={CreditMode.CREDITED}
          defaultChecked={defaultMode === CreditMode.CREDITED}
          className="mt-1 h-4 w-4 accent-[var(--cl-selected)]"
        />
        <span className="text-sm">
          <span className="block text-text">Credit my account</span>
          <span className="block text-muted">
            Shows {displayName} and your picture, linked to your profile.
          </span>
        </span>
      </label>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5">
        <input
          type="radio"
          name="creditMode"
          value={CreditMode.ANONYMOUS}
          defaultChecked={defaultMode === CreditMode.ANONYMOUS}
          className="mt-1 h-4 w-4 accent-[var(--cl-selected)]"
        />
        <span className="text-sm">
          <span className="block text-text">Keep me anonymous</span>
          <span className="block text-muted">
            Shows &ldquo;Anonymous&rdquo; with no link to your account. Moderators can still see
            who submitted it.
          </span>
        </span>
      </label>

      <p className="m-0 mt-3 text-xs text-muted">
        You can change this later from My submissions.
      </p>
    </fieldset>
  );
}
