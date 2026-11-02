'use client';

import Link from 'next/link';
import { Avatar } from './ui/avatar';
import { useState } from 'react';
import {
  CONTRIBUTION_KIND_LABEL,
  creditSummaryLine,
  type ContributionKind,
  type PublicCredit,
} from '@couchlist/shared';

export { creditSummaryLine };

/**
 * Who contributed a source.
 *
 * A popular source can collect a lot of names, and a wall of them buries the
 * one piece most readers want: who found it first. So the original contributor
 * is always named, a couple of others are shown, and the rest collapse behind
 * a count that expands.
 *
 * Anonymous entries are counted but never linked or named — the collapsing is
 * presentation, and must not become a way to work out who they were.
 */

export interface CreditEntry {
  id: string;
  kind: ContributionKind;
  isOriginal: boolean;
  summary: string | null;
  credit: PublicCredit;
}

/** Names shown before the rest collapse. */
const VISIBLE = 3;

export function ContributorCredits({ credits }: { credits: CreditEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (credits.length === 0) {
    return (
      <p className="m-0 mt-2 text-sm text-muted">This listing predates contribution tracking.</p>
    );
  }

  // Original first, then the order the server gave.
  const ordered = [...credits].sort(
    (a, b) => Number(b.isOriginal) - Number(a.isOriginal),
  );
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE);
  const hidden = ordered.length - shown.length;

  return (
    <>
      {ordered.length > VISIBLE ? (
        <p className="m-0 mt-1 text-sm text-muted">{creditSummaryLine(ordered)}</p>
      ) : null}

      <ul className="m-0 mt-2.5 list-none space-y-2 p-0">
        {shown.map((entry) => (
          <li key={entry.id} className="text-sm">
            <CreditName credit={entry.credit} />
            <span className="text-muted">
              {' '}
              — {entry.summary ?? CONTRIBUTION_KIND_LABEL[entry.kind]}
              {entry.isOriginal ? (
                <span className="ml-1.5 rounded-pill border border-category-line bg-accent-soft px-1.5 py-px text-xs font-semibold text-accent">
                  found it first
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="cl-touch mt-2 rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text hover:bg-hover"
        >
          Show {hidden} more {hidden === 1 ? 'contributor' : 'contributors'}
        </button>
      ) : null}

      {expanded && ordered.length > VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="cl-touch mt-2 rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-text"
        >
          Show fewer
        </button>
      ) : null}
    </>
  );
}

function CreditName({ credit }: { credit: PublicCredit }) {
  if (credit.anonymous) {
    return (
      <span className="inline-flex items-center gap-1.5 align-middle">
        <Avatar userId={null} displayName={null} hasAvatar={false} size="sm" />
        <span className="font-semibold text-text">Anonymous</span>
      </span>
    );
  }
  return (
    <Link
      href={`/u/${credit.userId}`}
      className="inline-flex items-center gap-1.5 align-middle font-semibold text-accent"
    >
      <Avatar
        userId={credit.userId}
        displayName={credit.displayName}
        hasAvatar={credit.hasAvatar}
        size="sm"
      />
      {credit.displayName}
    </Link>
  );
}

/**
 * The one-line form, for a row or a card.
 *
 * "Mina, Jay and 4 others" — enough to recognise a name, short enough not to
 * take over the line it sits on.
 */
