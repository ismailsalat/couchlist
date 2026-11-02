import { describe, expect, it } from 'vitest';
import { explainMailFailure } from '@couchlist/shared';

/**
 * When outbound mail stops, the symptom is silence: somebody waits for a code
 * that never comes. These are the provider's common refusals, each of which
 * has exactly one fix, translated into that fix.
 */
describe('explaining a mail failure', () => {
  it('names a rejected API key', () => {
    expect(explainMailFailure('API key is invalid', 401)).toMatch(/RESEND_API_KEY/u);
    expect(explainMailFailure('unauthorized', 401)).toMatch(/RESEND_API_KEY/u);
  });

  it('names the unverified-domain restriction, which looks like a bug', () => {
    const message = explainMailFailure(
      'You can only send testing emails to your own email address (you@example.com).',
      403,
    );
    expect(message).toMatch(/not verified/iu);
    expect(message).toMatch(/MAIL_FROM/u);
  });

  it('names an unverified sending domain', () => {
    expect(explainMailFailure('The domain is not verified', 403)).toMatch(/MAIL_FROM/u);
  });

  it('names a malformed from address', () => {
    expect(explainMailFailure('invalid_from_address', 422)).toMatch(/MAIL_FROM/u);
  });

  it('names rate limiting', () => {
    expect(explainMailFailure('Too many requests', 429)).toMatch(/rate limiting/iu);
  });

  it('says nothing rather than guessing at an unfamiliar error', () => {
    expect(explainMailFailure('socket hang up')).toBeNull();
    expect(explainMailFailure(undefined)).toBeNull();
    expect(explainMailFailure('')).toBeNull();
  });
});
