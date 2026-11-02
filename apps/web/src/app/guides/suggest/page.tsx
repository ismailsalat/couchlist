import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { GuideSuggestForm } from '@/components/guide-suggest-form';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireVerifiedOrPrompt } from '@/lib/auth/require-page-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suggest a guide', robots: { index: false } };

export default async function SuggestGuidePage() {
  const user = await requireVerifiedOrPrompt('/guides/suggest');
  const savedCount = await savedCountFor(user);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />

      <main id="main" className="mx-auto max-w-[620px] px-3.5 pb-8 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <Link href="/guides" className="text-accent no-underline">
            Guides
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Suggest</span>
        </nav>

        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">
          Suggest a guide or tool
        </h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          Something that helped you get a source working is probably worth writing down.
        </p>

        <GuideSuggestForm displayName={user.displayName?.trim() || user.username} />
      </main>
    </>
  );
}
