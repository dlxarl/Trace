/**
 * Appearance: "system" follows the OS, or force "light" / "dark".
 * The choice is stored in localStorage (`trace_theme`) and applied as
 * <html data-theme="light|dark"> (plus the `dark` class), which switches the
 * CSS variables in index.css. index.html applies it before first paint.
 */
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'trace_theme';
const MODES: ThemeMode[] = ['system', 'light', 'dark'];

export function parseThemeMode(v: unknown): ThemeMode {
  return MODES.includes(v as ThemeMode) ? (v as ThemeMode) : 'system';
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

const systemQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function readStoredMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

// ── tiny external store so every component sees the same theme ───────────────
let mode: ThemeMode = readStoredMode();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function currentResolved(): ResolvedTheme {
  return resolveTheme(mode, !!systemQuery()?.matches);
}

/** Writes data-theme / class / colour-scheme on <html> and tells the desktop shell. */
export function applyTheme(): ResolvedTheme {
  const resolved = currentResolved();
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }
  return resolved;
}

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
  applyTheme();
  window.electronAPI?.setTheme?.(next);
  emit();
}

let started = false;
/** Call once at startup: applies the stored theme and follows OS changes in "system" mode. */
export function initTheme() {
  if (started) return;
  started = true;
  applyTheme();
  window.electronAPI?.setTheme?.(mode);
  systemQuery()?.addEventListener?.('change', () => {
    if (mode === 'system') {
      applyTheme();
      emit();
    }
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** { mode, resolved, setMode } — re-renders when either the choice or the OS theme changes. */
export function useTheme() {
  const m = useSyncExternalStore(subscribe, () => mode, () => 'system' as ThemeMode);
  const resolved = useSyncExternalStore(subscribe, currentResolved, () => 'dark' as ResolvedTheme);
  return { mode: m, resolved, setMode: setThemeMode };
}
