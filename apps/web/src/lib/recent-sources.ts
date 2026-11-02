/**
 * Recently viewed sources, kept on the device.
 *
 * localStorage, not the database: a browsing history is the sort of thing that
 * should not become a server-side record of what somebody reads. It is capped,
 * and the reader can erase it.
 *
 * Every access is wrapped: storage throws in private modes and when a quota is
 * full, and a convenience feature must never break the page.
 */

const STORAGE_KEY = 'couchlist.recent-sources.v1';
const MAX_ENTRIES = 12;

export interface RecentSource {
  id: string;
  name: string;
  /** Epoch milliseconds, so the list can be ordered without parsing. */
  at: number;
}

/**
 * Cached snapshot.
 *
 * `useSyncExternalStore` compares snapshots by reference, so parsing storage
 * on every call would loop forever. The parsed array is cached and replaced
 * only when the stored string actually changes.
 */
let cachedRaw: string | null = null;
let cachedValue: RecentSource[] = [];

const EMPTY: RecentSource[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToRecentSources(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab writing to storage should update this one too.
  if (typeof window !== 'undefined') window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', listener);
  };
}

/** Referentially stable between changes, so it is safe as a store snapshot. */
export function recentSourcesSnapshot(): RecentSource[] {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = readRecentSources();
  return cachedValue;
}

/** The server has no local history, so it renders none. */
export function recentSourcesServerSnapshot(): RecentSource[] {
  return EMPTY;
}

export function readRecentSources(): RecentSource[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is RecentSource =>
          Boolean(entry) &&
          typeof (entry as RecentSource).id === 'string' &&
          typeof (entry as RecentSource).name === 'string' &&
          typeof (entry as RecentSource).at === 'number',
      )
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function recordRecentSource(source: { id: string; name: string }): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readRecentSources().filter((entry) => entry.id !== source.id);
    const next = [{ id: source.id, name: source.name, at: Date.now() }, ...existing].slice(
      0,
      MAX_ENTRIES,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  } catch {
    // Private browsing or a full quota. Not worth surfacing.
  }
}

export function clearRecentSources(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    notify();
  } catch {
    // Nothing to do.
  }
}
