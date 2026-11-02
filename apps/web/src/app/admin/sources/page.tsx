import { parseCategoryFilter } from '@couchlist/shared';
import { SourceAdminRow } from '@/components/admin/source-admin-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

/** Sources: search, filter, edit, hide and restore. Hidden rows included. */
export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const { sources } = repos();

  const [listing, reportCounts] = await Promise.all([
    sources.list({
      search: params.q,
      category: parseCategoryFilter(params.category),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      includeHidden: true,
    }),
    sources.openReportCounts(),
  ]);

  // The admin row needs the raw flags the public shape does not carry.
  const rows = await Promise.all(
    listing.sources.map(async (source) => {
      const row = await sources.findRowById(source.id);
      return { source, row };
    }),
  );

  return (
    <section>
      <form method="get" className="mb-3.5 flex flex-wrap gap-2">
        <label className="flex-1">
          <span className="sr-only">Search sources</span>
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search name, domain or description"
            className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-text"
          />
        </label>
        <button
          type="submit"
          className="cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3.5 py-2.5 text-sm text-text hover:bg-hover"
        >
          Search
        </button>
      </form>

      <p className="m-0 mb-2.5 text-sm text-muted">
        {listing.total} source{listing.total === 1 ? '' : 's'}, hidden ones included.
      </p>

      <div className="rounded-card border border-line bg-surface">
        {rows.length > 0 ? (
          rows.map(({ source, row }) =>
            row ? (
              <SourceAdminRow
                key={source.id}
                source={{
                  id: source.id,
                  name: source.name,
                  domain: source.domain,
                  homepageUrl: source.homepageUrl,
                  description: source.description,
                  categories: source.categories,
                  hasLotsOfAds: source.hasLotsOfAds,
                  shouldAvoid: source.shouldAvoid,
                  avoidReason: source.avoidReason,
                  trustedRank: source.trustedRank,
                  trustedNote: source.trustedNote,
                  isEnabled: row.isEnabled,
                  hiddenReason: row.hiddenReason,
                  adminRankPenalty: source.adminRankPenalty,
                  likes: source.likes,
                  dislikes: source.dislikes,
                }}
                openReports={reportCounts.get(source.id) ?? 0}
              />
            ) : null,
          )
        ) : (
          <EmptyState title="No sources match that search." />
        )}
      </div>

      <Pagination
        total={listing.total}
        limit={listing.limit}
        offset={listing.offset}
        searchParams={params}
      />
    </section>
  );
}
