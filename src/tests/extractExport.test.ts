import { describe, it, expect } from 'vitest';
import { extractIndicators } from '../services/extract/extractIndicators';
import { toGraphML, toStix, stableUuid } from '../services/export/graphExport';
import type { Entity, ProjectData, Relationship } from '../types';

const names = (t: string, type?: string) => extractIndicators(t).entities.filter((e) => !type || e.type === type).map((e) => e.name);

describe('extractIndicators', () => {
  const text = `Contact John at John.Doe@Example.com or +44 20 7946 0912. Site: https://shadow-fin.example.org/about?x=1.
Server 198.51.100.42 (not 999.1.1.1). Telegram @cipher_intel_bot and mirror evil.example.net, see index.html and v1.2.3.
Wallet 0x52908400098527886E0F7030069857D2E4169EE7 and bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq.`;

  it('finds the common indicator types', () => {
    expect(names(text, 'email')).toEqual(['john.doe@example.com']);
    expect(names(text, 'phone')).toEqual(['+44 20 7946 0912']);
    expect(names(text, 'website')).toEqual(['https://shadow-fin.example.org/about?x=1']);
    expect(names(text, 'ip')).toEqual(['198.51.100.42']);
    expect(names(text, 'account')).toEqual(['0x52908400098527886E0F7030069857D2E4169EE7', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', '@cipher_intel_bot']);
  });
  it('does not turn email or URL hosts into separate domains, nor file names or versions', () => {
    expect(names(text, 'domain')).toEqual(['evil.example.net']);
  });
  it('rejects impossible IPs and dedupes', () => {
    expect(names('1.1.1.1 1.1.1.1 256.1.1.1 01.2.3.4', 'ip')).toEqual(['1.1.1.1']);
  });
  it('trims trailing punctuation and keeps the surrounding context for provenance', () => {
    const b = extractIndicators('Write to a@b.co, now. See (https://x.org/p).');
    expect(b.entities.map((e) => e.name)).toEqual(['https://x.org/p', 'a@b.co']);
    expect((b.entities[1].raw as { context: string }).context).toContain('Write to');
  });
  it('ignores short digit runs and dates as phone numbers', () => {
    expect(names('Ref +1234 and 2026-11-13 and 12345678', 'phone')).toEqual([]);
  });
  it('warns when nothing is found', () => {
    expect(extractIndicators('just words').warnings).toHaveLength(1);
  });
  it('passes the source address through', () => {
    expect(extractIndicators('a@b.co', { sourceUrl: 'https://s.org/a' }).entities[0].source_url).toBe('https://s.org/a');
  });
});

const ent = (id: string, type: Entity['type'], name: string, extra: Partial<Entity> = {}): Entity => ({
  id, type, name, aliases: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', attributes: {}, tags: [], markdownBody: '', ...extra,
});
const rel = (id: string, s: string, t: string, extra: Partial<Relationship> = {}): Relationship => ({
  id, type: 'Works for', source_entity: s, target_entity: t, directed: true, status: 'confirmed', confidence: 80, evidence: ['src1'], created_at: '2026-01-01T00:00:00Z', markdownBody: '', ...extra,
});
const data: ProjectData = {
  project: { id: 'p1', name: 'Case <1>', description: '' } as any,
  entities: [ent('a', 'person', 'Alice & Bob', { aliases: ['Al'] }), ent('b', 'company', 'Acme'), ent('c', 'phone', '+1 555 0100'), ent('d', 'ip', '2001:db8::1'), ent('e', 'domain', 'acme.test')],
  relationships: [rel('r1', 'a', 'b', { valid_from: '2020-06', valid_to: '2022' }), rel('r2', 'a', 'c'), rel('r3', 'b', 'e', { status: 'rejected' })],
  sources: [], notes: [],
};

describe('graph export', () => {
  it('GraphML escapes text, keeps dates and drops rejected links by default', () => {
    const x = toGraphML(data);
    expect(x).toContain('Alice &amp; Bob');
    expect(x).toContain('<edge id="r1"');
    expect(x).toContain('<data key="e_valid_from">2020-06</data>');
    expect(x).not.toContain('id="r3"');
    expect(toGraphML(data, { includeRejected: true })).toContain('id="r3"');
    expect(x).toContain('graph id="p1"');
  });
  it('GraphML tags are balanced and every edge points at an existing node', () => {
    const x = toGraphML(data, { includeRejected: true });
    for (const tag of ['node', 'edge', 'data', 'graph', 'graphml']) {
      const open = (x.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
      const close = (x.match(new RegExp(`</${tag}>`, 'g')) || []).length + (tag === 'node' || tag === 'edge' ? 0 : 0);
      expect(close).toBe(open);
    }
    const nodeIds = new Set([...x.matchAll(/<node id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of x.matchAll(/<edge id="[^"]+" source="([^"]+)" target="([^"]+)"/g)) {
      expect(nodeIds.has(m[1]) && nodeIds.has(m[2])).toBe(true);
    }
    expect(x).not.toMatch(/<[^>]*[^&;\w]&[^a-z#]/); // no raw ampersands inside tags
  });
  it('STIX maps types, skips unsupported ones and wires relationships', () => {
    const { bundle, skipped } = toStix(data);
    const types = bundle.objects.map((o) => o.type);
    expect(types).toEqual(expect.arrayContaining(['identity', 'ipv6-addr', 'domain-name', 'relationship']));
    expect(skipped).toEqual([{ name: '+1 555 0100', type: 'phone' }]);
    const rels = bundle.objects.filter((o) => o.type === 'relationship') as any[];
    expect(rels).toHaveLength(1); // r2 points at a skipped entity, r3 is rejected
    expect(rels[0]).toMatchObject({ relationship_type: 'works-for', confidence: 80, start_time: '2020-06-01T00:00:00.000Z', stop_time: '2022-01-01T00:00:00.000Z' });
    const ids = new Set(bundle.objects.map((o) => o.id));
    expect(ids.has(rels[0].source_ref) && ids.has(rels[0].target_ref)).toBe(true);
  });
  it('ids are stable, well-formed UUIDs', () => {
    expect(stableUuid('x')).toBe(stableUuid('x'));
    expect(stableUuid('x')).not.toBe(stableUuid('y'));
    expect(stableUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.stringify(toStix(data).bundle)).toBe(JSON.stringify(toStix(data).bundle));
  });
});
