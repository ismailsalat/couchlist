import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        subtitle="Reset links contain a one-time token. Ask for a new one."
        footer={
          <Link href="/forgot-password" className="text-accent">
            Send a new reset link
          </Link>
        }
      >
        <p className="m-0 text-sm text-muted">Nothing has been changed on your account.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This link can be used once.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
