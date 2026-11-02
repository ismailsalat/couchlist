import type { SourceCategory } from '@couchlist/shared';
import { CategoryIcon } from './category-icon';

/**
 * A content-category pill.
 *
 * The colour comes from `data-category`, which globals.css maps to CSS
 * variables, so one component renders all six categories. The name is always
 * written out, so colour is never the only thing telling them apart.
 */
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

/**
 * The two moderator-set warnings.
 *
 * Severity is carried three ways, not one: colour (orange, then red), shape
 * (a warning triangle, then a stop octagon) and the words themselves. Nobody
 * has to be able to tell orange from red to get the message, which matters
 * for the one reader in twelve who cannot.
 *
 * The colours are reserved: no category pill uses orange or red, so a warm
 * chip on a row always means "be careful" and never "this is a comedy".
 */

export function AdsWarning() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-warn-line bg-warn-bg px-[7px] py-px text-xs font-semibold text-warn-text">
      <WarningTriangle className="h-3 w-3" />
      Lots of ads
    </span>
  );
}

/**
 * The stronger one. Solid rather than outlined, so it carries more weight
 * than the ad caution even at a glance down a long list.
 */
export function AvoidWarning({ reason }: { reason?: string | null }) {
  return (
    <span
      title={reason ?? undefined}
      className="inline-flex items-center gap-1 rounded-pill border border-danger-line bg-danger-bg px-[7px] py-px text-xs font-bold text-danger-text"
    >
      <StopOctagon className="h-3 w-3" />
      Avoid
    </span>
  );
}

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
