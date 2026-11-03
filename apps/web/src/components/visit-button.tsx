'use client';

import { ArrowUpRight } from 'lucide-react';
import { countVisit } from '@/lib/count-visit';

/**
 * The main outbound link on a listing.
 *
 * A client component only so the visit can be counted on the way out. It is
 * still a plain anchor: the navigation is the browser's, not JavaScript's, so
 * middle-click, open-in-new-tab and copy-link all behave, and the link works
 * if the script never runs.
 */
export function VisitButton({
  sourceId,
  homepageUrl,
  shouldAvoid,
}: {
  sourceId: string;
  homepageUrl: string;
  shouldAvoid: boolean;
}) {
  return (
    <a
      href={homepageUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => countVisit(sourceId)}
      className={
        shouldAvoid
          ? 'cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted no-underline hover:bg-hover hover:text-text'
          : 'cl-touch inline-flex items-center gap-2 rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg no-underline shadow-primary hover:bg-selected-hover'
      }
    >
      {shouldAvoid ? 'Go anyway' : 'Visit website'}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
    </a>
  );
}
