import 'server-only';
import { AppError } from '@couchlist/shared';

/**
 * In-memory sliding-window rate limiter.
 *
 * Per-process, which is the right trade for a single Railway instance. It is
 * keyed by user id where possible so one noisy account cannot spend everyone
 * else's budget, and it protects AniList/TMDB as much as it protects us.
 */
interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();

export function checkRateLimit(key: string, limitPerMinute: number): void {
  const now = Date.now();
  const cutoff = now - 60_000;

  const window = windows.get(key) ?? { hits: [] };
  window.hits = window.hits.filter((time) => time > cutoff);

  if (window.hits.length >= limitPerMinute) {
    const oldest = window.hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
    windows.set(key, window);
    throw AppError.rateLimited(retryAfter);
  }

  window.hits.push(now);
  windows.set(key, window);
}

/** Test helper - never called in production code. */
export function resetRateLimits(): void {
  windows.clear();
}

/** Keeps the map from growing without bound on a long-running process. */
export function pruneRateLimits(): void {
  const cutoff = Date.now() - 60_000;
  for (const [key, window] of windows) {
    window.hits = window.hits.filter((time) => time > cutoff);
    if (window.hits.length === 0) windows.delete(key);
  }
}
