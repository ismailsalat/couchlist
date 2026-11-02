import { config } from '@/lib/config';
import { siteContact } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** How long each served copy claims to be valid. RFC 9116 wants under a year. */
const VALID_FOR_DAYS = 180;

/**
 * security.txt, per RFC 9116.
 *
 * It is a small file that says where to send a security report. Two reasons
 * to serve it: somebody who finds a problem can tell us instead of selling
 * it, and reputation scanners read its presence as a sign that a human is
 * looking after the domain.
 *
 * Generated rather than static so `Expires` is always in the future. A
 * security.txt that expired eighteen months ago is worse than none: it
 * advertises that nobody is minding the site.
 */
export async function GET(): Promise<Response> {
  const { email } = siteContact();
  const base = config().APP_BASE_URL.replace(/\/$/, '');
  const expires = new Date(Date.now() + VALID_FOR_DAYS * 86_400_000).toISOString();

  const body = [
    `Contact: mailto:${email}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${base}/.well-known/security.txt`,
    '',
    '# Couchlist is a directory of links. It hosts no media and takes no payments.',
    '# Reports about a listed third-party site are welcome too, at the same address.',
    '# Good-faith research is welcome and will not be met with legal threats.',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}
