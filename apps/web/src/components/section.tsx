import Link from 'next/link';

/** Section heading with an optional "See all" link. */
export function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm font-bold text-primary hover:text-primary-hover">
            See all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="card px-5 py-9 text-center">
      <div aria-hidden="true" className="mb-3 text-2xl">🍿</div>
      <p className="muted mx-auto max-w-md leading-relaxed">{children}</p>
    </div>
  );
}
