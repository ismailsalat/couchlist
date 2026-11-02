import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { CollectionsManager } from '@/components/collections-manager';
import { EmptyState } from '@/components/ui/empty-state';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My collections', robots: { index: false } };

/**
 * Collections.
 *
 * A named list of sources, private by default. A public one gets a shareable
 * URL under its owner's id.
 */
export default async function CollectionsPage() {
  const user = await requireUserOrLogin('/collections');
  const { collections } = repos();

  const [savedCount, owned, publicOnes] = await Promise.all([
    savedCountFor(user),
    collections.listOwned(user.id),
    collections.listPublic(10),
  ]);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">My collections</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          Group sources into a list. Private unless you choose to publish it.
        </p>

        <CollectionsManager
          collections={owned.map((collection) => ({
            id: collection.id,
            name: collection.name,
            slug: collection.slug,
            description: collection.description,
            isPublic: collection.isPublic,
            itemCount: collection.itemCount,
            url: `/collections/${user.id}/${collection.slug}`,
          }))}
        />

        {publicOnes.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-2.5 text-lg font-semibold">Public collections</h2>
            <ul className="m-0 list-none space-y-2 p-0">
              {publicOnes.map((collection) => (
                <li key={collection.id} className="rounded-card border border-line bg-surface p-3.5">
                  <Link
                    href={`/collections/${collection.ownerUserId}/${collection.slug}`}
                    className="text-sm font-semibold text-text no-underline hover:text-accent"
                  >
                    {collection.name}
                  </Link>
                  <p className="m-0 mt-0.5 text-sm text-muted">
                    {collection.itemCount} source{collection.itemCount === 1 ? '' : 's'}
                    {collection.ownerDisplayName ? ` · by ${collection.ownerDisplayName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="mt-8 rounded-card border border-line bg-surface">
            <EmptyState title="No public collections yet." />
          </div>
        )}
      </main>
    </>
  );
}
