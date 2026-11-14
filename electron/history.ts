/**
 * Case history: local snapshots of a case's text files (a small, dependency-free
 * stand-in for git, so it works on every machine).
 *
 *   <history>/<project>/objects/<aa>/<sha256>     file contents, stored once
 *   <history>/<project>/snapshots/<id>.json       { id, at, reason, label, files: { path: sha256 } }
 *
 * Tracked: project.md, graph-layout.json and the *.md files of entities/,
 * relationships/, sources/ and notes/. Evidence captures are not copied here
 * (they are large and already carry hashes); backups cover them.
 *
 * Pure Node — no Electron imports — so it is unit-testable.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SECTIONS = ['entities', 'relationships', 'sources', 'notes'] as const;
export const MAX_TRACKED_BYTES = 2 * 1024 * 1024;
export const MAX_SNAPSHOTS = 300;

export type SnapshotReason = 'auto' | 'manual' | 'before-restore' | 'before-merge' | 'import' | 'other';

export interface Snapshot {
  id: string;
  at: string;
  reason: SnapshotReason;
  label?: string;
  files: Record<string, string>;
}

export interface SnapshotInfo {
  id: string;
  at: string;
  reason: SnapshotReason;
  label?: string;
  fileCount: number;
}

export interface FileChange {
  path: string;
  status: 'added' | 'removed' | 'modified';
  /** Human label (entity name, note title, …) when it can be read. */
  label?: string;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const SNAP_ID = /^\d{8}T\d{6}Z(-\d+)?$/;
const SHA_RE = /^[0-9a-f]{64}$/;

function snapDir(h: string) {
  return path.join(h, 'snapshots');
}
function objPath(h: string, hash: string) {
  return path.join(h, 'objects', hash.slice(0, 2), hash);
}

/** Relative paths of the tracked files that exist in a case folder. */
export function listTracked(caseDir: string): string[] {
  const out: string[] = [];
  const ok = (p: string) => {
    try {
      const st = fs.lstatSync(p);
      return st.isFile() && !st.isSymbolicLink() && st.size <= MAX_TRACKED_BYTES;
    } catch {
      return false;
    }
  };
  for (const f of ['project.md', 'graph-layout.json']) if (ok(path.join(caseDir, f))) out.push(f);
  for (const s of SECTIONS) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(caseDir, s));
    } catch {
      continue;
    }
    for (const n of names.sort()) if (n.endsWith('.md') && ok(path.join(caseDir, s, n))) out.push(`${s}/${n}`);
  }
  return out;
}

function newId(h: string, now: Date): string {
  const base = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  let id = base;
  for (let n = 2; fs.existsSync(path.join(snapDir(h), `${id}.json`)); n++) id = `${base}-${n}`;
  return id;
}

/** Fingerprint of the current files, used to skip snapshots when nothing changed. */
export function currentFiles(caseDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const rel of listTracked(caseDir)) files[rel] = sha(fs.readFileSync(path.join(caseDir, rel)));
  return files;
}

function readSnapshot(h: string, id: string): Snapshot | null {
  if (!SNAP_ID.test(id)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(snapDir(h), `${id}.json`), 'utf8'));
    if (s && typeof s.id === 'string' && s.files && typeof s.files === 'object') return s as Snapshot;
  } catch {
    /* unreadable */
  }
  return null;
}

export function listSnapshots(h: string): SnapshotInfo[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(snapDir(h));
  } catch {
    return [];
  }
  const out: SnapshotInfo[] = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const s = readSnapshot(h, n.slice(0, -5));
    if (s) out.push({ id: s.id, at: s.at, reason: s.reason, label: s.label, fileCount: Object.keys(s.files).length });
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function takeSnapshot(
  h: string,
  caseDir: string,
  opts: { reason: SnapshotReason; label?: string; force?: boolean; now?: Date },
): SnapshotInfo | null {
  const files: Record<string, string> = {};
  for (const rel of listTracked(caseDir)) {
    const data = fs.readFileSync(path.join(caseDir, rel));
    const hash = sha(data);
    files[rel] = hash;
    const op = objPath(h, hash);
    if (!fs.existsSync(op)) {
      fs.mkdirSync(path.dirname(op), { recursive: true });
      fs.writeFileSync(`${op}.tmp`, data);
      fs.renameSync(`${op}.tmp`, op);
    }
  }
  const latest = listSnapshots(h)[0];
  if (!opts.force && latest) {
    const prev = readSnapshot(h, latest.id);
    if (prev && diffFiles(prev.files, files).length === 0) return null;
  }
  const now = opts.now ?? new Date();
  const snap: Snapshot = { id: newId(h, now), at: now.toISOString(), reason: opts.reason, files };
  if (opts.label) snap.label = opts.label.slice(0, 120);
  fs.mkdirSync(snapDir(h), { recursive: true });
  fs.writeFileSync(path.join(snapDir(h), `${snap.id}.json`), JSON.stringify(snap));
  prune(h);
  return { id: snap.id, at: snap.at, reason: snap.reason, label: snap.label, fileCount: Object.keys(files).length };
}

/** Drops the oldest unlabeled automatic snapshots beyond the limit, then unreferenced objects. */
export function prune(h: string, max = MAX_SNAPSHOTS) {
  const all = listSnapshots(h);
  let excess = all.length - max;
  if (excess > 0) {
    for (const s of [...all].reverse()) {
      if (excess <= 0) break;
      if (s.reason === 'auto' && !s.label) {
        fs.rmSync(path.join(snapDir(h), `${s.id}.json`), { force: true });
        excess--;
      }
    }
  }
  const used = new Set<string>();
  for (const s of listSnapshots(h)) {
    const full = readSnapshot(h, s.id);
    if (full) Object.values(full.files).forEach((x) => used.add(x));
  }
  const root = path.join(h, 'objects');
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const d of dirs) {
    let items: string[] = [];
    try {
      items = fs.readdirSync(path.join(root, d));
    } catch {
      continue;
    }
    for (const it of items) if (!used.has(it) && !it.endsWith('.tmp')) fs.rmSync(path.join(root, d, it), { force: true });
  }
}

export function diffFiles(a: Record<string, string>, b: Record<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const p of Object.keys(b)) {
    if (!(p in a)) out.push({ path: p, status: 'added' });
    else if (a[p] !== b[p]) out.push({ path: p, status: 'modified' });
  }
  for (const p of Object.keys(a)) if (!(p in b)) out.push({ path: p, status: 'removed' });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

function readBlob(h: string, hash: string): Buffer | null {
  if (!SHA_RE.test(hash)) return null;
  try {
    const b = fs.readFileSync(objPath(h, hash));
    return sha(b) === hash ? b : null; // a corrupted object is treated as missing
  } catch {
    return null;
  }
}

export function labelOf(text: string): string | undefined {
  const head = text.slice(0, 2000);
  // A name or title is the best label; a bare type (e.g. a relationship) is the fallback.
  const m = /^(?:name|title):\s*["']?(.+?)["']?\s*$/m.exec(head) ?? /^type:\s*["']?(.+?)["']?\s*$/m.exec(head);
  return m ? m[1].slice(0, 80) : undefined;
}

/** Changes a snapshot made compared with the one before it (or with the current files). */
export function changesOf(h: string, id: string, against: 'previous' | { caseDir: string }): FileChange[] {
  const snap = readSnapshot(h, id);
  if (!snap) return [];
  let from: Record<string, string>;
  let to: Record<string, string>;
  if (against === 'previous') {
    const older = listSnapshots(h).filter((s) => s.id < id)[0];
    from = older ? (readSnapshot(h, older.id)?.files ?? {}) : {};
    to = snap.files;
  } else {
    // What restoring this snapshot would do to the case right now.
    from = currentFiles(against.caseDir);
    to = snap.files;
  }
  return diffFiles(from, to).map((c) => {
    const hash = c.status === 'removed' ? from[c.path] : to[c.path];
    const blob = hash ? readBlob(h, hash) : null;
    return { ...c, label: blob ? labelOf(blob.toString('utf8')) : undefined };
  });
}

export function readFileAt(h: string, id: string, rel: string): string | null {
  const snap = readSnapshot(h, id);
  const hash = snap?.files[rel];
  const b = hash ? readBlob(h, hash) : null;
  return b ? b.toString('utf8') : null;
}

/**
 * Makes the case's tracked files equal to the snapshot. Everything is verified
 * first so a damaged snapshot changes nothing. Evidence and other files stay.
 */
export function restoreSnapshot(h: string, caseDir: string, id: string): { restored: number; removed: number } {
  const snap = readSnapshot(h, id);
  if (!snap) throw new Error('Snapshot not found');
  const blobs = new Map<string, Buffer>();
  for (const [rel, hash] of Object.entries(snap.files)) {
    if (rel.includes('..') || path.isAbsolute(rel)) throw new Error('Snapshot contains an unsafe path');
    const b = readBlob(h, hash);
    if (!b) throw new Error(`Snapshot is damaged (missing data for ${rel})`);
    blobs.set(rel, b);
  }
  let removed = 0;
  for (const rel of listTracked(caseDir)) {
    if (!(rel in snap.files)) {
      fs.rmSync(path.join(caseDir, rel), { force: true });
      removed++;
    }
  }
  for (const [rel, b] of blobs) {
    const target = path.join(caseDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}.tmp`, b);
    fs.renameSync(`${target}.tmp`, target);
  }
  return { restored: blobs.size, removed };
}

export function deleteHistory(h: string) {
  fs.rmSync(h, { recursive: true, force: true });
}
