/**
 * Where to send a browser after it signs in.
 *
 * The target arrives in a query string, so anybody can choose it. If it can
 * be made to point at another site, a Couchlist sign-in link becomes a way to
 * launder somebody else's page through a domain the reader already trusts.
 *
 * This is a whitelist of one shape — a plain path on this site — rather than
 * a list of things to block, because the ways to write "somewhere else" are
 * open-ended and the ways to write "a path here" are not.
 */
export function safeRedirectPath(value: string | undefined | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';

  /*
   * `//evil.example` is a protocol-relative URL. Several browsers also
   * normalise a backslash to a slash before resolving, so `/\evil.example`
   * arrives at the same place by a different spelling.
   */
  if (value[1] === '/' || value[1] === '\\') return '/';

  // A control character can hide the real target from a log or a reviewer.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(value)) return '/';

  return value;
}
