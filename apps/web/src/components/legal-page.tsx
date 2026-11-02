import type { ReactNode } from 'react';
import type { User } from '@couchlist/db';
import { SiteHeader } from '@/components/site-header';

/**
 * The shell the About, Privacy and Terms pages share.
 *
 * One column, generous measure, no sidebar. These pages are read, not
 * navigated, and the thing that makes them worth having is that they are
 * specific and legible rather than that they exist.
 */
export function LegalPage({
  title,
  intro,
  user,
  savedCount,
  children,
}: {
  title: string;
  intro: string;
  user: User | null;
  savedCount: number;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />
      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="m-0 mt-2 text-base text-muted">{intro}</p>
        <div className="mt-6 flex flex-col gap-6">{children}</div>
      </main>
    </>
  );
}

/** A titled block. Headings are real headings, for screen readers and search. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2.5 flex flex-col gap-2.5 text-sm leading-relaxed text-text">
        {children}
      </div>
    </section>
  );
}

/** A plain bulleted list in the same voice as the prose around it. */
export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
