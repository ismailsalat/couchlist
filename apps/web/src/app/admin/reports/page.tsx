import Link from 'next/link';
import { ResolveReports } from '@/components/admin/resolve-reports';
import { EmptyState } from '@/components/ui/empty-state';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  BROKEN_LINK: 'Broken link',
  LOTS_OF_ADS: 'Lots of ads',
  OTHER: 'Something else',
};

/**
 * Open reports, grouped by source.
 *
 * One card per source, not per report: twenty complaints about one broken link
 * are a single decision.
 */
export default async function AdminReportsPage() {
  const groups = await repos().contributions.openReportGroups();

  if (groups.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState title="No open reports." hint="Reported sources will appear here." />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3.5">
      {groups.map((group) => (
        <article key={group.source.id} className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-text">
                <Link href={`/sources/${group.source.id}`} className="text-text no-underline hover:text-accent">
                  {group.source.name}
                </Link>
              </p>
              <p className="m-0 mt-0.5 text-sm text-muted">{group.source.domain}</p>
            </div>
            <span className="shrink-0 rounded-pill border border-warn-line bg-warn-bg px-2.5 py-0.5 text-xs text-warn-text">
              {group.count} report{group.count === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
            {group.reasons.map((reason) => (
              <li
                key={reason.reason}
                className="rounded-pill border border-line bg-bg px-2.5 py-1 text-xs text-muted"
              >
                {REASON_LABEL[reason.reason] ?? reason.reason} × {reason.count}
              </li>
            ))}
          </ul>

          {group.samples.length > 0 ? (
            <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-sm text-muted">
              {group.samples.map((sample, index) => (
                <li key={index}>
                  <span className="text-text">
                    {REASON_LABEL[sample.reason] ?? sample.reason}:
                  </span>{' '}
                  {sample.details}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="m-0 mt-3 text-sm">
            <Link href={`/admin/sources?q=${encodeURIComponent(group.source.domain)}`} className="text-accent">
              Edit, warn or hide this source
            </Link>
          </p>

          <ResolveReports sourceId={group.source.id} count={group.count} />
        </article>
      ))}
    </section>
  );
}
