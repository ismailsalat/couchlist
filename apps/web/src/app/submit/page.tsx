import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SuggestSourceForm } from '@/components/suggest-source-form';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireVerifiedOrPrompt } from '@/lib/auth/require-page-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suggest a source', robots: { index: false } };

/** Suggesting a source needs a verified account; browsing never does. */
export default async function SubmitPage() {
  const user = await requireVerifiedOrPrompt('/submit');
  const savedCount = await savedCountFor(user);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="discover" />

      <main id="main" className="mx-auto max-w-[620px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Suggest a source</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          A moderator checks suggestions before they appear.{' '}
          <Link href="/submissions" className="text-accent">
            See your submissions
          </Link>
        </p>

        <SuggestSourceForm displayName={user.displayName?.trim() || user.username} />
      </main>
    </>
  );
}
