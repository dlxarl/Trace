import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Camera, FolderOpen, History, RotateCcw, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { Toggle } from '@/components/common/Toggle';
import type { BackupInfo, FileChange, SnapshotInfo } from '@/types';
import { formatBytes } from '@/utils/format';
import { collapseDiff, lineDiff } from '@/services/diff/lineDiff';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  /** Reload the case after something was restored. */
  onRestored: (message: string, openProjectId?: string) => void;
}

type Tab = 'history' | 'backups';
const REASON: Record<string, string> = {
  auto: 'Automatic',
  manual: 'Saved by you',
  'before-restore': 'Before a restore',
  'before-merge': 'Before a merge',
  'before-delete': 'Before a delete',
  import: 'Import',
  other: '',
};
const STATUS_STYLE: Record<FileChange['status'], string> = { added: 'text-emerald-400', removed: 'text-rose-400', modified: 'text-amber-400' };
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};
const KIND: Record<string, string> = { entities: 'entity', relationships: 'link', sources: 'source', notes: 'note' };
const kindOf = (p: string) => (p === 'project.md' ? 'case' : p === 'graph-layout.json' ? 'layout' : (KIND[p.split('/')[0]] ?? p.split('/')[0]));

export const HistoryModal: React.FC<Props> = ({ isOpen, onClose, projectId, projectName, onRestored }) => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const history = api?.history;
  const backups = api?.backups;
  const [tab, setTab] = useState<Tab>('history');
  const [snaps, setSnaps] = useState<SnapshotInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'previous' | 'current'>('previous');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileText, setFileText] = useState<{ snapshot: string | null; now: string | null } | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [list, setList] = useState<BackupInfo[]>([]);
  const [settings, setSettings] = useState<{ enabled: boolean; intervalMin: number; keep: number } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'snapshot' | 'backup'; id: string } | null>(null);

  const loadSnaps = useCallback(async () => {
    if (!history || !projectId) return;
    const l = await history.list(projectId);
    setSnaps(l);
    setSelected((cur) => (cur && l.some((s) => s.id === cur) ? cur : (l[0]?.id ?? null)));
  }, [history, projectId]);
  const loadBackups = useCallback(async () => {
    if (!backups || !projectId) return;
    setList(await backups.list(projectId));
    setSettings(await backups.getSettings());
  }, [backups, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    setMsg(null);
    setConfirm(null);
    void loadSnaps();
    void loadBackups();
  }, [isOpen, loadSnaps, loadBackups]);

  useEffect(() => {
    setOpenFile(null);
    setFileText(null);
    if (!history || !projectId || !selected) {
      setChanges([]);
      return;
    }
    let live = true;
    history.changes(projectId, selected, mode).then((c) => live && setChanges(c)).catch(() => live && setChanges([]));
    return () => {
      live = false;
    };
  }, [history, projectId, selected, mode]);

  const showFile = async (p: string) => {
    if (!history || !projectId || !selected) return;
    setOpenFile(p);
    setFileText(await history.file(projectId, selected, p));
  };

  const diff = useMemo(() => {
    if (!fileText) return null;
    // "previous": compare with the version before; "current": compare what the case has now with the snapshot.
    return collapseDiff(lineDiff(fileText.now ?? '', fileText.snapshot ?? ''));
  }, [fileText]);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ tone: 'ok', text });
    } catch (e: any) {
      setMsg({ tone: 'error', text: e?.message || 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  if (!api || !history || !backups) {
    return (
      <Dialog isOpen={isOpen} onClose={onClose} title="History & backups" width={460}>
        <div className="px-4 py-4 text-[11.5px] text-zinc-400 leading-relaxed">
          Version history and backups are kept on disk by the desktop app. In the browser, use <span className="text-zinc-200">Settings → Export</span> to save a copy of the case.
        </div>
      </Dialog>
    );
  }

  const sel = snaps.find((s) => s.id === selected);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="History & backups"
      subtitle={projectName}
      width={760}
      footer={
        <>
          <span className="mr-auto text-[11px] text-zinc-500">Stored in <span className="font-mono">.trace/</span> next to your cases. Removing a case permanently also removes these.</span>
          <button type="button" className="t-btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="flex h-8 border-b border-[var(--t-border)] px-2 gap-1 items-end shrink-0">
        {([['history', 'Version history', History], ['backups', 'Backups', Archive]] as const).map(([id, name, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 h-7 text-[11.5px] flex items-center gap-1.5 border-b-2 ${tab === id ? 'border-[var(--t-accent)] text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {name}
          </button>
        ))}
      </div>

      {msg && (
        <div role="status" className={`mx-3 mt-2 px-2.5 py-1.5 rounded-[3px] text-[11.5px] border ${msg.tone === 'ok' ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>
          {msg.text}
        </div>
      )}

      {tab === 'history' && (
        <div className="p-3 space-y-3">
          <p className="text-[11.5px] text-zinc-500 leading-relaxed">
            TRACE saves a version of the case a few seconds after you stop editing. Pick a version to see what changed, look at one file, or go back to it. Going back first saves the current state, so it can be undone.
          </p>
          <div className="flex items-center gap-2">
            <input className="t-input flex-1" placeholder="Name this moment (optional), e.g. “before interviews”" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
            <button
              type="button"
              className="t-btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await history.snapshot(projectId!, label);
                  setLabel('');
                  await loadSnaps();
                  if (r) setSelected(r.id);
                  return 'Version saved';
                })
              }
            >
              <Camera className="w-3.5 h-3.5 opacity-70" />
              Save version now
            </button>
          </div>

          {snaps.length === 0 ? (
            <div className="text-[11.5px] text-zinc-500 py-6 text-center">No versions yet. They appear after the first edit.</div>
          ) : (
            <div className="grid grid-cols-[250px_1fr] gap-3 min-h-[260px]">
              <ul className="border border-[var(--t-border)] rounded-[3px] overflow-y-auto max-h-[330px] divide-y divide-[var(--t-border)]" aria-label="Versions">
                {snaps.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.id)}
                      className={`w-full text-left px-2.5 py-1.5 ${selected === s.id ? 'bg-[var(--t-active)]' : 'hover:bg-[var(--t-hover)]'}`}
                    >
                      <div className="text-[11.5px] text-zinc-100 truncate">{s.label || REASON[s.reason] || 'Version'}</div>
                      <div className="text-[10.5px] text-zinc-500">{when(s.at)}</div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0 space-y-2">
                {sel && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex border border-[var(--t-border)] rounded-[3px] overflow-hidden h-[24px]">
                        {([['previous', 'What this version changed'], ['current', 'Difference from now']] as const).map(([id, name]) => (
                          <button key={id} type="button" onClick={() => setMode(id)} className={`px-2.5 text-[11px] border-l border-[var(--t-border)] first:border-l-0 ${mode === id ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
                            {name}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1" />
                      {confirm?.kind === 'snapshot' && confirm.id === sel.id ? (
                        <>
                          <span className="text-[11px] text-zinc-400">Go back to this version?</span>
                          <button
                            type="button"
                            className="t-btn t-btn-primary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const r = await history.restore(projectId!, sel.id);
                                setConfirm(null);
                                await loadSnaps();
                                onRestored(`Went back to ${when(sel.at)} · ${r.restored} files`);
                                return `Done. The state before is saved as a version too.`;
                              })
                            }
                          >
                            Yes, go back
                          </button>
                          <button type="button" className="t-btn" onClick={() => setConfirm(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className="t-btn" onClick={() => setConfirm({ kind: 'snapshot', id: sel.id })}>
                          <RotateCcw className="w-3.5 h-3.5 opacity-70" />
                          Go back to this version
                        </button>
                      )}
                    </div>
                    <div className="border border-[var(--t-border)] rounded-[3px] max-h-[150px] overflow-y-auto">
                      {changes.length === 0 ? (
                        <div className="px-2.5 py-3 text-[11.5px] text-zinc-500">{mode === 'previous' ? 'Nothing changed compared with the version before.' : 'Identical to the current case.'}</div>
                      ) : (
                        <ul className="divide-y divide-[var(--t-border)]">
                          {changes.map((c) => (
                            <li key={c.path}>
                              <button type="button" onClick={() => showFile(c.path)} className={`w-full text-left px-2.5 py-1 flex items-center gap-2 hover:bg-[var(--t-hover)] ${openFile === c.path ? 'bg-[var(--t-active)]' : ''}`}>
                                <span className={`text-[10.5px] w-[58px] ${STATUS_STYLE[mode === 'current' ? (c.status === 'added' ? 'removed' : c.status === 'removed' ? 'added' : 'modified') : c.status]}`}>
                                  {mode === 'current' ? (c.status === 'added' ? 'now missing' : c.status === 'removed' ? 'now extra' : 'differs') : c.status}
                                </span>
                                <span className="text-[10.5px] text-zinc-500 w-[56px]">{kindOf(c.path)}</span>
                                <span className="text-[11.5px] text-zinc-200 truncate">{c.label || c.path}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {openFile && diff && (
                      <pre className="border border-[var(--t-border)] rounded-[3px] bg-[var(--t-bg)] max-h-[170px] overflow-auto text-[10.5px] leading-[1.5] font-mono p-1.5" aria-label={`Changes in ${openFile}`}>
                        {diff.map((l, i) =>
                          l.kind === 'gap' ? (
                            <div key={i} className="text-zinc-600">⋯ {l.hidden} unchanged line(s)</div>
                          ) : (
                            <div key={i} className={l.kind === 'add' ? 'text-emerald-400' : l.kind === 'del' ? 'text-rose-400' : 'text-zinc-500'}>
                              {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}
                              {l.text}
                            </div>
                          ),
                        )}
                      </pre>
                    )}
                    {mode === 'current' && openFile && <div className="text-[10.5px] text-zinc-600">− is in the case now, + is in this version.</div>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'backups' && settings && (
        <div className="p-3 space-y-3">
          <p className="text-[11.5px] text-zinc-500 leading-relaxed">
            A backup is a .zip of the whole case, including preserved web pages. Unlike versions, backups are meant for disasters: a deleted folder, a disk problem, or moving to another computer.
          </p>
          <div className="border border-[var(--t-border)] rounded-[4px] divide-y divide-[var(--t-border)]">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1">
                <div className="text-[12px] text-zinc-100">Automatic backups</div>
                <div className="text-[11px] text-zinc-500">Only when the case changed since the last one. Older automatic backups are removed.</div>
              </div>
              <Toggle on={settings.enabled} onClick={() => run(async () => void setSettings(await backups.setSettings({ ...settings, enabled: !settings.enabled })))} />
            </div>
            <div className="flex items-center gap-3 px-3 py-2">
              <label className="flex-1 text-[12px] text-zinc-100" htmlFor="bk-int">
                Back up at most every
              </label>
              <input
                id="bk-int"
                type="number"
                min={5}
                max={1440}
                className="t-input w-[70px] text-right"
                value={settings.intervalMin}
                onChange={(e) => setSettings({ ...settings, intervalMin: Number(e.target.value) })}
                onBlur={() => run(async () => void setSettings(await backups.setSettings(settings)))}
              />
              <span className="text-[11px] text-zinc-500 w-[44px]">minutes</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2">
              <label className="flex-1 text-[12px] text-zinc-100" htmlFor="bk-keep">
                Keep the latest
              </label>
              <input
                id="bk-keep"
                type="number"
                min={1}
                max={100}
                className="t-input w-[70px] text-right"
                value={settings.keep}
                onChange={(e) => setSettings({ ...settings, keep: Number(e.target.value) })}
                onBlur={() => run(async () => void setSettings(await backups.setSettings(settings)))}
              />
              <span className="text-[11px] text-zinc-500 w-[44px]">backups</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="t-btn t-btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await backups.create(projectId!);
                  await loadBackups();
                  return `Backup created (${formatBytes(r.info.bytes)})${r.skipped.length ? ` · ${r.skipped.length} very large file(s) skipped` : ''}`;
                })
              }
            >
              <Archive className="w-3.5 h-3.5" />
              Back up now
            </button>
            <button type="button" className="t-btn" onClick={() => void backups.reveal(projectId!)}>
              <FolderOpen className="w-3.5 h-3.5 opacity-70" />
              Show folder
            </button>
          </div>

          {list.length === 0 ? (
            <div className="text-[11.5px] text-zinc-500 py-4 text-center">No backups yet.</div>
          ) : (
            <ul className="border border-[var(--t-border)] rounded-[3px] divide-y divide-[var(--t-border)] max-h-[240px] overflow-y-auto" aria-label="Backups">
              {list.map((b) => (
                <li key={b.id} className="px-2.5 py-1.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] text-zinc-100">{when(b.at)}</div>
                    <div className="text-[10.5px] text-zinc-500">{REASON[b.reason] || b.reason} · {formatBytes(b.bytes)}</div>
                  </div>
                  {confirm?.kind === 'backup' && confirm.id === b.id ? (
                    <>
                      <span className="text-[11px] text-zinc-400">Replace the case with this backup?</span>
                      <button
                        type="button"
                        className="t-btn t-btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await backups.restore(projectId!, b.id, 'replace');
                            setConfirm(null);
                            await loadBackups();
                            onRestored(`Case restored from backup ${when(b.at)}`);
                            return 'Restored. The state before is saved as a backup too.';
                          })
                        }
                      >
                        Replace
                      </button>
                      <button type="button" className="t-btn" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="t-btn"
                        disabled={busy}
                        title="Creates a new case from this backup and leaves the current one untouched"
                        onClick={() =>
                          run(async () => {
                            const r = await backups.restore(projectId!, b.id, 'copy');
                            onRestored(`Restored as a new case "${r.id}"`, r.id);
                            return `Restored as a new case “${r.id}”.`;
                          })
                        }
                      >
                        Restore as copy
                      </button>
                      <button type="button" className="t-btn" disabled={busy} onClick={() => setConfirm({ kind: 'backup', id: b.id })}>
                        Replace case
                      </button>
                      <button type="button" className="t-icon-btn" title="Delete this backup" onClick={() => run(async () => { await backups.remove(projectId!, b.id); await loadBackups(); })}>
                        <Trash2 />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
};
