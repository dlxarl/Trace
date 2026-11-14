/**
 * Interchange formats for the graph: GraphML (Gephi, yEd, Cytoscape, Neo4j
 * tools) and a STIX 2.1 bundle (MISP, OpenCTI, threat-intel platforms).
 * Pure functions over ProjectData; the caller saves the text.
 */
import { parsePartialDate, type Entity, type EntityType, type ProjectData, type Relationship } from '@/types';

export interface ExportOptions {
  /** Links marked Rejected are left out unless asked for. */
  includeRejected?: boolean;
}

function keepRels(data: ProjectData, o: ExportOptions): Relationship[] {
  const ids = new Set(data.entities.map((e) => e.id));
  return data.relationships.filter((r) => ids.has(r.source_entity) && ids.has(r.target_entity) && (o.includeRejected || r.status !== 'rejected'));
}

const xmlEsc = (v: unknown) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function toGraphML(data: ProjectData, o: ExportOptions = {}): string {
  const rels = keepRels(data, o);
  const node = (e: Entity) =>
    `    <node id="${xmlEsc(e.id)}">
      <data key="n_name">${xmlEsc(e.name)}</data>
      <data key="n_type">${xmlEsc(e.type)}</data>
      <data key="n_aliases">${xmlEsc(e.aliases.join('; '))}</data>
      <data key="n_tags">${xmlEsc((e.tags || []).join('; '))}</data>
      <data key="n_attributes">${xmlEsc(JSON.stringify(e.attributes || {}))}</data>
    </node>`;
  const edge = (r: Relationship) =>
    `    <edge id="${xmlEsc(r.id)}" source="${xmlEsc(r.source_entity)}" target="${xmlEsc(r.target_entity)}" directed="${r.directed !== false}">
      <data key="e_type">${xmlEsc(r.type)}</data>
      <data key="e_status">${xmlEsc(r.status)}</data>
      <data key="e_confidence">${r.confidence ?? ''}</data>
      <data key="e_valid_from">${xmlEsc(r.valid_from ?? '')}</data>
      <data key="e_valid_to">${xmlEsc(r.valid_to ?? '')}</data>
      <data key="e_sources">${xmlEsc((r.evidence || []).join('; '))}</data>
    </edge>`;
  const keys: [string, string, string][] = [
    ['n_name', 'node', 'name'], ['n_type', 'node', 'type'], ['n_aliases', 'node', 'aliases'], ['n_tags', 'node', 'tags'], ['n_attributes', 'node', 'attributes'],
    ['e_type', 'edge', 'type'], ['e_status', 'edge', 'status'], ['e_confidence', 'edge', 'confidence'], ['e_valid_from', 'edge', 'valid_from'], ['e_valid_to', 'edge', 'valid_to'], ['e_sources', 'edge', 'sources'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
${keys.map(([id, f, name]) => `  <key id="${id}" for="${f}" attr.name="${name}" attr.type="${id === 'e_confidence' ? 'double' : 'string'}"/>`).join('\n')}
  <graph id="${xmlEsc(data.project.id)}" edgedefault="directed">
${data.entities.map(node).join('\n')}
${rels.map(edge).join('\n')}
  </graph>
</graphml>
`;
}

// ── STIX 2.1 ────────────────────────────────────────────────────────────────

/** Stable UUID-shaped id from a string, so exporting twice gives the same ids. */
export function stableUuid(input: string): string {
  const h = [0x811c9dc5, 0x1b873593, 0xcc9e2d51, 0x85ebca6b];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ (c + k * 31), 0x01000193 + k * 2) >>> 0;
  }
  const hex = h.map((x) => x.toString(16).padStart(8, '0')).join('');
  const v = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${v}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const isV6 = (v: string) => v.includes(':');
const iso = (v: string | undefined) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
};

export interface StixResult {
  bundle: { type: 'bundle'; id: string; objects: Record<string, unknown>[] };
  /** Entities STIX has no standard object for (e.g. phone numbers). */
  skipped: { name: string; type: EntityType }[];
}

export function toStix(data: ProjectData, o: ExportOptions = {}): StixResult {
  const objects: Record<string, unknown>[] = [];
  const idOf = new Map<string, string>();
  const skipped: StixResult['skipped'] = [];
  const common = (type: string, e: Entity) => ({ type, spec_version: '2.1', id: `${type}--${stableUuid(`${data.project.id}/${e.id}`)}`, created: iso(e.created_at), modified: iso(e.updated_at) });

  for (const e of data.entities) {
    let obj: Record<string, unknown> | null = null;
    switch (e.type) {
      case 'person':
        obj = { ...common('identity', e), name: e.name, identity_class: 'individual', labels: e.aliases.length ? e.aliases.map((a) => `alias:${a}`) : undefined };
        break;
      case 'organization':
      case 'company':
        obj = { ...common('identity', e), name: e.name, identity_class: 'organization' };
        break;
      case 'location':
        obj = { ...common('location', e), name: e.name };
        break;
      case 'website':
        obj = { type: 'url', spec_version: '2.1', id: `url--${stableUuid(`${data.project.id}/${e.id}`)}`, value: e.name };
        break;
      case 'domain':
        obj = { type: 'domain-name', spec_version: '2.1', id: `domain-name--${stableUuid(`${data.project.id}/${e.id}`)}`, value: e.name };
        break;
      case 'email':
        obj = { type: 'email-addr', spec_version: '2.1', id: `email-addr--${stableUuid(`${data.project.id}/${e.id}`)}`, value: e.name };
        break;
      case 'ip':
        obj = { type: isV6(e.name) ? 'ipv6-addr' : 'ipv4-addr', spec_version: '2.1', id: `${isV6(e.name) ? 'ipv6-addr' : 'ipv4-addr'}--${stableUuid(`${data.project.id}/${e.id}`)}`, value: e.name };
        break;
      case 'network_interface':
        obj = { type: 'mac-addr', spec_version: '2.1', id: `mac-addr--${stableUuid(`${data.project.id}/${e.id}`)}`, value: e.name.toLowerCase() };
        break;
      case 'account':
        obj = { type: 'user-account', spec_version: '2.1', id: `user-account--${stableUuid(`${data.project.id}/${e.id}`)}`, user_id: e.name, account_login: e.name.replace(/^@/, '') };
        break;
      default:
        obj = null;
    }
    if (!obj) {
      skipped.push({ name: e.name, type: e.type });
      continue;
    }
    // Drop undefined so the JSON stays clean.
    for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
    idOf.set(e.id, obj.id as string);
    objects.push(obj);
  }

  for (const r of keepRels(data, o)) {
    const s = idOf.get(r.source_entity);
    const t = idOf.get(r.target_entity);
    if (!s || !t) continue;
    const rel: Record<string, unknown> = {
      type: 'relationship',
      spec_version: '2.1',
      id: `relationship--${stableUuid(`${data.project.id}/${r.id}`)}`,
      created: iso(r.created_at),
      modified: iso(r.created_at),
      relationship_type: (r.type || 'related-to').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'related-to',
      source_ref: s,
      target_ref: t,
      description: `Verification status in TRACE: ${r.status}`,
    };
    if (typeof r.confidence === 'number') rel.confidence = Math.max(0, Math.min(100, Math.round(r.confidence)));
    const start = parsePartialDate(r.valid_from);
    if (start) rel.start_time = new Date(start.ms).toISOString();
    const stop = parsePartialDate(r.valid_to);
    if (stop && (!start || stop.ms > start.ms)) rel.stop_time = new Date(stop.ms).toISOString();
    objects.push(rel);
  }

  return { bundle: { type: 'bundle', id: `bundle--${stableUuid(`${data.project.id}/bundle`)}`, objects }, skipped };
}
