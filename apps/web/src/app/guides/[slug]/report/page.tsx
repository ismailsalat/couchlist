import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { GuideSuggestForm } from '@/components/guide-suggest-form';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireVerifiedOrPrompt } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report a broken link', robots: { index: false } };

export default async function GuideFeedbackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireVerifiedOrPrompt(`/guides/${slug}/report`);
  const [guide, savedCount] = await Promise.all([
    repos().guides.findBySlug(slug, { includeUnpublished: true }),
    savedCountFor(user),
  ]);
  if (!guide) notFound();

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />

      <main id="main" className="mx-auto max-w-[620px] px-3.5 pb-8 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <Link href={`/guides/${guide.slug}`} className="text-accent no-underline">
            {guide.title}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Feedback</span>
        </nav>

        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Report a broken link</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">Tell us which link no longer works.</p>

        <GuideSuggestForm
          displayName={user.displayName?.trim() || user.username}
          guide={{ id: guide.id, title: guide.title }}
          kind="BROKEN_LINK"
        />
      </main>
    </>
  );
}
