import Link from 'next/link';
import type { User } from '@couchlist/db';
import { Logo } from './logo';

export function PublicNav({ user }: { user: User | null }) {
  return (
    <header className="app-top-nav sticky z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
        <Link href={user ? '/home' : '/'} className="flex min-h-[44px] items-center"><Logo /></Link>
        <nav className="ml-auto flex items-center gap-2 text-sm font-bold sm:gap-4">
          <Link href="/sources" className="nav-directory-link"><span className="hidden sm:inline">Global Sources</span><span className="sm:hidden">Sources</span></Link>
          {user ? (
            <>
              <Link href="/my-server" className="hidden text-text-secondary hover:text-text-primary sm:inline">My Server</Link>
              <Link href="/friends" className="hidden text-text-secondary hover:text-text-primary sm:inline">Friends</Link>
              <Link href="/profile" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card" aria-label="Profile">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : <span className="text-xs font-black">{user.username.slice(0, 1).toUpperCase()}</span>}
              </Link>
            </>
          ) : (
            <a href="/api/auth/login" className="btn-primary public-discord-login"><span className="hidden sm:inline">Continue with Discord</span><span className="sm:hidden">Sign in</span></a>
          )}
        </nav>
      </div>
    </header>
  );
}
