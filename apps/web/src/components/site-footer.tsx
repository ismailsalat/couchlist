import Link from 'next/link';
import { siteContact } from '@/lib/site';

/**
 * The footer, on every page.
 *
 * It carries the one sentence that matters most about what this site is
 * ("it lists, it does not host"), and the pages that say who runs it. Those
 * links being present on every page is the point: a reader who lands on a
 * listing from a search result should not have to find the home page to work
 * out whether this is a real site.
 */
export function SiteFooter() {
  const { email } = siteContact();

  return (
    <footer className="mt-2 border-t border-line px-4 py-5 text-xs text-muted sm:px-6">
      <p className="m-0 max-w-[62ch]">
        Couchlist lists websites and guides. It does not host, stream or proxy any video, comics
        or translated pages, and it carries no advertising.
      </p>

      <nav aria-label="Site information" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/about" className="text-muted no-underline hover:text-accent">
          About
        </Link>
        <Link href="/privacy" className="text-muted no-underline hover:text-accent">
          Privacy
        </Link>
        <Link href="/terms" className="text-muted no-underline hover:text-accent">
          Terms
        </Link>
        <Link href="/guides" className="text-muted no-underline hover:text-accent">
          Guides
        </Link>
        <Link href="/submit" className="text-muted no-underline hover:text-accent">
          Suggest a source
        </Link>
        <a href={`mailto:${email}`} className="text-muted no-underline hover:text-accent">
          {email}
        </a>
      </nav>
    </footer>
  );
}
