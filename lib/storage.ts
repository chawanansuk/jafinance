'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Transaction } from './types';

// Bump when the persisted shape changes; old keys are ignored, not crashed on.
const VERSION = 'v1';
const PREFIX = `jafinance:${VERSION}:`;

export const KEYS = {
  overrides: `${PREFIX}overrides`,
  budget: `${PREFIX}budget`,
  imported: `${PREFIX}imported`,
  rules: `${PREFIX}rules`,
  settings: `${PREFIX}settings`,
  statements: `${PREFIX}statements`,
  theme: `${PREFIX}theme`,
  aiKey: `${PREFIX}aiKey`,
  aiModel: `${PREFIX}aiModel`,
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Fired on window when a localStorage write fails (quota / private mode). */
export const STORAGE_ERROR_EVENT = 'jafinance:storage-error';

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode — the app keeps working in-memory, but everything
    // since this write is lost on reload. AppShell listens for this event and
    // shows a persistent warning so the failure is never silent.
    window.dispatchEvent(new Event(STORAGE_ERROR_EVENT));
  }
}

/**
 * localStorage-backed state. Starts from `initial` on the server and during the
 * first client render (avoids hydration mismatch), then hydrates on mount.
 * Also follows `storage` events so a write in another tab updates this tab
 * instead of being silently overwritten by our next stale write.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(read<T>(key, initial));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage || e.key !== key) return;
      try {
        setValue(e.newValue != null ? (JSON.parse(e.newValue) as T) : initial);
      } catch {
        /* malformed external write — keep current state */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        write(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set, hydrated] as const;
}

export type ImportedStore = Transaction[];

export function loadImported(): ImportedStore {
  return read<ImportedStore>(KEYS.imported, []);
}
