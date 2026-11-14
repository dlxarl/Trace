import { describe, it, expect } from 'vitest';
import { applyTag, buildRecords, filterRecords, NO_RECORD_FILTER, ratingRank, sortRecords } from '../features/records/buildRecords';
import type { Entity, ProjectData, Relationship, Source } from '../types';

const ent = (id: string, name: string, type: Entity['type'] = 'person', extra: Partial<Entity> = {}): Entity => ({
  id, type, name, aliases: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', attributes: {}, tags: [], markdownBody: '', ...extra,
});
const rel = (id: string, s: string, t: string, evidence: string[] = []): Relationship => ({
  id, type: 'knows', source_entity: s, target_entity: t, directed: true, status: 'confirmed', confidence: null, evidence, created_at: '2026-01-01T00:00:00Z', markdownBody: '',
});
const src = (id: string, reliability?: Source['reliability'], credibility?: Source['credibility']): Source => ({ id, type: 'source', title: id, accessed_at: '2026-01-01T00:00:00Z', source_type: 'webpage', reliability, credibility, markdownBody: '' });

const data: ProjectData = {
  project: { id: 'p', name: 'P' } as any,
  entities: [ent('a', 'Alice', 'person', { tags: ['vip'], aliases: ['Al'] }), ent('b', 'Bob', 'person', { updated_at: '2026-03-01T00:00:00Z' }), ent('c', 'acme.test', 'domain', { tags: ['vip', 'infra'] }), ent('d', 'Lonely', 'person')],
  relationships: [rel('r1', 'a', 'b', ['s1']), rel('r2', 'a', 'c', []), rel('r3', 'b', 'c', ['s1', 's2'])],
  sources: [src('s1', 'C', '3'), src('s2', 'A', '1')],
  notes: [],
};

describe('records', () => {
  const rows = buildRecords(data);
  const by = (id: string) => rows.find((r) => r.id === id)!;

  it('counts links, unsourced links and the best rating', () => {
    expect(by('a')).toMatchObject({ links: 2, unsourced: 1, rating: 'C3' });
    expect(by('b')).toMatchObject({ links: 2, unsourced: 0, rating: 'A1' });
    expect(by('c')).toMatchObject({ links: 2, unsourced: 1, rating: 'A1' });
    expect(by('d')).toMatchObject({ links: 0, unsourced: 0, rating: '' });
  });
  it('ranks ratings so A1 beats B2 beats nothing', () => {
    expect(ratingRank('A1')).toBeLessThan(ratingRank('B2'));
    expect(ratingRank('F6')).toBeLessThan(ratingRank(''));
    expect(ratingRank('A')).toBeLessThan(ratingRank('B'));
  });
  it('filters by text (name, alias, tag), type, tag and link state', () => {
    const f = (o: Partial<typeof NO_RECORD_FILTER>) => filterRecords(rows, { ...NO_RECORD_FILTER, ...o }).map((r) => r.id);
    expect(f({ query: 'al' })).toEqual(['a']);
    expect(f({ query: 'lone' })).toEqual(['d']);
    expect(f({ query: 'INFRA' })).toEqual(['c']);
    expect(f({ type: 'domain' })).toEqual(['c']);
    expect(f({ tag: 'vip' })).toEqual(['a', 'c']);
    expect(f({ links: 'none' })).toEqual(['d']);
    expect(f({ links: 'unsourced' })).toEqual(['a', 'c']);
    expect(f({ type: 'person', tag: 'vip' })).toEqual(['a']);
  });
  it('sorts by every column, stably, in both directions', () => {
    const ids = (k: Parameters<typeof sortRecords>[1], d: 'asc' | 'desc') => sortRecords(rows, k, d).map((r) => r.id);
    expect(ids('name', 'asc')).toEqual(['c', 'a', 'b', 'd'].sort((x, y) => by(x).name.localeCompare(by(y).name, undefined, { sensitivity: 'base' })));
    expect(ids('links', 'desc').slice(0, 3)).toEqual(['c', 'a', 'b']); // equal counts fall back to name
    expect(ids('rating', 'asc').slice(0, 2)).toEqual(['c', 'b']); // both A1, then by name
    expect(ids('rating', 'asc').at(-1)).toBe('d');
    expect(ids('updated_at', 'desc')[0]).toBe('b');
  });
  it('adds and removes tags, touching only entities that change', () => {
    const add = applyTag(data.entities, new Set(['a', 'b']), 'vip', 'add', '2026-05-05T00:00:00Z');
    expect(add.map((e) => e.id)).toEqual(['b']);
    expect(add[0].tags).toEqual(['vip']);
    expect(add[0].updated_at).toBe('2026-05-05T00:00:00Z');
    const rm = applyTag(data.entities, new Set(['a', 'c', 'd']), 'vip', 'remove');
    expect(rm.map((e) => e.id)).toEqual(['a', 'c']);
    expect(rm.find((e) => e.id === 'c')!.tags).toEqual(['infra']);
    expect(applyTag(data.entities, new Set(['a']), '  ', 'add')).toEqual([]);
  });
});

import { countLines, scratchText, SCRATCH_ID } from '../components/common/Scratchpad';
describe('scratchpad helpers', () => {
  it('reads the scratchpad note body and counts non-empty lines', () => {
    const notes = [{ id: SCRATCH_ID, markdownBody: 'a\n\n  \nb\n' }, { id: 'x', markdownBody: 'other' }] as any;
    expect(scratchText(notes)).toBe('a\n\n  \nb\n');
    expect(scratchText([])).toBe('');
    expect(countLines('a\n\n  \nb\n')).toBe(2);
    expect(countLines('')).toBe(0);
  });
});
