import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ReportForm } from '@/components/report-form';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireVerifiedOrPrompt } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report an issue', robots: { index: false } };

export default async function ReportSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireVerifiedOrPrompt(`/sources/${id}/report`);
  const [source, savedCount] = await Promise.all([
    repos().sources.findById(id, { includeHidden: true }),
    savedCountFor(user),
  ]);
  if (!source) notFound();

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="discover" />

      <main id="main" className="mx-auto max-w-[620px] px-3.5 pb-8 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <Link href={`/sources/${source.id}`} className="text-accent no-underline">
            {source.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Report</span>
        </nav>

        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Report an issue</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">Tell us what is wrong with {source.name}.</p>

        <ReportForm sourceId={source.id} sourceName={source.name} />
      </main>
    </>
  );
}
