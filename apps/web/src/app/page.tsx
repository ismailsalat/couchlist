import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { DirectoryControls } from '@/components/directory-controls';
import { SourceRow } from '@/components/source-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { optionalUser } from '@/lib/api/guards';
import { PAGE_SIZE, loadDirectoryView, savedCountFor } from '@/lib/directory/page-data';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Find a good place to watch or read',
  description:
    'A community directory of websites for anime, movies, TV, manga, manhwa and comics, with honest feedback and no login needed to browse.',
  alternates: { canonical: '/' },
};

/**
 * Discover: the default entry page.
 *
 * Public. Browsing, searching, filtering and opening a source all work signed
 * out; this is a server-rendered list so it is indexable and arrives complete
 * rather than as an empty shell waiting on a client fetch.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await optionalUser();
  const [view, savedCount] = await Promise.all([
    loadDirectoryView(params, user),
    savedCountFor(user),
  ]);

  const canInteract = Boolean(user?.emailVerifiedAt);
  const filtered = Boolean(view.search) || view.category !== 'All';

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="discover" />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-4 pt-6 sm:px-6">
        <div className="mb-4 sm:flex sm:items-baseline sm:gap-3.5">
          <h1 className="m-0 text-xl font-bold tracking-tight sm:text-2xl">
            Your next good find.
          </h1>
          <p className="m-0 mt-1 text-sm text-muted sm:mt-0">A little help from the community.</p>
        </div>

        <DirectoryControls
          category={view.category}
          sort={view.sort}
          search={view.search}
          resultLabel={view.resultLabel}
        />

        <div className="rounded-card border-2 border-line bg-surface px-1.5 shadow-pop sm:px-[7px]">
          {view.page.sources.length > 0 ? (
            view.page.sources.map((source, index) => (
              <SourceRow
                key={source.id}
                source={source}
                position={(view.pageNumber - 1) * PAGE_SIZE + index + 1}
                userVote={view.votes.get(source.id) ?? null}
                saved={view.savedIds.has(source.id)}
                canInteract={canInteract}
              />
            ))
          ) : filtered ? (
            <EmptyState
              title="No sources match those filters."
              hint="Try a different search or category."
              action={
                <Link href="/" className="rounded-pill bg-accent-soft px-3.5 py-2 text-sm text-accent no-underline">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="No sources listed yet."
              hint="The directory is community-built. Suggest the first one."
              action={
                <Link
                  href="/submit"
                  className="rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg no-underline"
                >
                  Suggest a source
                </Link>
              }
            />
          )}
        </div>

        <Pagination
          total={view.page.total}
          limit={view.page.limit}
          offset={view.page.offset}
          searchParams={params}
        />

        <footer className="flex flex-wrap justify-between gap-3.5 px-0 pb-1 pt-3.5 text-xs text-muted">
          <span>
            Couchlist lists websites and guides. It does not host or proxy any video, comics or
            translated pages.{' '}
            <Link href="/submit" className="text-accent">
              Suggest a source
            </Link>
          </span>
          <span>{view.resultLabel}</span>
        </footer>
      </main>
    </>
  );
}
