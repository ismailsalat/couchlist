import Link from "next/link";

/**
 * Mobile navigation.
 *
 * Kept intentionally simple: four large destinations with real touch targets.
 * The extra safe-area padding keeps the controls above iPhone's home gesture.
 */
const ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/friends", label: "Friends", icon: "friends" },
  { href: "/watch-together", label: "Watch", icon: "watch" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

type IconName = (typeof ITEMS)[number]["icon"];

export function MobileNav() {
  return (
    <nav aria-label="Main" className="mobile-bottom-nav sm:hidden">
      <ul className="mobile-bottom-nav-inner">
        {ITEMS.map((item) => (
          <li key={item.href} className="min-w-0 flex-1">
            <Link href={item.href} className="mobile-nav-link">
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavIcon({ name }: { name: IconName }) {
  if (name === "home") {
    return (
      <svg className="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.8 12 3.7l8.5 7.1v8.6a1.6 1.6 0 0 1-1.6 1.6h-4.4v-6h-5v6H5.1a1.6 1.6 0 0 1-1.6-1.6v-8.6Z" />
      </svg>
    );
  }

  if (name === "friends") {
    return (
      <svg className="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM3 20a6.2 6.2 0 0 1 12.4 0H3Zm13.1-8.7a3 3 0 1 0 0-5.9 4.9 4.9 0 0 1 0 5.9Zm.8 2.3a6 6 0 0 1 3.9 5.6v.8h-3.2a8.2 8.2 0 0 0-2.4-5.8c.5-.3 1.1-.5 1.7-.6Z" />
      </svg>
    );
  }

  if (name === "watch") {
    return (
      <svg className="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4Zm-2 5.4 6.5 3.8-6.5 3.8V8.2Z" />
      </svg>
    );
  }

  return (
    <svg className="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.1a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2ZM4.2 21a7.8 7.8 0 0 1 15.6 0H4.2Z" />
    </svg>
  );
}
