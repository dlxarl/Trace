import { describe, it, expect } from 'vitest';
import { applyFilters, hasFilters, NO_FILTERS, parseSavedSearches } from '../features/search/filters';
import { CASE_TEMPLATES, buildTemplateRecords, getTemplate } from '../services/templates/caseTemplates';
import type { SearchResult } from '../types';

const r = (o: Partial<SearchResult> & Pick<SearchResult, 'id' | 'type'>): SearchResult => ({ title: o.id, subtitle: '', ...o });
const results: SearchResult[] = [
  r({ id: 'e1', type: 'entity', entityType: 'person' }),
  r({ id: 'e2', type: 'entity', entityType: 'domain' }),
  r({ id: 'l1', type: 'relationship', relStatus: 'confirmed' }),
  r({ id: 'l2', type: 'relationship', relStatus: 'candidate' }),
  r({ id: 's1', type: 'source' }),
  r({ id: 'n1', type: 'note' }),
  r({ id: 'p', type: 'project' }),
];
const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(results, f).map((x) => x.id);

describe('search filters', () => {
  it('shows every record kind by default but never the project row', () => {
    expect(ids(NO_FILTERS)).toEqual(['e1', 'e2', 'l1', 'l2', 's1', 'n1']);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });
  it('filters by kind', () => {
    expect(ids({ ...NO_FILTERS, kinds: ['source', 'note'] })).toEqual(['s1', 'n1']);
  });
  it('an entity type or status alone means only those records', () => {
    expect(ids({ ...NO_FILTERS, entityType: 'person' })).toEqual(['e1']);
    expect(ids({ ...NO_FILTERS, status: 'candidate' })).toEqual(['l2']);
  });
  it('combines kind with type', () => {
    expect(ids({ kinds: ['entity', 'source'], entityType: 'domain', status: '' })).toEqual(['e2', 's1']);
  });
  it('parses saved searches defensively', () => {
    const out = parseSavedSearches([
      { id: 'a', name: 'People', query: 'rostova', filters: { kinds: ['entity', 'bogus'], entityType: 'person' } },
      { id: 'b', name: '  ', query: 'x' },
      { name: 'no id', query: 'x' },
      'junk',
      { id: 'c', name: 'No filters', query: 'q' },
    ]);
    expect(out.map((s) => s.id)).toEqual(['a', 'c']);
    expect(out[0].filters.kinds).toEqual(['entity']);
    expect(out[1].filters).toEqual(NO_FILTERS);
    expect(parseSavedSearches('nope')).toEqual([]);
  });
});

describe('case templates', () => {
  it('has a blank template that adds nothing', () => {
    expect(CASE_TEMPLATES[0].id).toBe('blank');
    expect(buildTemplateRecords(getTemplate('blank'), 'x')).toEqual({});
  });
  it('unknown ids fall back to blank', () => {
    expect(getTemplate('nope').id).toBe('blank');
  });
  it('creates a subject entity and a checklist note, without inventing facts', () => {
    const { entity, note } = buildTemplateRecords(getTemplate('domain'), ' example.com ', new Date('2026-11-13T10:00:00Z'));
    expect(entity).toMatchObject({ type: 'website', name: 'example.com', tags: ['subject'], attributes: {}, aliases: [] });
    expect(note?.markdownBody).toMatch(/^# Checklist — domain\n\n- \[ \] /);
    expect(note?.tags).toEqual(['checklist']);
  });
  it('skips the entity when no subject is given', () => {
    const { entity, note } = buildTemplateRecords(getTemplate('person'), '   ');
    expect(entity).toBeUndefined();
    expect(note).toBeDefined();
  });
  it('every template is well formed', () => {
    const idsSeen = new Set<string>();
    for (const t of CASE_TEMPLATES) {
      expect(idsSeen.has(t.id)).toBe(false);
      idsSeen.add(t.id);
      if (t.id !== 'blank') {
        expect(t.checklist.length).toBeGreaterThan(3);
        expect(t.objective.length).toBeGreaterThan(20);
      }
    }
  });
});
