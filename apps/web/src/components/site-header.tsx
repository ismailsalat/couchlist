import Link from 'next/link';
import type { User } from '@couchlist/db';
import { Brand } from './popcorn-mark';
import { AccountMenu, type ViewerSummary } from './account-menu';

/**
 * The application header.
 *
 * Primary navigation is Discover, Guides and Saved — and nothing else. My
 * submissions, collections, settings and admin live in the account menu, so
 * the header does not grow a new item every time a feature is added.
 *
 * This is a server component and it is the boundary where the account row
 * stops: `viewerSummary` reduces it to the four fields the client menu needs,
 * so no email address or password hash is serialised into the page.
 */
export function SiteHeader({
  user,
  savedCount,
  active,
}: {
  user: User | null;
  savedCount: number;
  active: 'discover' | 'guides' | 'saved' | null;
}) {
  return (
    <header className="flex min-h-[76px] flex-wrap items-center gap-x-5 gap-y-2 rounded-t-[19px] border-b border-line bg-surface px-4 py-3 sm:gap-x-[22px] sm:px-6">
      <Link href="/" className="order-0 rounded-lg text-text no-underline">
        <Brand />
      </Link>

      <nav
        aria-label="Main navigation"
        className="order-2 mt-0.5 flex w-full gap-1.5 sm:order-1 sm:mt-0 sm:w-auto"
      >
        <NavLink href="/" label="Discover" current={active === 'discover'} />
        {/* The hub holds tools as well as guides, and the tools come first on
            it. The label says so, shortening to "Tools" where the bar is
            tight rather than truncating mid-word. */}
        <NavLink
          href="/guides"
          label="Tools"
          labelWide="Tools & Guides"
          current={active === 'guides'}
        />
        <NavLink
          href="/saved"
          label="Saved"
          current={active === 'saved'}
          badge={user ? savedCount : undefined}
        />
      </nav>

      <div className="order-1 ml-auto sm:order-2">
        <AccountMenu viewer={viewerSummary(user)} />
      </div>

    </header>
  );
}

/** Everything the account menu may see, and nothing else. */
function viewerSummary(user: User | null): ViewerSummary | null {
  if (!user) return null;
  return {
    displayName: user.displayName?.trim() || user.username,
    avatarUrl: user.avatarUrl,
    id: user.id,
    hasAvatar: Boolean(user.avatarMime),
    emailVerified: Boolean(user.emailVerifiedAt),
    isAdmin: user.isAdmin,
  };
}

function NavLink({
  href,
  label,
  labelWide,
  current,
  badge,
}: {
  labelWide?: string;
  href: string;
  label: string;
  current: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      /*
       * The visible label shortens on a narrow screen, but the accessible
       * name must not: a screen-reader user would otherwise hear a different
       * name for the same link depending on the window width.
       *
       * The horizontal padding is narrower below `sm`, and `min-w-0` lets the
       * pills shrink. Tailwind's `px-4` is rem-based, so somebody reading at
       * 150% gets 24px of padding a side while the 13px label stays 13px:
       * three pills then need more room than the row has, `min-width: auto`
       * stops `flex-1` shrinking them, and the last one hangs off the edge of
       * a 320px phone.
       */
      aria-label={labelWide ?? undefined}
      className={`cl-touch cl-pill flex min-w-0 flex-1 items-center justify-center gap-1 rounded-pill px-2.5 py-2.5 text-[13px] font-bold no-underline sm:flex-initial sm:px-4 ${
        current
          ? 'bg-selected text-selected-fg shadow-pop-red hover:bg-selected-hover'
          : 'text-muted hover:bg-hover hover:text-text'
      }`}
    >
      {labelWide ? (
        <>
          <span className="md:hidden">{label}</span>
          <span className="hidden md:inline">{labelWide}</span>
        </>
      ) : (
        label
      )}
      {badge !== undefined ? (
        <span className="ml-[3px] rounded-pill bg-active px-[5px] py-px text-xs text-text">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
