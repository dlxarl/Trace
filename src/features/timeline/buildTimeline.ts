/**
 * Timeline model: relationships with a time period, and the dates sources were
 * accessed or preserved. Pure, so it is easy to test.
 */
import { parsePartialDate, type ProjectData, type RelationshipStatus } from '@/types';

export interface PeriodItem {
  kind: 'period';
  id: string;
  label: string; // "Elena → Acme (works_at)"
  type: string;
  status: RelationshipStatus;
  from: number;
  to: number | null; // null = ongoing
  fromText: string;
  toText: string;
  entityIds: string[];
}
export interface SourceItem {
  kind: 'source';
  id: string;
  label: string;
  at: number;
  atText: string;
  preserved: boolean;
}
export type TimelineItem = PeriodItem | SourceItem;

export interface Timeline {
  items: TimelineItem[];
  min: number;
  max: number;
  /** Relationships with no valid_from/valid_to — shown as a count, not guessed. */
  undated: number;
}

const DAY = 86_400_000;

export function buildTimeline(data: ProjectData, opts: { entityId?: string | null; includeSources?: boolean; now?: number } = {}): Timeline {
  const name = (id: string) => data.entities.find((e) => e.id === id)?.name ?? id;
  const items: TimelineItem[] = [];
  let undated = 0;
  for (const r of data.relationships) {
    if (opts.entityId && r.source_entity !== opts.entityId && r.target_entity !== opts.entityId) continue;
    const from = parsePartialDate(r.valid_from);
    const to = parsePartialDate(r.valid_to);
    if (!from && !to) {
      undated++;
      continue;
    }
    // Only an end date: the period ends there, start unknown — drawn from the end date.
    const start = (from ?? to)!.ms;
    items.push({
      kind: 'period',
      id: r.id,
      label: `${name(r.source_entity)} ${r.directed === false ? '—' : '→'} ${name(r.target_entity)}`,
      type: r.type,
      status: r.status,
      from: start,
      to: to ? to.ms : null,
      fromText: from?.iso ?? '?',
      toText: to?.iso ?? 'ongoing',
      entityIds: [r.source_entity, r.target_entity],
    });
  }
  if (opts.includeSources !== false) {
    const cited = opts.entityId
      ? new Set(data.relationships.filter((r) => r.source_entity === opts.entityId || r.target_entity === opts.entityId).flatMap((r) => r.evidence || []))
      : null;
    for (const s of data.sources) {
      if (cited && !cited.has(s.id)) continue;
      const t = Date.parse(s.accessed_at);
      if (isNaN(t)) continue;
      items.push({ kind: 'source', id: s.id, label: s.title, at: t, atText: new Date(t).toISOString().slice(0, 10), preserved: !!s.captures?.length });
    }
  }
  const start = (i: TimelineItem) => (i.kind === 'period' ? i.from : i.at);
  items.sort((a, b) => start(a) - start(b) || a.label.localeCompare(b.label));
  const now = opts.now ?? Date.now();
  const edges = items.flatMap((i) => (i.kind === 'period' ? [i.from, i.to ?? now] : [i.at]));
  const min = edges.length ? Math.min(...edges) : now;
  const max = edges.length ? Math.max(...edges) : now;
  return { items, min, max: max === min ? min + DAY * 30 : max, undated };
}
