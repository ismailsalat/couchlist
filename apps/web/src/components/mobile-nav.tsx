import Link from 'next/link';

/**
 * Mobile navigation.
 *
 * Discord users often open Couchlist from the mobile app, so the four
 * destinations sit in a bottom bar rather than being squeezed into the header.
 */
const ITEMS = [
  { href: '/home', label: 'Home' },
  { href: '/friends', label: 'Friends' },
  { href: '/watch-together', label: 'Watch' },
  { href: '/profile', label: 'Profile' },
];

export function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 shadow-[0_-10px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:hidden"
    >
      <ul className="mx-auto flex max-w-5xl">
        {ITEMS.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className="block px-2 py-3 text-center text-xs font-bold text-text-secondary transition-colors hover:text-primary-hover focus-visible:text-primary-hover"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
