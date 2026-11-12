/**
 * Reader appearance and behaviour, with every value clamped on the way in.
 *
 * Kept pure and separate from the component for two reasons. Settings are
 * restored from localStorage, which is user-writable and survives across
 * versions, so "a number" from storage can be a string, NaN, or a value that
 * was valid two releases ago. And a colour read from storage is interpolated
 * straight into a CSS custom property, so anything that is not a plain hex
 * literal has to be rejected here rather than trusted later.
 *
 * Everything below therefore validates by allow-list: a value is used only if
 * it is one of the choices or inside the range, and otherwise the default is
 * used. Nothing throws — a reader that refuses to open because a stored
 * preference went bad would be worse than one that opens with defaults.
 */

export const READING_MODES = ['strip', 'page', 'horizontal'] as const;
export type ReadingMode = (typeof READING_MODES)[number];

export const READING_DIRECTIONS = ['ltr', 'rtl'] as const;
export type ReadingDirection = (typeof READING_DIRECTIONS)[number];

export const READER_FITS = ['width', 'height', 'original'] as const;
export type ReaderFit = (typeof READER_FITS)[number];

export const READER_THEMES = ['dark', 'light', 'sepia', 'custom'] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

export interface ReaderSettings {
  mode: ReadingMode;
  direction: ReadingDirection;
  fit: ReaderFit;
  theme: ReaderTheme;
  /** Page column width in px. */
  width: number;
  zoom: number;
  /** Space between pages, px. */
  gap: number;
  /** Space around the column, px. */
  margin: number;
  brightness: number;
  contrast: number;
  /** Two pages side by side, in page mode only. */
  spread: boolean;
  /** First page on its own, the way a physical cover sits. */
  coverAlone: boolean;
  /** Pixels per second for hands-free scrolling. */
  autoScrollSpeed: number;
  /** Honour the reader's own preference for less animation. */
  reduceMotion: boolean;
  /** Background, used when theme is 'custom'. */
  background: string;
  accent: string;
}

export const READER_DEFAULTS: ReaderSettings = {
  mode: 'strip',
  direction: 'ltr',
  fit: 'width',
  theme: 'dark',
  width: 900,
  zoom: 100,
  gap: 12,
  margin: 20,
  brightness: 100,
  contrast: 100,
  spread: false,
  coverAlone: true,
  autoScrollSpeed: 55,
  reduceMotion: false,
  background: '#15161a',
  accent: '#e4575f',
};

/** Inclusive bounds. Chosen so every value stays usable, not merely finite. */
export const READER_RANGES = {
  width: [320, 2000],
  zoom: [40, 300],
  gap: [0, 100],
  margin: [0, 120],
  brightness: [40, 150],
  contrast: [50, 160],
  autoScrollSpeed: [10, 240],
} as const satisfies Record<string, readonly [number, number]>;

export type ReaderRangeKey = keyof typeof READER_RANGES;

/** Only a plain 3- or 6-digit hex literal. Anything else could carry CSS. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;

const CHOICES = {
  mode: READING_MODES,
  direction: READING_DIRECTIONS,
  fit: READER_FITS,
  theme: READER_THEMES,
} as const;

/**
 * Build a usable settings object from anything at all.
 *
 * `raw` is deliberately `unknown`: it comes from JSON.parse of localStorage.
 */
export function normalizeReaderSettings(raw: unknown): ReaderSettings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: ReaderSettings = { ...READER_DEFAULTS };

  for (const key of Object.keys(CHOICES) as Array<keyof typeof CHOICES>) {
    const value = input[key];
    // `includes` on a readonly tuple needs the widening, not a cast of value.
    if (typeof value === 'string' && (CHOICES[key] as readonly string[]).includes(value)) {
      Object.assign(out, { [key]: value });
    }
  }

  for (const key of Object.keys(READER_RANGES) as ReaderRangeKey[]) {
    const [lo, hi] = READER_RANGES[key];
    const given = input[key];

    /*
     * An empty string means "no value", not zero — which is what a cleared
     * number input sends. Number('') and Number(null) are both 0, so coercing
     * first would clamp to the minimum and silently shrink the reader to its
     * narrowest width instead of leaving the setting alone.
     */
    const usable =
      typeof given === 'number' ? given : typeof given === 'string' && given.trim() !== '' ? Number(given) : NaN;

    if (Number.isFinite(usable)) {
      out[key] = Math.min(hi, Math.max(lo, Math.round(usable)));
    }
  }

  for (const key of ['spread', 'coverAlone', 'reduceMotion'] as const) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }

  for (const key of ['background', 'accent'] as const) {
    const value = input[key];
    if (typeof value === 'string' && HEX.test(value)) out[key] = value;
  }

  return out;
}

/**
 * Which page indices appear together.
 *
 * In page mode with spreads on, pages pair up. `coverAlone` puts the first
 * page by itself so the rest pair the way a printed book does — without it,
 * every spread after page one is off by one and the art meets in the wrong
 * place. A final odd page is left alone rather than padded.
 */
export function spreadGroups(count: number, settings: ReaderSettings): number[][] {
  if (count <= 0) return [];
  if (settings.mode !== 'page' || !settings.spread) {
    return Array.from({ length: count }, (_, i) => [i]);
  }

  const groups: number[][] = [];
  let i = 0;
  if (settings.coverAlone) {
    groups.push([0]);
    i = 1;
  }
  while (i < count) {
    groups.push(i + 1 < count ? [i, i + 1] : [i]);
    i += 2;
  }
  return groups;
}

/** Which group a page belongs to, for keeping position across a mode change. */
export function groupOfPage(page: number, groups: number[][]): number {
  const found = groups.findIndex((group) => group.includes(page));
  return found === -1 ? 0 : found;
}
