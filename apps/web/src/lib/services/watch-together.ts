import 'server-only';
import {
  findWatchTogether,
  type GroupEntry,
  type MediaType,
  type WatchTogetherCandidate,
} from '@couchlist/shared';
import { repos } from '../db';
import { reconcileAnimeEntriesForUsers } from './media';

/**
 * Watch Together.
 *
 * Callers must have already established that every participant shares the
 * guild - this only assembles entries and runs the deterministic scorer.
 */
export async function suggestForGroup(options: {
  userIds: string[];
  mediaType: 'anime' | 'movie' | 'tv' | 'anything';
  allowRewatch: boolean;
  limit?: number;
}): Promise<WatchTogetherCandidate[]> {
  await reconcileAnimeEntriesForUsers(options.userIds, 16);
  const rows = await repos().entries.listForUsers(options.userIds);

  const entries: GroupEntry[] = rows.map((row) => ({
    userId: row.userId,
    provider: row.provider,
    providerMediaId: row.providerMediaId,
    mediaType: row.mediaType,
    canonicalMediaKey: row.canonicalMediaKey,
    title: row.title,
    posterUrl: row.posterUrl,
    status: row.status,
  }));

  const mediaTypes: MediaType[] | undefined =
    options.mediaType === 'anything'
      ? undefined
      : options.mediaType === 'anime'
        ? ['ANIME']
        : options.mediaType === 'movie'
          ? ['MOVIE']
          : ['TV'];

  return findWatchTogether(entries, {
    userIds: options.userIds,
    mediaTypes,
    allowRewatch: options.allowRewatch,
    limit: options.limit ?? 5,
  });
}
