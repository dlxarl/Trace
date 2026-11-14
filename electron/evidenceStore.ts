/**
 * Evidence store: preserved copies of sources, kept beside the case files.
 *
 *   <project>/evidence/<source-id>/<capture-id>/
 *       screenshot.png  page.pdf  page.mhtml  capture.json
 *
 * Every file is hashed with SHA-256 when written; the hashes go into
 * capture.json and into the source's frontmatter, so a later "verify" can show
 * whether a file was changed or removed. Pure Node — no Electron imports — so
 * it is unit-testable.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type EvidenceKind = 'screenshot' | 'pdf' | 'mhtml';
export const EVIDENCE_FILES: Record<EvidenceKind, string> = {
  screenshot: 'screenshot.png',
  pdf: 'page.pdf',
  mhtml: 'page.mhtml',
};
const ALLOWED_NAMES = new Set([...Object.values(EVIDENCE_FILES), 'capture.json']);
const ID_RE = /^[a-zA-Z0-9_\-.]{1,128}$/;
const CAPTURE_ID_RE = /^[0-9A-Za-z_-]{1,40}$/;

export interface StoredFile {
  name: string;
  kind: EvidenceKind;
  sha256: string;
  bytes: number;
}

export interface StoredCapture {
  id: string;
  captured_at: string;
  url: string;
  final_url?: string;
  title?: string;
  files: StoredFile[];
  tool?: string;
}

export const sha256 = (data: Buffer | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** UTC timestamp usable as a folder name: 20261113T104500Z. */
export function captureIdFor(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function safeId(id: unknown, what: string): string {
  if (typeof id !== 'string' || !ID_RE.test(id) || id === '.' || id === '..') throw new Error(`Invalid ${what}`);
  return id;
}

/** evidence/<source-id>[/<capture-id>] inside a project directory, validated. */
export function evidenceDir(projectDir: string, sourceId: string, captureId?: string): string {
  const base = path.join(projectDir, 'evidence', safeId(sourceId, 'source id'));
  if (captureId === undefined) return base;
  if (!CAPTURE_ID_RE.test(captureId)) throw new Error('Invalid capture id');
  return path.join(base, captureId);
}

export function writeCapture(
  projectDir: string,
  sourceId: string,
  meta: { url: string; final_url?: string; title?: string; tool?: string },
  blobs: Partial<Record<EvidenceKind, Buffer>>,
  now: Date = new Date(),
): StoredCapture {
  let id = captureIdFor(now);
  let dir = evidenceDir(projectDir, sourceId, id);
  for (let n = 2; fs.existsSync(dir); n++) {
    id = `${captureIdFor(now)}-${n}`;
    dir = evidenceDir(projectDir, sourceId, id);
  }
  fs.mkdirSync(dir, { recursive: true });
  const files: StoredFile[] = [];
  for (const kind of Object.keys(EVIDENCE_FILES) as EvidenceKind[]) {
    const data = blobs[kind];
    if (!data || data.length === 0) continue;
    const name = EVIDENCE_FILES[kind];
    fs.writeFileSync(path.join(dir, name), data, { flag: 'wx' }); // never overwrite evidence
    files.push({ name, kind, sha256: sha256(data), bytes: data.length });
  }
  if (files.length === 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error('Nothing could be captured from this page.');
  }
  const capture: StoredCapture = {
    id,
    captured_at: now.toISOString(),
    url: meta.url,
    final_url: meta.final_url && meta.final_url !== meta.url ? meta.final_url : undefined,
    title: meta.title || undefined,
    files,
    tool: meta.tool,
  };
  fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify(capture, null, 2), { flag: 'wx' });
  return capture;
}

export type FileCheck = { name: string; status: 'ok' | 'modified' | 'missing' };

/** Re-hashes the stored files and compares them with the recorded hashes. */
export function verifyCapture(projectDir: string, sourceId: string, capture: { id: string; files: { name: string; sha256: string }[] }): FileCheck[] {
  const dir = evidenceDir(projectDir, sourceId, capture.id);
  return capture.files.map((f) => {
    if (!ALLOWED_NAMES.has(f.name)) return { name: f.name, status: 'missing' as const };
    const full = path.join(dir, f.name);
    try {
      const st = fs.lstatSync(full);
      if (!st.isFile()) return { name: f.name, status: 'missing' as const };
      return { name: f.name, status: sha256(fs.readFileSync(full)) === f.sha256 ? ('ok' as const) : ('modified' as const) };
    } catch {
      return { name: f.name, status: 'missing' as const };
    }
  });
}

/** Path of one stored file (or the capture folder), for "open" / "reveal". */
export function evidencePath(projectDir: string, sourceId: string, captureId: string, name?: string): string {
  const dir = evidenceDir(projectDir, sourceId, captureId);
  if (name === undefined) return dir;
  if (!ALLOWED_NAMES.has(name)) throw new Error('Unknown evidence file');
  return path.join(dir, name);
}

/** All evidence files of a project, for export: [{ path: 'evidence/<src>/<cap>/<file>', data }]. */
export function listEvidenceFiles(projectDir: string, maxTotalBytes = 500 * 1024 * 1024): { path: string; data: Buffer }[] {
  const root = path.join(projectDir, 'evidence');
  const out: { path: string; data: Buffer }[] = [];
  let total = 0;
  const dirs = (d: string) => {
    try {
      return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  for (const src of dirs(root)) {
    if (!ID_RE.test(src)) continue;
    for (const cap of dirs(path.join(root, src))) {
      if (!CAPTURE_ID_RE.test(cap)) continue;
      for (const name of ALLOWED_NAMES) {
        const full = path.join(root, src, cap, name);
        try {
          const st = fs.lstatSync(full);
          if (!st.isFile()) continue;
          total += st.size;
          if (total > maxTotalBytes) throw new Error('Evidence is larger than 500 MB; export the case folder instead.');
          out.push({ path: `evidence/${src}/${cap}/${name}`, data: fs.readFileSync(full) });
        } catch (e: any) {
          if (/larger than/.test(e?.message)) throw e;
        }
      }
    }
  }
  return out;
}

/**
 * Restores evidence files (from a case zip) into a project. Only
 * evidence/<source>/<capture>/<known name> paths are accepted; existing files are
 * never overwritten. Returns how many files were written and how many rejected.
 */
export function importEvidenceFiles(projectDir: string, files: { path: string; data: Uint8Array }[]): { written: number; rejected: number } {
  let written = 0;
  let rejected = 0;
  for (const f of files) {
    const m = /^evidence\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(f.path).replace(/\\/g, '/'));
    if (!m || !ALLOWED_NAMES.has(m[3]) || !ID_RE.test(m[1]) || !CAPTURE_ID_RE.test(m[2]) || m[1] === '.' || m[1] === '..') {
      rejected++;
      continue;
    }
    try {
      const dir = evidenceDir(projectDir, m[1], m[2]);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, m[3]), Buffer.from(f.data), { flag: 'wx' });
      written++;
    } catch (e: any) {
      if (e?.code !== 'EEXIST') rejected++;
    }
  }
  return { written, rejected };
}
