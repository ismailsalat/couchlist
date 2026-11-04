import 'server-only';
import { config } from '@/lib/config';
import { DAY, HOUR, type LookupTarget, type ProviderAnswer, type ReputationProvider } from './types';

/**
 * Google Safe Browsing, Lookup API v4.
 *
 * Free, and free of charge for non-commercial use — which Couchlist is,
 * carrying no advertising — with a default quota around ten thousand lookups
 * a day. That quota is the reason every answer is cached.
 *
 * Google's terms place one hard rule on us: a warning may be shown only while
 * the response's own cache duration is still valid. So `cacheFor` is taken
 * from the response rather than chosen here, and an expired row is re-fetched
 * instead of being shown again.
 */

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const THREAT_LABELS: Record<string, string> = {
  MALWARE: 'malware',
  SOCIAL_ENGINEERING: 'phishing or deceptive content',
  UNWANTED_SOFTWARE: 'unwanted software',
  POTENTIALLY_HARMFUL_APPLICATION: 'a potentially harmful app',
};

interface ThreatMatch {
  threatType?: string;
  cacheDuration?: string;
}

/** Google returns durations as "300s". Fall back to an hour if it is absent. */
export function parseCacheDuration(value: string | undefined): number {
  if (!value) return HOUR;
  const seconds = Number.parseFloat(value.replace(/s$/u, ''));
  if (!Number.isFinite(seconds) || seconds <= 0) return HOUR;
  return Math.min(seconds * 1000, 7 * DAY);
}

export const safeBrowsing: ReputationProvider = {
  name: 'Google Safe Browsing',

  configured() {
    return config().GOOGLE_SAFE_BROWSING_API_KEY.length > 0;
  },

  async lookup(target: LookupTarget, signal: AbortSignal): Promise<ProviderAnswer> {
    const key = config().GOOGLE_SAFE_BROWSING_API_KEY;
    if (!key) return { status: 'unavailable', detail: 'No key set up', cacheFor: 0 };

    /*
     * Both schemes, because Safe Browsing matches on the URL it is given and a
     * site can be flagged under one and not the other.
     *
     * And the exact page when one was pasted. Safe Browsing flags URLs, not
     * domains: a single bad page on an otherwise ordinary host is the common
     * case, and asking only about `/` misses it entirely.
     */
    const threatEntries = [{ url: `http://${target.host}/` }, { url: `https://${target.host}/` }];
    if (target.path && target.path !== '/') {
      threatEntries.push(
        { url: `https://${target.host}${target.path}` },
        { url: `http://${target.host}${target.path}` },
      );
    }

    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'couchlist', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: Object.keys(THREAT_LABELS),
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries,
        },
      }),
    });

    if (!response.ok) {
      // 429 is the quota, which is a normal condition rather than a bug.
      const reason = response.status === 429 ? 'Daily quota used up' : `Service error ${response.status}`;
      return { status: 'unavailable', detail: reason, cacheFor: 0 };
    }

    const body = (await response.json()) as { matches?: ThreatMatch[] };
    const matches = body.matches ?? [];

    if (matches.length === 0) {
      // An empty response means "not on our lists today", which is a weaker
      // claim than "safe", and the wording has to keep that distinction.
      return { status: 'clean', detail: 'Not on Google’s threat lists.', cacheFor: 6 * HOUR };
    }

    const kinds = [...new Set(matches.map((match) => THREAT_LABELS[match.threatType ?? ''] ?? 'a threat'))];
    const cacheFor = Math.min(...matches.map((match) => parseCacheDuration(match.cacheDuration)));

    return {
      status: 'flagged',
      detail: `Flagged for ${kinds.join(' and ')}`,
      cacheFor,
    };
  },
};
