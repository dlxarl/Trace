/**
 * Ties history snapshots and backups to the workspace: tracks which cases
 * changed, takes a snapshot shortly after edits stop, and writes rotating
 * backups on an interval. No Electron imports (testable).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as hist from './history';
import * as bk from './backups';

export interface BackupSettings {
  enabled: boolean;
  intervalMin: number;
  keep: number;
}
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { enabled: true, intervalMin: 30, keep: 10 };

export function normaliseBackupSettings(raw: unknown): BackupSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_BACKUP_SETTINGS.enabled,
    intervalMin: n(o.intervalMin, DEFAULT_BACKUP_SETTINGS.intervalMin, 5, 24 * 60),
    keep: n(o.keep, DEFAULT_BACKUP_SETTINGS.keep, 1, 100),
  };
}

export interface SafetyDeps {
  getWorkspace: () => string;
  /** Validated case folder for an id (throws on a bad id). */
  getCaseDir: (id: string) => string;
  getSettings: () => BackupSettings;
  /** Idle time after the last edit before a history snapshot (ms). */
  idleMs?: number;
}

export function createCaseSafety(deps: SafetyDeps) {
  const idleMs = deps.idleMs ?? 15_000;
  const historyDir = (id: string) => path.join(deps.getWorkspace(), '.trace', 'history', id);
  const backupDir = (id: string) => path.join(deps.getWorkspace(), '.trace', 'backups', id);
  const idleTimers = new Map<string, NodeJS.Timeout>();
  const changedSinceBackup = new Set<string>();
  const lastBackupAt = new Map<string, number>();
  let ticker: NodeJS.Timeout | null = null;

  const exists = (id: string) => fs.existsSync(path.join(deps.getCaseDir(id), 'project.md'));

  function snapshotNow(id: string, reason: hist.SnapshotReason = 'auto', label?: string, force = false) {
    const t = idleTimers.get(id);
    if (t) clearTimeout(t);
    idleTimers.delete(id);
    if (!exists(id)) return null;
    return hist.takeSnapshot(historyDir(id), deps.getCaseDir(id), { reason, label, force });
  }

  /** Call after every write to a case. */
  function touch(id: string) {
    changedSinceBackup.add(id);
    const old = idleTimers.get(id);
    if (old) clearTimeout(old);
    const t = setTimeout(() => {
      try {
        snapshotNow(id);
      } catch (e) {
        console.error('History snapshot failed:', e);
      }
    }, idleMs);
    t.unref?.();
    idleTimers.set(id, t);
  }

  async function backupNow(id: string, reason: bk.BackupReason = 'manual') {
    const r = await bk.createBackup(backupDir(id), deps.getCaseDir(id), reason);
    lastBackupAt.set(id, Date.now());
    if (reason === 'auto') bk.pruneAutoBackups(backupDir(id), deps.getSettings().keep);
    if (reason === 'auto' || reason === 'manual') changedSinceBackup.delete(id);
    return r;
  }

  async function tick(now = Date.now()) {
    const s = deps.getSettings();
    if (!s.enabled) return;
    for (const id of [...changedSinceBackup]) {
      const last = lastBackupAt.get(id) ?? 0;
      if (now - last < s.intervalMin * 60_000) continue;
      try {
        if (exists(id)) await backupNow(id, 'auto');
        else changedSinceBackup.delete(id);
      } catch (e) {
        console.error('Automatic backup failed:', e);
      }
    }
  }

  function start(everyMs = 60_000) {
    stop();
    ticker = setInterval(() => void tick(), everyMs);
    ticker.unref?.();
  }
  function stop() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  /** On quit: snapshot every case with pending edits (fast, synchronous). */
  function flush() {
    for (const id of [...idleTimers.keys()]) {
      try {
        snapshotNow(id);
      } catch {
        /* best effort */
      }
    }
  }

  function forget(id: string, purge: boolean) {
    const t = idleTimers.get(id);
    if (t) clearTimeout(t);
    idleTimers.delete(id);
    changedSinceBackup.delete(id);
    lastBackupAt.delete(id);
    if (purge) {
      hist.deleteHistory(historyDir(id));
      fs.rmSync(backupDir(id), { recursive: true, force: true });
    }
  }

  return { historyDir, backupDir, touch, snapshotNow, backupNow, tick, start, stop, flush, forget, exists };
}

export type CaseSafety = ReturnType<typeof createCaseSafety>;

/** Restoring a backup as a copy: gives the copy its own id and a recognisable name. */
export function rewriteProjectIdentity(projectMd: string, id: string, nameSuffix: string): string {
  const setKey = (src: string, key: string, fn: (old: string) => string) =>
    src.replace(new RegExp(`^(${key}:\\s*)(.*)$`, 'm'), (_m, p: string, v: string) => `${p}${fn(v.replace(/^["']|["']$/g, ''))}`);
  let out = setKey(projectMd, 'id', () => id);
  out = setKey(out, 'name', (v) => JSON.stringify(`${v} ${nameSuffix}`.trim()));
  return out;
}
