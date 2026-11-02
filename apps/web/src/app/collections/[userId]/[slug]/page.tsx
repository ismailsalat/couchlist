import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { categoriesFromFlags } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { SourceRow } from '@/components/source-row';
import { EmptyState } from '@/components/ui/empty-state';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * One collection.
 *
 * A private collection is served only to its owner: `findForViewer` takes the
 * viewer and returns nothing otherwise, so guessing a URL does not expose one.
 * A private collection is also kept out of the index.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string; slug: string }>;
}): Promise<Metadata> {
  const { userId, slug } = await params;
  const viewer = await optionalUser();
  const collection = await repos().collections.findForViewer(userId, slug, viewer?.id);

  if (!collection) return { title: 'Collection not found', robots: { index: false } };

  return {
    title: collection.name,
    description: collection.description ?? undefined,
    robots: collection.isPublic ? undefined : { index: false, follow: false },
    alternates: collection.isPublic
      ? { canonical: `/collections/${userId}/${slug}` }
      : undefined,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ userId: string; slug: string }>;
}) {
  const { userId, slug } = await params;
  const viewer = await optionalUser();
  const { collections, sources } = repos();

  const collection = await collections.findForViewer(userId, slug, viewer?.id);
  if (!collection) notFound();

  // Items first: the vote lookup needs their ids, and loading them twice
  // would be two queries for one list.
  const items = await collections.items(collection.id);
  const itemIds = items.map((item) => item.source.id);

  const [savedCount, votes, savedIds] = await Promise.all([
    savedCountFor(viewer),
    viewer
      ? sources.votesByUser(viewer.id, itemIds)
      : Promise.resolve(new Map<string, 'LIKE' | 'DISLIKE'>()),
    viewer ? sources.bookmarkedIds(viewer.id, itemIds) : Promise.resolve(new Set<string>()),
  ]);

  const isOwner = viewer?.id === collection.ownerUserId;

  return (
    <>
      <SiteHeader user={viewer} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">{collection.name}</h1>
        <p className="m-0 mt-1.5 text-sm text-muted">
          {collection.isPublic ? 'Public collection' : 'Private collection — only you can see it'}
          {collection.description ? ` · ${collection.description}` : ''}
        </p>

        {isOwner ? (
          <p className="m-0 mt-2 text-sm">
            <Link href="/collections" className="text-accent">
              Manage your collections
            </Link>
          </p>
        ) : null}

        <div className="mt-4 rounded-card border border-line bg-surface px-1.5 sm:px-[7px]">
          {items.length > 0 ? (
            items.map((item, index) => (
              <SourceRow
                key={item.source.id}
                source={{
                  id: item.source.id,
                  name: item.source.name,
                  domain: item.source.domain,
                  homepageUrl: item.source.homepageUrl,
                  description: item.source.description,
                  categories: categoriesFromFlags(item.source),
                  hasLotsOfAds: item.source.hasLotsOfAds,
                  shouldAvoid: item.source.shouldAvoid,
                  avoidReason: item.source.avoidReason,
                  hasIcon: item.source.iconMime !== null,
                  likes: 0,
                  dislikes: 0,
                }}
                position={index + 1}
                userVote={votes.get(item.source.id) ?? null}
                saved={savedIds.has(item.source.id)}
                canInteract={Boolean(viewer?.emailVerifiedAt)}
                note={isOwner ? item.item.note : null}
              />
            ))
          ) : (
            <EmptyState
              title="Nothing in this collection yet."
              hint={isOwner ? 'Add sources from a source page.' : undefined}
            />
          )}
        </div>
      </main>
    </>
  );
}
