import Link from 'next/link';

/**
 * Page links for the directory.
 *
 * Real links with real URLs, so a page is shareable and the back button works.
 * Numbering continues across pages, which is why the row component is given an
 * explicit position rather than using its index.
 */
export function Pagination({
  total,
  limit,
  offset,
  searchParams,
}: {
  total: number;
  limit: number;
  offset: number;
  searchParams: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  if (pageCount <= 1) return null;

  function href(page: number): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') next.set(key, value);
    }
    if (page > 1) next.set('page', String(page));
    const query = next.toString();
    return query ? `?${query}` : '?';
  }

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-3.5">
      {current > 1 ? (
        <Link href={href(current - 1)} className={pageLinkClass}>
          Previous
        </Link>
      ) : (
        <span className={`${pageLinkClass} pointer-events-none opacity-40`} aria-hidden="true">
          Previous
        </span>
      )}

      <span className="text-xs tabular-nums text-muted">
        Page {current} of {pageCount}
      </span>

      {current < pageCount ? (
        <Link href={href(current + 1)} className={pageLinkClass}>
          Next
        </Link>
      ) : (
        <span className={`${pageLinkClass} pointer-events-none opacity-40`} aria-hidden="true">
          Next
        </span>
      )}
    </nav>
  );
}

const pageLinkClass =
  'cl-touch inline-flex items-center rounded-pill border border-line bg-surface px-3.5 py-2 text-sm text-text no-underline hover:bg-hover';
