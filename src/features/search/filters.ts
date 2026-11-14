import type { EntityType, RelationshipStatus, SearchResult } from '@/types';

export type RecordKind = 'entity' | 'relationship' | 'source' | 'note';
export const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: 'entity', label: 'Entities' },
  { kind: 'relationship', label: 'Links' },
  { kind: 'source', label: 'Sources' },
  { kind: 'note', label: 'Notes' },
];

export interface SearchFilters {
  /** Empty = all kinds. */
  kinds: RecordKind[];
  entityType: EntityType | '';
  status: RelationshipStatus | '';
}
export const NO_FILTERS: SearchFilters = { kinds: [], entityType: '', status: '' };

export const hasFilters = (f: SearchFilters) => f.kinds.length > 0 || !!f.entityType || !!f.status;

/** Entity type narrows entities only, status narrows links only; other kinds stay unless a kind filter hides them. */
export function applyFilters(results: SearchResult[], f: SearchFilters): SearchResult[] {
  return results.filter((r) => {
    if (r.type === 'project') return false;
    if (f.kinds.length && !f.kinds.includes(r.type as RecordKind)) return false;
    if (f.entityType && r.type === 'entity' && r.entityType !== f.entityType) return false;
    if (f.status && r.type === 'relationship' && r.relStatus !== f.status) return false;
    // An entity-type / status filter with no kind filter means "only those records".
    if (f.entityType && !f.kinds.length && r.type !== 'entity') return false;
    if (f.status && !f.kinds.length && r.type !== 'relationship') return false;
    return true;
  });
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
}

const KEY = (projectId: string) => `trace_saved_searches_${projectId}`;
const KINDS = new Set<string>(RECORD_KINDS.map((k) => k.kind));

export function parseSavedSearches(raw: unknown): SavedSearch[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedSearch[] = [];
  for (const r of raw.slice(0, 50)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, any>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.query !== 'string' || !o.name.trim()) continue;
    const f = o.filters && typeof o.filters === 'object' ? o.filters : {};
    out.push({
      id: o.id,
      name: o.name.slice(0, 60),
      query: o.query.slice(0, 300),
      filters: {
        kinds: Array.isArray(f.kinds) ? f.kinds.filter((k: unknown): k is RecordKind => typeof k === 'string' && KINDS.has(k)) : [],
        entityType: typeof f.entityType === 'string' ? (f.entityType as EntityType) : '',
        status: typeof f.status === 'string' ? (f.status as RelationshipStatus) : '',
      },
    });
  }
  return out;
}

export function loadSavedSearches(projectId: string): SavedSearch[] {
  try {
    return parseSavedSearches(JSON.parse(localStorage.getItem(KEY(projectId)) || '[]'));
  } catch {
    return [];
  }
}

export function storeSavedSearches(projectId: string, list: SavedSearch[]) {
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}
