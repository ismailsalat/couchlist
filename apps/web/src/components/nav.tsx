import Link from 'next/link';
import { Logo } from './logo';
import { SearchBar } from './search-bar';

/** Top navigation. Four destinations, nothing else. */
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
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-5 py-3">
        <Link href="/home" className="shrink-0">
          <Logo />
        </Link>

        {showSearch ? (
          <div className="hidden flex-1 sm:block">
            <SearchBar compact />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <nav className="flex items-center gap-5 text-sm font-bold">
          <Link href="/home" className="text-text-secondary hover:text-text-primary">
            Home
          </Link>
          <Link href="/friends" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Friends
          </Link>
          <Link
            href="/watch-together"
            className="hidden text-text-secondary hover:text-text-primary sm:inline"
          >
            Watch Together
          </Link>
          <Link href="/profile" className="shrink-0" aria-label="Profile">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={username ?? 'Profile'}
                className="h-9 w-9 rounded-full border-2 border-border object-cover shadow-md transition-transform hover:scale-105"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-bold shadow-md">
                {(username ?? '?').slice(0, 1).toUpperCase()}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
