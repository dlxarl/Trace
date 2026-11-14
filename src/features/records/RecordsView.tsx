import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GitMerge, LayoutGrid, Plus, Search, Table2, Tag, Trash2, X } from 'lucide-react';
import { ENTITY_TYPES, type Entity, type EntityType, type ProjectData } from '@/types';
import { EntityIcon, getEntityTypeLabel } from '@/components/common/EntityIcon';
import { allTags, applyTag, buildRecords, filterRecords, NO_RECORD_FILTER, sortRecords, type RecordFilter, type RecordRow, type SortKey } from './buildRecords';

interface Props {
  projectData: ProjectData;
  onOpenEntity: (id: string, name: string) => void;
  onCreateEntity: () => void;
  /** Saves entities that were changed in bulk (tags). */
  onSaveEntities: (entities: Entity[]) => Promise<void>;
  onDeleteEntities: (ids: string[]) => void;
  /** Opens the merge dialog with this entity as the starting point. */
  onMerge: (id: string, others: string[]) => void;
}

const VIEW_KEY = 'trace_records_view';
const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
};

const COLS: { key: SortKey; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'flex-1 min-w-[180px]' },
  { key: 'type', label: 'Type', className: 'w-[120px]' },
  { key: 'links', label: 'Links', className: 'w-[62px] text-right' },
  { key: 'unsourced', label: 'No source', className: 'w-[78px] text-right' },
  { key: 'rating', label: 'Rating', className: 'w-[62px]' },
  { key: 'updated_at', label: 'Changed', className: 'w-[104px]' },
];

export const RecordsView: React.FC<Props> = ({ projectData, onOpenEntity, onCreateEntity, onSaveEntities, onDeleteEntities, onMerge }) => {
  const [filter, setFilter] = useState<RecordFilter>(NO_RECORD_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [view, setView] = useState<'table' | 'cards'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table';
    } catch {
      return 'table';
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => buildRecords(projectData), [projectData]);
  const tags = useMemo(() => allTags(all), [all]);
  const rows = useMemo(() => sortRecords(filterRecords(all, filter), sort.key, sort.dir), [all, filter, sort]);
  // Selection only counts what still exists and is visible.
  const picked = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const typesPresent = useMemo(() => ENTITY_TYPES.filter((t) => all.some((r) => r.type === t.type)), [all]);
  const filtered = filter.query || filter.type || filter.tag || filter.links !== 'all';

  const setViewMode = (v: 'table' | 'cards') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* session only */
    }
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected = rows.length > 0 && picked.length === rows.length;
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'type' ? 'asc' : 'desc' }));

  const bulkTag = async (mode: 'add' | 'remove') => {
    const changed = applyTag(projectData.entities, new Set(picked.map((r) => r.id)), tagText, mode);
    if (changed.length === 0) return;
    setBusy(true);
    try {
      await onSaveEntities(changed);
      setTagText('');
    } finally {
      setBusy(false);
    }
  };

  const Chips: React.FC<{ r: RecordRow }> = ({ r }) => (
    <span className="flex flex-wrap gap-1">
      {r.tags.slice(0, 4).map((t) => (
        <button key={t} type="button" onClick={(e) => { e.stopPropagation(); setFilter((f) => ({ ...f, tag: t })); }} className="px-1.5 h-[16px] rounded-full border border-[var(--t-border)] text-[10px] text-zinc-400 hover:text-zinc-100" title={`Show only “${t}”`}>
          {t}
        </button>
      ))}
      {r.tags.length > 4 && <span className="text-[10px] text-zinc-600">+{r.tags.length - 4}</span>}
    </span>
  );

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] text-[12px]">
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <span className="t-label mr-1">Records</span>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="t-input !h-[24px] !pl-7 w-[200px]" placeholder="Name, alias or tag" aria-label="Filter records" value={filter.query} onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))} />
        </div>
        <select aria-label="Type" className="t-input !h-[24px] !w-auto !py-0" value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value as EntityType | '' }))}>
          <option value="">All types</option>
          {typesPresent.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        <select aria-label="Tag" className="t-input !h-[24px] !w-auto !py-0" value={filter.tag} onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))} disabled={tags.length === 0}>
          <option value="">{tags.length ? 'All tags' : 'No tags yet'}</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Links" className="t-input !h-[24px] !w-auto !py-0" value={filter.links} onChange={(e) => setFilter((f) => ({ ...f, links: e.target.value as RecordFilter['links'] }))}>
          <option value="all">Any links</option>
          <option value="none">No links at all</option>
          <option value="unsourced">Has links without a source</option>
        </select>
        {filtered && (
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setFilter(NO_RECORD_FILTER)}>
            Reset
          </button>
        )}
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums px-1">{filtered ? `${rows.length} of ${all.length}` : `${all.length} records`}</span>
        <div className="flex border border-[var(--t-border)] rounded-[3px] overflow-hidden h-[24px]" role="radiogroup" aria-label="View">
          {([['table', 'Table', Table2], ['cards', 'Cards', LayoutGrid]] as const).map(([id, name, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setViewMode(id)} className={`px-2.5 flex items-center gap-1 text-[11px] border-l border-[var(--t-border)] first:border-l-0 ${view === id ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Icon className="w-3 h-3" />
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="t-btn t-btn-primary" onClick={onCreateEntity}>
          <Plus className="w-3 h-3" />
          Entity
        </button>
      </div>

      {picked.length > 0 && (
        <div role="region" aria-label="Selected records" className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-active)]">
          <span className="text-zinc-100 font-medium">{picked.length} selected</span>
          <input className="t-input !h-[24px] w-[130px]" list="records-tags" placeholder="Tag" aria-label="Tag to add or remove" value={tagText} onChange={(e) => setTagText(e.target.value)} />
          <datalist id="records-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="button" className="t-btn" disabled={busy || !tagText.trim()} onClick={() => bulkTag('add')}>
            <Tag className="w-3 h-3" />
            Add tag
          </button>
          <button type="button" className="t-btn" disabled={busy || !tagText.trim()} onClick={() => bulkTag('remove')}>
            Remove tag
          </button>
          <button type="button" className="t-btn" onClick={() => onMerge(picked[0].id, picked.slice(1).map((r) => r.id))} title="Combine duplicates: choose which entity to keep in the next step">
            <GitMerge className="w-3 h-3" />
            Merge…
          </button>
          <button type="button" className="t-btn t-btn-danger" onClick={() => onDeleteEntities(picked.map((r) => r.id))}>
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
          <div className="flex-1" />
          <button type="button" className="t-icon-btn" title="Clear selection" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <X />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-zinc-500">
            {all.length === 0 ? (
              <>
                No entities yet.{' '}
                <button type="button" className="text-[var(--t-accent-strong)] hover:underline" onClick={onCreateEntity}>
                  Add the first one
                </button>
              </>
            ) : (
              'No records match these filters.'
            )}
          </div>
        ) : view === 'table' ? (
          <table className="w-full border-collapse" aria-label="Records">
            <thead className="sticky top-0 z-10 bg-[var(--t-panel)]">
              <tr className="h-[26px] border-b border-[var(--t-border)] text-left">
                <th className="w-[32px] pl-3">
                  <input type="checkbox" className="accent-[var(--t-accent)]" aria-label="Select all shown" checked={allVisibleSelected} onChange={toggleAll} />
                </th>
                {COLS.map((c) => (
                  <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-2 font-normal ${c.className.includes('text-right') ? 'text-right' : ''}`}>
                    <button type="button" onClick={() => sortBy(c.key)} className={`inline-flex items-center gap-1 t-label hover:!text-zinc-200 ${sort.key === c.key ? '!text-zinc-200' : ''}`}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </button>
                  </th>
                ))}
                <th className="px-2 text-left"><span className="t-label">Tags</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => onOpenEntity(r.id, r.name)} className={`h-[28px] border-b border-[var(--t-border-subtle)] cursor-pointer ${selected.has(r.id) ? 'bg-[var(--t-active)]' : 'hover:bg-[var(--t-hover)]'}`}>
                  <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-[var(--t-accent)]" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-2 max-w-[320px]">
                    <button type="button" className="flex items-center gap-2 min-w-0 text-left" onClick={(e) => { e.stopPropagation(); onOpenEntity(r.id, r.name); }}>
                      <EntityIcon type={r.type} className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate text-zinc-100">{r.name}</span>
                      {r.aliases[0] && <span className="truncate text-[10.5px] text-zinc-600">aka {r.aliases[0]}{r.aliases.length > 1 ? ` +${r.aliases.length - 1}` : ''}</span>}
                    </button>
                  </td>
                  <td className="px-2 text-zinc-400 whitespace-nowrap">{getEntityTypeLabel(r.type)}</td>
                  <td className="px-2 text-right font-mono tabular-nums text-zinc-300">{r.links}</td>
                  <td className={`px-2 text-right font-mono tabular-nums ${r.unsourced ? 'text-amber-400' : 'text-zinc-600'}`}>{r.unsourced || '–'}</td>
                  <td className="px-2 font-mono text-zinc-300">{r.rating || <span className="text-zinc-600">–</span>}</td>
                  <td className="px-2 text-zinc-500 whitespace-nowrap">{fmt(r.updated_at)}</td>
                  <td className="px-2"><Chips r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-3 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }} role="list" aria-label="Records">
            {rows.map((r) => (
              <div
                key={r.id}
                role="listitem"
                onClick={() => onOpenEntity(r.id, r.name)}
                className={`relative rounded-[4px] border p-3 cursor-pointer ${selected.has(r.id) ? 'border-[var(--t-accent)] bg-[var(--t-active)]' : 'border-[var(--t-border)] bg-[var(--t-panel)] hover:border-[var(--t-border-hover)]'}`}
              >
                <input type="checkbox" className="accent-[var(--t-accent)] absolute top-2.5 right-2.5" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} />
                <div className="flex items-start gap-2 pr-6">
                  <EntityIcon type={r.type} className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-zinc-100 truncate">{r.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{getEntityTypeLabel(r.type)}{r.aliases[0] ? ` · aka ${r.aliases[0]}` : ''}</div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-3 text-[11px] text-zinc-400">
                  <span>{r.links} link{r.links === 1 ? '' : 's'}</span>
                  {r.unsourced > 0 && <span className="text-amber-400">{r.unsourced} without source</span>}
                  {r.rating && <span className="font-mono text-zinc-300">{r.rating}</span>}
                </div>
                {r.tags.length > 0 && <div className="mt-2"><Chips r={r} /></div>}
                <div className="mt-2 text-[10.5px] text-zinc-600">Changed {fmt(r.updated_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
