'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
/**
 * What this control is allowed to know about the viewer.
 *
 * Deliberately narrow. This is a client component, so every field here is
 * serialised into the page that reaches the browser. Handing it the whole
 * account row would publish the viewer's email address and password hash in
 * the HTML of every signed-in page.
 */
export interface ViewerSummary {
  displayName: string;
  id: string;
  avatarUrl: string | null;
  hasAvatar: boolean;
  emailVerified: boolean;
  isAdmin: boolean;
}

/**
 * The account control.
 *
 * Signed out: a plain sign-in link. Signed in: the profile picture opening a
 * compact menu. Everything that is not Discover, Guides or Saved lives here.
 *
 * The menu is a <details>-free implementation because it also needs to close
 * on outside click and Escape, which native disclosure does not give.
 */
export function AccountMenu({ viewer }: { viewer: ViewerSummary | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!viewer) {
    return (
      <Link
        href="/login"
        className="cl-touch inline-flex items-center rounded-pill bg-selected px-3.5 py-2 text-[13px] font-semibold text-selected-fg no-underline shadow-primary hover:bg-selected-hover"
      >
        Sign in
      </Link>
    );
  }

  const name = viewer.displayName;
  const initial = (name[0] ?? '?').toUpperCase();

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="cl-touch grid h-11 w-11 place-items-center rounded-full border border-[#a44959] bg-accent-soft text-sm font-semibold text-[#ffc1c8] sm:h-8 sm:w-8"
      >
        {viewer.hasAvatar ? (
          /* Uploaded here, so it is served from this origin. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/users/${viewer.id}/avatar`}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : viewer.avatarUrl ? (
          /* A legacy remote picture. No referrer: the host should not learn
             which page the reader is on. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={viewer.avatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initial
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-card border border-line bg-surface py-1.5 shadow-lg"
        >
          <p className="m-0 truncate px-3.5 py-2 text-sm text-muted">
            Signed in as <span className="text-text">{name}</span>
          </p>
          {!viewer.emailVerified ? (
            <Link href="/verify-email" role="menuitem" className={menuItemClass}>
              Verify your email
            </Link>
          ) : null}
          <div className="my-1 border-t border-line" />
          <Link href="/submit" role="menuitem" className={menuItemClass}>
            Suggest a source
          </Link>
          <Link href="/submissions" role="menuitem" className={menuItemClass}>
            My submissions
          </Link>
          <Link href="/collections" role="menuitem" className={menuItemClass}>
            My collections
          </Link>
          <Link href="/whats-new" role="menuitem" className={menuItemClass}>
            What&apos;s new
          </Link>
          <div className="my-1 border-t border-line" />
          <Link href="/account" role="menuitem" className={menuItemClass}>
            Account settings
          </Link>
          {viewer.isAdmin ? (
            <Link href="/admin" role="menuitem" className={menuItemClass}>
              Admin
            </Link>
          ) : null}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.push('/');
                router.refresh();
              } finally {
                setSigningOut(false);
              }
            }}
            className={`${menuItemClass} w-full text-left disabled:opacity-60`}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuItemClass =
  'block px-3.5 py-2.5 text-[13px] text-text no-underline hover:bg-hover';
