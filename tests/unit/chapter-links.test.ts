import { describe, expect, it } from 'vitest';
import {
  allowedChapterLink,
  chapterNumber,
  labelNumber,
  neighbours,
  orderChapters,
  sameFamily,
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
