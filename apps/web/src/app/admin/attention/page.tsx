import Link from 'next/link';
import { countsAsFailure } from '@couchlist/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Sources that want a decision.
 *
 * A link directory rots quietly, and the failure is invisible: a dead source
 * keeps its votes and its place in the list until somebody happens to report
 * it. This is the page that makes the rot visible, and it is deliberately the
 * only thing that happens automatically — nothing here has been hidden or
 * changed, because one bad afternoon on somebody else's server should not
 * remove a good listing.
 */

const EXPLANATIONS: Record<string, string> = {
  UNREACHABLE: 'Did not answer',
  ERROR: 'Answered with an error',
  MOVED: 'Redirects somewhere else now',
  REFUSED: 'Points somewhere we will not request',
  OK: 'Answered normally',
};

export default async function AdminAttentionPage() {
  const flagged = await repos().sources.needingAttention();

  if (flagged.length === 0) {
    return (
      <div className="rounded-card border-2 border-line bg-surface">
        <EmptyState
          title="Nothing needs a decision."
          hint="Sources appear here after several failed checks, after they move, or when several people report the same one."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-sm text-muted">
        {flagged.length} source{flagged.length === 1 ? '' : 's'} to look at. Nothing has been
        hidden or changed &mdash; these are waiting on you.
      </p>

      {flagged.map((entry) => (
        <article
          key={entry.source.id}
          className="rounded-card border-2 border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-base font-bold text-text">
                <Link
                  href={`/sources/${entry.source.id}`}
                  className="text-text no-underline hover:text-accent"
                >
                  {entry.source.name}
                </Link>
              </p>
              <p className="m-0 mt-0.5 break-all text-sm text-muted">{entry.source.domain}</p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <a
                href={entry.source.homepageUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text no-underline hover:bg-hover"
              >
                Open it yourself
              </a>
              <Link
                href={`/admin/sources?q=${encodeURIComponent(entry.source.domain)}`}
                className="cl-touch rounded-pill bg-selected px-3 py-1.5 text-sm font-semibold text-selected-fg no-underline hover:bg-selected-hover"
              >
                Edit or remove
              </Link>
            </div>
          </div>

          <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-sm">
            {entry.healthFailures >= 3 && countsAsFailure(entry.healthStatus) ? (
              <li className="text-danger-text">
                <span className="font-bold">
                  Failed {entry.healthFailures} checks in a row.
                </span>{' '}
                {EXPLANATIONS[entry.healthStatus ?? ''] ?? 'Check failed'}
                {entry.healthStatusCode ? ` (${entry.healthStatusCode})` : ''}.
              </li>
            ) : null}

            {entry.healthStatus === 'MOVED' || entry.healthStatus === 'REFUSED' ? (
              <li className="text-warn-text">
                <span className="font-bold">{EXPLANATIONS[entry.healthStatus]}.</span> Worth
                updating the address rather than deleting the listing &mdash; the votes and the
                credit belong to the site, not to the URL.
              </li>
            ) : null}

            {entry.openReports >= 3 ? (
              <li className="text-warn-text">
                <span className="font-bold">
                  {entry.openReports} people reported this.
                </span>{' '}
                Several independent reports is its own signal.
              </li>
            ) : null}

            {entry.healthDetail ? (
              <li className="break-words text-xs text-muted">{entry.healthDetail}</li>
            ) : null}

            <li className="text-xs text-muted">
              {entry.lastCheckedAt
                ? `Last checked ${entry.lastCheckedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
                : 'Never checked'}
            </li>
          </ul>
        </article>
      ))}
    </div>
  );
}
