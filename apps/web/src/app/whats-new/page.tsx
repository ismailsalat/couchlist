import type { Metadata } from 'next';
import Link from 'next/link';
import { categoriesFromFlags } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { CategoryPill } from '@/components/ui/category-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "What's new",
  description: 'Newly listed sources, approved corrections and recently added guides.',
  alternates: { canonical: '/whats-new' },
};

/**
 * What's new.
 *
 * Newly listed sources, approved corrections and recent guides, merged by
 * date. A plain reverse-chronological list: there is nothing here that tries
 * to keep anybody scrolling.
 */
export default async function WhatsNewPage() {
  const user = await optionalUser();
  const { contributions, guides } = repos();

  const [savedCount, activity, recentGuides] = await Promise.all([
    savedCountFor(user),
    contributions.recentActivity(15),
    guides.list({ includeUnpublished: false }),
  ]);

  type Entry = {
    key: string;
    at: Date;
    kind: 'source' | 'correction' | 'guide';
    title: string;
    detail: string;
    href: string;
    categories?: string[];
  };

  const entries: Entry[] = [
    ...activity.recentSources.map(({ source }) => ({
      key: `source-${source.id}`,
      at: source.createdAt,
      kind: 'source' as const,
      title: source.name,
      detail: source.description ?? source.domain,
      href: `/sources/${source.id}`,
      categories: categoriesFromFlags(source),
    })),
    ...activity.recentRevisions.map(({ revision, sourceName, sourceId }) => ({
      key: `revision-${revision.id}`,
      at: revision.createdAt,
      kind: 'correction' as const,
      title: sourceName,
      detail: revision.summary,
      href: `/sources/${sourceId}`,
    })),
    ...recentGuides.slice(0, 10).map((guide) => ({
      key: `guide-${guide.id}`,
      at: guide.createdAt,
      kind: 'guide' as const,
      title: guide.title,
      detail: guide.task,
      href: `/guides/${guide.slug}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 30);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">What&apos;s new</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          Newly listed sources, approved corrections and recent guides.
        </p>

        <div className="rounded-card border border-line bg-surface">
          {entries.length > 0 ? (
            <ul className="m-0 list-none p-0">
              {entries.map((entry) => (
                <li key={entry.key} className="border-b border-line p-3.5 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-pill border border-line bg-bg px-2 py-px text-xs text-muted">
                      {KIND_LABEL[entry.kind]}
                    </span>
                    <Link
                      href={entry.href}
                      className="text-sm font-semibold text-text no-underline hover:text-accent"
                    >
                      {entry.title}
                    </Link>
                    {entry.categories?.map((category) => (
                      <CategoryPill key={category} category={category as never} />
                    ))}
                    <span className="ml-auto text-xs tabular-nums text-muted">
                      {entry.at.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-sm text-muted">{entry.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing new yet." hint="New sources and guides will show up here." />
          )}
        </div>
      </main>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  source: 'New source',
  correction: 'Correction',
  guide: 'Guide',
};
