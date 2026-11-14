/**
 * Tracks whether any open editor has unsaved edits and when something was last
 * saved, so the status bar and editors can show one consistent state.
 */
import { useSyncExternalStore } from 'react';

interface Snapshot {
  dirty: number;
  lastSavedAt: number | null;
}

const dirtyIds = new Set<string>();
let lastSavedAt: number | null = null;
let snap: Snapshot = { dirty: 0, lastSavedAt: null };
const listeners = new Set<() => void>();

function publish() {
  snap = { dirty: dirtyIds.size, lastSavedAt };
  listeners.forEach((l) => l());
}

export function setDirty(id: string, dirty: boolean) {
  const had = dirtyIds.has(id);
  if (dirty === had) return;
  if (dirty) dirtyIds.add(id);
  else dirtyIds.delete(id);
  publish();
}

export function markSaved(now = Date.now()) {
  lastSavedAt = now;
  publish();
}

export function resetSaveStatus() {
  dirtyIds.clear();
  lastSavedAt = null;
  publish();
}

export function useSaveStatus(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => snap,
  );
}

/** Text for the current state; `null` when there is nothing to say. */
export function describeSave(s: Snapshot, autosave: boolean, now = Date.now()): { tone: 'dirty' | 'saved' | 'idle'; text: string } {
  if (s.dirty > 0) return { tone: 'dirty', text: autosave ? 'Saving…' : s.dirty > 1 ? `${s.dirty} unsaved changes` : 'Unsaved changes' };
  if (s.lastSavedAt) {
    const ago = now - s.lastSavedAt;
    if (ago < 5000) return { tone: 'saved', text: 'Saved' };
    return { tone: 'idle', text: `Saved ${new Date(s.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` };
  }
  return { tone: 'idle', text: autosave ? 'Autosave on' : 'Autosave off' };
}
