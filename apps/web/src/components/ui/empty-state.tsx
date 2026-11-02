/**
 * Empty, filtered-empty and error states.
 *
 * All three keep the same box so the page does not jump when a filter stops
 * matching: the list container is already drawn by the caller.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center text-[13px] text-muted">
      <p className="m-0">{title}</p>
      {hint ? <p className="m-0 mt-1.5 text-sm">{hint}</p> : null}
      {action ? <div className="mt-3.5 flex justify-center">{action}</div> : null}
    </div>
  );
}
