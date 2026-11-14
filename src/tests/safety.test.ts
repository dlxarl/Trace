// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import * as hist from '../../electron/history';
import * as bk from '../../electron/backups';
import { createCaseSafety, normaliseBackupSettings, rewriteProjectIdentity } from '../../electron/caseSafety';
import { importEvidenceFiles } from '../../electron/evidenceStore';
import { lineDiff, collapseDiff } from '../services/diff/lineDiff';
import { parsePreferences } from '../services/preferences';
import { readCaseBundle, zipToBundleFiles } from '../services/import/caseBundle';

let root: string;
let caseDir: string;
let h: string;
const w = (rel: string, text: string) => {
  const f = path.join(caseDir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const r = (rel: string) => fs.readFileSync(path.join(caseDir, rel), 'utf8');
let t = 0;
const at = () => new Date(Date.UTC(2026, 10, 13, 10, 0, t++));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-safety-'));
  caseDir = path.join(root, 'projects', 'c1');
  h = path.join(root, '.trace', 'history', 'c1');
  w('project.md', '---\nid: c1\nname: "Case"\n---\n');
  w('entities/e1.md', '---\nname: Alice\n---\nhello');
  t = 0;
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('history', () => {
  it('skips a snapshot when nothing changed and records changes otherwise', () => {
    expect(hist.takeSnapshot(h, caseDir, { reason: 'auto', now: at() })).not.toBeNull();
    expect(hist.takeSnapshot(h, caseDir, { reason: 'auto', now: at() })).toBeNull();
    w('entities/e1.md', '---\nname: Alice\n---\nchanged');
    w('entities/e2.md', '---\nname: Bob\n---\n');
    const s = hist.takeSnapshot(h, caseDir, { reason: 'auto', now: at() })!;
    const ch = hist.changesOf(h, s.id, 'previous');
    expect(ch.map((c) => `${c.status}:${c.path}`)).toEqual(['modified:entities/e1.md', 'added:entities/e2.md']);
    expect(ch.find((c) => c.path === 'entities/e2.md')?.label).toBe('Bob');
  });

  it('restores a snapshot: contents come back and later files are removed', () => {
    const first = hist.takeSnapshot(h, caseDir, { reason: 'manual', now: at() })!;
    w('entities/e1.md', 'broken');
    w('entities/e2.md', 'new');
    fs.rmSync(path.join(caseDir, 'project.md'));
    const out = hist.restoreSnapshot(h, caseDir, first.id);
    expect(out.removed).toBe(1);
    expect(r('entities/e1.md')).toContain('hello');
    expect(fs.existsSync(path.join(caseDir, 'entities/e2.md'))).toBe(false);
    expect(fs.existsSync(path.join(caseDir, 'project.md'))).toBe(true);
  });

  it('keeps evidence and unrelated files when restoring', () => {
    const first = hist.takeSnapshot(h, caseDir, { reason: 'manual', now: at() })!;
    w('evidence/s1/20260101T000000Z/screenshot.png', 'png');
    hist.restoreSnapshot(h, caseDir, first.id);
    expect(fs.existsSync(path.join(caseDir, 'evidence/s1/20260101T000000Z/screenshot.png'))).toBe(true);
  });

  it('refuses a damaged snapshot without touching the case', () => {
    const first = hist.takeSnapshot(h, caseDir, { reason: 'manual', now: at() })!;
    const objs = path.join(h, 'objects');
    for (const d of fs.readdirSync(objs)) for (const f of fs.readdirSync(path.join(objs, d))) fs.writeFileSync(path.join(objs, d, f), 'tampered');
    w('entities/e1.md', 'mine');
    expect(() => hist.restoreSnapshot(h, caseDir, first.id)).toThrow(/damaged/);
    expect(r('entities/e1.md')).toBe('mine');
  });

  it('rejects ids that are not snapshot ids', () => {
    expect(() => hist.restoreSnapshot(h, caseDir, '../../etc/passwd')).toThrow();
    expect(hist.readFileAt(h, '../x', 'project.md')).toBeNull();
  });

  it('prunes old automatic snapshots but never named ones', () => {
    hist.takeSnapshot(h, caseDir, { reason: 'manual', label: 'keep me', now: at() });
    for (let i = 0; i < 4; i++) {
      w('notes/n.md', `v${i}`);
      hist.takeSnapshot(h, caseDir, { reason: 'auto', now: at() });
    }
    hist.prune(h, 2);
    const left = hist.listSnapshots(h);
    expect(left.some((s) => s.label === 'keep me')).toBe(true);
    expect(left.filter((s) => s.reason === 'auto').length).toBeLessThanOrEqual(2);
  });
});

describe('labels', () => {
  it('prefers a name or title over a type, wherever it appears', () => {
    expect(hist.labelOf('---\ntype: person\nname: Alice\n---')).toBe('Alice');
    expect(hist.labelOf('---\ntype: note\ntitle: "My note"\n---')).toBe('My note');
    expect(hist.labelOf('---\ntype: works_for\n---')).toBe('works_for');
    expect(hist.labelOf('no frontmatter')).toBeUndefined();
  });
});

describe('backups', () => {
  it('creates, lists, rotates automatic ones and keeps manual ones', async () => {
    w('evidence/s1/20260101T000000Z/capture.json', '{}');
    const dir = path.join(root, '.trace', 'backups', 'c1');
    await bk.createBackup(dir, caseDir, 'manual', at());
    for (let i = 0; i < 4; i++) await bk.createBackup(dir, caseDir, 'auto', at());
    expect(bk.pruneAutoBackups(dir, 2)).toBe(2);
    const l = bk.listBackups(dir);
    expect(l.filter((b) => b.reason === 'auto')).toHaveLength(2);
    expect(l.filter((b) => b.reason === 'manual')).toHaveLength(1);
    const files = await bk.readBackup(dir, l[0].id);
    expect(files.some((f) => f.path === 'evidence/s1/20260101T000000Z/capture.json')).toBe(true);
  });

  it('restores as a copy and never overwrites an existing folder', async () => {
    const dir = path.join(root, '.trace', 'backups', 'c1');
    const { info } = await bk.createBackup(dir, caseDir, 'manual', at());
    const target = path.join(root, 'projects', 'c1-restored');
    await bk.restoreBackupInto(dir, info.id, target, false);
    expect(fs.readFileSync(path.join(target, 'entities/e1.md'), 'utf8')).toContain('Alice');
    await expect(bk.restoreBackupInto(dir, info.id, target, false)).rejects.toThrow(/exists/);
    const pm = rewriteProjectIdentity(fs.readFileSync(path.join(target, 'project.md'), 'utf8'), 'c1-restored', '(restored)');
    expect(pm).toContain('id: c1-restored');
    expect(pm).toContain('Case (restored)');
  });

  it('replace validates the archive before deleting anything', async () => {
    const dir = path.join(root, '.trace', 'backups', 'c1');
    fs.mkdirSync(dir, { recursive: true });
    const zip = new JSZip();
    zip.file('entities/x.md', 'no project file');
    fs.writeFileSync(path.join(dir, '20260101T000000Z__manual.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
    await expect(bk.restoreBackupInto(dir, '20260101T000000Z', caseDir, true)).rejects.toThrow(/project\.md/);
    expect(r('entities/e1.md')).toContain('Alice');
  });

  it('ignores unknown file names', () => {
    const dir = path.join(root, '.trace', 'backups', 'c1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'random.zip'), 'x');
    expect(bk.listBackups(dir)).toEqual([]);
    expect(() => bk.deleteBackup(dir, '../x')).toThrow();
  });
});

describe('case safety scheduler', () => {
  const make = (settings = { enabled: true, intervalMin: 30, keep: 3 }) =>
    createCaseSafety({
      getWorkspace: () => root,
      getCaseDir: (id) => path.join(root, 'projects', id),
      getSettings: () => settings,
      idleMs: 10,
    });

  it('snapshots shortly after the last edit', async () => {
    const s = make();
    s.touch('c1');
    await new Promise((res) => setTimeout(res, 60));
    expect(hist.listSnapshots(s.historyDir('c1')).length).toBe(1);
  });

  it('backs up only changed cases, respecting the interval and the switch', async () => {
    const s = make();
    await s.tick(); // nothing changed
    expect(bk.listBackups(s.backupDir('c1'))).toHaveLength(0);
    s.touch('c1');
    await s.tick(Date.now());
    expect(bk.listBackups(s.backupDir('c1'))).toHaveLength(1);
    s.touch('c1');
    await s.tick(Date.now() + 60_000); // too soon
    expect(bk.listBackups(s.backupDir('c1'))).toHaveLength(1);
    await s.tick(Date.now() + 31 * 60_000);
    expect(bk.listBackups(s.backupDir('c1'))).toHaveLength(2);

    const off = make({ enabled: false, intervalMin: 5, keep: 3 });
    off.touch('c1');
    await off.tick(Date.now() + 99 * 60_000);
    expect(bk.listBackups(off.backupDir('c1'))).toHaveLength(2);
  });

  it('forget(purge) removes history and backups', async () => {
    const s = make();
    s.snapshotNow('c1', 'manual', undefined, true);
    await s.backupNow('c1');
    s.forget('c1', true);
    expect(fs.existsSync(s.historyDir('c1'))).toBe(false);
    expect(fs.existsSync(s.backupDir('c1'))).toBe(false);
  });

  it('normalises settings', () => {
    expect(normaliseBackupSettings({ intervalMin: 1, keep: 9999, enabled: 'x' })).toEqual({ enabled: true, intervalMin: 5, keep: 100 });
    expect(normaliseBackupSettings(null).keep).toBe(10);
  });
});

describe('evidence import from zip', () => {
  it('writes only valid evidence paths and never overwrites', () => {
    const out = importEvidenceFiles(caseDir, [
      { path: 'evidence/s1/20260101T000000Z/screenshot.png', data: new Uint8Array([1]) },
      { path: 'evidence/s1/20260101T000000Z/evil.sh', data: new Uint8Array([1]) },
      { path: 'evidence/../x/20260101T000000Z/page.pdf', data: new Uint8Array([1]) },
      { path: 'evidence/s1/../../page.pdf', data: new Uint8Array([1]) },
    ]);
    expect(out).toEqual({ written: 1, rejected: 3 });
    const again = importEvidenceFiles(caseDir, [{ path: 'evidence/s1/20260101T000000Z/screenshot.png', data: new Uint8Array([9]) }]);
    expect(again.written).toBe(0);
    expect(fs.readFileSync(path.join(caseDir, 'evidence/s1/20260101T000000Z/screenshot.png'))[0]).toBe(1);
  });

  it('readCaseBundle exposes evidence files from a zip and does not list them as skipped', async () => {
    const zip = new JSZip();
    zip.file('project.md', '---\nid: c1\nname: "Case"\n---\n');
    zip.file('evidence/s1/20260101T000000Z/page.pdf', 'pdf');
    zip.file('evidence/s1/20260101T000000Z/notes.txt', 'x');
    const b = await readCaseBundle(await zipToBundleFiles(await zip.generateAsync({ type: 'arraybuffer' })), 'x');
    expect(b.evidence?.map((e) => e.path)).toEqual(['evidence/s1/20260101T000000Z/page.pdf']);
    expect(b.skipped).toEqual(['evidence/s1/20260101T000000Z/notes.txt']);
    expect(Buffer.from(await b.evidence![0].bytes()).toString()).toBe('pdf');
  });
});

describe('diff and preferences', () => {
  it('diffs lines and collapses unchanged runs', () => {
    const d = lineDiff('a\nb\nc\nd\ne\nf\ng\nh', 'a\nb\nc\nd\nE\nf\ng\nh');
    expect(d.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['E']);
    expect(d.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['e']);
    expect(collapseDiff(d, 1).some((l) => l.kind === 'gap')).toBe(true);
    expect(lineDiff('x', 'x').every((l) => l.kind === 'same')).toBe(true);
  });

  it('parses preferences defensively', () => {
    expect(parsePreferences(null).autosave).toBe(true);
    expect(parsePreferences({ autosave: false }).autosave).toBe(false);
    expect(parsePreferences({ autosave: 'no' }).autosave).toBe(true);
  });
});
