import Link from 'next/link';
import type { ToolMeta } from '@couchlist/shared';
import { Pill, ToolGlyph } from './tool-glyph';

/**
 * One tool on the hub.
 *
 * Carries a name, a line, and two tags: what kind of thing it is, and
 * whether it works yet. Before the tags existed this grid was eight
 * identically-shaped cards and there was no way to tell at a glance which
 * ones you could actually use.
 */
export function ToolTile({ tool }: { tool: ToolMeta }) {
  const soon = tool.state === 'COMING_SOON';

  return (
    <Link
      href={`/tools/${tool.slug}`}
      data-palette={tool.palette}
      className={`cl-touch flex flex-col gap-2 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
        soon ? 'border-dashed border-line bg-transparent' : 'border-line bg-surface hover:border-pal-line'
      }`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl border ${
          soon ? 'border-dashed border-warn-line text-warn-text' : 'border-pal-line bg-pal-bg text-pal-text'
        }`}
      >
        <ToolGlyph icon={tool.icon} className="h-[18px] w-[18px]" />
      </span>

      <span className={`mt-0.5 text-[15px] font-bold tracking-[-0.02em] ${soon ? 'text-muted' : ''}`}>
        {tool.name}
      </span>
      <span className="text-[12.5px] leading-snug text-muted">{tool.blurb}</span>

      <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
        <Pill palette={tool.palette}>{tool.tag}</Pill>
        {soon ? (
          <Pill tone="soon">
            <ToolGlyph icon="cone" className="h-[11px] w-[11px]" />
            Coming soon
          </Pill>
        ) : (
          <Pill tone="ready">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="12" r="7" />
            </svg>
            Ready
          </Pill>
        )}
      </span>
    </Link>
  );
}
