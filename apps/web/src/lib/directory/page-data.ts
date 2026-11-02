import 'server-only';
import {
  SourceSort,
  parseCategoryFilter,
  parseSourceSort,
  type CategoryFilter,
} from '@couchlist/shared';
import type { User } from '@couchlist/db';
import type { DirectoryPage } from '@couchlist/db';
import { repos } from '../db';

/**
 * Shared loading for the directory views.
 *
 * Discover and Saved differ by one filter, so they read through here rather
 * than duplicating the query, the vote lookup and the bookmark lookup.
 */

export const PAGE_SIZE = 25;

export interface DirectoryViewParams {
  category?: string;
  q?: string;
  sort?: string;
  page?: string;
}

export interface DirectoryView {
  page: DirectoryPage;
  category: CategoryFilter;
  sort: SourceSort;
  search: string;
  pageNumber: number;
  /** This viewer's votes, by source id. Empty when signed out. */
  votes: Map<string, 'LIKE' | 'DISLIKE'>;
  savedIds: Set<string>;
  resultLabel: string;
}

export async function loadDirectoryView(
  params: DirectoryViewParams,
  user: User | null,
  options: { savedOnly?: boolean } = {},
): Promise<DirectoryView> {
  const category = parseCategoryFilter(params.category);
  const sort = parseSourceSort(params.sort);
  const search = (params.q ?? '').slice(0, 120);
  const pageNumber = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const { sources } = repos();
  const page = await sources.list({
    category,
    search: search || undefined,
    sort,
    limit: PAGE_SIZE,
    offset: (pageNumber - 1) * PAGE_SIZE,
    savedByUserId: options.savedOnly ? (user?.id ?? '__none__') : undefined,
  });

  const ids = page.sources.map((source) => source.id);

  // One query each, not one per row.
  const [votes, savedIds] = user
    ? await Promise.all([sources.votesByUser(user.id, ids), sources.bookmarkedIds(user.id, ids)])
    : [new Map<string, 'LIKE' | 'DISLIKE'>(), new Set<string>()];

  return {
    page,
    category,
    sort,
    search,
    pageNumber,
    votes,
    savedIds,
    resultLabel: `${page.total} ${page.total === 1 ? 'source' : 'sources'}`,
  };
}

/** The header's Saved badge. Zero for a signed-out visitor. */
export async function savedCountFor(user: User | null): Promise<number> {
  if (!user) return 0;
  return repos().sources.bookmarkCount(user.id);
}
