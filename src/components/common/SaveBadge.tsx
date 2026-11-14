import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { usePreferences } from '@/services/preferences';
import { useSaveStatus } from '@/services/saveStatus';

/** Next to an editor's title: Saving… / Unsaved changes while dirty, Saved for a few seconds after. */
export const SaveBadge: React.FC<{ dirty: boolean }> = ({ dirty }) => {
  const { autosave } = usePreferences();
  const { lastSavedAt } = useSaveStatus();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt || Date.now() - lastSavedAt >= 4000) return;
    const t = setTimeout(() => tick((n) => n + 1), 4100 - (Date.now() - lastSavedAt));
    return () => clearTimeout(t);
  }, [lastSavedAt]);
  if (dirty) {
    return (
      <span className="text-[10.5px] text-amber-400 shrink-0" role="status">
        {autosave ? 'Saving…' : 'Unsaved changes'}
      </span>
    );
  }
  if (lastSavedAt && Date.now() - lastSavedAt < 4000) {
    return (
      <span className="text-[10.5px] text-emerald-400 shrink-0 inline-flex items-center gap-1" role="status">
        <Check className="w-3 h-3" /> Saved
      </span>
    );
  }
  return null;
};
