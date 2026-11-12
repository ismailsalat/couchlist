'use client';
import { useCallback, useSyncExternalStore } from 'react';
import {
  READER_DEFAULTS,
  normalizeReaderSettings,
  type ReaderSettings,
} from '@couchlist/shared';

const KEY = 'couchlist.reader.settings.v1';

/*
 * localStorage is an external store, so it is read through
 * useSyncExternalStore rather than copied into state inside an effect. That
 * gives the right behaviour in three places at once: the server render uses
 * the defaults so the markup matches, the first client render already has the
 * stored value instead of flashing the defaults for a frame, and a change in
 * another tab arrives on its own.
 *
 * The parsed value is cached against the exact string it came from because
 * getSnapshot must return the same reference when nothing has changed —
 * re-parsing on every call returns a new object each time and React treats
 * that as an endless stream of changes.
 */
let cachedRaw: string | null = null;
let cachedValue: ReaderSettings = READER_DEFAULTS;

const listeners = new Set<() => void>();

function read(): ReaderSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private mode or storage disabled. The defaults are a fine answer.
    raw = null;
  }

  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;

  if (raw === null) {
    cachedValue = READER_DEFAULTS;
    return cachedValue;
  }

  try {
    cachedValue = normalizeReaderSettings(JSON.parse(raw));
  } catch {
    // Hand-edited or truncated JSON. Never let it stop the reader opening.
    cachedValue = READER_DEFAULTS;
  }
  return cachedValue;
}

function serverSnapshot(): ReaderSettings {
  return READER_DEFAULTS;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Fires for other tabs only, which is exactly what it is wanted for.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(next: ReaderSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode: carry on, just without remembering.
  }
  // Notify this tab too — `storage` does not fire in the tab that wrote.
  for (const listener of listeners) listener();
}

/** Reader appearance and behaviour, remembered between visits. */
export function useReaderSettings(): {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(subscribe, read, serverSnapshot);

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    // Normalised on the way in as well as out: a range input sends strings.
    write(normalizeReaderSettings({ ...read(), ...patch }));
  }, []);

  const reset = useCallback(() => write({ ...READER_DEFAULTS }), []);

  return { settings, update, reset };
}
