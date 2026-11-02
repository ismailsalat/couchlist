import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Three different things are said beside a source's name — what it covers,
 * how good the material is, and what to watch out for — and they were all
 * being said with the same rounded pill in a different colour.
 *
 * Colour alone is a weak signal. It fails for a reader who cannot separate
 * two of ours, it fails in a screenshot, and it fails at a glance down a long
 * list. These assertions pin the thing that does not fail: each kind has its
 * own silhouette.
 */

const source = readFileSync(
  fileURLToPath(new URL('../../apps/web/src/components/ui/category-pill.tsx', import.meta.url)),
  'utf8',
);

function componentBody(name: string): string {
  const start = source.indexOf(`export function ${name}`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('the marks beside a source name', () => {
  it('draws a category as a fully rounded pill', () => {
    const body = componentBody('CategoryPill');
    expect(body).toContain('rounded-pill');
    expect(body).toContain('bg-category-bg');
  });

  it('draws quality as a square-cornered outline, not a pill', () => {
    const body = componentBody('QualityBadge');
    expect(body).toContain('rounded-[3px]');
    expect(body).not.toContain('rounded-pill');
    // Outline only: a fill would make it read as a label.
    expect(body).toContain('bg-transparent');
    expect(body).toContain('uppercase');
  });

  it('draws both warnings as a notched banner, which nothing else uses', () => {
    const banner = source.slice(source.indexOf('const BANNER'), source.indexOf('export function AdsWarning'));
    expect(banner).toContain('clip-path');
    expect(banner).not.toContain('rounded-pill');

    for (const name of ['AdsWarning', 'AvoidWarning']) {
      expect(componentBody(name)).toContain('BANNER');
    }
  });

  it('draws a trusted pick as a bare star with no container', () => {
    const body = componentBody('TrustedMark');
    expect(body).toContain('<svg');
    // No chip of any kind: that is what separates an endorsement from a label.
    expect(body).not.toContain('rounded-pill');
    expect(body).not.toContain('rounded-[3px]');
    expect(body).not.toContain('border');
  });

  it('says what a trusted pick means without relying on hover', () => {
    const body = componentBody('TrustedMark');
    // A title attribute alone is invisible to a keyboard or a screen reader.
    expect(body).toContain('sr-only');
    expect(body).toContain('Trusted pick');
  });

  it('keeps the four shapes genuinely different from each other', () => {
    const shapes = {
      category: componentBody('CategoryPill').includes('rounded-pill'),
      quality: componentBody('QualityBadge').includes('rounded-[3px]'),
      warning: source.includes('clip-path'),
      trusted: !componentBody('TrustedMark').includes('rounded'),
    };
    expect(Object.values(shapes).every(Boolean)).toBe(true);
  });
});
