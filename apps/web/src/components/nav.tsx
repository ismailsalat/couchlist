import Link from "next/link";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";

/**
 * Shared signed-in navigation.
 *
 * Desktop keeps the full product navigation. Mobile intentionally mirrors the
 * public directory header: brand on the left, current section in the middle,
 * avatar on the right. The fixed bottom bar remains the primary mobile nav.
 */
export function Nav({
  avatarUrl,
  username,
  showSearch = true,
  mobileLabel = "Home",
}: {
  avatarUrl?: string | null;
  username?: string;
  showSearch?: boolean;
  mobileLabel?: string;
}) {
  return (
    <header className="app-top-nav sticky z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:gap-6 sm:px-5 sm:py-3">
        <Link href="/home" className="flex min-h-[44px] shrink-0 items-center">
          <Logo />
        </Link>

        {showSearch ? (
          <div className="hidden flex-1 sm:block">
            <SearchBar compact />
          </div>
        ) : (
          <div className="hidden flex-1 sm:block" />
        )}

        <span className="ml-auto truncate text-sm font-black text-[#dbe3ec] sm:hidden">
          {mobileLabel}
        </span>

        <nav className="flex items-center gap-2 text-sm font-bold sm:ml-auto sm:gap-5">
          <Link href="/home" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Home
          </Link>
          <Link href="/sources" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Sources
          </Link>
          <Link href="/my-server" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            My Server
          </Link>
          <Link href="/friends" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Friends
          </Link>
          <Link href="/watch-together" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Pick Together
          </Link>
          <Link
            href="/profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            aria-label="Profile"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={username ?? "Profile"}
                className="h-10 w-10 rounded-full border-2 border-border object-cover shadow-md transition-transform hover:scale-105 sm:h-9 sm:w-9"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-bold shadow-md sm:h-9 sm:w-9">
                {(username ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
