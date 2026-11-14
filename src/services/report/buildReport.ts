/**
 * Case report: turns an investigation into a document for a client, editor or
 * court file. Pure functions — the same model renders to Markdown and to a
 * self-contained, print-ready HTML page (which the desktop app turns into PDF).
 *
 * Every claim (relationship) is listed with its verification status, evidence
 * class and numbered source references; sources carry their rating, capture
 * date and the SHA-256 of preserved copies.
 */
import {
  ENTITY_TYPES,
  EVIDENCE_CLASSES,
  INFO_CREDIBILITY,
  RELATIONSHIP_STATUSES,
  SOURCE_RELIABILITY,
  admiraltyCode,
  evidenceClassOf,
  type Entity,
  type ProjectData,
  type Relationship,
  type Source,
} from '@/types';

export interface ReportOptions {
  /** Include relationships marked rejected (disproven). Default false. */
  includeRejected?: boolean;
  /** Include entity attributes. Default true. */
  includeAttributes?: boolean;
  /** Include investigator notes. Default false. */
  includeNotes?: boolean;
  /** Author / organisation line. */
  author?: string;
  /** PNG data URL of the graph, if available. */
  graphImage?: string;
  generatedAt?: Date;
  appVersion?: string;
}

export interface ReportModel {
  title: string;
  generatedAt: string;
  author?: string;
  appVersion?: string;
  brief: string;
  stats: { label: string; value: string }[];
  keyEntities: { name: string; type: string; links: number }[];
  entityGroups: { type: string; entities: { name: string; aliases: string[]; attributes: [string, string][] }[] }[];
  claims: {
    from: string;
    to: string;
    type: string;
    directed: boolean;
    status: string;
    evidenceClass: string;
    confidence: string;
    period: string;
    refs: number[];
    explanation: string;
  }[];
  unsourcedCount: number;
  sources: {
    n: number;
    title: string;
    url?: string;
    archiveUrl?: string;
    type: string;
    accessed: string;
    rating: string;
    ratingText: string;
    cited: number;
    captures: { at: string; files: { name: string; sha256: string }[] }[];
  }[];
  notes: { title: string; body: string }[];
  graphImage?: string;
}

const typeLabel = (t: string) => ENTITY_TYPES.find((x) => x.type === t)?.label ?? t;
const day = (iso?: string) => (iso && !isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : iso || '');

/** First paragraphs of a Markdown body without headings, for use as plain prose. */
function prose(md: string, max = 1200): string {
  const text = (md || '')
    .split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l) && !/^\s*---\s*$/.test(l))
    .join('\n')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Relationship bodies start from a template; don't print the untouched template. */
function explanationOf(r: Relationship): string {
  const p = prose(r.markdownBody, 600);
  return /Describe why this relationship is being considered|Document supporting and contradicting observations/.test(p) ? '' : p;
}

export function buildReportModel(data: ProjectData, opts: ReportOptions = {}): ReportModel {
  const includeAttributes = opts.includeAttributes !== false;
  const entityById = new Map<string, Entity>(data.entities.map((e) => [e.id, e]));
  const nameOf = (id: string) => entityById.get(id)?.name ?? id;

  const rels = data.relationships.filter((r) => opts.includeRejected || r.status !== 'rejected');
  const degree = new Map<string, number>();
  rels.forEach((r) => {
    degree.set(r.source_entity, (degree.get(r.source_entity) || 0) + 1);
    degree.set(r.target_entity, (degree.get(r.target_entity) || 0) + 1);
  });

  // Sources are numbered in the order they are first cited; uncited ones follow.
  const order: Source[] = [];
  const numberOf = new Map<string, number>();
  const cite = (id: string) => {
    const s = data.sources.find((x) => x.id === id);
    if (!s) return 0;
    if (!numberOf.has(id)) {
      order.push(s);
      numberOf.set(id, order.length);
    }
    return numberOf.get(id)!;
  };
  const statusRank = Object.fromEntries(RELATIONSHIP_STATUSES.map((s, i) => [s.status, i]));
  const sorted = [...rels].sort(
    (a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || nameOf(a.source_entity).localeCompare(nameOf(b.source_entity)),
  );
  const claims = sorted.map((r) => ({
    from: nameOf(r.source_entity),
    to: nameOf(r.target_entity),
    type: r.type,
    directed: r.directed !== false,
    status: RELATIONSHIP_STATUSES.find((x) => x.status === r.status)?.label ?? r.status,
    evidenceClass: EVIDENCE_CLASSES.find((x) => x.cls === evidenceClassOf(r.status))?.label ?? '',
    period: r.valid_from || r.valid_to ? `${r.valid_from || '?'} – ${r.valid_to || 'ongoing'}` : '',
    confidence: typeof r.confidence === 'number' ? `${Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1))}%` : '',
    refs: [...new Set((r.evidence || []).map(cite).filter((n) => n > 0))],
    explanation: explanationOf(r),
  }));
  data.sources.forEach((s) => cite(s.id));
  const citedCount = new Map<string, number>();
  rels.forEach((r) => (r.evidence || []).forEach((id) => citedCount.set(id, (citedCount.get(id) || 0) + 1)));

  const groups = ENTITY_TYPES.map((t) => ({
    type: t.label,
    entities: data.entities
      .filter((e) => e.type === t.type)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        name: e.name,
        aliases: e.aliases || [],
        attributes: includeAttributes
          ? Object.entries(e.attributes || {})
              .filter(([k, v]) => v != null && typeof v !== 'object' && String(v).trim() !== '' && !/^(photo|image|avatar)$/i.test(k))
              .map(([k, v]) => [k, String(v)] as [string, string])
          : [],
      })),
  })).filter((g) => g.entities.length > 0);
  const known = new Set(ENTITY_TYPES.map((t) => t.type as string));
  const other = data.entities.filter((e) => !known.has(e.type));
  if (other.length) groups.push({ type: 'Other', entities: other.map((e) => ({ name: e.name, aliases: e.aliases || [], attributes: [] })) });

  const unsourced = rels.filter((r) => !r.evidence || r.evidence.length === 0).length;
  const byClass = (c: string) => rels.filter((r) => evidenceClassOf(r.status) === c).length;

  return {
    title: data.project.name,
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    author: opts.author?.trim() || undefined,
    appVersion: opts.appVersion,
    brief: prose(data.project.markdownBody, 3000),
    stats: [
      { label: 'Entities', value: String(data.entities.length) },
      { label: 'Relationships', value: String(rels.length) },
      { label: 'Observed facts', value: String(byClass('observed')) },
      { label: 'Hypotheses', value: String(byClass('hypothesis')) },
      ...(opts.includeRejected ? [{ label: 'Disproven', value: String(byClass('disproven')) }] : []),
      { label: 'Sources', value: String(data.sources.length) },
      { label: 'Unsourced relationships', value: String(unsourced) },
    ],
    keyEntities: data.entities
      .map((e) => ({ name: e.name, type: typeLabel(e.type), links: degree.get(e.id) || 0 }))
      .filter((e) => e.links > 0)
      .sort((a, b) => b.links - a.links || a.name.localeCompare(b.name))
      .slice(0, 10),
    entityGroups: groups,
    claims,
    unsourcedCount: unsourced,
    sources: order.map((s, i) => ({
      n: i + 1,
      title: s.title,
      url: s.url || undefined,
      archiveUrl: s.archive_url,
      type: s.source_type,
      accessed: day(s.accessed_at),
      rating: admiraltyCode(s),
      ratingText: [
        s.reliability ? SOURCE_RELIABILITY.find((r) => r.code === s.reliability)?.label : '',
        s.credibility ? INFO_CREDIBILITY.find((c) => c.code === s.credibility)?.label : '',
      ]
        .filter(Boolean)
        .join('; '),
      cited: citedCount.get(s.id) || 0,
      captures: (s.captures || []).map((c) => ({ at: c.captured_at, files: c.files.map((f) => ({ name: f.name, sha256: f.sha256 })) })),
    })),
    notes: opts.includeNotes ? data.notes.map((n) => ({ title: n.title, body: prose(n.markdownBody, 4000) })) : [],
    graphImage: opts.graphImage && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(opts.graphImage) ? opts.graphImage : undefined,
  };
}

// ── Markdown ───────────────────────────────────────────────────────────────

const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
const refs = (r: number[]) => (r.length ? r.map((n) => `[S${n}]`).join(' ') : '—');

export function renderReportMarkdown(m: ReportModel): string {
  const out: string[] = [];
  out.push(`# ${m.title}`, '');
  out.push(`*Investigation report · generated ${m.generatedAt.slice(0, 16).replace('T', ' ')} UTC${m.author ? ` · ${m.author}` : ''}*`, '');
  if (m.brief) out.push('## Summary', '', m.brief, '');
  out.push('## At a glance', '', ...m.stats.map((s) => `- **${s.label}:** ${s.value}`), '');
  if (m.keyEntities.length) {
    out.push('## Key entities', '', '| Entity | Type | Links |', '| :--- | :--- | ---: |');
    m.keyEntities.forEach((e) => out.push(`| ${mdCell(e.name)} | ${e.type} | ${e.links} |`));
    out.push('');
  }
  out.push('## Findings', '');
  if (m.claims.length === 0) out.push('No relationships recorded.', '');
  else {
    out.push('| From | Relationship | To | Period | Status | Evidence class | Confidence | Sources |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    m.claims.forEach((c) =>
      out.push(`| ${mdCell(c.from)} | ${mdCell(c.type)} ${c.directed ? '→' : '—'} | ${mdCell(c.to)} | ${c.period || '—'} | ${c.status} | ${c.evidenceClass} | ${c.confidence || '—'} | ${refs(c.refs)} |`),
    );
    out.push('');
    const explained = m.claims.filter((c) => c.explanation);
    if (explained.length) {
      out.push('### Reasoning', '');
      explained.forEach((c) => out.push(`**${c.from} ${c.directed ? '→' : '—'} ${c.to} (${c.type}).** ${c.explanation.replace(/\n+/g, ' ')}`, ''));
    }
    if (m.unsourcedCount > 0) out.push(`> ${m.unsourcedCount} relationship(s) cite no source and should be read as unverified.`, '');
  }
  out.push('## Entities', '');
  m.entityGroups.forEach((g) => {
    out.push(`### ${g.type} (${g.entities.length})`, '');
    g.entities.forEach((e) => {
      out.push(`- **${e.name}**${e.aliases.length ? ` (aka ${e.aliases.join(', ')})` : ''}`);
      e.attributes.forEach(([k, v]) => out.push(`  - ${k}: ${v.replace(/\n+/g, ' ')}`));
    });
    out.push('');
  });
  out.push('## Sources', '');
  if (m.sources.length === 0) out.push('No sources recorded.', '');
  m.sources.forEach((s) => {
    out.push(`**[S${s.n}] ${s.title}**${s.rating ? ` · rating ${s.rating}` : ''}`);
    const meta = [s.type, s.accessed ? `accessed ${s.accessed}` : '', s.ratingText, `cited by ${s.cited}`].filter(Boolean).join(' · ');
    out.push(`  ${meta}`);
    if (s.url) out.push(`  ${s.url}`);
    if (s.archiveUrl) out.push(`  Archived: ${s.archiveUrl}`);
    s.captures.forEach((c) => {
      out.push(`  Preserved copy ${c.at.slice(0, 19).replace('T', ' ')} UTC:`);
      c.files.forEach((f) => out.push(`  - ${f.name} — SHA-256 \`${f.sha256}\``));
    });
    out.push('');
  });
  if (m.notes.length) {
    out.push('## Notes', '');
    m.notes.forEach((n) => out.push(`### ${n.title}`, '', n.body, ''));
  }
  out.push('---', `Generated with TRACE${m.appVersion ? ` ${m.appVersion}` : ''}. Statuses: ${RELATIONSHIP_STATUSES.map((s) => s.label).join(', ')}.`);
  return out.join('\n') + '\n';
}

// ── HTML ───────────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const e = escapeHtml;
/** Inline Markdown on already-escaped text: **bold**, *italic*, `code`. Nothing else is interpreted. */
const inline = (escaped: string) =>
  escaped
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');

/** Prose with simple Markdown: paragraphs, "- " / "1. " lists and inline emphasis. Input is escaped first. */
export function richText(t: string): string {
  const out: string[] = [];
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (bullets || numbered) {
      const tag = bullets ? 'ul' : 'ol';
      out.push(`<${tag}>${lines.map((l) => `<li>${inline(e(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')))}</li>`).join('')}</${tag}>`);
    } else {
      out.push(`<p>${lines.map((l) => inline(e(l))).join('<br>')}</p>`);
    }
  }
  return out.join('');
}
const paragraphs = richText;
/** Only http(s) links become clickable. */
const link = (url: string) => (/^https?:\/\//i.test(url) ? `<a href="${e(url)}">${e(url)}</a>` : e(url));

const CSS = `
*{box-sizing:border-box}
body{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:#1b1c20;background:#fff;margin:0}
main{max-width:900px;margin:0 auto;padding:40px 36px}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:15px;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid #d2d3d7;text-transform:uppercase;letter-spacing:.05em}
h3{font-size:13px;margin:16px 0 6px}
.meta{color:#666970;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e1e2e5;vertical-align:top}
code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;background:#f1f1f3;padding:0 3px;border-radius:2px}
th.num{text-align:right}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#666970;border-bottom:1px solid #c3c4c9}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.stat{border:1px solid #d2d3d7;border-radius:4px;padding:6px 10px;min-width:110px}
.stat b{display:block;font-size:17px}
.stat span{font-size:10.5px;color:#666970;text-transform:uppercase;letter-spacing:.05em}
.tag{display:inline-block;font-size:10.5px;padding:0 5px;border:1px solid #c3c4c9;border-radius:3px;white-space:nowrap}
.observed{color:#2f7a58;border-color:#2f7a58}.hypothesis{color:#94701f;border-color:#94701f}.disproven{color:#b04f4f;border-color:#b04f4f}
.ref{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#2f7d77}
.src{margin:0 0 12px;break-inside:avoid}
.src .t{font-weight:600}
.src .m{color:#666970;font-size:12px}
.hash{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#43464c;word-break:break-all}
.note{border-left:3px solid #c6a463;padding:2px 10px;color:#43464c;margin:8px 0}
ul{margin:4px 0 8px;padding-left:18px}
img.graph{max-width:100%;border:1px solid #d2d3d7;border-radius:4px;margin:6px 0}
footer{margin-top:32px;padding-top:8px;border-top:1px solid #d2d3d7;color:#8a8d94;font-size:11px}
a{color:#2f7d77;word-break:break-all}
@media print{main{padding:0;max-width:none}h2{break-after:avoid}tr,.src{break-inside:avoid}a{color:inherit;text-decoration:none}}
`;

export function renderReportHtml(m: ReportModel): string {
  const cls = (c: string) => (c.startsWith('Observed') ? 'observed' : c.startsWith('Disproven') ? 'disproven' : 'hypothesis');
  const parts: string[] = [];
  parts.push(`<h1>${e(m.title)}</h1>`);
  parts.push(`<div class="meta">Investigation report · generated ${e(m.generatedAt.slice(0, 16).replace('T', ' '))} UTC${m.author ? ` · ${e(m.author)}` : ''}</div>`);
  if (m.brief) parts.push('<h2>Summary</h2>', paragraphs(m.brief));
  parts.push('<h2>At a glance</h2>', `<div class="stats">${m.stats.map((s) => `<div class="stat"><b>${e(s.value)}</b><span>${e(s.label)}</span></div>`).join('')}</div>`);
  if (m.graphImage) parts.push('<h2>Graph</h2>', `<img class="graph" alt="Investigation graph" src="${m.graphImage}">`);
  if (m.keyEntities.length) {
    parts.push('<h2>Key entities</h2>', '<table><thead><tr><th>Entity</th><th>Type</th><th class="num">Links</th></tr></thead><tbody>');
    m.keyEntities.forEach((k) => parts.push(`<tr><td>${e(k.name)}</td><td>${e(k.type)}</td><td class="num">${k.links}</td></tr>`));
    parts.push('</tbody></table>');
  }
  parts.push('<h2>Findings</h2>');
  if (m.claims.length === 0) parts.push('<p>No relationships recorded.</p>');
  else {
    parts.push('<table><thead><tr><th>From</th><th>Relationship</th><th>To</th><th>Period</th><th>Status</th><th>Confidence</th><th>Sources</th></tr></thead><tbody>');
    m.claims.forEach((c) =>
      parts.push(
        `<tr><td>${e(c.from)}</td><td>${e(c.type)} ${c.directed ? '→' : '—'}</td><td>${e(c.to)}</td><td>${e(c.period || '—')}</td><td><span class="tag ${cls(c.evidenceClass)}">${e(c.status)} · ${e(c.evidenceClass)}</span></td><td>${e(c.confidence || '—')}</td><td class="ref">${c.refs.length ? c.refs.map((n) => `<a href="#s${n}">[S${n}]</a>`).join(' ') : '—'}</td></tr>`,
      ),
    );
    parts.push('</tbody></table>');
    const explained = m.claims.filter((c) => c.explanation);
    if (explained.length) {
      parts.push('<h3>Reasoning</h3>');
      explained.forEach((c) => parts.push(`<p><b>${e(c.from)} ${c.directed ? '→' : '—'} ${e(c.to)} (${e(c.type)}).</b> ${e(c.explanation).replace(/\n+/g, ' ')}</p>`));
    }
    if (m.unsourcedCount > 0) parts.push(`<div class="note">${m.unsourcedCount} relationship(s) cite no source and should be read as unverified.</div>`);
  }
  parts.push('<h2>Entities</h2>');
  m.entityGroups.forEach((g) => {
    parts.push(`<h3>${e(g.type)} (${g.entities.length})</h3><ul>`);
    g.entities.forEach((en) => {
      const attrs = en.attributes.length ? `<ul>${en.attributes.map(([k, v]) => `<li>${e(k)}: ${/^https?:\/\//i.test(v) ? link(v) : e(v)}</li>`).join('')}</ul>` : '';
      parts.push(`<li><b>${e(en.name)}</b>${en.aliases.length ? ` <span class="meta">aka ${e(en.aliases.join(', '))}</span>` : ''}${attrs}</li>`);
    });
    parts.push('</ul>');
  });
  parts.push('<h2>Sources</h2>');
  if (m.sources.length === 0) parts.push('<p>No sources recorded.</p>');
  m.sources.forEach((s) => {
    const meta = [e(s.type), s.accessed ? `accessed ${e(s.accessed)}` : '', e(s.ratingText), `cited by ${s.cited}`].filter(Boolean).join(' · ');
    parts.push(
      `<div class="src" id="s${s.n}"><div class="t"><span class="ref">[S${s.n}]</span> ${e(s.title)}${s.rating ? ` <span class="tag" title="Admiralty rating">${e(s.rating)}</span>` : ''}</div><div class="m">${meta}</div>` +
        (s.url ? `<div>${link(s.url)}</div>` : '') +
        (s.archiveUrl ? `<div>Archived: ${link(s.archiveUrl)}</div>` : '') +
        s.captures
          .map((c) => `<div class="m">Preserved copy ${e(c.at.slice(0, 19).replace('T', ' '))} UTC</div>${c.files.map((f) => `<div class="hash">${e(f.name)} — SHA-256 ${e(f.sha256)}</div>`).join('')}`)
          .join('') +
        '</div>',
    );
  });
  if (m.notes.length) {
    parts.push('<h2>Notes</h2>');
    m.notes.forEach((n) => parts.push(`<h3>${e(n.title)}</h3>`, paragraphs(n.body)));
  }
  parts.push(`<footer>Generated with TRACE${m.appVersion ? ` ${e(m.appVersion)}` : ''}. Statuses reflect the investigator's assessment at the time of export.</footer>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(m.title)} — report</title><style>${CSS}</style></head><body><main>${parts.join('\n')}</main></body></html>\n`;
}

/** File-system friendly base name for the report. */
export function reportFileName(title: string, date = new Date()): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'investigation';
  return `${slug}-report-${date.toISOString().slice(0, 10)}`;
}
