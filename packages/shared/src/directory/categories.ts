/**
 * Source content categories.
 *
 * A source can belong to more than one category, so a category is a set of
 * boolean capabilities on the row rather than a single field. The reference
 * demonstration used one category per source; that was a drawing convenience,
 * not a data rule.
 */

export const SourceCategory = {
  ANIME: 'Anime',
  MOVIES: 'Movies',
  TV: 'TV',
  MANGA: 'Manga',
  MANHWA: 'Manhwa',
  COMICS: 'Comics',
} as const;
export type SourceCategory = (typeof SourceCategory)[keyof typeof SourceCategory];

export const SOURCE_CATEGORIES: readonly SourceCategory[] = [
  SourceCategory.ANIME,
  SourceCategory.MOVIES,
  SourceCategory.TV,
  SourceCategory.MANGA,
  SourceCategory.MANHWA,
  SourceCategory.COMICS,
];

/** The "All" pseudo-category used by the filter rail. */
export const ALL_CATEGORIES = 'All' as const;
export type CategoryFilter = SourceCategory | typeof ALL_CATEGORIES;

/** Database column backing each category, so callers never hard-code names. */
export const CATEGORY_COLUMN: Record<SourceCategory, string> = {
  [SourceCategory.ANIME]: 'supportsAnime',
  [SourceCategory.MOVIES]: 'supportsMovies',
  [SourceCategory.TV]: 'supportsTv',
  [SourceCategory.MANGA]: 'supportsManga',
  [SourceCategory.MANHWA]: 'supportsManhwa',
  [SourceCategory.COMICS]: 'supportsComics',
};

/** The capability flags of one source row, in category terms. */
export interface CategoryFlags {
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  supportsManga: boolean;
  supportsManhwa: boolean;
  supportsComics: boolean;
}

export function categoriesFromFlags(flags: Partial<CategoryFlags>): SourceCategory[] {
  const result: SourceCategory[] = [];
  if (flags.supportsAnime) result.push(SourceCategory.ANIME);
  if (flags.supportsMovies) result.push(SourceCategory.MOVIES);
  if (flags.supportsTv) result.push(SourceCategory.TV);
  if (flags.supportsManga) result.push(SourceCategory.MANGA);
  if (flags.supportsManhwa) result.push(SourceCategory.MANHWA);
  if (flags.supportsComics) result.push(SourceCategory.COMICS);
  return result;
}

export function flagsFromCategories(categories: readonly SourceCategory[]): CategoryFlags {
  const set = new Set(categories);
  return {
    supportsAnime: set.has(SourceCategory.ANIME),
    supportsMovies: set.has(SourceCategory.MOVIES),
    supportsTv: set.has(SourceCategory.TV),
    supportsManga: set.has(SourceCategory.MANGA),
    supportsManhwa: set.has(SourceCategory.MANHWA),
    supportsComics: set.has(SourceCategory.COMICS),
  };
}

export function isSourceCategory(value: unknown): value is SourceCategory {
  return typeof value === 'string' && SOURCE_CATEGORIES.includes(value as SourceCategory);
}

/**
 * Common misspellings and alternate spellings, normalised so a search for
 * "manwha" finds Manhwa sources. Deliberately small: this is a spelling aid,
 * not a synonym engine.
 */
const SEARCH_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/manwha/gu, 'manhwa'],
  [/manhua/gu, 'manhwa'],
  [/webtoons?/gu, 'manhwa'],
  [/anmie|animé/gu, 'anime'],
  [/comic books?|graphic novels?/gu, 'comics'],
  [/television|tv shows?|series/gu, 'tv'],
  [/films?|cinema/gu, 'movies'],
];

/**
 * Lowercases, collapses whitespace and applies the spelling aliases.
 * Used on both sides of a comparison so the two always agree.
 */
export function normalizeSearchText(input: string): string {
  let text = input.toLowerCase().normalize('NFKD').replace(/\s+/gu, ' ').trim();
  for (const [pattern, replacement] of SEARCH_ALIASES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/** Parses a category from a URL query value, tolerating case and misspellings. */
export function parseCategoryFilter(value: string | null | undefined): CategoryFilter {
  if (!value) return ALL_CATEGORIES;
  const normalized = normalizeSearchText(value);
  if (normalized === 'all' || normalized === '') return ALL_CATEGORIES;
  const match = SOURCE_CATEGORIES.find(
    (category) => normalizeSearchText(category) === normalized,
  );
  return match ?? ALL_CATEGORIES;
}
