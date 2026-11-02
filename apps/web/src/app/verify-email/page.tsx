import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { VerifyEmailForm } from '@/components/verify-email-form';
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
       * Says plainly what state the reader is already in. Without this, the
       * back button looks like it skipped a step it did not skip.
       */}
      <p className="m-0 mt-4 border-t border-line pt-4 text-sm text-muted">
        You are already signed in as {user.displayName ?? user.email}. Browsing, searching and
        reading guides all work now &mdash; the code is only needed before you vote, save or
        contribute.{' '}
        <Link href="/" className="text-accent">
          Have a look round first
        </Link>
        .
      </p>
    </AuthShell>
  );
}
