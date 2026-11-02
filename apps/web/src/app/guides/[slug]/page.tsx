import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { guideLinks, guideSteps } from '@couchlist/db';
import { devicesFromFlags, guideTopicMeta } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';
import { GUIDE_TOPICS } from '@couchlist/shared';

export const dynamic = 'force-dynamic';

/**
 * A guide's own page.
 *
 * Stable, shareable and indexable. A topic slug also resolves here, so the
 * topic links in the footer of a source page land somewhere sensible.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const topic = GUIDE_TOPICS.find((entry) => entry.slug === slug);
  if (topic) {
    return {
      title: topic.title,
      description: topic.description,
      alternates: { canonical: `/guides?topic=${topic.slug}` },
    };
  }

  const guide = await repos().guides.findBySlug(slug);
  if (!guide) return { title: 'Guide not found', robots: { index: false } };

  return {
    title: guide.title,
    description: guide.summary.slice(0, 200),
    alternates: { canonical: `/guides/${guide.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A topic slug is a filter on the hub, not a guide.
  const topicEntry = GUIDE_TOPICS.find((entry) => entry.slug === slug);
  if (topicEntry) {
    const { redirect } = await import('next/navigation');
    redirect(`/guides?topic=${topicEntry.slug}`);
  }

  const user = await optionalUser();
  const [guide, savedCount] = await Promise.all([
    repos().guides.findBySlug(slug),
    savedCountFor(user),
  ]);
  if (!guide) notFound();

  const steps = guideSteps(guide);
  const links = guideLinks(guide);
  const topic = guideTopicMeta(guide.topic);
  const devices = devicesFromFlags(guide);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-6 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <Link href="/guides" className="text-accent no-underline">
            Guides
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/guides?topic=${topic.slug}`} className="text-accent no-underline">
            {topic.title}
          </Link>
        </nav>

        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">{guide.title}</h1>
        <p className="m-0 mt-1.5 text-sm text-muted">{guide.task}</p>

        {devices.length > 0 ? (
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
            {devices.map((device) => (
              <li
                key={device}
                className="rounded-pill border border-line bg-surface px-2.5 py-1 text-xs text-muted"
              >
                {DEVICE_LABELS[device]}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 rounded-card border border-line bg-surface p-4 sm:p-5">
          <p className="m-0 text-sm leading-relaxed text-text">{guide.summary}</p>

          {steps.length > 0 ? (
            <>
              <h2 className="mb-2 mt-5 text-lg font-semibold">Steps</h2>
              <ol className="m-0 list-decimal pl-5 text-sm leading-relaxed">
                {steps.map((step, index) => (
                  <li key={index} className="my-2">
                    {step}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {links.length > 0 ? (
            <>
              <h2 className="mb-2 mt-5 text-lg font-semibold">Official links</h2>
              <div className="flex flex-wrap gap-2">
                {links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cl-touch inline-flex items-center gap-1.5 rounded-pill border border-line bg-bg px-3 py-2 text-xs text-accent no-underline hover:border-[#a44959] hover:bg-accent-soft"
                  >
                    {link.label}
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </>
          ) : null}

          <dl className="m-0 mt-5 grid gap-2.5 text-sm">
            {guide.browserNotes ? (
              <div>
                <dt className="font-semibold text-text">Browser support</dt>
                <dd className="m-0 text-muted">{guide.browserNotes}</dd>
              </div>
            ) : null}
            {guide.costNote ? (
              <div>
                <dt className="font-semibold text-text">Cost</dt>
                <dd className="m-0 text-muted">{guide.costNote}</dd>
              </div>
            ) : null}
            {guide.note ? (
              <div>
                <dt className="font-semibold text-text">Good to know</dt>
                <dd className="m-0 text-muted">{guide.note}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-text">Last reviewed</dt>
              <dd className="m-0 text-muted">
                {guide.lastReviewedAt
                  ? guide.lastReviewedAt.toISOString().slice(0, 10)
                  : 'Not yet reviewed by a moderator. Check the official links before relying on compatibility or pricing.'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href={`/guides/${guide.slug}/correct`}
            className="cl-touch inline-flex items-center rounded-pill border border-line bg-surface px-3.5 py-2.5 text-sm text-text no-underline hover:bg-hover"
          >
            Suggest a correction
          </Link>
          <Link
            href={`/guides/${guide.slug}/report`}
            className="cl-touch inline-flex items-center rounded-pill border border-line bg-surface px-3.5 py-2.5 text-sm text-text no-underline hover:bg-hover"
          >
            Report a broken link
          </Link>
        </div>
      </main>
    </>
  );
}

const DEVICE_LABELS: Record<string, string> = {
  computer: 'Computer',
  iphone: 'iPhone / iPad',
  android: 'Android',
  tv: 'TV',
};
