import Link from 'next/link';
import type { LiveStatus, StatusEntry } from '@/lib/tools/status';
import { StatusMark, type Tone } from './result';

/**
 * The status board.
 *
 * Worst first, because that is what the page is for. Two of the four states
 * exist to stop the board overclaiming in either direction: "not checked yet"
 * is never counted as working, and a single missed check is "wobbly" rather
 * than down, because one failure is as likely to be our server as theirs.
 *
 * The same marks as the rest of the tools, at the same size — a shape, not
 * just a colour, so it reads without relying on colour vision and is visible
 * at arm's length on a phone.
 */
const STATE_TONE: Record<StatusEntry['state'], Tone> = {
  up: 'good',
  wobbly: 'warn',
  down: 'bad',
  unchecked: 'off',
};

/*
 * The marks draw with `fill="currentColor"`, so without an explicit colour
 * they inherit the row's text colour and every one of them comes out white.
 * That is exactly what shipped: a board of white check marks where the whole
 * point is telling green from amber from red at a glance.
 */
const TONE_COLOUR: Record<Tone, string> = {
  good: 'text-[#8fc9c2]',
  warn: 'text-[#f6ba7b]',
  bad: 'text-[#ffb0b0]',
  neutral: 'text-muted/70',
  off: 'text-muted/40',
};

/** Short, scannable label. The sentence underneath explains it. */
const STATE_LABEL: Record<StatusEntry['state'], string> = {
  up: 'Working',
  wobbly: 'Missed a check',
  down: 'Not answering',
  unchecked: 'Not checked',
};

const CHIP: Record<StatusEntry['state'], string> = {
  up: 'border-[#8fc9c2]/30 bg-[#8fc9c2]/10 text-[#8fc9c2]',
  wobbly: 'border-[#f6ba7b]/35 bg-[#f6ba7b]/12 text-[#f6ba7b]',
  down: 'border-[#ffb0b0]/35 bg-[#ffb0b0]/12 text-[#ffb0b0]',
  unchecked: 'border-line bg-hover text-muted',
};

export function StatusBoard({ status }: { status: LiveStatus }) {
  const { counts } = status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-9 gap-y-4 rounded-2xl border border-line bg-surface p-5">
        <Figure value={counts.up} label="answering" palette="green" />
        <Figure value={counts.wobbly} label="missed one check" palette="caution" />
        <Figure value={counts.down} label="not answering" palette="pink" />
        <Figure value={counts.unchecked} label="not checked yet" palette="slate" />
        <Figure value={status.blocklistDomains} label="domains on our blocklists" palette="blue" />
      </div>

      {status.maintenance.note ? (
        <div
          data-palette="caution"
          className="flex items-start gap-2.5 rounded-xl border border-pal-line bg-pal-bg/40 px-4 py-3"
        >
          <span className="mt-[1px] flex-none">
            <StatusMark tone="warn" className="h-[18px] w-[18px] text-[#f6ba7b]" />
          </span>
          <p className="m-0 min-w-0 max-w-[62ch] text-[13px] text-pal-text">
            {status.maintenance.note}
          </p>
        </div>
      ) : null}

      <p className="m-0 max-w-[62ch] text-[12.5px] text-muted">
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
          <li key={entry.id} className="flex gap-3 border-t border-line py-3 first:border-t-0">
            <span className={`mt-[1px] flex-none ${TONE_COLOUR[STATE_TONE[entry.state]]}`}>
              <StatusMark tone={STATE_TONE[entry.state]} className="h-[18px] w-[18px]" />
            </span>
            {/*
              Stacks below `sm` and goes to two columns above it, the same rule
              the signal rows follow. A fixed row with the detail pushed right
              by `ml-auto` collapses to one word per line on a narrow phone at
              large text sizes.
            */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/sources/${entry.id}`}
                  className="text-[14px] font-semibold hover:underline"
                >
                  {entry.name}
                </Link>
                <span className="text-[12.5px] text-muted/80">{entry.domain}</span>
              </span>
              {/*
                A short coloured chip rather than another grey sentence. With
                55 rows, identical grey text everywhere means the one row that
                needs attention looks like all the others.
              */}
              <span className="flex min-w-0 items-center gap-2 sm:ml-auto sm:shrink-0">
                <span
                  className={`inline-flex flex-none items-center rounded-pill border px-2 py-[2px] text-[11.5px] font-semibold ${CHIP[entry.state]}`}
                >
                  {STATE_LABEL[entry.state]}
                </span>
                <span className="min-w-0 text-[12.5px] text-muted sm:text-right">{entry.detail}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {status.entries.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">
          Nothing is published yet, so there is nothing to check.
        </p>
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
