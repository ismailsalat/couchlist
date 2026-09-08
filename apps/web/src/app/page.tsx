import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Landing page. One message, one button. */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect('/home');

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <Logo />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <h1 className="font-display max-w-2xl text-5xl font-bold leading-[1.02] sm:text-6xl">
          Track what
          <br />
          <span className="text-primary">your friends watch.</span>
        </h1>

        <p className="muted mt-5 text-lg font-medium">Anime. Movies. TV Shows. Together.</p>

        {error === 'auth' ? (
          <p className="mt-6 rounded-lg border border-border bg-card px-4 py-2 text-sm text-text-secondary">
            That sign-in didn&apos;t complete. Please try again.
          </p>
        ) : null}

        <a href="/api/auth/login" className="btn-primary mt-8 px-7 py-3.5 text-base">
          Continue with Discord
        </a>

        <p className="muted mt-8 max-w-md leading-relaxed">
          Add your Couchlist friends and see what they&apos;re watching. Discord servers are optional
          community hubs with extra shared-taste perks.
        </p>
      </div>
    </main>
  );
}
