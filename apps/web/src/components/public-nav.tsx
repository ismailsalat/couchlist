import Link from 'next/link';
import type { User } from '@couchlist/db';
import { Logo } from './logo';

/** Public header uses the same mobile rhythm as signed-in pages. */
export function PublicNav({ user }: { user: User | null }) {
  return (
    <header className="app-top-nav sticky z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:gap-6 sm:px-5 sm:py-3">
        <Link href={user ? '/home' : '/'} className="flex min-h-[44px] shrink-0 items-center">
          <Logo />
        </Link>
        <span className="ml-auto text-sm font-black text-[#dbe3ec] sm:hidden">Sources</span>
        <nav className="flex items-center gap-2 text-sm font-bold sm:ml-auto sm:gap-5">
          <Link href="/sources" className="hidden text-text-secondary hover:text-text-primary sm:inline">Sources</Link>
          {user ? (
            <>
              <Link href="/my-server" className="hidden text-text-secondary hover:text-text-primary sm:inline">My Server</Link>
              <Link href="/friends" className="hidden text-text-secondary hover:text-text-primary sm:inline">Friends</Link>
              <Link href="/profile" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" aria-label="Profile">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full border-2 border-border object-cover shadow-md sm:h-9 sm:w-9" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-bold shadow-md sm:h-9 sm:w-9">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <a href="/api/auth/login" className="btn-primary public-discord-login">
              <span className="hidden sm:inline">Continue with Discord</span>
              <span className="sm:hidden">Sign in</span>
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
