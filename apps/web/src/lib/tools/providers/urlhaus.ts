import 'server-only';
import { config } from '@/lib/config';
import { DAY, HOUR, type ProviderAnswer, type ReputationProvider } from './types';

/**
 * URLhaus, by abuse.ch.
 *
 * A database of URLs seen distributing malware. Narrower than Safe Browsing
 * and correspondingly more specific: a hit here means somebody observed that
 * host serving a payload, which is worth saying in those words.
 *
 * Since abuse.ch's "Community First" change on 30 June 2025 every request
 * must carry an `Auth-Key` header. The key is free from auth.abuse.ch, and
 * without one this provider reports itself unavailable rather than failing
 * the whole lookup.
 */

const ENDPOINT = 'https://urlhaus-api.abuse.ch/v1/host/';

interface HostResponse {
  query_status?: string;
  urls?: Array<{ url_status?: string; threat?: string; date_added?: string }>;
  blacklists?: Record<string, string>;
}

export const urlhaus: ReputationProvider = {
  name: 'URLhaus',

  configured() {
    return config().URLHAUS_AUTH_KEY.length > 0;
  },

  async lookup(domain: string, signal: AbortSignal): Promise<ProviderAnswer> {
    const key = config().URLHAUS_AUTH_KEY;
    if (!key) return { status: 'unavailable', detail: 'Not configured.', cacheFor: 0 };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Auth-Key': key,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ host: domain }).toString(),
    });

    if (!response.ok) {
      return { status: 'unavailable', detail: `HTTP ${response.status}.`, cacheFor: 0 };
    }

    const body = (await response.json()) as HostResponse;

    if (body.query_status === 'no_results') {
      return { status: 'clean', detail: 'No malware URLs recorded for this host.', cacheFor: 12 * HOUR };
    }
    if (body.query_status !== 'ok') {
      return { status: 'unknown', detail: 'URLhaus could not answer for this host.', cacheFor: HOUR };
    }

    const urls = body.urls ?? [];
    const online = urls.filter((entry) => entry.url_status === 'online').length;

    if (urls.length === 0) {
      return { status: 'clean', detail: 'No malware URLs recorded for this host.', cacheFor: 12 * HOUR };
    }

    const threats = [...new Set(urls.map((entry) => entry.threat).filter(Boolean))];
    const threatText = threats.length > 0 ? ` (${threats.join(', ').replace(/_/gu, ' ')})` : '';
    const detail =
      online > 0
        ? `${online} malware URL${online === 1 ? '' : 's'} currently live on this host${threatText}.`
        : `${urls.length} malware URL${urls.length === 1 ? '' : 's'} recorded here in the past, none live right now${threatText}.`;

    return {
      status: online > 0 ? 'flagged' : 'unknown',
      detail,
      cacheFor: online > 0 ? 6 * HOUR : DAY,
    };
  },
};
