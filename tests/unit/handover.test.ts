import { describe, expect, it } from 'vitest';
import { handoverFromHash, parseHandover } from '@couchlist/shared';

/**
 * A fragment is attacker-controllable — anyone can send somebody a link with
 * one attached — so none of it is trusted. These tests are mostly about what
 * gets thrown away.
 */
describe('chapter handover', () => {
  const good = {
    title: 'Chapter 50',
    sourceUrl: 'https://site.test/m/t/c50',
    pages: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
    candidates: [{ url: 'https://site.test/m/t/c51', label: 'Chapter 51' }],
    next: 'https://site.test/m/t/c51',
    guessed: false,
  };

  it('accepts a well-formed chapter', () => {
    const { chapter } = parseHandover(good);
    expect(chapter?.pages).toHaveLength(2);
    expect(chapter?.title).toBe('Chapter 50');
    expect(chapter?.next).toBe('https://site.test/m/t/c51');
  });

  it('drops pages that are not public http(s)', () => {
    const { chapter } = parseHandover({
      ...good,
      pages: [
        'https://cdn.test/1.jpg',
        'javascript:alert(1)',
        'file:///etc/passwd',
        'http://127.0.0.1/secret.png',
        'http://169.254.169.254/latest/meta-data/',
        'data:image/png;base64,AAAA',
      ],
    });
    expect(chapter?.pages).toEqual(['https://cdn.test/1.jpg']);
  });

  it('refuses a chapter whose pages are all unusable', () => {
    const result = parseHandover({ ...good, pages: ['javascript:alert(1)'] });
    expect(result.chapter).toBeNull();
    expect(result.problem).toMatch(/none of that chapter/iu);
  });

  it('refuses an empty or malformed payload', () => {
    expect(parseHandover(null).chapter).toBeNull();
    expect(parseHandover('nope').chapter).toBeNull();
    expect(parseHandover({ pages: [] }).chapter).toBeNull();
  });

  it('caps the page count and the text lengths', () => {
    const { chapter } = parseHandover({
      ...good,
      title: 'x'.repeat(5000),
      pages: Array.from({ length: 4000 }, (_, i) => `https://cdn.test/${i}.jpg`),
    });
    expect(chapter?.pages.length).toBeLessThanOrEqual(1500);
    expect(chapter?.title.length).toBeLessThanOrEqual(250);
  });

  it('keeps reading order and removes duplicates', () => {
    const { chapter } = parseHandover({
      ...good,
      pages: ['https://cdn.test/3.jpg', 'https://cdn.test/1.jpg', 'https://cdn.test/3.jpg'],
    });
    expect(chapter?.pages).toEqual(['https://cdn.test/3.jpg', 'https://cdn.test/1.jpg']);
  });

  it('carries the guessed flag through so the reader can warn', () => {
    expect(parseHandover({ ...good, guessed: true }).chapter?.guessed).toBe(true);
    expect(parseHandover({ ...good, guessed: 'yes' }).chapter?.guessed).toBe(false);
  });

  it('reads one out of a fragment, and survives rubbish', () => {
    const hash = `#chapter=${encodeURIComponent(JSON.stringify(good))}`;
    expect(handoverFromHash(hash).chapter?.pages).toHaveLength(2);
    expect(handoverFromHash('#chapter=not-json')?.chapter).toBeNull();
    expect(handoverFromHash('#nothing-here')).toBeNull();
  });
});
