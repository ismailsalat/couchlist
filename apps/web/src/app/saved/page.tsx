import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { ExportMenu } from '@/components/export-menu';
import { DirectoryControls } from '@/components/directory-controls';
import { SourceRow } from '@/components/source-row';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { RecentlyViewed } from '@/components/recently-viewed';
import { PAGE_SIZE, loadDirectoryView, savedCountFor } from '@/lib/directory/page-data';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Saved sources', robots: { index: false } };

/**
 * Saved sources.
 *
 * The same compact list as Discover, filtered to this account's bookmarks.
 * Private: it needs a session, and nothing here is exposed publicly. Private
 * notes are shown because the viewer is their owner.
 */
export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUserOrLogin('/saved');

  const [view, savedCount] = await Promise.all([
    loadDirectoryView(params, user, { savedOnly: true }),
    savedCountFor(user),
  ]);

  const notes = await Promise.all(
    view.page.sources.map(async (source) => ({
      id: source.id,
      note: await repos().sources.bookmarkNote(source.id, user.id),
    })),
  );
  const noteById = new Map(notes.map((entry) => [entry.id, entry.note]));

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="saved" />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-4 pt-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Saved sources</h1>
            <p className="m-0 mt-1 text-sm text-muted">
              Only you can see this list and your notes.
            </p>
          </div>
          {savedCount > 0 ? (
            <ExportMenu />
          ) : null}
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
                saved
                canInteract={Boolean(user.emailVerifiedAt)}
                note={noteById.get(source.id)}
              />
            ))
          ) : (
            <EmptyState
              title={
                view.search || view.category !== 'All'
                  ? 'No saved sources match those filters.'
                  : 'Nothing saved yet.'
              }
              hint="Use the bookmark button on a source to keep it here."
              action={
                <Link
                  href="/"
                  className="rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg no-underline"
                >
                  Browse Discover
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

        <RecentlyViewed />
      </main>
    </>
  );
}
