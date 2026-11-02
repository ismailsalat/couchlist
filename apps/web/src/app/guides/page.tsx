import type { Metadata } from 'next';
import Link from 'next/link';
import { Armchair } from 'lucide-react';
import {
  GUIDE_TOPICS,
  START_HERE,
  START_HERE_META,
  guideTopicMeta,
  parseGuideDevice,
  parseGuideTopicFilter,
} from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { GuideControls } from '@/components/guide-controls';
import { GuideTopicRail } from '@/components/guide-topic-rail';
import { GuideRowItem } from '@/components/guide-row';
import { EmptyState } from '@/components/ui/empty-state';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guides for watching and reading',
  description:
    'Pick an ad blocker, play a video file, read manga and manhwa, translate a panel, add subtitles, cast to a TV, and fix the usual problems.',
  alternates: { canonical: '/guides' },
};

/**
 * The Guides hub.
 *
 * Public and server-rendered. A topic rail, a search that tolerates common
 * misspellings, and a device filter that excludes tools which do not run on
 * the chosen platform.
 */
export default async function GuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; q?: string; device?: string }>;
}) {
  const params = await searchParams;
  const topic = parseGuideTopicFilter(params.topic);
  const device = parseGuideDevice(params.device);
  const search = (params.q ?? '').slice(0, 120);

  const user = await optionalUser();
  const { guides } = repos();

  const [rows, savedCount, topicCounts] = await Promise.all([
    guides.list({ topic, device, search: search || undefined }),
    savedCountFor(user),
    guides.countByTopic(),
  ]);

  const heading =
    topic === START_HERE
      ? search
        ? 'Search all guides'
        : START_HERE_META.title
      : guideTopicMeta(topic).title;

  const description = search
    ? `Results for “${search}”${topic === START_HERE ? '' : ` in ${guideTopicMeta(topic).title.toLowerCase()}`}.`
    : topic === START_HERE
      ? START_HERE_META.description
      : guideTopicMeta(topic).description;

  const counts: Record<string, number> = {};
  for (const entry of GUIDE_TOPICS) {
    counts[entry.slug] = topicCounts.get(entry.topic) ?? 0;
  }

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-4 pt-6 sm:px-6">
        <div className="mb-4 sm:mb-5">
          <span className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-accent">
            <Armchair aria-hidden="true" className="h-4 w-4" />
            MAKE YOURSELF COMFORTABLE
          </span>
          <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">
            A little help goes a long way.
          </h1>
          <p className="m-0 mt-1.5 text-[13px] text-muted">
            Apps, tools, and how-tos for whatever you&apos;re watching or reading.
          </p>
        </div>

        <GuideControls search={search} device={device} />

        <div className="sm:grid sm:grid-cols-[177px_minmax(0,1fr)] sm:items-start sm:gap-6">
          <GuideTopicRail topic={topic} counts={counts} />

          <div className="min-w-0">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-semibold tracking-tight">{heading}</h2>
                <p className="m-0 mt-1 text-sm leading-normal text-muted">{description}</p>
              </div>
              <span role="status" aria-live="polite" className="shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums text-muted">
                {rows.length} {rows.length === 1 ? 'guide' : 'guides'}
              </span>
            </div>

            <div className="rounded-card border-2 border-line bg-surface shadow-pop">
              {rows.length > 0 ? (
                rows.map((guide) => <GuideRowItem key={guide.id} guide={guide} />)
              ) : (
                <EmptyState
                  title="No guides match these filters yet."
                  action={
                    <Link
                      href="/guides"
                      className="rounded-pill bg-accent-soft px-3.5 py-2 text-sm text-accent no-underline"
                    >
                      Show starting guides
                    </Link>
                  }
                />
              )}
            </div>

            <p className="mb-1 mt-3.5 text-xs text-muted">
              Open a guide for quick steps, compatibility notes, and official links.{' '}
              <Link href="/guides/suggest" className="text-accent">
                Suggest a guide or tool
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
