import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { AccountSettings } from '@/components/account-settings';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account settings', robots: { index: false } };

/**
 * Account settings.
 *
 * The email address appears here, to its owner. It is not in any public
 * response, page markup, contributor list or source credit.
 */
export default async function AccountPage() {
  const user = await requireUserOrLogin('/account');
  const [savedCount, contributionCount] = await Promise.all([
    savedCountFor(user),
    repos().contributions.publicContributionCount(user.id),
  ]);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[620px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Account settings</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          Your email is private. Your display name and the contributions you choose to credit are
          public.
        </p>

        <AccountSettings
          userId={user.id}
          hasAvatar={Boolean(user.avatarMime)}
          email={user.email ?? ''}
          displayName={user.displayName?.trim() || user.username}
          emailVerified={Boolean(user.emailVerifiedAt)}
          isAdmin={user.isAdmin}
          publicContributionCount={contributionCount}
        />
      </main>
    </>
  );
}
