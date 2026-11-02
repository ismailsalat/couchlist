import { describe, expect, it } from 'vitest';
import { ANONYMOUS_DISPLAY_NAME, CreditMode, parseCreditMode, publicCredit } from '@couchlist/shared';

/**
 * Anonymous credit is a public display choice, so the thing worth testing is
 * that the public shape leaks nothing: no name, no avatar, and above all no
 * account id that could be joined back to a profile.
 */
const account = {
  id: 'usr_abc123',
  displayName: 'Mina',
  username: 'mina',
  avatarUrl: 'https://example.com/a.png',
};

describe('public contributor credit', () => {
  it('credits an account that asked to be credited', () => {
    const credit = publicCredit({ creditMode: CreditMode.CREDITED, user: account });
    expect(credit).toEqual({
      anonymous: false,
      displayName: 'Mina',
      userId: 'usr_abc123',
      avatarUrl: 'https://example.com/a.png',
      hasAvatar: false,
    });
  });

  it('reports an uploaded picture as a flag, never as an address', () => {
    const credit = publicCredit({
      creditMode: CreditMode.CREDITED,
      user: { ...account, avatarMime: 'image/png' },
    });
    expect(credit.anonymous).toBe(false);
    if (!credit.anonymous) {
      expect(credit.hasAvatar).toBe(true);
      // The caller has to go through Couchlist's own route to fetch it.
      expect(JSON.stringify(credit)).not.toContain('/avatar');
    }
  });

  it('gives an anonymous contributor no picture to be recognised by', () => {
    const credit = publicCredit({
      creditMode: CreditMode.ANONYMOUS,
      user: { ...account, avatarMime: 'image/png' },
    });
    expect(credit).not.toHaveProperty('hasAvatar');
    expect(credit).not.toHaveProperty('userId');
  });

  it('exposes no identifying field at all for an anonymous contribution', () => {
    const credit = publicCredit({ creditMode: CreditMode.ANONYMOUS, user: account });

    expect(credit.anonymous).toBe(true);
    expect(credit.displayName).toBe(ANONYMOUS_DISPLAY_NAME);

    // The decisive assertion: nothing in the shape can identify the account.
    const serialized = JSON.stringify(credit);
    expect(serialized).not.toContain(account.id);
    expect(serialized).not.toContain(account.displayName);
    expect(serialized).not.toContain(account.username);
    expect(serialized).not.toContain(account.avatarUrl);
    expect(Object.keys(credit).sort()).toEqual(['anonymous', 'displayName']);
  });

  it('renders a deleted account as anonymous, so an old name cannot leak', () => {
    const credit = publicCredit({
      creditMode: CreditMode.CREDITED,
      user: { ...account, deletedAt: new Date() },
    });
    expect(credit.anonymous).toBe(true);
    expect(JSON.stringify(credit)).not.toContain(account.displayName);
  });

  it('renders a detached contribution as anonymous', () => {
    expect(publicCredit({ creditMode: CreditMode.CREDITED, user: null }).anonymous).toBe(true);
  });

  it('falls back to anonymous rather than showing a blank name', () => {
    const credit = publicCredit({
      creditMode: CreditMode.CREDITED,
      user: { ...account, displayName: '   ', username: null },
    });
    expect(credit.anonymous).toBe(true);
  });

  it('makes credited the default for anything unrecognised', () => {
    expect(parseCreditMode(undefined)).toBe(CreditMode.CREDITED);
    expect(parseCreditMode('nonsense')).toBe(CreditMode.CREDITED);
    expect(parseCreditMode('ANONYMOUS')).toBe(CreditMode.ANONYMOUS);
  });
});
