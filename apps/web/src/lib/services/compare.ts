import 'server-only';
import { calculateTasteMatch, type RatedEntry, type TasteMatch } from '@couchlist/shared';
import type { User } from '@couchlist/db';
import { repos } from '../db';

/**
 * Friend comparison.
 *
 * The formula lives in @couchlist/shared and is pure; this only gathers the
 * data and applies each person's rating-privacy setting first, so a hidden
 * rating cannot leak through a comparison.
 */
export interface ComparisonView {
  viewer: PublicUser;
  target: PublicUser;
  result: TasteMatch;
}

export interface PublicUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export async function compareUsers(viewer: User, target: User): Promise<ComparisonView> {
  const { entries } = repos();

  const [viewerRows, targetRows] = await Promise.all([
    entries.listForUser(viewer.id),
    entries.listForUser(target.id),
  ]);

  const toRated = (rows: typeof viewerRows, owner: User, isSelf: boolean): RatedEntry[] =>
    rows.map((row) => ({
      provider: row.provider,
      providerMediaId: row.providerMediaId,
      mediaType: row.mediaType,
      title: row.title,
      rating: isSelf || owner.showRatings ? row.rating : null,
      completed: row.status === 'COMPLETED',
    }));

  return {
    viewer: publicUser(viewer),
    target: publicUser(target),
    result: calculateTasteMatch(
      toRated(viewerRows, viewer, true),
      toRated(targetRows, target, false),
    ),
  };
}

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName,
    avatarUrl: user.avatarUrl,
  };
}
