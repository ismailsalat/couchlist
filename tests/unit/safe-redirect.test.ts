import { describe, expect, it } from 'vitest';
import { safeRedirectPath as safeNext } from '@couchlist/shared';

/**
 * After signing in, the browser is sent wherever `next` says. If that can be
 * made to point at another site, a sign-in link becomes a way to launder a
 * phishing page through a domain the reader trusts.
 */
describe('post-sign-in redirect target', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/saved')).toBe('/saved');
    expect(safeNext('/sources/wsr_123?from=list')).toBe('/sources/wsr_123?from=list');
  });

  it('falls back home when there is nothing to go back to', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  it('refuses an absolute URL', () => {
    expect(safeNext('https://evil.example/login')).toBe('/');
    expect(safeNext('http://evil.example')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
    expect(safeNext('data:text/html,<script>')).toBe('/');
  });

  it('refuses a protocol-relative URL, in either slash direction', () => {
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('//evil.example/path')).toBe('/');
    // Browsers normalise the backslash, so this reaches the same place.
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('/\\\\evil.example')).toBe('/');
  });

  it('refuses a target carrying control characters', () => {
    expect(safeNext('/saved\n/../admin')).toBe('/');
    expect(safeNext('/saved\u0000')).toBe('/');
    expect(safeNext('/\u007f')).toBe('/');
  });
});
