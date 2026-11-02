import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { VerifyEmailForm } from '@/components/verify-email-form';
import { SignOutLink } from '@/components/sign-out-link';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verify your email', robots: { index: false } };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const user = await requireUserOrLogin('/verify-email');
  if (user.emailVerifiedAt) redirect('/');

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        sent
          ? `We sent a 6-digit code to ${user.email ?? 'your address'}. It expires in 30 minutes.`
          : `Enter the 6-digit code we sent to ${user.email ?? 'your address'}.`
      }
    >
      <VerifyEmailForm />

      {/*
       * The way out, said plainly. The hold is deliberate, so the page that
       * imposes it has to offer both exits: finish, or leave.
       */}
      <p className="m-0 mt-4 border-t border-line pt-4 text-sm text-muted">
        Signed in as {user.displayName ?? user.email}. Until this address is confirmed, this is
        the only page available &mdash; that is how we know an account belongs to someone.{' '}
        <SignOutLink />
      </p>
    </AuthShell>
  );
}
