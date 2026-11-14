import React, { useState, useEffect, useRef } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
import { SaveBadge } from '@/components/common/SaveBadge';
import {
  ProjectData,
  Source,
  SOURCE_TYPES,
  SourceType,
  SOURCE_RELIABILITY,
  INFO_CREDIBILITY,
  admiraltyCode,
  type EvidenceCapture,
  type InfoCredibility,
  type SourceReliability,
} from '@/types';
import { formatBytes } from '@/utils/format';
import { findWaybackSnapshot, waybackSaveUrl } from '@/services/evidence/wayback';
import { MarkdownEditor } from '@/components/common/MarkdownEditor';
import { StatusBadge } from '@/components/common/StatusBadge';
import { isSafeUrl } from '@/utils/url';
import {
  Save,
  Trash2,
  Globe,
  ExternalLink,
  Calendar,
  FileText,
  Link,
  ShieldCheck,
  Bookmark,
  Camera,
  Loader2,
  FolderOpen,
  Archive,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Select } from '@/components/common/Select';

interface SourceEditorProps {
  source: Source;
  projectId?: string;
  projectData: ProjectData;
  onSave: (source: Source, opts?: { auto?: boolean }) => void;
  onDelete: (sourceId: string) => void;
  onOpenRelationship: (relId: string) => void;
  onOpenEntity: (entityId: string) => void;
  isQuickPinned?: boolean;
  onToggleQuickPin?: () => void;
}

export const SourceEditor: React.FC<SourceEditorProps> = ({
  source,
  projectId,
  projectData,
  onSave,
  onDelete,
  onOpenRelationship,
  onOpenEntity,
  isQuickPinned,
  onToggleQuickPin,
}) => {
  const [draft, setDraft] = useState<Source>({ ...source });
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;
  const autoRef = useRef(false);
  const draftIdRef = useRef(source.id);
  useEffect(() => {
    // A save that completes while you keep typing must not overwrite the newer text.
    if (dirtyRef.current && draftIdRef.current === source.id) return;
    draftIdRef.current = source.id;
    setDraft({ ...source });
    setIsDirty(false);
  }, [source]);

  const updateDraft = (updates: Partial<Source>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(draft, { auto: autoRef.current });
    setIsDirty(false);
  };

  useAutosave(isDirty, draft, () => {
    autoRef.current = true;
    handleSave();
    autoRef.current = false;
  });

  // ── Evidence: preserved copies, verification, archive lookup ──────────────
  const evidenceApi = typeof window !== 'undefined' ? window.electronAPI?.evidence : undefined;
  const [capturing, setCapturing] = useState(false);
  const [evidenceMsg, setEvidenceMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [checks, setChecks] = useState<Record<string, { name: string; status: 'ok' | 'modified' | 'missing' }[]>>({});
  const [waybackBusy, setWaybackBusy] = useState(false);
  const captures = draft.captures ?? [];
  const canCapture = !!evidenceApi && !!projectId && !!draft.url && /^https?:\/\//i.test(draft.url.trim());

  /** Saving right away keeps the record of a capture even if the tab is closed. */
  const saveWith = (updates: Partial<Source>) => {
    const next = { ...draft, ...updates };
    setDraft(next);
    onSave(next);
    setIsDirty(false);
  };

  const handleCapture = async () => {
    if (!evidenceApi || !projectId || !draft.url || capturing) return;
    setCapturing(true);
    setEvidenceMsg(null);
    const r = await evidenceApi.capture(projectId, draft.id, draft.url.trim());
    setCapturing(false);
    if (!r.ok) {
      setEvidenceMsg({ tone: 'error', text: r.error });
      return;
    }
    saveWith({ captures: [r.capture, ...captures], accessed_at: r.capture.captured_at });
    setEvidenceMsg(
      r.warnings.length
        ? { tone: 'warn', text: `Captured with warnings: ${r.warnings.join(' ')}` }
        : { tone: 'ok', text: `Captured ${r.capture.files.length} files and recorded their SHA-256 hashes.` },
    );
  };

  const handleVerify = async (c: EvidenceCapture) => {
    if (!evidenceApi || !projectId) return;
    const r = await evidenceApi.verify(projectId, draft.id, c);
    if (r.ok) setChecks((p) => ({ ...p, [c.id]: r.files }));
    else setEvidenceMsg({ tone: 'error', text: r.error });
  };

  const handleWayback = async () => {
    if (!draft.url || waybackBusy) return;
    setWaybackBusy(true);
    setEvidenceMsg(null);
    try {
      const snap = await findWaybackSnapshot(draft.url.trim());
      if (snap) {
        updateDraft({ archive_url: snap.url });
        setEvidenceMsg({ tone: 'ok', text: `Found a Wayback Machine snapshot${snap.timestamp ? ` from ${snap.timestamp.slice(0, 10)}` : ''}. Save the source to keep the link.` });
      } else {
        setEvidenceMsg({ tone: 'warn', text: 'The Wayback Machine has no snapshot of this URL yet. Use “Save page now” to request one.' });
      }
    } catch (err) {
      setEvidenceMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Wayback lookup failed' });
    } finally {
      setWaybackBusy(false);
    }
  };

  // Find relationships that cite this source
  const citingRelationships = projectData.relationships.filter((r) =>
    r.evidence.includes(source.id)
  );

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 h-[40px] shrink-0 flex items-center justify-between pl-4 pr-2 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
        <div className="flex items-center space-x-3">
          <div className="hidden">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10.5px] text-zinc-600">{draft.id}</span>
              <span className="text-xs text-emerald-400 font-mono">[{draft.source_type}]</span>
              {admiraltyCode(draft) && (
                <span className="t-kbd !text-[10px]" title="Admiralty rating: source reliability + information credibility">
                  {admiraltyCode(draft)}
                </span>
              )}
              <SaveBadge dirty={isDirty} />
            </div>
            <h1 className="text-[13.5px] font-semibold text-zinc-50 leading-tight">{draft.title}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onToggleQuickPin && (
            <button
              type="button"
              onClick={onToggleQuickPin}
              className={`px-2.5 py-1.5 flex items-center space-x-1.5 text-xs rounded-md font-medium transition-colors border ${
                isQuickPinned
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-[var(--t-raised)] text-obsidian-dim hover:text-white hover:bg-white/5 border-obsidian-border'
              }`}
              title={isQuickPinned ? 'Remove from Global Quick Access' : 'Pin to Global Quick Access'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isQuickPinned ? 'fill-current text-zinc-200' : ''}`} />
              <span>{isQuickPinned ? 'In Quick Access' : 'Quick Access'}</span>
            </button>
          )}

          {draft.url && isSafeUrl(draft.url) && (
            <a
              href={draft.url}
              target="_blank"
              rel="noopener noreferrer"
              className="t-icon-btn"
              title="Open URL in Browser"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className={`t-btn ${
              isDirty
                ? 't-btn-primary'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Source</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="t-icon-btn hover:!text-rose-400"
            title="Delete Source"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 max-w-[980px] w-full space-y-5">
        {/* Source Metadata Card */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Source Title *
              </label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                className="t-input"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Source Type *
              </label>
              <Select
                value={draft.source_type}
                onChange={(e) => updateDraft({ source_type: e.target.value as SourceType })}
                className="t-input"
              >
                {SOURCE_TYPES.map((st) => (
                  <option key={st.type} value={st.type} className="bg-[var(--t-raised)]">
                    {st.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                URL / Archive Link
              </label>
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={draft.url || ''}
                  onChange={(e) => updateDraft({ url: e.target.value })}
                  placeholder="https://..."
                  className="t-input flex-1"
                />
                {draft.url && (
                  <a
                    href={draft.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t-btn !px-1.5 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Accessed / Archived At
              </label>
              <input
                type="text"
                value={draft.accessed_at}
                onChange={(e) => updateDraft({ accessed_at: e.target.value })}
                className="t-input font-mono"
              />
            </div>
          </div>
          {/* Admiralty rating */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Source reliability</label>
              <Select value={draft.reliability ?? ''} onChange={(e) => updateDraft({ reliability: (e.target.value || undefined) as SourceReliability | undefined })} className="t-input">
                <option value="">Not rated</option>
                {SOURCE_RELIABILITY.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Information credibility</label>
              <Select value={draft.credibility ?? ''} onChange={(e) => updateDraft({ credibility: (e.target.value || undefined) as InfoCredibility | undefined })} className="t-input">
                <option value="">Not rated</option>
                {INFO_CREDIBILITY.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Archived copy */}
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Archived copy (Wayback Machine or other archive)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={draft.archive_url || ''}
                onChange={(e) => updateDraft({ archive_url: e.target.value || undefined })}
                placeholder="https://web.archive.org/web/…"
                className="t-input flex-1"
              />
              {draft.archive_url && isSafeUrl(draft.archive_url) && (
                <a href={draft.archive_url} target="_blank" rel="noopener noreferrer" className="t-btn !px-1.5 shrink-0" title="Open archived copy">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                className="t-btn shrink-0"
                disabled={!draft.url || !isSafeUrl(draft.url) || waybackBusy}
                onClick={handleWayback}
                title="Look up the closest snapshot on archive.org (sends this URL to archive.org)"
              >
                {waybackBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 opacity-70" />}
                Find in Wayback
              </button>
              {draft.url && isSafeUrl(draft.url) && (
                <a href={waybackSaveUrl(draft.url.trim())} target="_blank" rel="noopener noreferrer" className="t-btn shrink-0" title="Ask the Wayback Machine to archive this page (opens archive.org)">
                  Save page now
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Preserved copies */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="t-label !text-zinc-400">Preserved copies ({captures.length})</h2>
            <div className="flex-1" />
            {evidenceApi ? (
              <button
                type="button"
                className="t-btn"
                disabled={!canCapture || capturing}
                onClick={handleCapture}
                title={canCapture ? 'Save a screenshot, PDF and MHTML of this page with SHA-256 hashes. Also saves the source.' : 'Enter an http(s) URL first'}
              >
                {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 opacity-70" />}
                {capturing ? 'Capturing…' : 'Capture page'}
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">Capturing pages is available in the desktop app</span>
            )}
          </div>
          {evidenceMsg && (
            <div
              className={`px-2.5 py-1.5 rounded-[3px] border text-[11.5px] ${
                evidenceMsg.tone === 'error'
                  ? 'border-rose-500/30 text-rose-300'
                  : evidenceMsg.tone === 'warn'
                    ? 'border-amber-500/30 text-amber-300'
                    : 'border-emerald-500/30 text-emerald-300'
              }`}
            >
              {evidenceMsg.text}
            </div>
          )}
          {captures.length === 0 && (
            <p className="text-[11.5px] text-zinc-500">
              No preserved copy yet. Pages change and disappear — a capture keeps a screenshot, a PDF and a full MHTML archive with hashes that prove
              they were not altered.
            </p>
          )}
          {captures.map((c) => {
            const check = checks[c.id];
            const bad = check?.filter((f) => f.status !== 'ok') ?? [];
            return (
              <div key={c.id} className="rounded-[3px] border border-[var(--t-border)] bg-[var(--t-panel)]">
                <div className="flex items-center gap-2 px-2.5 h-[30px]">
                  <span className="font-mono text-[11px] text-zinc-300">{c.captured_at.replace('T', ' ').slice(0, 19)} UTC</span>
                  {c.title && <span className="text-[11.5px] text-zinc-500 truncate">{c.title}</span>}
                  <div className="flex-1" />
                  {check &&
                    (bad.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <Check className="w-3 h-3" /> Intact
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertTriangle className="w-3 h-3" /> {bad.map((f) => `${f.name} ${f.status}`).join(', ')}
                      </span>
                    ))}
                  {evidenceApi && projectId && (
                    <>
                      <button type="button" className="t-btn !h-[22px]" onClick={() => handleVerify(c)} title="Re-hash the files and compare with the recorded SHA-256">
                        <ShieldCheck className="w-3 h-3 opacity-70" />
                        Verify
                      </button>
                      <button type="button" className="t-icon-btn !w-6 !h-6" onClick={() => evidenceApi.open(projectId, draft.id, c.id)} title="Show files in folder">
                        <FolderOpen />
                      </button>
                    </>
                  )}
                </div>
                {c.final_url && c.final_url !== c.url && (
                  <div className="px-2.5 pb-1 text-[11px] text-zinc-500 truncate">Redirected to {c.final_url}</div>
                )}
                {c.files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 px-2.5 h-[24px] border-t border-[var(--t-border-subtle)] text-[11px]">
                    {evidenceApi && projectId ? (
                      <button type="button" className="text-[var(--t-accent)] hover:underline w-[108px] text-left shrink-0" onClick={() => evidenceApi.open(projectId, draft.id, c.id, f.name)}>
                        {f.name}
                      </button>
                    ) : (
                      <span className="text-zinc-300 w-[108px] shrink-0">{f.name}</span>
                    )}
                    <span className="font-mono text-zinc-500 w-[64px] shrink-0 tabular-nums">{formatBytes(f.bytes)}</span>
                    <span className="font-mono text-[10.5px] text-zinc-500 truncate select-text" title={`SHA-256 ${f.sha256}`}>
                      sha256 {f.sha256}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Markdown Extract & Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-label !text-zinc-400">Source Content & Extract</h2>
            </div>
          </div>
          <MarkdownEditor
            value={draft.markdownBody}
            onChange={(val) => updateDraft({ markdownBody: val })}
            onWikilinkClick={(target) => {
              const ent = projectData.entities.find((e) => e.id === target || e.name === target);
              if (ent) onOpenEntity(ent.id);
            }}
          />
        </div>

        {/* Citations in Investigation */}
        <div className="border-t border-[var(--t-border)] pt-3 space-y-3">
          <h2 className="t-label !text-zinc-400 border-b border-obsidian-border pb-2">
            Cited as Evidence in Relationships ({citingRelationships.length})
          </h2>
          {citingRelationships.length > 0 ? (
            <div className="space-y-2">
              {citingRelationships.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => onOpenRelationship(rel.id)}
                  className="p-2.5 bg-[var(--t-panel)] hover:bg-obsidian-hover border border-obsidian-border rounded cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div className="truncate mr-3">
                    <span className="font-mono text-xs text-purple-300 font-medium">
                      {rel.type}
                    </span>{' '}
                    <span className="text-xs text-obsidian-muted">
                      ({rel.source_entity} → {rel.target_entity})
                    </span>
                  </div>
                  <StatusBadge status={rel.status} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-obsidian-dim italic">
              This source is not cited as evidence by any relationships yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
