import { Logo } from '@/components/logo';

/** Shown to anyone outside the TEST_USER_IDS allowlist. */
export default function PrivateTestingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <Logo />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <h1 className="text-2xl font-semibold">Couchlist is currently in private testing.</h1>
        <p className="muted mt-4 max-w-md leading-relaxed">
          Thanks for the interest. Access is limited to a small group of testers right now.
          Check back soon.
        </p>
      </div>
    </main>
  );
}
