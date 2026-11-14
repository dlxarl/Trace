import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureIdFor, evidenceDir, evidencePath, listEvidenceFiles, sha256, verifyCapture, writeCapture } from '../../electron/evidenceStore';
import { parseSourceFile, serializeSourceFile } from '../services/markdownParser';
import { parseWaybackResponse, waybackSaveUrl } from '../services/evidence/wayback';
import { buildReportModel, escapeHtml, renderReportHtml, renderReportMarkdown, reportFileName, richText } from '../services/report/buildReport';
import { createSampleProject } from '../services/storage/sampleData';
import { admiraltyCode, type ProjectData, type Source } from '../types';
import { InvestigationIndex } from '../core/investigation';

describe('evidence store', () => {
  let proj: string;
  beforeEach(() => { proj = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-ev-')); });
  afterEach(() => fs.rmSync(proj, { recursive: true, force: true }));
  const now = new Date('2026-11-13T10:45:00.123Z');
  const blobs = { screenshot: Buffer.from('png-bytes'), pdf: Buffer.from('pdf-bytes'), mhtml: Buffer.from('mhtml-bytes') };

  it('writes files with SHA-256, a manifest, and a timestamp id', () => {
    expect(captureIdFor(now)).toBe('20261113T104500Z');
    const c = writeCapture(proj, 'src-1', { url: 'https://a.example/', final_url: 'https://a.example/', title: 'A', tool: 'TRACE test' }, blobs, now);
    expect(c.id).toBe('20261113T104500Z');
    expect(c.final_url).toBeUndefined(); // same as url → not repeated
    expect(c.files.map((f) => [f.name, f.kind, f.bytes])).toEqual([['screenshot.png', 'screenshot', 9], ['page.pdf', 'pdf', 9], ['page.mhtml', 'mhtml', 11]]);
    expect(c.files[0].sha256).toBe(sha256(blobs.screenshot));
    const dir = evidenceDir(proj, 'src-1', c.id);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'capture.json'), 'utf-8'))).toMatchObject({ id: c.id, url: 'https://a.example/' });
  });

  it('never overwrites: a second capture in the same second gets its own folder', () => {
    const a = writeCapture(proj, 'src-1', { url: 'https://a.example/' }, blobs, now);
    const b = writeCapture(proj, 'src-1', { url: 'https://a.example/' }, { pdf: Buffer.from('other') }, now);
    expect(b.id).toBe(`${a.id}-2`);
    expect(fs.readFileSync(evidencePath(proj, 'src-1', a.id, 'page.pdf'), 'utf-8')).toBe('pdf-bytes');
  });

  it('refuses an empty capture and leaves no folder', () => {
    expect(() => writeCapture(proj, 'src-1', { url: 'https://a.example/' }, {}, now)).toThrow(/Nothing could be captured/);
    expect(fs.existsSync(evidenceDir(proj, 'src-1', '20261113T104500Z'))).toBe(false);
  });

  it('verification detects modified and missing files', () => {
    const c = writeCapture(proj, 'src-1', { url: 'https://a.example/' }, blobs, now);
    expect(verifyCapture(proj, 'src-1', c).every((f) => f.status === 'ok')).toBe(true);
    fs.writeFileSync(evidencePath(proj, 'src-1', c.id, 'page.pdf'), 'tampered');
    fs.rmSync(evidencePath(proj, 'src-1', c.id, 'page.mhtml'));
    expect(verifyCapture(proj, 'src-1', c)).toEqual([
      { name: 'screenshot.png', status: 'ok' },
      { name: 'page.pdf', status: 'modified' },
      { name: 'page.mhtml', status: 'missing' },
    ]);
  });

  it('rejects traversal in ids and unknown file names', () => {
    for (const bad of ['..', '../x', 'a/b', '']) expect(() => evidenceDir(proj, bad)).toThrow();
    expect(() => evidenceDir(proj, 'src-1', '../../etc')).toThrow(/capture id/);
    expect(() => evidencePath(proj, 'src-1', '20261113T104500Z', '../../../etc/passwd')).toThrow(/Unknown evidence file/);
    expect(verifyCapture(proj, 'src-1', { id: '20261113T104500Z', files: [{ name: '../secret', sha256: 'x' }] })).toEqual([{ name: '../secret', status: 'missing' }]);
  });

  it('lists evidence for export, ignoring stray files', () => {
    const c = writeCapture(proj, 'src-1', { url: 'https://a.example/' }, blobs, now);
    fs.writeFileSync(path.join(evidenceDir(proj, 'src-1', c.id), 'notes.txt'), 'stray');
    const files = listEvidenceFiles(proj).map((f) => f.path).sort();
    expect(files).toEqual(['capture.json', 'page.mhtml', 'page.pdf', 'screenshot.png'].map((n) => `evidence/src-1/${c.id}/${n}`).sort());
    expect(() => listEvidenceFiles(proj, 10)).toThrow(/larger than/);
  });
});

describe('source rating, archive link and captures in Markdown', () => {
  const base: Source = { id: 's1', type: 'source', title: 'Registry', url: 'https://r.example/x', accessed_at: '2026-11-01T00:00:00Z', source_type: 'registry', markdownBody: 'body' };
  it('round-trips the new fields and keeps unknown frontmatter', () => {
    const src: Source = {
      ...base,
      reliability: 'B',
      credibility: '2',
      archive_url: 'https://web.archive.org/web/2026/https://r.example/x',
      captures: [{ id: '20261113T104500Z', captured_at: '2026-11-13T10:45:00.123Z', url: 'https://r.example/x', title: 'T', files: [{ name: 'page.pdf', kind: 'pdf', sha256: 'a'.repeat(64), bytes: 9 }] }],
      extraFrontmatter: { custom: 'kept' },
    };
    const back = parseSourceFile(serializeSourceFile(src), 'x');
    expect(back).toMatchObject({ reliability: 'B', credibility: '2', archive_url: src.archive_url, extraFrontmatter: { custom: 'kept' } });
    expect(back.captures).toEqual(src.captures);
    expect(admiraltyCode(back)).toBe('B2');
  });
  it('old sources parse unchanged and malformed values are dropped', () => {
    const old = parseSourceFile(serializeSourceFile(base), 'x');
    expect(old.reliability).toBeUndefined();
    expect(old.captures).toBeUndefined();
    expect(admiraltyCode(old)).toBe('');
    const bad = parseSourceFile('---\nid: s\ntype: source\ntitle: T\naccessed_at: x\nreliability: Z\ncredibility: 9\narchive_url: "javascript:alert(1)"\ncaptures:\n  - id: "../../x"\n    files: []\n  - id: ok1\n    files:\n      - {name: "../a.pdf", kind: pdf, sha256: abc}\n      - {name: page.pdf, kind: pdf, sha256: ' + 'b'.repeat(64) + ', bytes: 3}\n---\nb', 's');
    expect(bad.reliability).toBeUndefined();
    expect(bad.credibility).toBeUndefined();
    expect(bad.archive_url).toBeUndefined();
    expect(bad.captures).toHaveLength(1);
    expect(bad.captures![0].files.map((f) => f.name)).toEqual(['page.pdf']);
    expect(admiraltyCode({ reliability: 'C' })).toBe('C');
    expect(admiraltyCode({ credibility: '3' })).toBe('–3');
  });
  it('MCP source refs expose rating and preserved copies', () => {
    const data = createSampleProject();
    data.sources[0] = { ...data.sources[0], reliability: 'A', credibility: '1', captures: [{ id: 'c1', captured_at: '', url: '', files: [] }] };
    const idx = new InvestigationIndex(data);
    const rel = data.relationships.find((r) => r.evidence.includes(data.sources[0].id))!;
    const ev: any = idx.relationshipDetails(rel.id)!.evidence.find((e: any) => e.id === data.sources[0].id);
    expect(ev).toMatchObject({ rating: 'A1', preserved_copies: 1 });
  });
});

describe('wayback', () => {
  it('accepts only web.archive.org snapshots', () => {
    expect(parseWaybackResponse({ archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/20240102030405/https://x.org/', timestamp: '20240102030405' } } })).toEqual({
      url: 'https://web.archive.org/web/20240102030405/https://x.org/',
      timestamp: '2024-01-02T03:04:05Z',
    });
    expect(parseWaybackResponse({ archived_snapshots: {} })).toBeNull();
    expect(parseWaybackResponse({ archived_snapshots: { closest: { available: true, url: 'https://evil.example/x' } } })).toBeNull();
    expect(parseWaybackResponse('nope')).toBeNull();
    expect(waybackSaveUrl('https://x.org/a')).toBe('https://web.archive.org/save/https://x.org/a');
  });
});

describe('case report', () => {
  const data: ProjectData = createSampleProject();
  const fixed = { generatedAt: new Date('2026-11-13T12:00:00Z'), appVersion: '0.3.0-test' };

  it('numbers sources in citation order and links claims to them', () => {
    const m = buildReportModel(data, fixed);
    expect(m.title).toBe(data.project.name);
    expect(m.sources.map((s) => s.n)).toEqual(m.sources.map((_, i) => i + 1));
    expect(m.sources).toHaveLength(data.sources.length);
    const cited = m.claims.flatMap((c) => c.refs);
    expect(Math.max(...cited)).toBeLessThanOrEqual(m.sources.length);
    expect(m.claims.length).toBe(data.relationships.filter((r) => r.status !== 'rejected').length);
    expect(m.stats.find((s) => s.label === 'Entities')!.value).toBe(String(data.entities.length));
  });

  it('hides rejected relationships and notes unless asked', () => {
    const withRejected: ProjectData = { ...data, relationships: [...data.relationships, { ...data.relationships[0], id: 'rx', status: 'rejected' }] };
    expect(buildReportModel(withRejected, fixed).claims.some((c) => c.evidenceClass === 'Disproven')).toBe(false);
    const all = buildReportModel(withRejected, { ...fixed, includeRejected: true, includeNotes: true });
    expect(all.claims.some((c) => c.evidenceClass === 'Disproven')).toBe(true);
    expect(all.notes.length).toBe(data.notes.length);
    expect(buildReportModel(data, fixed).notes).toEqual([]);
  });

  it('renders Markdown with findings, sources and hashes', () => {
    const d: ProjectData = { ...data, sources: data.sources.map((s, i) => (i === 0 ? { ...s, reliability: 'B', credibility: '2', captures: [{ id: 'c', captured_at: '2026-11-13T10:45:00Z', url: s.url || '', files: [{ name: 'page.pdf', kind: 'pdf', sha256: 'c'.repeat(64), bytes: 1 }] }] } : s)) };
    const md = renderReportMarkdown(buildReportModel(d, fixed));
    expect(md).toContain(`# ${data.project.name}`);
    expect(md).toContain('## Findings');
    expect(md).toMatch(/\[S1\]/);
    expect(md).toContain('rating B2');
    expect(md).toContain(`SHA-256 \`${'c'.repeat(64)}\``);
    expect(md).toContain('Generated with TRACE 0.3.0-test');
  });

  it('escapes everything in HTML and only links http(s)', () => {
    const evil: ProjectData = {
      ...data,
      project: { ...data.project, name: '<script>alert(1)</script>', markdownBody: 'Body <img src=x onerror=alert(1)>' },
      entities: [{ ...data.entities[0], name: '"><svg onload=alert(1)>', attributes: { site: 'javascript:alert(1)', web: 'https://ok.example/' } }, ...data.entities.slice(1)],
      sources: [{ ...data.sources[0], title: '<b>x</b>', url: 'javascript:alert(1)' }, ...data.sources.slice(1)],
    };
    const html = renderReportHtml(buildReportModel(evil, { ...fixed, graphImage: 'data:image/png;base64,AAAA" onerror="x' }));
    expect(html).not.toMatch(/<script|<svg|<img src=x/i); // no injected elements
    expect(html).not.toMatch(/<[^>]*\son(error|load)=/i); // no event-handler attributes inside any tag
    expect(html).toContain('onerror=alert(1)&gt;'); // the payload survives only as escaped text
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://ok.example/"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img class="graph"'); // malformed data URL is dropped
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('renders simple Markdown in prose without letting markup through', () => {
    expect(richText('Welcome to **Trace**, see `code`.\n\n- one\n- **two**\n\n1. a\n2. b')).toBe(
      '<p>Welcome to <b>Trace</b>, see <code>code</code>.</p><ul><li>one</li><li><b>two</b></li></ul><ol><li>a</li><li>b</li></ol>',
    );
    expect(richText('**<img src=x onerror=1>** and `<script>`')).toBe('<p><b>&lt;img src=x onerror=1&gt;</b> and <code>&lt;script&gt;</code></p>');
    expect(richText('2 * 3 * 4 stays')).toBe('<p>2 * 3 * 4 stays</p>');
  });

  it('includes a valid graph image and builds a safe file name', () => {
    const html = renderReportHtml(buildReportModel(data, { ...fixed, graphImage: 'data:image/png;base64,iVBORw0KGgo=' }));
    expect(html).toContain('<img class="graph"');
    expect(reportFileName('Operation: Nightfall / 2026!', new Date('2026-11-13T00:00:00Z'))).toBe('operation-nightfall-2026-report-2026-11-13');
    expect(reportFileName('???', new Date('2026-11-13T00:00:00Z'))).toBe('investigation-report-2026-11-13');
  });
});
