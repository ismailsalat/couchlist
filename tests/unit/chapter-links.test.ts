import { describe, expect, it } from 'vitest';
import {
  allowedChapterLink,
  chapterNumber,
  labelNumber,
  neighbours,
  orderChapters,
  sameFamily,
  seriesChapters,
} from '@couchlist/shared';

/**
 * The failure this guards against is specific: confidently sending a reader
 * to the wrong comic. Every test below is a way that happens.
 */
describe('chapter numbers', () => {
  it('reads a marked number out of the path', () => {
    expect(chapterNumber('https://site.test/manga/title/c50')?.value).toBe(50);
    expect(chapterNumber('https://site.test/manga/title/chapter-65')?.value).toBe(65);
    expect(chapterNumber('https://site.test/manga/title/chapter/346')?.value).toBe(346);
    expect(chapterNumber('https://site.test/read/title/ep-7.5')?.value).toBe(7.5);
  });

  it('keeps leading zeroes as written', () => {
    expect(chapterNumber('https://site.test/m/t/chapter-050')?.raw).toBe('050');
  });

  it('refuses sites whose chapter URLs are database IDs', () => {
    // 9555322 is a row ID. Treating it as a chapter number and adding one
    // lands on somebody else's comic.
    expect(chapterNumber('https://mangafire.to/title/zk6q3-demon/chapter/9555322')).toBeNull();
    expect(chapterNumber('https://weebcentral.com/chapters/01M1AVS7MBY4XYA13QEZYPNZ8A')).toBeNull();
  });

  it('does not treat pages, volumes or ids as chapters', () => {
    expect(chapterNumber('https://site.test/manga/title/page/4')).toBeNull();
    expect(chapterNumber('https://site.test/manga/title/vol/4')).toBeNull();
    expect(chapterNumber('https://site.test/view?id=5120')).toBeNull();
  });

  it('reads a chapter number from the query and keeps the series id', () => {
    const found = chapterNumber('https://site.test/read.php?series=88&chapter=50');
    expect(found?.value).toBe(50);
    // The series id stays in the family, so series 88 and 99 never mix.
    expect(found?.family).not.toBe(
      chapterNumber('https://site.test/read.php?series=99&chapter=50')?.family,
    );
  });
});

describe('families', () => {
  it('treats chapters of one series as siblings', () => {
    expect(sameFamily('https://site.test/m/title/c50', 'https://site.test/m/title/c51')).toBe(true);
  });

  it('ignores the chapter title suffix, which changes between chapters', () => {
    expect(
      sameFamily('https://site.test/m/t/chapter-50-the-return', 'https://site.test/m/t/chapter-51-the-fall'),
    ).toBe(true);
  });

  it('keeps two different series apart', () => {
    expect(sameFamily('https://site.test/m/alpha/c50', 'https://site.test/m/beta/c51')).toBe(false);
  });
});

describe('accepting a link', () => {
  const here = 'https://site.test/m/title/chapter-50';

  it('accepts the real next chapter', () => {
    expect(allowedChapterLink(here, '/m/title/chapter-51')).toBe('https://site.test/m/title/chapter-51');
  });

  it('refuses a recommendation for another series', () => {
    // The exact bug the family check exists for: a sidebar card.
    expect(allowedChapterLink(here, '/m/other-comic/chapter-1')).toBeNull();
  });

  it('refuses another site, the current page, and non-http schemes', () => {
    expect(allowedChapterLink(here, 'https://elsewhere.test/m/title/chapter-51')).toBeNull();
    expect(allowedChapterLink(here, '/m/title/chapter-50')).toBeNull();
    expect(allowedChapterLink(here, 'javascript:alert(1)')).toBeNull();
    expect(allowedChapterLink(here, '#top')).toBeNull();
    expect(allowedChapterLink(here, 'data:text/html,hi')).toBeNull();
  });

  it('refuses a private address even on the same host name', () => {
    expect(allowedChapterLink('http://localhost/m/t/c1', 'http://localhost/m/t/c2')).toBeNull();
  });
});

describe('ordering a collected list', () => {
  it('sorts by number and drops duplicates', () => {
    const list = orderChapters([
      { url: 'https://site.test/m/t/c3', label: 'Chapter 3' },
      { url: 'https://site.test/m/t/c1', label: 'Chapter 1' },
      { url: 'https://site.test/m/t/c3', label: 'Chapter 3' },
      { url: 'https://site.test/m/t/c2', label: 'Chapter 2' },
    ]);
    expect(list.map((entry) => entry.number)).toEqual([1, 2, 3]);
  });

  it('prefers the human label over the URL for numbering', () => {
    // Opaque URLs with readable labels are the WeebCentral case.
    const list = orderChapters([
      { url: 'https://weebcentral.com/chapters/BB', label: 'Chapter 2' },
      { url: 'https://weebcentral.com/chapters/AA', label: 'Chapter 1' },
    ]);
    expect(list[0]?.label).toBe('Chapter 1');
    expect(list[1]?.number).toBe(2);
  });

  it('keeps source order when some chapters are unnumbered', () => {
    // Sorting a partial list throws specials to the front and reads as loss.
    const list = orderChapters([
      { url: 'https://site.test/m/t/c2', label: 'Chapter 2' },
      { url: 'https://site.test/m/t/extra', label: 'Side story' },
      { url: 'https://site.test/m/t/c1', label: 'Chapter 1' },
    ]);
    expect(list.map((entry) => entry.label)).toEqual(['Chapter 2', 'Side story', 'Chapter 1']);
  });

  it('reads a decimal chapter from its label', () => {
    expect(labelNumber('Chapter 65.5')).toBe(65.5);
    expect(labelNumber('Ch. 7')).toBe(7);
    expect(labelNumber('Side story')).toBeNull();
  });
});

describe('previous and next', () => {
  const list = orderChapters([
    { url: 'https://site.test/m/t/c1', label: 'Chapter 1' },
    { url: 'https://site.test/m/t/c2', label: 'Chapter 2' },
    { url: 'https://site.test/m/t/c3', label: 'Chapter 3' },
  ]);

  it("uses the source's own link before anything else", () => {
    const result = neighbours('https://site.test/m/t/c2', list, {
      next: 'https://site.test/m/t/c2.5',
    });
    expect(result.next).toEqual({ kind: 'source-link', url: 'https://site.test/m/t/c2.5' });
  });

  it('falls back to the chapter list', () => {
    const result = neighbours('https://site.test/m/t/c2', list);
    expect(result.next).toEqual({ kind: 'chapter-list', url: 'https://site.test/m/t/c3' });
    expect(result.previous).toEqual({ kind: 'chapter-list', url: 'https://site.test/m/t/c1' });
  });

  it('says unknown at the end rather than inventing a URL', () => {
    const result = neighbours('https://site.test/m/t/c3', list);
    // Running out of known links is not the source saying the story ended.
    expect(result.next).toEqual({ kind: 'unknown', url: null });
  });

  it('says unknown when the chapter is not in the list at all', () => {
    const result = neighbours('https://site.test/m/t/c99', list);
    expect(result.next.kind).toBe('unknown');
    expect(result.previous.kind).toBe('unknown');
  });

  it('ignores a published link that points at another series', () => {
    const result = neighbours('https://site.test/m/t/c2', list, {
      next: 'https://site.test/m/other/c1',
    });
    // Rejected by family, then the list supplies the real answer.
    expect(result.next).toEqual({ kind: 'chapter-list', url: 'https://site.test/m/t/c3' });
  });
});

describe('filtering a real chapter page', () => {
  /*
   * Taken from what the extension actually collected on a live site: the
   * chapter list came back offering "Next", "Edward" and "2 years ago" as
   * chapters, because every anchor on the page had been swept up.
   */
  const current = 'https://site.test/manga/title/chapter-1';
  const scraped = [
    { url: 'https://site.test/manga/title/chapter-1', label: 'Chapter 1' },
    { url: 'https://site.test/manga/title/chapter-2', label: 'Chapter 2' },
    { url: 'https://site.test/manga/title/chapter-3', label: 'Chapter 3' },
    { url: 'https://site.test/users/edward', label: 'Edward' },
    { url: 'https://site.test/comments/9912', label: '2 years ago' },
    { url: 'https://site.test/manga/title/chapter-2', label: 'Next' },
    { url: 'https://site.test/login', label: 'Sign in' },
    { url: 'https://site.test/genre/action', label: 'Action' },
    { url: 'https://other.test/manga/title/chapter-9', label: 'Chapter 9' },
  ];

  it('keeps the chapters and drops the furniture', () => {
    const list = seriesChapters(current, scraped);
    const labels = list.map((entry) => entry.label);

    expect(labels).toContain('Chapter 1');
    expect(labels).toContain('Chapter 2');
    expect(labels).toContain('Chapter 3');

    for (const junk of ['Edward', '2 years ago', 'Sign in', 'Action']) {
      expect(labels, junk).not.toContain(junk);
    }
    // Another site's chapter is not this series.
    expect(list.some((entry) => entry.url.includes('other.test'))).toBe(false);
  });

  it('keeps opaque chapter ids that sit in the same place', () => {
    // WeebCentral: no number anywhere in the URL to compare.
    const list = seriesChapters('https://weebcentral.com/chapters/AAA', [
      { url: 'https://weebcentral.com/chapters/BBB', label: 'Chapter 2' },
      { url: 'https://weebcentral.com/chapters/CCC', label: 'Chapter 3' },
      { url: 'https://weebcentral.com/series/ZZZ', label: 'All chapters' },
      { url: 'https://weebcentral.com/users/edward', label: 'Edward' },
    ]);

    expect(list.map((entry) => entry.label)).toEqual(['Chapter 2', 'Chapter 3']);
  });

  it('does not keep a sibling page that is not a chapter', () => {
    const list = seriesChapters(current, [
      { url: 'https://site.test/manga/title/popular', label: 'Most popular' },
    ]);
    expect(list).toHaveLength(0);
  });
});

describe('the junk that actually reached a reader', () => {
  /*
   * Straight from a screenshot of the live site: the chapter list offered
   * "Prev", "Next" and four copies of "2 years ago". The first filter let
   * the timestamps through because it accepted any label containing a digit.
   */
  const current = 'https://site.test/manga/title/chapter-2';

  it('drops comment timestamps', () => {
    const list = seriesChapters(current, [
      { url: 'https://site.test/manga/title/chapter-3', label: 'Chapter 3' },
      { url: 'https://site.test/manga/title/chapter-2/c/1', label: '2 years ago' },
      { url: 'https://site.test/manga/title/chapter-2/c/2', label: '3 hours ago' },
      { url: 'https://site.test/manga/title/chapter-2/c/3', label: '11 months ago' },
    ]);
    expect(list.map((entry) => entry.label)).toEqual(['Chapter 3']);
  });

  it('prefers a chapter name over Prev/Next for the same link', () => {
    const list = seriesChapters(current, [
      { url: 'https://site.test/manga/title/chapter-3', label: 'Next' },
      { url: 'https://site.test/manga/title/chapter-1', label: 'Prev' },
      { url: 'https://site.test/manga/title/chapter-3', label: 'Chapter 3' },
      { url: 'https://site.test/manga/title/chapter-1', label: 'Chapter 1' },
    ]);

    // Both links survive once each, under their real names.
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.label).sort()).toEqual(['Chapter 1', 'Chapter 3']);
  });

  it('still keeps a legitimately unnumbered special', () => {
    const list = seriesChapters(current, [
      { url: 'https://site.test/manga/title/chapter-3', label: 'Chapter 3' },
      { url: 'https://site.test/manga/title/chapter-3-5', label: 'Chapter 3.5 Extra' },
    ]);
    expect(list).toHaveLength(2);
  });
});
