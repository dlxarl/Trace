/** Rows for the Records view: one per entity, with the numbers people sort and filter by. */
import { admiraltyCode, type Entity, type EntityType, type ProjectData } from '@/types';

export interface RecordRow {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  tags: string[];
  /** Number of relationships touching the entity. */
  links: number;
  /** Relationships touching it that cite no source. */
  unsourced: number;
  /** Best Admiralty code among the sources behind its links ("A1" > "B2"), or "". */
  rating: string;
  updated_at: string;
}

export type SortKey = 'name' | 'type' | 'links' | 'unsourced' | 'rating' | 'updated_at';
export interface RecordFilter {
  query: string;
  type: EntityType | '';
  tag: string;
  /** all | none (no links) | unsourced (at least one link without a source) */
  links: 'all' | 'none' | 'unsourced';
}
export const NO_RECORD_FILTER: RecordFilter = { query: '', type: '', tag: '', links: 'all' };

/** Lower is better: A1 → 0, B2 → 11, F6 → 55; no code → 99. */
export function ratingRank(code: string): number {
  if (!code) return 99;
  const l = 'ABCDEF'.indexOf(code[0]);
  const c = Number(code[1]);
  return (l < 0 ? 9 : l) * 10 + (Number.isFinite(c) ? c - 1 : 9);
}

export function buildRecords(data: ProjectData): RecordRow[] {
  const src = new Map(data.sources.map((s) => [s.id, s]));
  const stats = new Map<string, { links: number; unsourced: number; best: string }>();
  const touch = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { links: 0, unsourced: 0, best: '' }));
    return s;
  };
  for (const r of data.relationships) {
    const codes = (r.evidence || []).map((e) => admiraltyCode(src.get(e) ?? {})).filter(Boolean);
    const bestHere = codes.sort((a, b) => ratingRank(a) - ratingRank(b))[0] ?? '';
    for (const id of [r.source_entity, r.target_entity]) {
      const s = touch(id);
      s.links++;
      if (!r.evidence || r.evidence.length === 0) s.unsourced++;
      if (bestHere && ratingRank(bestHere) < ratingRank(s.best)) s.best = bestHere;
    }
  }
  return data.entities.map((e: Entity) => {
    const s = stats.get(e.id);
    return { id: e.id, name: e.name, type: e.type, aliases: e.aliases, tags: e.tags ?? [], links: s?.links ?? 0, unsourced: s?.unsourced ?? 0, rating: s?.best ?? '', updated_at: e.updated_at };
  });
}

export function filterRecords(rows: RecordRow[], f: RecordFilter): RecordRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.tag && !r.tags.includes(f.tag)) return false;
    if (f.links === 'none' && r.links > 0) return false;
    if (f.links === 'unsourced' && r.unsourced === 0) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.aliases.some((a) => a.toLowerCase().includes(q)) || r.tags.some((t) => t.toLowerCase().includes(q)))) return false;
    return true;
  });
}

export function sortRecords(rows: RecordRow[], key: SortKey, dir: 'asc' | 'desc'): RecordRow[] {
  const m = dir === 'asc' ? 1 : -1;
  const cmp = (a: RecordRow, b: RecordRow) => {
    switch (key) {
      case 'links':
      case 'unsourced':
        return a[key] - b[key];
      case 'rating':
        return ratingRank(a.rating) - ratingRank(b.rating);
      case 'updated_at':
        return (Date.parse(a.updated_at) || 0) - (Date.parse(b.updated_at) || 0);
      default:
        return a[key].localeCompare(b[key], undefined, { sensitivity: 'base' });
    }
  };
  // Ties fall back to the name so the order is stable and predictable.
  return [...rows].sort((a, b) => m * cmp(a, b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export const allTags = (rows: RecordRow[]): string[] => [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));

/** Adds or removes a tag on entities; returns only the entities that actually change. */
export function applyTag(entities: Entity[], ids: Set<string>, tag: string, mode: 'add' | 'remove', now = new Date().toISOString()): Entity[] {
  const t = tag.trim();
  if (!t) return [];
  const out: Entity[] = [];
  for (const e of entities) {
    if (!ids.has(e.id)) continue;
    const has = (e.tags ?? []).includes(t);
    if (mode === 'add' && !has) out.push({ ...e, tags: [...(e.tags ?? []), t], updated_at: now });
    if (mode === 'remove' && has) out.push({ ...e, tags: e.tags.filter((x) => x !== t), updated_at: now });
  }
  return out;
}
