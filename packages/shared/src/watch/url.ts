/**
 * External URL handling.
 *
 * Every URL attached to a watch source is untrusted input: it may arrive from a
 * provider API, an importer or a human. Nothing reaches the database or a
 * rendered anchor without passing through here first.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Hostnames that must never be fetched server-side, and never linked either. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

export interface ParsedExternalUrl {
  url: URL;
  domain: string;
}

/**
 * Strips the parts of a hostname that make two records look different while
 * pointing at the same operator, so `WWW.Example.com.` and `example.com` dedupe.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Accept either a bare hostname or a full URL.
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(candidate).hostname;
  } catch {
    return null;
  }

  const withoutTrailingDot = host.replace(/\.+$/u, '');
  const withoutWww = withoutTrailingDot.replace(/^www\./u, '');

  // A hostname with no dot is either a local name or malformed. Both are unusable
  // as a public source domain.
  if (!withoutWww || !withoutWww.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/u.test(withoutWww)) return null;

  return withoutWww;
}

/** True for addresses that live inside the deploy's own network. */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/u, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // Bracketed IPv6 arrives from URL.hostname without brackets.
  if (host.includes(':')) return isPrivateIpv6(host);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host);
  if (!v4) return false;

  const octets = v4.slice(1, 5).map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => !Number.isFinite(octet) || octet < 0 || octet > 255)) {
    // Not a well-formed address; refuse rather than guess.
    return true;
  }

  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved

  return false;
}

function isPrivateIpv6(host: string): boolean {
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('fe80')) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/u.test(host)) return true; // unique local
  // ::ffff:127.0.0.1 style mapped addresses reuse the v4 rules.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/u.exec(host);
  if (mapped?.[1]) return isPrivateHostname(mapped[1]);
  return false;
}

/**
 * Parses a URL that Couchlist is willing to show as a link.
 *
 * Rejects non-HTTP schemes outright: `javascript:` and `data:` are the reason
 * this function exists, and an href is a script sink.
 */
export function parseExternalUrl(input: string): ParsedExternalUrl | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (url.username || url.password) return null;
  if (isPrivateHostname(url.hostname)) return null;

  const domain = normalizeDomain(url.hostname);
  if (!domain) return null;

  return { url, domain };
}

export function isSafeExternalUrl(input: string): boolean {
  return parseExternalUrl(input) !== null;
}

/**
 * Normalised form used for storage and duplicate detection. Drops the fragment
 * and any trailing slash so two records for the same page collapse into one.
 */
export function canonicalizeExternalUrl(input: string): string | null {
  const parsed = parseExternalUrl(input);
  if (!parsed) return null;

  const { url } = parsed;
  url.hash = '';
  url.hostname = parsed.domain;
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/u, '');
  }
  return url.toString();
}

/**
 * Fetch guard for server-side health checks.
 *
 * Hostname rules alone do not stop SSRF, because DNS can resolve a public name
 * to a private address. Callers must also check the resolved address; this is
 * the first gate, not the only one.
 */
export function assertFetchableUrl(input: string): URL {
  const parsed = parseExternalUrl(input);
  if (!parsed) throw new Error('URL is not fetchable');
  return parsed.url;
}

/** Display text for a link: the domain, never the raw untrusted string. */
export function displayDomain(input: string): string {
  return normalizeDomain(input) ?? 'unknown source';
}
