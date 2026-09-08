import 'server-only';
import type { MediaEntry, User } from '@couchlist/db';
import { repos } from '../db';

/**
 * Profile assembly.
 *
 * Privacy is applied here rather than in the UI: ratings and progress are
 * stripped from the data itself when the owner has hidden them, so they never
 * reach the browser.
 */
export interface ProfileEntry {
  id: string;
  provider: 'ANILIST' | 'JIKAN' | 'TMDB';
  providerMediaId: string;
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  status: 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH';
  title: string;
  posterUrl: string | null;
  rating: number | null;
  progress: number | null;
  updatedAt: string;
}

export interface ProfileView {
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
  };
  counts: { WATCHING: number; COMPLETED: number; PLAN_TO_WATCH: number };
  entries: ProfileEntry[];
  isSelf: boolean;
}

export async function buildProfile(target: User, isSelf: boolean): Promise<ProfileView> {
  const { entries } = repos();
  const [rows, counts] = await Promise.all([
    entries.listForUser(target.id),
    entries.countsByStatus(target.id),
  ]);

  return {
    user: {
      id: target.id,
      username: target.username,
      globalName: target.globalName,
      avatarUrl: target.avatarUrl,
    },
    counts,
    entries: rows.map((row) => toProfileEntry(row, target, isSelf)),
    isSelf,
  };
}

export function toProfileEntry(entry: MediaEntry, owner: User, isSelf: boolean): ProfileEntry {
  return {
    id: entry.id,
    provider: entry.provider,
    providerMediaId: entry.providerMediaId,
    mediaType: entry.mediaType,
    status: entry.status,
    title: entry.title,
    posterUrl: entry.posterUrl,
    // Hidden values are removed from the payload, not just from the markup.
    rating: isSelf || owner.showRatings ? entry.rating : null,
    progress: isSelf || owner.showProgress ? entry.progress : null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}
