import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeRedirectPath as safeNext } from '@couchlist/shared';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/login-form';
import { optionalUser } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; intent?: string }>;
}) {
  const { next, intent } = await searchParams;
  const user = await optionalUser();
  if (user) redirect(safeNext(next));

  return (
    <AuthShell
      title="Welcome back"
      subtitle={intent ? `Sign in to ${intent}.` : 'Sign in to save sources and give feedback.'}
      footer={
        <div className="flex flex-col gap-1.5">
          <span>
            New here?{' '}
            <Link href="/signup" className="text-accent">
              Create an account
            </Link>
          </span>
          <Link href="/forgot-password" className="text-accent">
            Forgot your password?
          </Link>
          <Link href="/" className="text-muted">
            Keep browsing without an account
          </Link>
        </div>
      }
    >
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
