/**
 * Merging duplicate entities.
 *
 * planMerge() is pure: it computes what the merge would change, without
 * touching storage, so the UI can preview it. applyMerge() performs the
 * changes through the normal storage interface in a safe order (rewired
 * relationships are saved before the merged entities are deleted, so the
 * delete's cascade cannot remove them).
 *
 * Nothing is lost silently:
 *  - names of merged entities become aliases of the kept one;
 *  - attributes the kept entity lacks are adopted; conflicting values are
 *    kept in an "Merged from …" section of the entity's notes;
 *  - relationships are rewired; exact duplicates (same endpoints and type)
 *    are folded into one with the union of their evidence;
 *  - the merge is recorded in the kept entity's `merged_from` frontmatter.
 */
import { RELATIONSHIP_STATUSES, type Entity, type Note, type ProjectData, type Relationship } from '@/types';
import { normaliseName } from '@/services/import/plan';
import type { IStorageService } from '@/services/storage/IStorageService';

export interface MergeConflict {
  from: string; // merged entity name
  key: string;
  kept: string;
  other: string;
}

export interface MergePlan {
  keep: Entity;
  merged: Entity[];
  /** The kept entity as it will be saved. */
  result: Entity;
  /** Relationships to save (rewired, or enriched with evidence from duplicates). */
  savedRelationships: Relationship[];
  /** Relationships to delete (self-loops created by the merge, folded duplicates). */
  deletedRelationshipIds: string[];
  /** Notes whose [[wikilinks]] to merged entities were rewritten. */
  savedNotes: Note[];
  conflicts: MergeConflict[];
  addedAliases: string[];
  stats: { rewired: number; folded: number; selfLoops: number };
}

const rank = (s: string) => RELATIONSHIP_STATUSES.findIndex((x) => x.status === s); // 0 = strongest

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function planMerge(data: ProjectData, keepId: string, mergeIds: string[], now: Date = new Date()): MergePlan {
  const keep = data.entities.find((e) => e.id === keepId);
  if (!keep) throw new Error('The entity to keep was not found');
  const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (ids.length === 0) throw new Error('Choose at least one other entity to merge');
  const merged = ids.map((id) => {
    const e = data.entities.find((x) => x.id === id);
    if (!e) throw new Error(`Entity ${id} was not found`);
    return e;
  });
  const gone = new Set(ids);

  // ── entity fields ────────────────────────────────────────────────────────
  const aliasSeen = new Set([keep.name, ...(keep.aliases || [])].map((a) => a.trim().toLowerCase()));
  const addedAliases: string[] = [];
  const addAlias = (a: string) => {
    const t = a.trim();
    if (t && !aliasSeen.has(t.toLowerCase())) {
      aliasSeen.add(t.toLowerCase());
      addedAliases.push(t);
    }
  };
  merged.forEach((m) => {
    addAlias(m.name);
    (m.aliases || []).forEach(addAlias);
  });

  const attributes: Record<string, any> = { ...(keep.attributes || {}) };
  const conflicts: MergeConflict[] = [];
  const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
  merged.forEach((m) => {
    for (const [k, v] of Object.entries(m.attributes || {})) {
      if (isEmpty(v)) continue;
      if (isEmpty(attributes[k])) attributes[k] = v;
      else if (JSON.stringify(attributes[k]) !== JSON.stringify(v)) conflicts.push({ from: m.name, key: k, kept: String(attributes[k]), other: String(v) });
    }
  });

  const tags = [...new Set([...(keep.tags || []), ...merged.flatMap((m) => m.tags || [])])];
  const stamp = now.toISOString();
  let body = keep.markdownBody || '';
  const extraBodies = merged.filter((m) => (m.markdownBody || '').trim() && (m.markdownBody || '').trim() !== (keep.markdownBody || '').trim());
  if (extraBodies.length || conflicts.length) {
    const lines = [`\n\n## Merged from other entities (${stamp.slice(0, 10)})`];
    for (const m of merged) {
      const own = conflicts.filter((c) => c.from === m.name);
      const hasBody = extraBodies.includes(m);
      if (!hasBody && own.length === 0) continue;
      lines.push(`\n### ${m.name}`);
      own.forEach((c) => lines.push(`- Conflicting value for \`${c.key}\`: ${c.other} (kept: ${c.kept})`));
      if (hasBody) lines.push(`\n${(m.markdownBody || '').trim()}`);
    }
    body = `${body.trimEnd()}${lines.join('\n')}\n`;
  }

  const prior = Array.isArray(keep.extraFrontmatter?.merged_from) ? (keep.extraFrontmatter!.merged_from as unknown[]) : [];
  const result: Entity = {
    ...keep,
    aliases: [...(keep.aliases || []), ...addedAliases],
    tags,
    attributes,
    markdownBody: body,
    updated_at: stamp,
    extraFrontmatter: {
      ...(keep.extraFrontmatter || {}),
      merged_from: [...prior, ...merged.map((m) => ({ id: m.id, name: m.name, type: m.type, merged_at: stamp }))],
    },
  };

  // ── relationships ────────────────────────────────────────────────────────
  const touching = data.relationships.filter((r) => gone.has(r.source_entity) || gone.has(r.target_entity));
  const keyOf = (r: { source_entity: string; target_entity: string; type: string }) => `${r.source_entity}>${r.target_entity}|${r.type}`;
  const rewired = new Map<string, Relationship>();
  const deleted = new Set<string>();
  let selfLoops = 0;
  let folded = 0;

  // Keys already present among relationships that are not touched by the merge.
  const survivors = new Map<string, Relationship>();
  data.relationships.filter((r) => !gone.has(r.source_entity) && !gone.has(r.target_entity)).forEach((r) => survivors.set(keyOf(r), r));
  const updatedSurvivors = new Map<string, Relationship>();

  for (const r of touching) {
    const next: Relationship = {
      ...r,
      source_entity: gone.has(r.source_entity) ? keepId : r.source_entity,
      target_entity: gone.has(r.target_entity) ? keepId : r.target_entity,
    };
    if (next.source_entity === next.target_entity) {
      deleted.add(r.id); // a link between the duplicates themselves
      selfLoops++;
      continue;
    }
    const k = keyOf(next);
    const existing = rewired.get(k) ?? updatedSurvivors.get(k) ?? survivors.get(k);
    if (existing) {
      // Same claim already exists: keep one, union the evidence, keep the stronger status.
      const combined: Relationship = {
        ...existing,
        evidence: [...new Set([...(existing.evidence || []), ...(next.evidence || [])])],
        status: rank(next.status) < rank(existing.status) ? next.status : existing.status,
        confidence: existing.confidence == null ? next.confidence : next.confidence == null ? existing.confidence : Math.max(existing.confidence, next.confidence),
      };
      if (rewired.has(k)) rewired.set(k, combined);
      else if (survivors.has(k) || updatedSurvivors.has(k)) updatedSurvivors.set(k, combined);
      deleted.add(r.id);
      folded++;
    } else {
      rewired.set(k, next);
    }
  }
  // A relationship folded into an earlier rewired one must not be saved under its own id.
  const rewiredList = [...rewired.values()].filter((r) => !deleted.has(r.id));
  const savedRelationships = [...rewiredList, ...updatedSurvivors.values()];

  // ── notes: [[Merged Name]] → [[Kept Name]] ───────────────────────────────
  const savedNotes: Note[] = [];
  for (const n of data.notes) {
    let text = n.markdownBody || '';
    let changed = false;
    for (const m of merged) {
      for (const ref of [m.name, m.id]) {
        const re = new RegExp(`\\[\\[\\s*${escapeRe(ref)}\\s*(\\|[^\\]]*)?\\]\\]`, 'gi');
        const next = text.replace(re, (_x, alias) => `[[${keep.name}${alias ?? ''}]]`);
        if (next !== text) {
          text = next;
          changed = true;
        }
      }
    }
    if (changed) savedNotes.push({ ...n, markdownBody: text, updated_at: stamp });
  }

  return {
    keep,
    merged,
    result,
    savedRelationships,
    deletedRelationshipIds: [...deleted],
    savedNotes,
    conflicts,
    addedAliases,
    stats: { rewired: rewiredList.length, folded, selfLoops },
  };
}

/** Performs the merge through the storage layer. Order matters: see the file header. */
export async function applyMerge(storage: Pick<IStorageService, 'saveEntity' | 'saveRelationship' | 'deleteRelationship' | 'saveNote' | 'deleteEntity'>, projectId: string, plan: MergePlan): Promise<void> {
  await storage.saveEntity(projectId, plan.result);
  for (const r of plan.savedRelationships) await storage.saveRelationship(projectId, r);
  for (const id of plan.deletedRelationshipIds) await storage.deleteRelationship(projectId, id);
  for (const n of plan.savedNotes) await storage.saveNote(projectId, n);
  for (const m of plan.merged) await storage.deleteEntity(projectId, m.id);
}

// ── Finding likely duplicates ───────────────────────────────────────────────

export interface DuplicateCandidate {
  entity: Entity;
  reason: 'same name' | 'alias' | 'shared attribute';
}

/** Other entities of the same type that look like the same real-world thing. */
export function findDuplicateCandidates(data: ProjectData, entityId: string): DuplicateCandidate[] {
  const e = data.entities.find((x) => x.id === entityId);
  if (!e) return [];
  const names = new Set([e.name, ...(e.aliases || [])].map((n) => normaliseName(e.type, n)));
  const attrVals = new Set(
    Object.values(e.attributes || {})
      .filter((v) => typeof v === 'string' && v.trim().length >= 5)
      .map((v) => (v as string).trim().toLowerCase()),
  );
  const out: DuplicateCandidate[] = [];
  for (const o of data.entities) {
    if (o.id === e.id) continue;
    const oNames = [o.name, ...(o.aliases || [])].map((n) => normaliseName(o.type, n));
    if (o.type === e.type && normaliseName(o.type, o.name) === normaliseName(e.type, e.name)) out.push({ entity: o, reason: 'same name' });
    else if (o.type === e.type && oNames.some((n) => names.has(n))) out.push({ entity: o, reason: 'alias' });
    else if (Object.values(o.attributes || {}).some((v) => typeof v === 'string' && attrVals.has(v.trim().toLowerCase()))) out.push({ entity: o, reason: 'shared attribute' });
  }
  return out;
}
