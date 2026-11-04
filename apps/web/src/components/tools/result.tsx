import type { ReactNode } from 'react';

/**
 * How every tool shows its answer.
 *
 * One component for all of them, because the first version let each tool
 * invent its own layout and the result read like a log file: four grey lines
 * of "source — status. detail." where nothing told you which parts were good.
 *
 * The rules it enforces:
 *   - a verdict is a *picture* first. A big mark you read in a quarter of a
 *     second, then the words.
 *   - every row carries its own mark. Colour alone is not enough and neither
 *     is a word alone, so each row has both.
 *   - evidence is a two-column list, not sentences. It is scanned.
 */

/**
 * `off` is not a failure.
 *
 * A provider with no key has not gone wrong — it never ran. Drawing that with
 * the same question mark as "ran, could not say" tells people something
 * untrue, and three identical question marks in a row read as three problems.
 */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'off';

const TONE: Record<Tone, { palette: string; ring: string }> = {
  good: { palette: 'green', ring: 'rgba(143,201,194,.18)' },
  warn: { palette: 'caution', ring: 'rgba(246,186,123,.18)' },
  bad: { palette: 'danger', ring: 'rgba(255,176,176,.16)' },
  neutral: { palette: 'slate', ring: 'rgba(195,214,238,.12)' },
  off: { palette: 'slate', ring: 'rgba(195,214,238,.08)' },
};

/** The big mark. Distinct silhouettes, so they differ without colour. */
export function StatusMark({ tone, className = 'h-7 w-7' }: { tone: Tone; className?: string }) {
  const shared = { viewBox: '0 0 24 24', 'aria-hidden': true as const, className, fill: 'currentColor' };

  switch (tone) {
    case 'good':
      return (
        <svg {...shared}>
          <path d="M12 1.6a10.4 10.4 0 1 0 0 20.8 10.4 10.4 0 0 0 0-20.8zm-1.5 15-4.3-4.3 1.9-1.9 2.4 2.4 5.9-5.9 1.9 1.9z" />
        </svg>
      );
    case 'warn':
      return (
        <svg {...shared}>
          <path d="M10.7 2.9a1.5 1.5 0 0 1 2.6 0l9 15.6a1.5 1.5 0 0 1-1.3 2.3H3a1.5 1.5 0 0 1-1.3-2.3zM12 7.6a1.4 1.4 0 0 0-1.4 1.5l.35 4.6a1.05 1.05 0 0 0 2.1 0l.35-4.6A1.4 1.4 0 0 0 12 7.6zm0 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
        </svg>
      );
    case 'bad':
      return (
        <svg {...shared}>
          <path d="M12 1.6a10.4 10.4 0 1 0 0 20.8 10.4 10.4 0 0 0 0-20.8zM8.3 6.4 12 10.1l3.7-3.7 1.9 1.9-3.7 3.7 3.7 3.7-1.9 1.9L12 13.9l-3.7 3.7-1.9-1.9 3.7-3.7-3.7-3.7z" />
        </svg>
      );
    case 'off':
      // A hollow ring with a dash: plainly "nothing happened here".
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9.2" strokeDasharray="3 3" opacity=".7" />
          <path d="M8.4 12h7.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M12 1.6a10.4 10.4 0 1 0 0 20.8 10.4 10.4 0 0 0 0-20.8zm0 4.6c2.2 0 3.9 1.6 3.9 3.7 0 1.6-.9 2.4-2.1 3.1-.7.5-.9.8-.9 1.3v.5h-2.2v-.8c0-1.3.7-2.1 1.8-2.8.9-.5 1.2-.9 1.2-1.4 0-.8-.7-1.5-1.7-1.5s-1.8.7-1.8 1.7H8c0-2.2 1.8-3.8 4-3.8zm0 11a1.45 1.45 0 1 1 0 2.9 1.45 1.45 0 0 1 0-2.9z" />
        </svg>
      );
  }
}

/** The headline block: mark, title, one sentence. */
export function ToolResult({
  tone,
  title,
  children,
  footer,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const shown = TONE[tone];

  return (
    <div
      data-palette={shown.palette}
      role="status"
      className="cl-rise mt-5 overflow-hidden rounded-2xl border border-pal-line bg-pal-bg"
    >
      <div className="flex items-start gap-4 p-5">
        <span
          className="grid h-12 w-12 flex-none place-items-center rounded-full text-pal-text"
          style={{ background: shown.ring }}
        >
          <StatusMark tone={tone} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="m-0 text-[19px] font-bold leading-tight tracking-[-0.02em] text-pal-text">{title}</p>
          {children ? <div className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted">{children}</div> : null}
        </div>
      </div>
      {footer ? <div className="border-t border-pal-line/50 px-5 py-4">{footer}</div> : null}
    </div>
  );
}

/** One piece of evidence. */
export function SignalRow({
  tone,
  name,
  detail,
  when,
}: {
  tone: Tone;
  name: string;
  detail: string;
  when?: string;
}) {
  const colour =
    tone === 'good'
      ? 'text-[#8fc9c2]'
      : tone === 'warn'
        ? 'text-[#f6ba7b]'
        : tone === 'bad'
          ? 'text-[#ffb0b0]'
          : tone === 'off'
            ? 'text-muted/40'
            : 'text-muted/70';

  return (
    <li className="flex items-center gap-3 py-[7px]">
      <span className={`flex-none ${colour}`}>
        <StatusMark tone={tone} className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-text">{name}</span>
      <span className="text-right text-[13px] text-muted">
        {detail}
        {when ? <span className="ml-1.5 text-muted/60">· {when}</span> : null}
      </span>
    </li>
  );
}

/**
 * A finding, where the explanation is the point.
 *
 * `SignalRow` is for "name → short value", which is scanned. This is for
 * "here is what we noticed and why it matters", which is read. Forcing the
 * second into the first put a paragraph in a right-aligned column.
 */
export function FindingRow({ tone, title, detail }: { tone: Tone; title: string; detail: string }) {
  const colour =
    tone === 'good'
      ? 'text-[#8fc9c2]'
      : tone === 'warn'
        ? 'text-[#f6ba7b]'
        : tone === 'bad'
          ? 'text-[#ffb0b0]'
          : 'text-muted/60';

  return (
    <li className="flex gap-3 py-2">
      <span className={`mt-[1px] flex-none ${colour}`}>
        <StatusMark tone={tone} className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-text">{title}</span>
        <span className="mt-0.5 block max-w-[62ch] text-[13px] leading-relaxed text-muted">{detail}</span>
      </span>
    </li>
  );
}

/** The evidence list, under a quiet label. */
export function SignalList({ label = 'What we checked', children }: { label?: string; children: ReactNode }) {
  return (
    <>
      <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted/70">{label}</p>
      <ul className="m-0 flex list-none flex-col p-0">{children}</ul>
    </>
  );
}
