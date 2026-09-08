import 'server-only';

/**
 * Name of the short-lived cookie holding the OAuth state value.
 *
 * Lives here rather than in a route file because Next.js route modules may
 * only export request handlers.
 */
export const STATE_COOKIE = 'couchlist_oauth_state';
