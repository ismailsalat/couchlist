import { describe, expect, it } from 'vitest';
import { MAX_LINKED_PAGES, classifyReaderLink, classifyReaderLinks } from '@couchlist/shared';

/**
 * These links end up in an <img src>, so the test that matters most is what
 * happens to the ones that should never get there.
 */
describe('reader link classification', () => {
  it('accepts a plain image link', () => {
    const result = classifyReaderLink('https://cdn.example.com/a/page-01.webp');
    expect(result.kind).toBe('image');
    expect(result.url).toBe('https://cdn.example.com/a/page-01.webp');
  });

  it('refuses anything that is not public http(s)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:image/png;base64,AAAA',
      'http://localhost/a.png',
      'http://127.0.0.1/a.png',
      'http://[::1]/a.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.5/a.png',
      'http://10.0.0.1/a.png',
      'not a url at all',
    ]) {
      expect(classifyReaderLink(bad, true).kind, bad).toBe('rejected');
    }
  });

  it('refuses the private addresses even when told to assume images', () => {
    // The assume-image flag must not become a way around the host checks.
    expect(classifyReaderLink('http://127.0.0.1/render?id=1', true).kind).toBe('rejected');
  });

  it('calls a chapter page what it is instead of rendering a broken image', () => {
    const result = classifyReaderLink('https://example.com/manga/title/chapter-65');
    expect(result.kind).toBe('needs-extension');
    expect(result.reason).toMatch(/extension/iu);
  });

  it('accepts an extensionless image endpoint when told it is one', () => {
    const result = classifyReaderLink('https://images.example.com/render?id=8', true);
    expect(result.kind).toBe('image');
  });

  it('keeps reading order and drops duplicates', () => {
    const { images } = classifyReaderLinks(
      [
        'https://cdn.example.com/3.jpg',
        'https://cdn.example.com/1.jpg',
        'https://cdn.example.com/3.jpg',
        'https://cdn.example.com/2.jpg',
      ].join('\n'),
    );
    // Order is the reading order; sorting it would scramble the chapter.
    expect(images).toEqual([
      'https://cdn.example.com/3.jpg',
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
    ]);
  });

  it('sorts each line into the right bucket', () => {
    const result = classifyReaderLinks(
      [
        'https://cdn.example.com/1.jpg',
        'https://example.com/manga/ch-2',
        'javascript:alert(1)',
        '',
        '   ',
      ].join('\n'),
    );
    expect(result.images).toHaveLength(1);
    expect(result.needsExtension).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('caps how many pages one paste can create', () => {
    const many = Array.from({ length: 900 }, (_, i) => `https://cdn.example.com/${i}.jpg`).join('\n');
    expect(classifyReaderLinks(many).images).toHaveLength(MAX_LINKED_PAGES);
  });
});
