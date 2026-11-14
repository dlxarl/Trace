import { useEffect, useId, useRef } from 'react';
import { setDirty } from '@/services/saveStatus';
import { usePreferences } from '@/services/preferences';

/**
 * Calls `save` shortly after the draft stops changing while it is dirty.
 * `version` must change on every edit (pass the draft object). The latest
 * `save` is always used, so no stale closure is ever saved.
 */
export function useAutosave(isDirty: boolean, version: unknown, save: () => void, delayMs = 1200) {
  const { autosave } = usePreferences();
  const id = useId();
  useEffect(() => {
    setDirty(id, isDirty);
    return () => setDirty(id, false);
  }, [id, isDirty]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!autosave || !isDirty) return;
    const t = setTimeout(() => saveRef.current(), delayMs);
    return () => clearTimeout(t);
  }, [autosave, isDirty, version, delayMs]);
}
