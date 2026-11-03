/**
 * The charts on the statistics page.
 *
 * Server-rendered, no charting library, no client JavaScript. Three rules
 * they all follow:
 *
 *  1. One hue. These are single-series charts — a count per category, a count
 *     per month — so colour carries no meaning and a palette would only
 *     invent some. The directory's own category colours were measured against
 *     this use and two of them are indistinguishable as fills even to a
 *     reader with full colour vision; they work as chips because the chip
 *     also says the name.
 *  2. Every value is written down. Nothing here needs a hover, a tooltip or a
 *     legend to be read, which also means it survives being printed, read
 *     aloud, or looked at by somebody who cannot tell the bars apart at all.
 *  3. Text wears text colours. The accent belongs to the marks.
 */

/** A labelled horizontal bar list: the form for comparing magnitudes. */
export function BarList({
  items,
  unit,
  emptyNote,
}: {
  items: Array<{ label: string; value: number; sublabel?: string }>;
  unit?: string;
  emptyNote: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const anything = items.some((item) => item.value > 0);

  if (!anything) {
    return <p className="m-0 text-sm text-muted">{emptyNote}</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
          <span className="min-w-0 truncate text-sm text-text">
            {item.label}
            {item.sublabel ? (
              <span className="ml-1.5 text-xs text-muted">{item.sublabel}</span>
            ) : null}
          </span>
          <span className="text-sm font-semibold tabular-nums text-text">
            {item.value.toLocaleString()}
            {unit ? <span className="ml-1 font-normal text-muted">{unit}</span> : null}
          </span>
          <span className="col-span-2 mt-1 block h-2 w-full overflow-hidden rounded-pill bg-active">
            <span
              className="block h-full rounded-pill bg-accent"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Listings added per month.
 *
 * Columns rather than a line: these are counts of separate events in separate
 * buckets, and a line between them would imply a continuous quantity measured
 * in between.
 */
export function MonthlyColumns({ months }: { months: Array<{ month: string; count: number }> }) {
  if (months.length === 0) {
    return <p className="m-0 text-sm text-muted">Nothing has been added in the last year yet.</p>;
  }

  const max = Math.max(...months.map((entry) => entry.count), 1);

  return (
    /*
     * Columns are capped in width and the row is left-aligned, so a directory
     * with one month of history shows one narrow column rather than a single
     * block the width of the card pretending to be a chart.
     */
    <div
      className="flex items-end justify-start gap-1.5 overflow-x-auto pb-1"
      role="img"
      aria-label={ariaFor(months)}
    >
      {months.map((entry) => (
        <div
          key={entry.month}
          className="flex w-[clamp(34px,8%,64px)] shrink-0 grow-0 flex-col items-center gap-1.5"
        >
          <span className="text-xs font-semibold tabular-nums text-text">{entry.count}</span>
          <span
            className="block w-full rounded-t-[4px] bg-accent"
            style={{ height: `${Math.max(3, Math.round((entry.count / max) * 96))}px` }}
          />
          <span className="text-[10px] text-muted">{shortMonth(entry.month)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * How the links are holding up.
 *
 * A segmented bar, with the reserved status colours doing what they are
 * reserved for — a state, not a series — and every segment labelled in words
 * underneath, so colour is never the only thing saying it.
 */
export function HealthBar({
  health,
}: {
  health: { ok: number; failing: number; neverChecked: number };
}) {
  const total = health.ok + health.failing + health.neverChecked;
  if (total === 0) {
    return <p className="m-0 text-sm text-muted">No links have been checked yet.</p>;
  }

  const segments = [
    { label: 'Answered', value: health.ok, className: 'bg-accent' },
    { label: 'Not answering', value: health.failing, className: 'bg-danger-text' },
    { label: 'Not checked yet', value: health.neverChecked, className: 'bg-active' },
  ].filter((segment) => segment.value > 0);

  return (
    <div>
      {/* A 2px gap between fills, so two segments never read as one mark. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-pill">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={`block h-full first:rounded-l-pill last:rounded-r-pill ${segment.className}`}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>

      <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5 text-muted">
            <span className={`block h-2 w-2 shrink-0 rounded-full ${segment.className}`} />
            {segment.label}
            <span className="font-semibold tabular-nums text-text">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One big number. Not everything that matters needs a plot. */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      <p className="m-0 text-2xl font-bold tabular-nums tracking-tight text-text sm:text-3xl">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="m-0 mt-0.5 text-sm text-muted">{label}</p>
      {note ? <p className="m-0 mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function shortMonth(month: string): string {
  const [year, index] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(index) - 1] ?? month} ${year?.slice(2) ?? ''}`;
}

function ariaFor(months: Array<{ month: string; count: number }>): string {
  return `Listings added per month: ${months
    .map((entry) => `${shortMonth(entry.month)}, ${entry.count}`)
    .join('; ')}`;
}
