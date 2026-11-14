import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../features/timeline/buildTimeline';
import { parsePartialDate } from '../types';
import { parseRelationshipFile, serializeRelationshipFile } from '../services/markdownParser';
import { buildReportModel, renderReportMarkdown } from '../services/report/buildReport';
import { createSampleProject } from '../services/storage/sampleData';
import { InvestigationIndex } from '../core/investigation';
import type { ProjectData, Relationship } from '../types';

describe('partial dates', () => {
  it('accepts YYYY, YYYY-MM and real YYYY-MM-DD only', () => {
    expect(parsePartialDate('2019')).toMatchObject({ precision: 'year', ms: Date.UTC(2019, 0, 1) });
    expect(parsePartialDate('2019-03')).toMatchObject({ precision: 'month', ms: Date.UTC(2019, 2, 1) });
    expect(parsePartialDate(' 2019-03-05 ')).toMatchObject({ precision: 'day', iso: '2019-03-05' });
    for (const bad of ['2019-13', '2019-02-31', '19-03', 'yesterday', '', null, 5, '2019/03/05']) expect(parsePartialDate(bad as any), String(bad)).toBeNull();
  });
});

describe('relationship dates in Markdown', () => {
  const rel: Relationship = { id: 'r', type: 'director_of', source_entity: 'a', target_entity: 'b', directed: true, status: 'confirmed', confidence: null, evidence: [], created_at: 'x', markdownBody: '', valid_from: '2019-03', valid_to: '2022-06-30' };
  it('round-trips, and old files without dates still load', () => {
    const back = parseRelationshipFile(serializeRelationshipFile(rel), 'r');
    expect(back).toMatchObject({ valid_from: '2019-03', valid_to: '2022-06-30' });
    const old = parseRelationshipFile(serializeRelationshipFile({ ...rel, valid_from: undefined, valid_to: undefined }), 'r');
    expect(old.valid_from).toBeUndefined();
  });
  it('keeps hand-written YAML dates as text and drops garbage', () => {
    const raw = '---\nid: r\ntype: t\nsource_entity: a\ntarget_entity: b\nstatus: confirmed\nvalid_from: 2019-03-05\nvalid_to: soon\ncreated_at: x\n---\n';
    const r = parseRelationshipFile(raw, 'r');
    expect(r.valid_from).toBe('2019-03-05');
    expect(r.valid_to).toBeUndefined();
  });
});

describe('timeline', () => {
  const data = (): ProjectData => {
    const d = createSampleProject();
    d.relationships = [
      { ...d.relationships[0], id: 'r1', valid_from: '2020', valid_to: '2022-06' },
      { ...d.relationships[1], id: 'r2', valid_from: '2018-05' },
      { ...d.relationships[2], id: 'r3', valid_to: '2019' },
      ...d.relationships.slice(3).map((r) => ({ ...r, valid_from: undefined, valid_to: undefined })),
    ];
    return d;
  };
  it('orders periods, marks ongoing ones and counts undated relationships', () => {
    const t = buildTimeline(data(), { includeSources: false, now: Date.UTC(2026, 10, 13) });
    expect(t.items.map((i) => i.id)).toEqual(['r2', 'r3', 'r1']);
    const p = Object.fromEntries(t.items.map((i) => [i.id, i])) as any;
    expect(p.r2.to).toBeNull();
    expect(p.r2.toText).toBe('ongoing');
    expect(p.r3).toMatchObject({ fromText: '?', from: Date.UTC(2019, 0, 1) });
    expect(t.undated).toBe(data().relationships.length - 3);
    expect(t.max).toBe(Date.UTC(2026, 10, 13)); // the axis extends to "now" for ongoing periods
  });
  it('filters by entity and includes source dates', () => {
    const d = data();
    const only = buildTimeline(d, { entityId: d.relationships[0].source_entity, includeSources: true });
    expect(only.items.some((i) => i.kind === 'period' && i.id === 'r1')).toBe(true);
    expect(only.items.every((i) => i.kind === 'source' || (i.kind === 'period' && i.entityIds.includes(d.relationships[0].source_entity)))).toBe(true);
    expect(buildTimeline(d, { includeSources: true }).items.some((i) => i.kind === 'source')).toBe(true);
  });
  it('is safe when nothing is dated', () => {
    const d = createSampleProject();
    const t = buildTimeline({ ...d, relationships: d.relationships.map((r) => ({ ...r, valid_from: undefined, valid_to: undefined })), sources: [] });
    expect(t.items).toEqual([]);
    expect(t.max).toBeGreaterThan(t.min);
  });
});

describe('dates in reports and MCP', () => {
  it('show the period of a relationship', () => {
    const d = createSampleProject();
    d.relationships[0] = { ...d.relationships[0], valid_from: '2019-03', valid_to: undefined };
    const md = renderReportMarkdown(buildReportModel(d, {}));
    expect(md).toContain('| Period |');
    expect(md).toContain('2019-03 – ongoing');
    const idx = new InvestigationIndex(d);
    expect(idx.relationshipDetails(d.relationships[0].id)).toMatchObject({ valid_from: '2019-03', valid_to: null });
  });
});

import { activeAt } from '../features/graph/asOf';
describe('graph "as of" date', () => {
  it('keeps undated links and unusable dates', () => {
    expect(activeAt({}, '2021')).toBe(true);
    expect(activeAt({ valid_from: '2020' }, 'nonsense')).toBe(true);
  });
  it('treats a year or month as the whole period', () => {
    const r = { valid_from: '2020-06', valid_to: '2021-02' };
    expect(activeAt(r, '2020')).toBe(true);
    expect(activeAt(r, '2021')).toBe(true);
    expect(activeAt(r, '2019')).toBe(false);
    expect(activeAt(r, '2022')).toBe(false);
    expect(activeAt(r, '2020-05-31')).toBe(false);
    expect(activeAt(r, '2021-02-28')).toBe(true);
    expect(activeAt(r, '2021-03-01')).toBe(false);
  });
  it('handles open-ended links', () => {
    expect(activeAt({ valid_from: '2020' }, '2030-01-01')).toBe(true);
    expect(activeAt({ valid_from: '2020' }, '2019-12-31')).toBe(false);
    expect(activeAt({ valid_to: '2020-03' }, '1999')).toBe(true);
    expect(activeAt({ valid_to: '2020-03' }, '2020-04')).toBe(false);
  });
});
