import { AppError, ERROR_CODES } from '../errors/index.js';

/**
 * HTTP helper for external providers.
 *
 * Every outbound call gets a timeout and bounded retries, and every failure is
 * converted into an AppError. A provider being slow or down must never surface
 * as an unhandled rejection or a hanging request.
 */
export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  providerName: string;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_INLINE_RETRY_AFTER_SECONDS = 3;

export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const { timeoutMs = 8000, retries = 2, method = 'GET', body, headers = {}, providerName } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const retryAfterSeconds = parseHeaderInt(response.headers.get('retry-after'));

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        // A long Retry-After should not freeze a page for 30-60 seconds. Return
        // control to Couchlist so it can show stale data and honor a cooldown.
        // Very short backoffs are still retried inline.
        if (
          response.status !== 429 ||
          retryAfterSeconds === null ||
          retryAfterSeconds <= MAX_INLINE_RETRY_AFTER_SECONDS
        ) {
          await delay(
            retryAfterSeconds !== null
              ? retryAfterSeconds * 1000
              : backoffMs(attempt),
          );
          continue;
        }
      }

      if (!response.ok) {
        throw new AppError(ERROR_CODES.CL_MEDIA_PROVIDER_ERROR, {
          message: `${providerName} responded ${response.status}`,
          context: {
            providerName,
            status: response.status,
            ...(retryAfterSeconds !== null ? { retryAfterSeconds } : {}),
            ...rateLimitContext(response.headers),
          },
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      if (error instanceof AppError) throw error;

      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt < retries) {
        await delay(backoffMs(attempt));
        continue;
      }

      throw new AppError(
        aborted ? ERROR_CODES.CL_MEDIA_PROVIDER_TIMEOUT : ERROR_CODES.CL_MEDIA_PROVIDER_ERROR,
        {
          message: `${providerName} request failed`,
          context: { providerName, timeoutMs },
          cause: error,
        },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError(ERROR_CODES.CL_MEDIA_PROVIDER_ERROR, {
    message: `${providerName} request failed`,
    context: { providerName },
    cause: lastError,
  });
}

function rateLimitContext(headers: Headers): Record<string, number> {
  const values: Array<[string, string | null]> = [
    ['rateLimitLimit', headers.get('x-ratelimit-limit')],
    ['rateLimitRemaining', headers.get('x-ratelimit-remaining')],
    ['rateLimitReset', headers.get('x-ratelimit-reset')],
  ];
  const output: Record<string, number> = {};
  for (const [key, value] of values) {
    const parsed = parseHeaderInt(value);
    if (parsed !== null) output[key] = parsed;
  }
  return output;
}

function parseHeaderInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function backoffMs(attempt: number): number {
  return Math.min(200 * 2 ** attempt, 2000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
