import { describe, expect, it } from 'vitest';
import {
  READER_DEFAULTS,
  READER_RANGES,
  groupOfPage,
  normalizeReaderSettings,
  spreadGroups,
  type ReaderSettings,
} from '@couchlist/shared';

/**
 * Settings come back from localStorage, which anyone can edit and which
 * outlives the version that wrote it. So the question each test asks is
 * "what happens when this value is wrong?", not "does the happy path work".
 */
describe('reader settings', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const bad of [null, undefined, 'nope', 42, [], true]) {
      expect(normalizeReaderSettings(bad)).toEqual(READER_DEFAULTS);
    }
  });

  it('ignores choices that are not on the list', () => {
    const s = normalizeReaderSettings({
      mode: 'zoomies',
      direction: 'sideways',
      fit: 'squish',
      theme: 'neon',
    });
    expect(s.mode).toBe(READER_DEFAULTS.mode);
    expect(s.direction).toBe(READER_DEFAULTS.direction);
    expect(s.fit).toBe(READER_DEFAULTS.fit);
    expect(s.theme).toBe(READER_DEFAULTS.theme);
  });

  it('keeps choices that are on the list', () => {
    const s = normalizeReaderSettings({
      mode: 'horizontal',
      direction: 'rtl',
      fit: 'height',
      theme: 'sepia',
    });
    expect(s).toMatchObject({
      mode: 'horizontal',
      direction: 'rtl',
      fit: 'height',
      theme: 'sepia',
    });
  });

  it('clamps every number to its range instead of rejecting it', () => {
    const huge = normalizeReaderSettings({
      width: 999999,
      zoom: 10000,
      gap: 5000,
      margin: 5000,
      brightness: 9999,
      contrast: 9999,
      autoScrollSpeed: 9999,
    });
    const tiny = normalizeReaderSettings({
      width: -50,
      zoom: 0,
      gap: -9,
      margin: -9,
      brightness: 0,
      contrast: 0,
      autoScrollSpeed: 0,
    });

    for (const key of Object.keys(READER_RANGES) as Array<keyof typeof READER_RANGES>) {
      const [lo, hi] = READER_RANGES[key];
      expect(huge[key], key).toBe(hi);
      expect(tiny[key], key).toBe(lo);
    }
  });

  it('falls back when a number is NaN, empty or missing', () => {
    const s = normalizeReaderSettings({ zoom: 'abc', width: '', gap: null, margin: undefined });
    expect(s.zoom).toBe(READER_DEFAULTS.zoom);
    expect(s.width).toBe(READER_DEFAULTS.width);
    // Number(null) is 0, which would silently clamp to the minimum.
    expect(s.gap).toBe(READER_DEFAULTS.gap);
    expect(s.margin).toBe(READER_DEFAULTS.margin);
  });

  it('accepts a numeric string, since a range input gives one', () => {
    expect(normalizeReaderSettings({ zoom: '125' }).zoom).toBe(125);
  });

  it('only takes a real boolean, not a truthy value', () => {
    const s = normalizeReaderSettings({ spread: 'yes', coverAlone: 0, reduceMotion: 1 });
    expect(s.spread).toBe(READER_DEFAULTS.spread);
    expect(s.coverAlone).toBe(READER_DEFAULTS.coverAlone);
    expect(s.reduceMotion).toBe(READER_DEFAULTS.reduceMotion);
    expect(normalizeReaderSettings({ spread: true }).spread).toBe(true);
  });

  it('refuses a colour that is not a plain hex literal', () => {
    // These land in a CSS custom property, so anything carrying syntax is out.
    for (const bad of ['url(http://x/y)', 'red; background:url(x)', 'rgb(1,2,3)', '#12', 'javascript:1']) {
      expect(normalizeReaderSettings({ accent: bad }).accent, bad).toBe(READER_DEFAULTS.accent);
    }
    expect(normalizeReaderSettings({ accent: '#abc' }).accent).toBe('#abc');
    expect(normalizeReaderSettings({ accent: '#A1B2C3' }).accent).toBe('#A1B2C3');
  });
});

describe('spreads', () => {
  const base = (over: Partial<ReaderSettings> = {}): ReaderSettings => ({
    ...READER_DEFAULTS,
    mode: 'page',
    spread: true,
    ...over,
  });

  it('gives one page per group when spreads are off', () => {
    expect(spreadGroups(3, base({ spread: false }))).toEqual([[0], [1], [2]]);
  });

  it('never spreads outside page mode, however the toggle is set', () => {
    expect(spreadGroups(4, base({ mode: 'strip' }))).toEqual([[0], [1], [2], [3]]);
    expect(spreadGroups(4, base({ mode: 'horizontal' }))).toEqual([[0], [1], [2], [3]]);
  });

  it('puts the cover alone and pairs the rest, like a printed book', () => {
    expect(spreadGroups(6, base())).toEqual([[0], [1, 2], [3, 4], [5]]);
  });

  it('pairs from the first page when the cover is not held back', () => {
    expect(spreadGroups(6, base({ coverAlone: false }))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('leaves a final odd page alone rather than padding it', () => {
    expect(spreadGroups(5, base({ coverAlone: false }))).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('handles an empty or single-page chapter', () => {
    expect(spreadGroups(0, base())).toEqual([]);
    expect(spreadGroups(1, base())).toEqual([[0]]);
  });

  it('finds the group holding a page, so position survives a mode change', () => {
    const groups = spreadGroups(6, base());
    expect(groupOfPage(4, groups)).toBe(2);
    expect(groupOfPage(0, groups)).toBe(0);
    // A page that is out of range must not return -1 and scroll nowhere.
    expect(groupOfPage(99, groups)).toBe(0);
  });
});
