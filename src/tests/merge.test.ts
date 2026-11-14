import { describe, it, expect } from 'vitest';
import { applyMerge, findDuplicateCandidates, planMerge } from '../services/merge/mergeEntities';
import { parseEntityFile, serializeEntityFile } from '../services/markdownParser';
import type { Entity, Note, ProjectData, Relationship } from '../types';

const ent = (id: string, name: string, extra: Partial<Entity> = {}): Entity => ({
  id, type: 'person', name, aliases: [], created_at: 'x', updated_at: 'x', attributes: {}, tags: [], markdownBody: '', ...extra,
});
const rel = (id: string, s: string, t: string, type = 'knows', extra: Partial<Relationship> = {}): Relationship => ({
  id, type, source_entity: s, target_entity: t, directed: true, status: 'candidate', confidence: null, evidence: [], created_at: 'x', markdownBody: '', ...extra,
});
const base = (): ProjectData => ({
  project: { id: 'p', type: 'project', name: 'P', created_at: '', updated_at: '', markdownBody: '' },
  entities: [
    ent('a', 'Elena Rostova', { aliases: ['E. Rostova'], attributes: { phone: '+44 1', email: '' }, tags: ['lead'], markdownBody: 'Main profile' }),
    ent('b', 'Елена Ростова', { aliases: ['elena_cipher'], attributes: { phone: '+44 2', telegram: '@elena' }, tags: ['tg'], markdownBody: 'Seen on Telegram' }),
    ent('c', 'Acme', { type: 'company' }),
    ent('d', 'Bob'),
  ],
  relationships: [
    rel('r1', 'b', 'c', 'works_at', { status: 'confirmed', evidence: ['s2'], confidence: 0.9 }),
    rel('r2', 'a', 'c', 'works_at', { status: 'unverified', evidence: ['s1'], confidence: 0.4 }),
    rel('r3', 'd', 'b', 'knows'),
    rel('r4', 'a', 'b', 'same_as'),
    rel('r5', 'd', 'c', 'knows'),
  ],
  sources: [],
  notes: [{ id: 'n1', type: 'note', title: 'N', tags: [], created_at: '', updated_at: '', markdownBody: 'See [[Елена Ростова]] and [[b|her]].' } as Note],
});

describe('planMerge', () => {
  it('merges names, tags and attributes without losing conflicting values', () => {
    const p = planMerge(base(), 'a', ['b'], new Date('2026-11-13T00:00:00Z'));
    expect(p.result.aliases).toEqual(['E. Rostova', 'Елена Ростова', 'elena_cipher']);
    expect(p.result.tags).toEqual(['lead', 'tg']);
    expect(p.result.attributes).toEqual({ phone: '+44 1', email: '', telegram: '@elena' });
    expect(p.conflicts).toEqual([{ from: 'Елена Ростова', key: 'phone', kept: '+44 1', other: '+44 2' }]);
    expect(p.result.markdownBody).toContain('Main profile');
    expect(p.result.markdownBody).toContain('Conflicting value for `phone`: +44 2 (kept: +44 1)');
    expect(p.result.markdownBody).toContain('Seen on Telegram');
    expect(p.result.extraFrontmatter?.merged_from).toEqual([{ id: 'b', name: 'Елена Ростова', type: 'person', merged_at: '2026-11-13T00:00:00.000Z' }]);
  });

  it('rewires relationships, folds duplicates (union evidence, stronger status) and drops self-loops', () => {
    const p = planMerge(base(), 'a', ['b']);
    expect(p.stats).toEqual({ rewired: 1, folded: 1, selfLoops: 1 });
    expect(p.deletedRelationshipIds.sort()).toEqual(['r1', 'r4']);
    const byId = Object.fromEntries(p.savedRelationships.map((r) => [r.id, r]));
    expect(byId.r3).toMatchObject({ source_entity: 'd', target_entity: 'a' }); // rewired
    expect(byId.r2).toMatchObject({ status: 'confirmed', confidence: 0.9 }); // survivor enriched
    expect(byId.r2.evidence.sort()).toEqual(['s1', 's2']);
    expect(p.savedRelationships.some((r) => r.source_entity === 'b' || r.target_entity === 'b')).toBe(false);
  });

  it('rewrites wikilinks in notes and keeps the original untouched', () => {
    const d = base();
    const p = planMerge(d, 'a', ['b']);
    expect(p.savedNotes[0].markdownBody).toBe('See [[Elena Rostova]] and [[Elena Rostova|her]].');
    expect(d.entities).toHaveLength(4); // input not mutated
    expect(d.notes[0].markdownBody).toContain('[[b|her]]');
  });

  it('merges several at once, accumulates history and validates input', () => {
    const d = base();
    d.entities[0] = { ...d.entities[0], extraFrontmatter: { merged_from: [{ id: 'old' }], custom: 1 } };
    const p = planMerge(d, 'a', ['b', 'd', 'b', 'a']);
    expect(p.merged.map((m) => m.id)).toEqual(['b', 'd']);
    expect((p.result.extraFrontmatter!.merged_from as unknown[]).length).toBe(3);
    expect(p.result.extraFrontmatter!.custom).toBe(1);
    expect(() => planMerge(d, 'a', [])).toThrow(/at least one/);
    expect(() => planMerge(d, 'a', ['zzz'])).toThrow(/not found/);
    expect(() => planMerge(d, 'zzz', ['a'])).toThrow(/not found/);
  });

  it('survives a Markdown round trip of the merge record', () => {
    const p = planMerge(base(), 'a', ['b']);
    const back = parseEntityFile(serializeEntityFile(p.result), 'a');
    expect(back.extraFrontmatter?.merged_from[0]).toMatchObject({ id: 'b', name: 'Елена Ростова' });
    expect(back.aliases).toContain('Елена Ростова');
  });
});

describe('applyMerge', () => {
  it('saves before it deletes, so cascades cannot remove rewired links', async () => {
    const calls: string[] = [];
    const store = {
      saveEntity: async (_p: string, e: Entity) => void calls.push(`saveEntity:${e.id}`),
      saveRelationship: async (_p: string, r: Relationship) => void calls.push(`saveRel:${r.id}`),
      deleteRelationship: async (_p: string, id: string) => void calls.push(`delRel:${id}`),
      saveNote: async (_p: string, n: Note) => void calls.push(`saveNote:${n.id}`),
      deleteEntity: async (_p: string, id: string) => void calls.push(`delEntity:${id}`),
    };
    await applyMerge(store, 'p', planMerge(base(), 'a', ['b']));
    expect(calls[0]).toBe('saveEntity:a');
    expect(calls.at(-1)).toBe('delEntity:b');
    expect(calls.indexOf('saveRel:r3')).toBeLessThan(calls.indexOf('delEntity:b'));
    expect(calls).toContain('saveNote:n1');
  });
});

describe('findDuplicateCandidates', () => {
  it('suggests same-name, alias and shared-attribute matches', () => {
    const d = base();
    d.entities.push(ent('e', 'elena rostova'), ent('f', 'X', { aliases: ['e. rostova'] }), ent('g', 'Other', { type: 'organization', attributes: { phone: '+44 1' } }), ent('h', 'Someone'));
    const got = Object.fromEntries(findDuplicateCandidates(d, 'a').map((c) => [c.entity.id, c.reason]));
    expect(got).toEqual({ e: 'same name', f: 'alias', g: 'shared attribute' });
    expect(findDuplicateCandidates(d, 'zzz')).toEqual([]);
  });
});
