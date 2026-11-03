import Link from 'next/link';
import type { LiveStatus } from '@/lib/tools/status';

/**
 * The status board.
 *
 * Down first, because that is what the page is for. "Not checked yet" is its
 * own state rather than being counted as working: a source nobody has looked
 * at is not a source that works, and colouring it green would make this a
 * decoration instead of a report.
 */
export function StatusBoard({ status }: { status: LiveStatus }) {
  const { counts } = status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-9 gap-y-4 rounded-2xl border border-line bg-surface p-5">
        <Figure value={counts.up} label="answering" palette="green" />
        <Figure value={counts.down} label="not answering" palette="pink" />
        <Figure value={counts.unchecked} label="not checked yet" palette="slate" />
        <Figure value={status.blocklistDomains} label="domains on our blocklists" palette="blue" />
      </div>

      <p className="m-0 text-[12.5px] text-muted">
        {status.lastRunAt
          ? `Last check ran ${new Date(status.lastRunAt).toLocaleString()}.`
          : 'No check has run yet, so every source below is unchecked.'}
        {status.blocklists.length > 0
          ? ` Blocklists: ${status.blocklists
              .map(
                (entry) =>
                  `${entry.list} (${entry.ok ? `${entry.entryCount.toLocaleString()} entries` : 'last sync failed'})`,
              )
              .join(', ')}.`
          : ''}
      </p>

      <ul className="m-0 flex list-none flex-col rounded-2xl border border-line bg-surface p-0 px-4">
        {status.entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{
                background:
                  entry.state === 'up' ? '#b9e1c6' : entry.state === 'down' ? '#ffb0b0' : '#6e6e7a',
              }}
            />
            <Link href={`/source/${entry.id}`} className="text-[14px] font-semibold hover:underline">
              {entry.name}
            </Link>
            <span className="text-[12.5px] text-muted/80">{entry.domain}</span>
            <span className="ml-auto text-[12.5px] text-muted">{entry.detail}</span>
          </li>
        ))}
      </ul>

      {status.entries.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Nothing is published yet, so there is nothing to check.</p>
      ) : null}
    </div>
  );
}

function Figure({ value, label, palette }: { value: number; label: string; palette: string }) {
  return (
    <div data-palette={palette}>
      <div className="text-[25px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-pal-text">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[13px] text-muted">{label}</div>
    </div>
  );
}
