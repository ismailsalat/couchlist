'use client';

import { countVisit } from '@/lib/count-visit';

/**
 * Straight to the website.
 *
 * `rel="noopener noreferrer nofollow"` on every outbound link: noopener and
 * noreferrer so the destination gets neither a handle on this tab nor the
 * page the reader came from, nofollow because a directory listing is not an
 * endorsement worth passing on.
 */
export function VisitLink({
  id,
  name,
  domain,
  homepageUrl,
}: {
  id: string;
  name: string;
  domain: string;
  homepageUrl: string;
}) {
  return (
    <a
      href={homepageUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => countVisit(id)}
      title={`Open ${domain} in a new tab`}
      aria-label={`Open ${name} website in a new tab`}
      className="cl-touch cl-pill flex h-11 w-8 shrink-0 items-center justify-center rounded-pill border-2 border-line bg-bg text-muted hover:border-accent hover:bg-accent-soft hover:text-accent sm:h-8 sm:w-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </svg>
    </a>
  );
}
