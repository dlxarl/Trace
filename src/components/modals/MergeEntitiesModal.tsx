import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/common/Dialog';
import { EntityIcon, getEntityTypeColor, getEntityTypeLabel } from '@/components/common/EntityIcon';
import type { ProjectData } from '@/types';
import { findDuplicateCandidates, planMerge } from '@/services/merge/mergeEntities';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData | null;
  /** The entity the dialog was opened from. */
  entityId: string | null;
  /** Entities already chosen elsewhere (e.g. selected in Records); used instead of the best guess. */
  preselect?: string[];
  onConfirm: (keepId: string, mergeIds: string[]) => Promise<void>;
}

/** Merge duplicate entities into one: pick the others, pick which one survives, preview, confirm. */
export const MergeEntitiesModal: React.FC<Props> = ({ isOpen, onClose, projectData, entityId, preselect, onConfirm }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [keepId, setKeepId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !projectData || !entityId) return;
    const likely = findDuplicateCandidates(projectData, entityId).map((c) => c.entity.id);
    const chosen = (preselect ?? []).filter((id) => id !== entityId && projectData.entities.some((e) => e.id === id));
    setPicked(new Set(chosen.length ? chosen : likely.slice(0, 1))); // the user's selection, else the best guess; the user confirms
    setKeepId(entityId);
    setQuery('');
    setError('');
    setBusy(false);
  }, [isOpen, entityId, projectData?.project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo(() => (projectData && entityId ? findDuplicateCandidates(projectData, entityId) : []), [projectData, entityId]);
  const reasons = useMemo(() => new Map(candidates.map((c) => [c.entity.id, c.reason])), [candidates]);
  const current = projectData?.entities.find((e) => e.id === entityId);
  const q = query.trim().toLowerCase();
  const others = useMemo(() => {
    if (!projectData || !entityId) return [];
    return projectData.entities
      .filter((e) => e.id !== entityId && (!q || e.name.toLowerCase().includes(q) || (e.aliases || []).some((a) => a.toLowerCase().includes(q))))
      .sort((a, b) => Number(reasons.has(b.id)) - Number(reasons.has(a.id)) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [projectData, entityId, q, reasons]);

  const group = useMemo(() => (entityId ? [entityId, ...picked] : []), [entityId, picked]);
  const plan = useMemo(() => {
    if (!projectData || picked.size === 0 || !group.includes(keepId)) return null;
    try {
      return planMerge(projectData, keepId, group.filter((id) => id !== keepId));
    } catch {
      return null;
    }
  }, [projectData, picked, group, keepId]);

  if (!projectData || !current) return null;
  const nameOf = (id: string) => projectData.entities.find((e) => e.id === id)?.name ?? id;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      if (!n.has(keepId) && keepId !== entityId) setKeepId(entityId!);
      return n;
    });

  const confirm = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(keepId, group.filter((id) => id !== keepId));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Merge entities"
      subtitle={current.name}
      width={620}
      footer={
        <>
          <button type="button" className="t-btn mr-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="t-btn t-btn-primary" disabled={!plan || busy} onClick={confirm}>
            {busy ? 'Merging…' : plan ? `Merge ${plan.merged.length + 1} into “${nameOf(keepId)}”` : 'Merge'}
          </button>
        </>
      }
    >
      <div className="px-3 py-2 text-[11.5px] text-zinc-400 border-b border-[var(--t-border-subtle)]">
        Combine records of the same person, company or asset. Names become aliases, relationships move to the entity you keep, duplicate relationships are
        folded together with all their evidence, and nothing is discarded silently.
      </div>
      <div className="px-3 py-2 border-b border-[var(--t-border-subtle)]">
        <input className="t-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find entities to merge with…" spellCheck={false} aria-label="Find entities" />
      </div>
      <div className="max-h-[240px] overflow-y-auto border-b border-[var(--t-border-subtle)]">
        {others.length === 0 && <div className="px-3 py-3 text-zinc-500">No matching entities.</div>}
        {others.map((o) => (
          <label key={o.id} className="flex items-center gap-2 px-3 h-[28px] hover:bg-[var(--t-hover)]">
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
            <span style={{ color: getEntityTypeColor(o.type) }} className="shrink-0">
              <EntityIcon type={o.type} className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 min-w-0 truncate text-zinc-200">{o.name}</span>
            {reasons.has(o.id) && <span className="text-[10.5px] text-amber-400 shrink-0">possible duplicate · {reasons.get(o.id)}</span>}
            <span className="text-[10.5px] text-zinc-600 shrink-0">{getEntityTypeLabel(o.type)}</span>
          </label>
        ))}
      </div>
      {picked.size > 0 && (
        <div className="px-3 py-2.5 space-y-2">
          <div className="t-label">Keep which one?</div>
          <div role="radiogroup" className="space-y-1">
            {group.map((id) => (
              <label key={id} className={`flex items-center gap-2 px-2.5 h-[28px] rounded-[3px] border ${keepId === id ? 'border-[var(--t-accent)] bg-[var(--t-active)]' : 'border-[var(--t-border)]'}`}>
                <input type="radio" name="keep" checked={keepId === id} onChange={() => setKeepId(id)} />
                <span className="text-zinc-100 truncate flex-1">{nameOf(id)}</span>
                <span className="font-mono text-[10.5px] text-zinc-600">{id}</span>
              </label>
            ))}
          </div>
          {plan && (
            <div className="text-[11.5px] text-zinc-400 leading-relaxed">
              <div>
                {plan.stats.rewired} relationship(s) move to the kept entity
                {plan.stats.folded > 0 && `, ${plan.stats.folded} duplicate(s) are folded together`}
                {plan.stats.selfLoops > 0 && `, ${plan.stats.selfLoops} link(s) between the merged entities are removed`}.
              </div>
              {plan.addedAliases.length > 0 && <div>New aliases: {plan.addedAliases.join(', ')}</div>}
              {plan.savedNotes.length > 0 && <div>{plan.savedNotes.length} note(s) have their [[links]] updated.</div>}
              {plan.conflicts.length > 0 && (
                <div className="text-amber-400">
                  {plan.conflicts.length} attribute value(s) differ; the kept value stays and the others are written into the entity’s notes:{' '}
                  {plan.conflicts.map((c) => `${c.key}`).join(', ')}.
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && <div className="mx-3 mb-2 px-2.5 py-2 rounded-[3px] border border-rose-500/30 text-rose-300 text-[11.5px]">{error}</div>}
    </Dialog>
  );
};
