import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@couchlist/db';
import { optionalUser } from '../api/guards';

/**
 * Page-level sign-in requirement.
 *
 * Pages redirect; API routes throw a 401. Both end up enforced on the server,
 * so a page is never rendered to someone who should not see it.
 */
export async function requireUserOrLogin(next: string): Promise<User> {
  const user = await optionalUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Signed in *and* verified. Used by pages that let people contribute. */
export async function requireVerifiedOrPrompt(next: string): Promise<User> {
  const user = await requireUserOrLogin(next);
  if (!user.emailVerifiedAt) redirect('/verify-email');
  return user;
}

/** Administrator pages. A non-admin gets a 404, not a hint that this exists. */
export async function requireAdminPage(): Promise<User> {
  const user = await optionalUser();
  if (!user) redirect('/login?next=%2Fadmin');
  if (!user.isAdmin) {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return user;
}
