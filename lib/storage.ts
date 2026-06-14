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

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — fail silently, app still works in-memory */
  }
}

/**
 * localStorage-backed state. Starts from `initial` on the server and during the
 * first client render (avoids hydration mismatch), then hydrates on mount.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(read<T>(key, initial));
    setHydrated(true);
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
