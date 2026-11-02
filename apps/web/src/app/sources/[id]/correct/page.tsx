import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { CorrectionForm } from '@/components/correction-form';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireVerifiedOrPrompt } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suggest a correction', robots: { index: false } };

export default async function CorrectSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireVerifiedOrPrompt(`/sources/${id}/correct`);
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
          <span>Correction</span>
        </nav>

        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">
          Suggest a correction
        </h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          Fix the address, name, description, categories or ad warning for {source.name}.
        </p>

        <CorrectionForm
          sourceId={source.id}
          displayName={user.displayName?.trim() || user.username}
          current={{
            name: source.name,
            homepageUrl: source.homepageUrl,
            description: source.description,
            categories: source.categories,
            hasLotsOfAds: source.hasLotsOfAds,
          }}
        />
      </main>
    </>
  );
}
