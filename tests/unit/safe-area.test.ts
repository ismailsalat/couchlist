import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The app asks for `viewport-fit=cover` and a translucent status bar, which
 * together draw the page underneath the clock, the camera housing and the
 * home indicator. That is the right choice — the background should reach the
 * edge of the screen — but only while something keeps the content out from
 * under them.
 *
 * It did not, and on a real phone the header sat behind the status bar. These
 * assertions are deliberately about the stylesheet rather than a rendered
 * page: a headless browser reports every inset as zero, so a layout test
 * would pass whether or not the padding was there.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../apps/web/src/app/globals.css', import.meta.url)),
  'utf8',
);
const layout = readFileSync(
  fileURLToPath(new URL('../../apps/web/src/app/layout.tsx', import.meta.url)),
  'utf8',
);

function shellRules(): string {
  // Every `.cl-shell { ... }` block, including the one inside the media query.
  return [...css.matchAll(/\.cl-shell\s*\{([^}]*)\}/gu)].map((match) => match[1]).join('\n');
}

describe('the page shell and the device safe areas', () => {
  it('is actually applied to the outermost container', () => {
    expect(layout).toContain('cl-shell');
    expect(css).toMatch(/\.cl-shell\s*\{/u);
  });

  it('pads for all four insets, not just the top', () => {
    const rules = shellRules();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(rules, `missing safe-area-inset-${side}`).toContain(`env(safe-area-inset-${side})`);
    }
  });

  it('keeps ordinary padding where the device reports no inset', () => {
    // max() rather than a bare env(): on a desktop browser every inset is
    // zero, and without max() the page would lose its padding entirely.
    const rules = shellRules();
    const envUses = [...rules.matchAll(/env\(safe-area-inset-\w+\)/gu)].length;
    const maxUses = [...rules.matchAll(/max\([^)]*env\(safe-area-inset-\w+\)\)/gu)].length;
    expect(maxUses).toBe(envUses);
  });

  it('still asks for the full-bleed viewport the padding exists to serve', () => {
    expect(layout).toContain("viewportFit: 'cover'");
    expect(layout).toContain('black-translucent');
  });
});
