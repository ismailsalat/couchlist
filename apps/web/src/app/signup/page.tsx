import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { SignupForm } from '@/components/signup-form';
import { optionalUser } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default async function SignupPage() {
  const user = await optionalUser();
  if (user) redirect('/');

  return (
    <AuthShell
      title="Create an account"
      subtitle="You only need one to save sources, vote and contribute. Browsing is always open."
      footer={
        <span>
          Already have one?{' '}
          <Link href="/login" className="text-accent">
            Sign in
          </Link>
        </span>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
