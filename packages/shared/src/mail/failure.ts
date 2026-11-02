/**
 * Turns a provider rejection into something a moderator can act on.
 *
 * The common refusals are configuration rather than faults, and each has one
 * obvious fix. Saying which one is the difference between a moderator
 * changing a setting and spending an evening wondering whether the code is
 * broken — which is exactly how this function came to exist.
 */
export function explainMailFailure(detail: string | undefined, status?: number): string | null {
  const text = (detail ?? '').toLowerCase();

  if (status === 401 || text.includes('api key is invalid') || text.includes('unauthorized')) {
    return 'The API key was rejected. Check RESEND_API_KEY, and that it has not been revoked.';
  }
  if (text.includes('only send testing emails to your own')) {
    return 'The sending domain is not verified, so the provider only accepts mail addressed to the account owner. Verify your domain and set MAIL_FROM to an address on it.';
  }
  if (text.includes('domain is not verified') || text.includes('not verified')) {
    return 'MAIL_FROM uses a domain that is not verified with the provider. Verify it, or send from the provider’s test address while you wait.';
  }
  if (status === 422 || text.includes('invalid_from_address')) {
    return 'MAIL_FROM is not an address the provider will accept. Use name@domain or Name <name@domain>.';
  }
  if (status === 429 || text.includes('rate')) {
    return 'The provider is rate limiting. Wait and try again; check the plan’s daily limit.';
  }
  return null;
}
