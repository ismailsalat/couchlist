/**
 * A labelled form field.
 *
 * The label is a real <label>, the hint and error are tied to the control with
 * aria-describedby, and the error is announced. Validation messages say what to
 * do rather than what went wrong.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-text">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-muted">optional</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="m-0 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div data-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
        {children}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-field border border-line bg-surface px-3.5 py-3 text-base text-text placeholder:text-muted focus-visible:border-focus';

export const selectClass =
  'w-full rounded-field border border-line bg-surface px-3 py-3 text-base text-text';
