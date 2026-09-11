import Link from "next/link";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";

/** Top navigation. Friends and servers stay first-class Couchlist destinations. */
export function Nav({
  avatarUrl,
  username,
  showSearch = true,
}: {
  avatarUrl?: string | null;
  username?: string;
  showSearch?: boolean;
}) {
  return (
    <header className="app-top-nav sticky z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:gap-6 sm:px-5 sm:py-3">
        <Link href="/home" className="flex min-h-[44px] shrink-0 items-center">
          <Logo />
        </Link>

        {showSearch ? (
          <div className="hidden flex-1 sm:block">
            <SearchBar compact />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <nav className="flex items-center gap-2 text-sm font-bold sm:gap-5">
          <Link
            href="/home"
            className="flex min-h-[44px] items-center px-1 text-text-secondary hover:text-text-primary"
          >
            Home
          </Link>
          <Link
            href="/sources"
            className="hidden text-text-secondary hover:text-text-primary sm:inline"
          >
            Global Sources
          </Link>
          <Link
            href="/my-server"
            className="hidden text-text-secondary hover:text-text-primary sm:inline"
          >
            My Server
          </Link>
          <Link
            href="/friends"
            className="hidden text-text-secondary hover:text-text-primary sm:inline"
          >
            Friends
          </Link>
          <Link
            href="/watch-together"
            className="hidden text-text-secondary hover:text-text-primary sm:inline"
          >
            Watch Together
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
