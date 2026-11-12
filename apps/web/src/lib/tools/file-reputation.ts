import 'server-only';
import { createLogger } from '@couchlist/shared';
import { config } from '@/lib/config';

const log = createLogger({ service: 'tools' });

/**
 * Looking a file up by its fingerprint.
 *
 * The browser hashes the file and sends sixty-four characters. The file never
 * moves. That is not a privacy nicety — uploading strangers' files would make
 * Couchlist a service that receives arbitrary binaries, with the storage,
 * abuse and liability that implies, and VirusTotal's own terms share uploaded
 * files with their partners, which somebody scanning a personal file would
 * not expect.
 *
 * What it buys: for malware anybody has already reported, this is a real
 * identification rather than a guess from the first four bytes. What it does
 * not buy: anything about a file nobody has seen before. The answer for those
 * is "not known", and the wording must never drift towards "clean".
 */

export type FileVerdict = 'THREAT' | 'NOT_KNOWN' | 'UNAVAILABLE';

export interface FileSignal {
  source: string;
  status: 'flagged' | 'unknown' | 'unavailable';
  detail: string;
}

export interface FileCheckResult {
  sha256: string;
  verdict: FileVerdict;
  title: string;
  body: string;
  signals: FileSignal[];
}

const TIMEOUT_MS = 6_000;

/** MalwareBazaar: a database of malware samples, queried by hash. */
async function malwareBazaar(sha256: string, signal: AbortSignal): Promise<FileSignal> {
  const key = config().URLHAUS_AUTH_KEY;
  if (!key) return { source: 'MalwareBazaar', status: 'unavailable', detail: 'No key set up' };

  const response = await fetch('https://mb-api.abuse.ch/api/v1/', {
    method: 'POST',
    signal,
    headers: { 'Auth-Key': key, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: 'get_info', hash: sha256 }).toString(),
  });

  if (!response.ok) {
    return { source: 'MalwareBazaar', status: 'unavailable', detail: `Service error ${response.status}` };
  }

  const body = (await response.json()) as {
    query_status?: string;
    data?: Array<{ signature?: string | null; file_type?: string | null; first_seen?: string | null }>;
  };

  if (body.query_status === 'hash_not_found') {
    return { source: 'MalwareBazaar', status: 'unknown', detail: 'Not in their database' };
  }
  if (body.query_status !== 'ok' || !body.data?.length) {
    return { source: 'MalwareBazaar', status: 'unavailable', detail: 'No answer' };
  }

  const sample = body.data[0]!;
  const family = sample.signature ? ` (${sample.signature})` : '';
  return { source: 'MalwareBazaar', status: 'flagged', detail: `Known malware${family}` };
}

/** Google's file reputation, through the same Safe Browsing project key. */
async function virusTotal(sha256: string, signal: AbortSignal): Promise<FileSignal> {
  const key = config().VIRUSTOTAL_API_KEY;
  if (!key) return { source: 'VirusTotal', status: 'unavailable', detail: 'No key set up' };

  const response = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
    signal,
    headers: { 'x-apikey': key },
  });

  if (response.status === 404) {
    return { source: 'VirusTotal', status: 'unknown', detail: 'Nobody has submitted this file' };
  }
  if (response.status === 429) {
    return { source: 'VirusTotal', status: 'unavailable', detail: 'Rate limit reached' };
  }
  if (!response.ok) {
    return { source: 'VirusTotal', status: 'unavailable', detail: `Service error ${response.status}` };
  }

  const body = (await response.json()) as {
    data?: { attributes?: { last_analysis_stats?: Record<string, number> } };
  };
  const stats = body.data?.attributes?.last_analysis_stats;
  const malicious = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0);
  const total = Object.values(stats ?? {}).reduce((sum, value) => sum + value, 0);

  if (malicious > 0) {
    return {
      source: 'VirusTotal',
      status: 'flagged',
      detail: `${malicious} of ${total} scanners flagged it`,
    };
  }
  return {
    source: 'VirusTotal',
    status: 'unknown',
    detail: total > 0 ? `No scanner flagged it (${total} checked)` : 'No analysis available',
  };
}

/** Ask both, report both, let the worse answer decide the headline. */
export async function checkFileHash(sha256: string): Promise<FileCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const signals: FileSignal[] = [];
  try {
    const answers = await Promise.allSettled([
      malwareBazaar(sha256, controller.signal),
      virusTotal(sha256, controller.signal),
    ]);

    for (const answer of answers) {
      if (answer.status === 'fulfilled') {
        signals.push(answer.value);
      } else {
        log.warn('file_lookup_failed', { message: String(answer.reason) });
        signals.push({ source: 'A reputation service', status: 'unavailable', detail: 'Did not answer' });
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const flagged = signals.filter((entry) => entry.status === 'flagged');
  const answered = signals.some((entry) => entry.status !== 'unavailable');

  if (flagged.length > 0) {
    return {
      sha256,
      verdict: 'THREAT',
      title: 'Threat detected',
      body: `${flagged.map((entry) => entry.source).join(' and ')} identified this exact file as malware. Delete it rather than opening it.`,
      signals,
    };
  }

  if (!answered) {
    return {
      sha256,
      verdict: 'UNAVAILABLE',
      title: 'Could not check it',
      body: 'No reputation service answered, so nothing was checked. That is not a result — treat the file as unknown.',
      signals,
    };
  }

  return {
    sha256,
    verdict: 'NOT_KNOWN',
    title: 'No threats detected',
    body: 'Nobody has reported this exact file as malware. That is not the same as it being safe: a file nobody has seen before looks identical to one that is harmless, and this checks a fingerprint rather than scanning the contents.',
    signals,
  };
}
