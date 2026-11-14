import React, { useState, useEffect } from 'react';
import { ENTITY_TYPES, RELATIONSHIP_STATUSES, SearchResult } from '@/types';
import { applyFilters, hasFilters, loadSavedSearches, NO_FILTERS, RECORD_KINDS, storeSavedSearches, type SavedSearch, type SearchFilters } from './filters';
import { EntityIcon } from '@/components/common/EntityIcon';
import {
  Search,
  Layers,
  Share2,
  Globe,
  FileText,
  FolderKanban,
  ArrowRight,
  ExternalLink,
  X,
  Bookmark,
} from 'lucide-react';

interface SearchViewProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelectResult: (result: SearchResult) => void;
  initialQuery?: string;
  /** Saved searches are kept per case. */
  projectId?: string;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onSearch,
  onSelectResult,
  initialQuery = '',
  projectId,
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [saved, setSaved] = useState<SavedSearch[]>(() => (projectId ? loadSavedSearches(projectId) : []));
  const [savingName, setSavingName] = useState<string | null>(null);

  useEffect(() => {
    setSaved(projectId ? loadSavedSearches(projectId) : []);
  }, [projectId]);
  const persist = (next: SavedSearch[]) => {
    setSaved(next);
    if (projectId) storeSavedSearches(projectId, next);
  };
  const saveCurrent = () => {
    const name = (savingName ?? '').trim();
    if (!name || !query.trim()) return;
    persist([...saved.filter((x) => x.name !== name), { id: `ss-${Date.now().toString(36)}`, name, query, filters }].slice(-50));
    setSavingName(null);
  };
  const toggleKind = (k: (typeof RECORD_KINDS)[number]['kind']) =>
    setFilters((f) => ({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] }));

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await onSearch(query);
        if (active) setResults(res);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  // Group by type
  const shown = applyFilters(results, filters);
  const entityResults = shown.filter((r) => r.type === 'entity');
  const relResults = shown.filter((r) => r.type === 'relationship');
  const sourceResults = shown.filter((r) => r.type === 'source');
  const noteResults = shown.filter((r) => r.type === 'note');
  const projectResults = shown.filter((r) => r.type === 'project');

  const groups: { label: string; items: typeof results }[] = [
    { label: 'Entities', items: entityResults },
    { label: 'Relationships', items: relResults },
    { label: 'Sources', items: sourceResults },
    { label: 'Notes', items: noteResults },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)]">
      <div className="h-[36px] shrink-0 flex items-center gap-2 px-2 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <div className="relative flex-1 max-w-[640px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search entities, aliases, attributes, evidence, notes"
            className="t-input !h-[26px] !pl-7 !text-[12.5px]"
          />
        </div>
        {query && (
          <button type="button" onClick={() => setQuery('')} className="t-icon-btn" title="Clear">
            <X />
          </button>
        )}
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] text-zinc-600 tabular-nums">
          {isLoading ? 'searching…' : `${shown.length}${shown.length !== results.length ? ` of ${results.length}` : ''} matches`}
        </span>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--t-border)] text-[11.5px]">
        <span className="t-label mr-1">Show</span>
        {RECORD_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={filters.kinds.includes(k.kind)}
            onClick={() => toggleKind(k.kind)}
            className={`px-2 h-[22px] rounded-full border ${filters.kinds.includes(k.kind) ? 'bg-[var(--t-active)] border-[var(--t-accent)] text-zinc-100' : 'border-[var(--t-border)] text-zinc-500 hover:text-zinc-200'}`}
          >
            {k.label}
          </button>
        ))}
        <select aria-label="Entity type" className="t-input !h-[22px] !w-auto !py-0" value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value as SearchFilters['entityType'] }))}>
          <option value="">Any entity type</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        <select aria-label="Link status" className="t-input !h-[22px] !w-auto !py-0" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as SearchFilters['status'] }))}>
          <option value="">Any link status</option>
          {RELATIONSHIP_STATUSES.map((st) => (
            <option key={st.status} value={st.status}>{st.label}</option>
          ))}
        </select>
        {hasFilters(filters) && (
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setFilters(NO_FILTERS)}>
            Reset filters
          </button>
        )}
        <div className="flex-1" />
        {projectId &&
          (savingName === null ? (
            <button type="button" className="t-btn" disabled={!query.trim()} onClick={() => setSavingName(query.trim().slice(0, 40))} title="Remember this search and its filters">
              <Bookmark className="w-3 h-3 opacity-70" />
              Save search
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <input className="t-input !h-[22px] w-[160px]" autoFocus value={savingName} onChange={(e) => setSavingName(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? saveCurrent() : e.key === 'Escape' && setSavingName(null))} aria-label="Name for this search" />
              <button type="button" className="t-btn t-btn-primary" onClick={saveCurrent}>Save</button>
              <button type="button" className="t-btn" onClick={() => setSavingName(null)}>Cancel</button>
            </span>
          ))}
      </div>
      {saved.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--t-border)] text-[11.5px]" aria-label="Saved searches">
          <span className="t-label mr-1">Saved</span>
          {saved.map((x) => (
            <span key={x.id} className="inline-flex items-center rounded-full border border-[var(--t-border)] overflow-hidden">
              <button type="button" className="pl-2 pr-1.5 h-[22px] text-zinc-300 hover:bg-[var(--t-hover)]" onClick={() => { setQuery(x.query); setFilters(x.filters); }} title={`“${x.query}”`}>
                {x.name}
              </button>
              <button type="button" className="px-1.5 h-[22px] text-zinc-600 hover:text-rose-400 hover:bg-[var(--t-hover)]" onClick={() => persist(saved.filter((y) => y.id !== x.id))} aria-label={`Delete saved search ${x.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto text-[12px]">
        {!query && (
          <div className="px-4 py-3 text-zinc-600">
            Full-text search across every record in this case. Matches names, aliases, attribute values, source extracts and note bodies.
          </div>
        )}
        {!isLoading && query && shown.length === 0 && (
          <div className="px-4 py-3 text-zinc-500">No records match “{query}”{hasFilters(filters) ? ' with these filters' : ''}.</div>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <div className="h-[24px] flex items-center gap-2 px-4 bg-[var(--t-panel)] border-b border-[var(--t-border)] sticky top-0">
              <span className="t-label">{g.label}</span>
              <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{g.items.length}</span>
            </div>
            {g.items.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectResult(item)}
                className="px-4 py-[5px] border-b border-[var(--t-border-subtle)] hover:bg-[var(--t-hover)] cursor-pointer"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-zinc-100 truncate">{item.title}</span>
                  <span className="text-[11px] text-zinc-500 truncate">{item.subtitle}</span>
                  <span className="ml-auto font-mono text-[10px] text-zinc-600 shrink-0">{item.id}</span>
                </div>
                {item.snippet && <div className="text-[11.5px] text-zinc-500 truncate font-mono">{item.snippet}</div>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
