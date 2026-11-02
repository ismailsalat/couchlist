import Link from 'next/link';
import { Brand } from './popcorn-mark';

/** The frame around every sign-in, signup and recovery page. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-[420px] px-4 py-10 sm:px-6">
      <Link href="/" className="inline-block text-text no-underline">
        <Brand tagline={null} />
      </Link>

      <h1 className="mb-1.5 mt-7 text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="m-0 mb-6 text-sm text-muted">{subtitle}</p> : null}

      {children}

      {footer ? <div className="mt-6 text-sm text-muted">{footer}</div> : null}
    </main>
  );
}

export const authButtonClass =
  'cl-touch cl-pill flex w-full items-center justify-center rounded-pill bg-selected px-4 py-3 text-base font-bold text-selected-fg shadow-pop-red hover:bg-selected-hover disabled:opacity-60';
