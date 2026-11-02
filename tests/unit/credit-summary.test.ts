import { describe, expect, it } from 'vitest';
import { creditSummaryLine, publicCredit, CreditMode } from '@couchlist/shared';

/**
 * A popular source collects names faster than a card can show them, so the
 * summary line has to stay one line however many people suggested it. These
 * tests pin the shortening, and the rule that an anonymous contributor is
 * counted without ever being named.
 */

function entry(name: string | null, isOriginal = false) {
  return {
    isOriginal,
    credit: publicCredit({
      creditMode: name === null ? CreditMode.ANONYMOUS : CreditMode.CREDITED,
      user: name === null ? null : { id: `usr_${name}`, displayName: name, avatarUrl: null },
    }),
  };
}

describe('credit summary line', () => {
  it('says nothing when nobody is credited', () => {
    expect(creditSummaryLine([])).toBe('');
  });

  it('names a single contributor on their own', () => {
    expect(creditSummaryLine([entry('Mina', true)])).toBe('Mina');
  });

  it('joins two contributors with "and"', () => {
    expect(creditSummaryLine([entry('Mina', true), entry('Jay')])).toBe('Mina and Jay');
  });

  it('collapses a third contributor into a singular count', () => {
    expect(creditSummaryLine([entry('Mina', true), entry('Jay'), entry('Sam')])).toBe(
      'Mina, Jay and 1 other',
    );
  });

  it('collapses a crowd into a plural count', () => {
    const credits = [entry('Mina', true), entry('Jay'), ...Array.from({ length: 4 }, (_, i) => entry(`P${i}`))];
    expect(creditSummaryLine(credits)).toBe('Mina, Jay and 4 others');
  });

  it('puts the original contributor first however the list arrives', () => {
    expect(creditSummaryLine([entry('Jay'), entry('Sam'), entry('Mina', true)])).toMatch(/^Mina, /u);
  });

  it('counts an anonymous contributor without naming them', () => {
    const line = creditSummaryLine([entry('Mina', true), entry(null), entry(null)]);
    expect(line).toBe('Mina, Anonymous and 1 other');
  });

  it('stays one line for a very large crowd', () => {
    const credits = [entry('Mina', true), ...Array.from({ length: 500 }, (_, i) => entry(`P${i}`))];
    const line = creditSummaryLine(credits);
    expect(line).toBe('Mina, P0 and 499 others');
    expect(line).not.toContain('\n');
  });
});
