import type { SourceCategory } from '@couchlist/shared';
import { CategoryIcon } from './category-icon';

/**
 * The marks that sit beside a source's name.
 *
 * Three different things get said there — what a source covers, how good the
 * material is, and what to watch out for — and they were all being said with
 * the same rounded pill in a different colour. Colour alone is a weak signal:
 * it fails for the one reader in twelve who cannot separate two of ours, it
 * fails in a screenshot, and it fails at a glance down a long list.
 *
 * So each kind has its own silhouette, recognisable before any colour or text
 * is read:
 *
 *   category  ( fully rounded pill )   soft fill, icon and name
 *   quality   [ square-cornered box ]  outline only, uppercase
 *   warning   < notched banner >       solid fill, icon, angled end
 *
 * The star for a moderator's pick is not a container at all, which makes it
 * the fourth distinct shape and the only one that reads as an endorsement
 * rather than a label.
 */

/* ------------------------------ category ------------------------------- */

export function CategoryPill({ category }: { category: SourceCategory }) {
  return (
    <span
      data-category={category}
      className="inline-flex items-center gap-1 rounded-pill border border-category-line bg-category-bg py-px pl-1.5 pr-2 text-xs font-semibold text-category-text"
    >
      <CategoryIcon category={category} className="h-3 w-3" />
      {category}
    </span>
  );
}

/* ------------------------------- quality -------------------------------- */

/**
 * A moderator's note on quality: 4K, HD, HQ scans.
 *
 * Square corners and no fill, so it reads as a specification rather than a
 * label or a warning. Uppercase with letter spacing because the values are
 * short and often abbreviations.
 */
export function QualityBadge({ label }: { label: string }) {
  return (
    <span
      title={`Quality: ${label}`}
      className="inline-flex items-center rounded-[3px] border border-quality-line bg-transparent px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] text-quality-text"
    >
      {label}
    </span>
  );
}

/* ------------------------------- warnings ------------------------------- */

/**
 * The two moderator-set warnings, mildest first.
 *
 * Both are notched banners: solid, with the right edge cut away. Nothing else
 * on the row has that outline, so a warning is identifiable with the colour
 * removed and at a size where the words are not yet legible.
 */
const BANNER =
  'inline-flex items-center gap-1 py-px pl-1.5 pr-2.5 text-xs font-bold [clip-path:polygon(0_0,calc(100%-6px)_0,100%_50%,calc(100%-6px)_100%,0_100%)]';

export function AdsWarning() {
  return (
    <span className={`${BANNER} bg-warn-bg text-warn-text`}>
      <WarningTriangle className="h-3 w-3" />
      Lots of ads
    </span>
  );
}

export function AvoidWarning({ reason }: { reason?: string | null }) {
  return (
    <span title={reason ?? undefined} className={`${BANNER} bg-danger-bg text-danger-text`}>
      <StopOctagon className="h-3 w-3" />
      Avoid
    </span>
  );
}

/* -------------------------------- trusted -------------------------------- */

/**
 * A moderator's pick.
 *
 * A bare star, with no container at all. A pill here competed with the
 * category pills for attention and read as another label; a star reads as
 * somebody vouching for it, which is what it means. The reason is the title,
 * and the accessible name carries it too so it is not hover-only.
 */
export function TrustedMark({ note }: { note?: string | null }) {
  const label = note ? `Trusted pick: ${note}` : 'Trusted pick';
  return (
    <span title={label} className="inline-flex shrink-0 text-trusted-text">
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M12 1.8l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.56l-6.18 3.25L7 13.93l-5-4.87 6.91-1z" />
      </svg>
    </span>
  );
}

/* --------------------------------- icons --------------------------------- */

export function WarningTriangle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** A road stop sign: eight sides, filled, with a bar through it. */
export function StopOctagon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.28 1.6h7.44c.37 0 .73.15.99.41l5.28 5.28c.26.26.41.62.41.99v7.44c0 .37-.15.73-.41.99l-5.28 5.28c-.26.26-.62.41-.99.41H8.28c-.37 0-.73-.15-.99-.41L2.01 16.72a1.4 1.4 0 0 1-.41-.99V8.28c0-.37.15-.73.41-.99L7.29 2.01c.26-.26.62-.41.99-.41z" />
      <path d="M7.4 10.8h9.2c.5 0 .9.4.9.9v.6c0 .5-.4.9-.9.9H7.4a.9.9 0 0 1-.9-.9v-.6c0-.5.4-.9.9-.9z" fill="var(--cl-danger-bg)" />
    </svg>
  );
}
