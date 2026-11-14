/**
 * Small per-device preferences (localStorage), shared through a tiny store so
 * every component sees a change at once. Not part of any case.
 */
import { useSyncExternalStore } from 'react';

export interface Preferences {
  /** Save edits automatically a moment after you stop typing. */
  autosave: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  autosave: true,
};

export const PREFS_KEY = 'trace_prefs';

export function parsePreferences(raw: unknown): Preferences {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    autosave: bool(o.autosave, DEFAULT_PREFERENCES.autosave),
  };
}

function read(): Preferences {
  try {
    return parsePreferences(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let current: Preferences = read();
const listeners = new Set<() => void>();

export const getPreferences = () => current;

export function setPreferences(patch: Partial<Preferences>) {
  current = parsePreferences({ ...current, ...patch });
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: lasts for this session */
  }
  listeners.forEach((l) => l());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
