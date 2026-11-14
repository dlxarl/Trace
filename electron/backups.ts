/**
 * Backups: a zip of a whole case (text files + evidence) stored outside the
 * case folder, so deleting or damaging the case does not touch them.
 *
 *   <backups>/<project>/<id>__<reason>.zip     id = 20261113T104500Z
 *
 * Automatic backups are rotated (oldest removed beyond `keep`); manual ones and
 * "before …" safety backups are never removed automatically.
 * Pure Node + jszip — unit-testable without Electron.
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export type BackupReason = 'auto' | 'manual' | 'before-restore' | 'before-delete' | 'before-merge';
const REASONS: BackupReason[] = ['auto', 'manual', 'before-restore', 'before-delete', 'before-merge'];
const NAME_RE = /^(\d{8}T\d{6}Z(?:-\d+)?)__([a-z-]+)\.zip$/;
/** Single files above this are skipped (and reported) to keep backups bounded. */
export const MAX_BACKUP_FILE_BYTES = 200 * 1024 * 1024;

export interface BackupInfo {
  id: string;
  file: string;
  reason: BackupReason;
  at: string;
  bytes: number;
}

function stamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function atOf(id: string) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(id)!;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function walk(dir: string, base = ''): { rel: string; abs: string; size: number }[] {
  const out: { rel: string; abs: string; size: number }[] = [];
  let items: fs.Dirent[] = [];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    if (it.isSymbolicLink() || it.name === '.DS_Store') continue;
    const abs = path.join(dir, it.name);
    const rel = base ? `${base}/${it.name}` : it.name;
    if (it.isDirectory()) out.push(...walk(abs, rel));
    else if (it.isFile()) out.push({ rel, abs, size: fs.statSync(abs).size });
  }
  return out;
}

export function listBackups(dir: string): BackupInfo[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  for (const n of names) {
    const m = NAME_RE.exec(n);
    if (!m || !REASONS.includes(m[2] as BackupReason)) continue;
    out.push({ id: m[1], file: n, reason: m[2] as BackupReason, at: atOf(m[1]), bytes: fs.statSync(path.join(dir, n)).size });
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function createBackup(
  dir: string,
  caseDir: string,
  reason: BackupReason,
  now = new Date(),
): Promise<{ info: BackupInfo; skipped: string[] }> {
  const zip = new JSZip();
  const skipped: string[] = [];
  for (const f of walk(caseDir)) {
    if (f.size > MAX_BACKUP_FILE_BYTES) {
      skipped.push(f.rel);
      continue;
    }
    zip.file(f.rel, fs.readFileSync(f.abs));
  }
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 4 } });
  fs.mkdirSync(dir, { recursive: true });
  let id = stamp(now);
  for (let n = 2; fs.existsSync(path.join(dir, `${id}__${reason}.zip`)); n++) id = `${stamp(now)}-${n}`;
  const file = `${id}__${reason}.zip`;
  const target = path.join(dir, file);
  fs.writeFileSync(`${target}.tmp`, data);
  fs.renameSync(`${target}.tmp`, target);
  return { info: { id, file, reason, at: atOf(id), bytes: data.length }, skipped };
}

export function pruneAutoBackups(dir: string, keep: number): number {
  const autos = listBackups(dir).filter((b) => b.reason === 'auto');
  let removed = 0;
  for (const b of autos.slice(Math.max(1, keep))) {
    fs.rmSync(path.join(dir, b.file), { force: true });
    removed++;
  }
  return removed;
}

function findFile(dir: string, id: string): string {
  const b = listBackups(dir).find((x) => x.id === id);
  if (!b) throw new Error('Backup not found');
  return path.join(dir, b.file);
}

/** Reads a backup and returns its files, rejecting unsafe paths. */
export async function readBackup(dir: string, id: string): Promise<{ path: string; data: Buffer }[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(findFile(dir, id)));
  const out: { path: string; data: Buffer }[] = [];
  const entries: JSZip.JSZipObject[] = [];
  zip.forEach((_p, e) => {
    if (!e.dir) entries.push(e);
  });
  for (const e of entries) {
    const p = e.name.replace(/\\/g, '/');
    if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.split('/').includes('..')) throw new Error('Backup contains an unsafe path');
    out.push({ path: p, data: await e.async('nodebuffer') });
  }
  if (!out.some((f) => f.path === 'project.md')) throw new Error('This backup does not contain a case (project.md is missing)');
  return out;
}

/**
 * Restores a backup into `targetDir`, which must not exist (restore as a copy)
 * — or replaces the content of `caseDir` after the caller took a safety backup.
 */
export async function restoreBackupInto(dir: string, id: string, targetDir: string, replace: boolean): Promise<number> {
  const files = await readBackup(dir, id); // fully validated before anything is written
  if (fs.existsSync(targetDir)) {
    if (!replace) throw new Error('Target already exists');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  for (const f of files) {
    const t = path.join(targetDir, f.path);
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, f.data);
  }
  return files.length;
}

export function deleteBackup(dir: string, id: string) {
  fs.rmSync(findFile(dir, id), { force: true });
}
