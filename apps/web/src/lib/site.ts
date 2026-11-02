import { config } from '@/lib/config';

/**
 * Who to write to, and who to say runs this.
 *
 * A directory with no named operator and no reachable address is, from the
 * outside, indistinguishable from a throwaway. Blocklist heuristics treat it
 * that way, and so do people. Both values are configurable, and the address
 * falls back to `hello@` on the site's own domain so a deployment is never
 * published with a dead or missing contact.
 */
export function siteContact(): { email: string; operator: string } {
  const { CONTACT_EMAIL, SITE_OPERATOR, APP_BASE_URL } = config();

  const configured = CONTACT_EMAIL.trim();
  if (configured) return { email: configured, operator: SITE_OPERATOR.trim() || 'Couchlist' };

  let host = 'couchlist.io';
  try {
    host = new URL(APP_BASE_URL).hostname.replace(/^www\./, '');
  } catch {
    // Keep the fallback; a malformed base URL is caught by config validation.
  }

  return { email: `hello@${host}`, operator: SITE_OPERATOR.trim() || 'Couchlist' };
}
