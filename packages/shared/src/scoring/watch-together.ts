import { mediaKey, type MediaIdentity, type MediaType } from '../media/identity.js';

/**
 * Watch Together.
 *
 * Finds titles a group might watch, using only their existing lists:
 *
 *   +3  for each selected person who has it on PLAN_TO_WATCH
 *   +1  for each selected person who has never added it
 *
 * A title anyone has COMPLETED is excluded unless rewatching is allowed. The
 * candidate pool is the union of everyone's PLAN_TO_WATCH, so we only ever
 * suggest something at least one person already wanted to see.
 */

export const PLAN_TO_WATCH_POINTS = 3;
export const UNWATCHED_POINTS = 1;

export type ListStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH';

export interface GroupEntry extends MediaIdentity {
  userId: string;
  title: string;
  posterUrl: string | null;
  status: ListStatus;
}

export interface WatchTogetherOptions {
  /** Users taking part. Scores are relative to this list, not the whole server. */
  userIds: string[];
  mediaTypes?: MediaType[];
  allowRewatch?: boolean;
  limit?: number;
}

export interface WatchTogetherCandidate {
  identity: MediaIdentity;
  title: string;
  posterUrl: string | null;
  score: number;
  planToWatchCount: number;
  unwatchedCount: number;
  /** Users who have already completed it. Non-empty only with allowRewatch. */
  completedBy: string[];
}

export function findWatchTogether(
  entries: GroupEntry[],
  options: WatchTogetherOptions,
): WatchTogetherCandidate[] {
  const { userIds, mediaTypes, allowRewatch = false, limit = 10 } = options;
  const participants = new Set(userIds);
  if (participants.size === 0) return [];

  const relevant = entries.filter(
    (entry) =>
      participants.has(entry.userId) &&
      (!mediaTypes || mediaTypes.length === 0 || mediaTypes.includes(entry.mediaType)),
  );

  // Group every participant's entries by title.
  const byTitle = new Map<string, GroupEntry[]>();
  for (const entry of relevant) {
    const key = mediaKey(entry);
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(entry);
    else byTitle.set(key, [entry]);
  }

  const candidates: WatchTogetherCandidate[] = [];

  for (const [key, group] of byTitle) {
    const statusByUser = new Map<string, ListStatus>();
    for (const entry of group) statusByUser.set(entry.userId, entry.status);

    const planToWatch = [...statusByUser.values()].filter(
      (status) => status === 'PLAN_TO_WATCH',
    ).length;

    // Only suggest things at least one participant already wants to watch.
    if (planToWatch === 0) continue;

    const completedBy = [...statusByUser.entries()]
      .filter(([, status]) => status === 'COMPLETED')
      .map(([userId]) => userId)
      .sort();

    if (completedBy.length > 0 && !allowRewatch) continue;

    const unwatched = userIds.filter((userId) => !statusByUser.has(userId)).length;
    const first = group[0]!;

    candidates.push({
      identity: {
        provider: first.provider,
        providerMediaId: first.providerMediaId,
        mediaType: first.mediaType,
      },
      title: first.title,
      posterUrl: first.posterUrl,
      score: planToWatch * PLAN_TO_WATCH_POINTS + unwatched * UNWATCHED_POINTS,
      planToWatchCount: planToWatch,
      unwatchedCount: unwatched,
      completedBy,
    });

    void key;
  }

  // Ties broken by title so results are stable between identical requests.
  return candidates
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);
}
