import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProjectData, TabType } from '@/types';
import { EntityIcon } from '@/components/common/EntityIcon';
import { Search, FileText, StickyNote, CornerDownLeft } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  title: string;
  /** Group heading, e.g. "Go to", "Create", "Case", "App". */
  section: string;
  /** Extra words that should find this command ("backup", "pdf", …). */
  keywords?: string;
  /** Shown on the right, e.g. "⌘G". */
  shortcut?: string;
  icon?: React.ReactNode;
  run: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData?: ProjectData | null;
  commands: PaletteCommand[];
  onOpenTab: (type: TabType, targetId?: string, title?: string) => void;
}

type Item =
  | { kind: 'command'; key: string; section: string; cmd: PaletteCommand }
  | { kind: 'record'; key: string; section: string; label: string; hint: string; icon: React.ReactNode; open: () => void };

/** Every word of the query must appear; earlier / whole-word hits rank higher. 0 = no match. */
export function scoreMatch(query: string, ...fields: (string | undefined)[]): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  const title = (fields[0] ?? '').toLowerCase();
  let score = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    score += 10 - Math.min(9, i / 6);
    if (title.startsWith(w)) score += 6;
    else if (new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) score += 3;
  }
  return score;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({ isOpen, onClose, projectData, commands, onOpenTab }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const items = useMemo<Item[]>(() => {
    if (!isOpen) return [];
    const q = query.trim();
    const cmds = commands
      .map((c) => ({ c, s: scoreMatch(q, c.title, c.section, c.keywords) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0));
    const out: Item[] = cmds.map(({ c }) => ({ kind: 'command', key: `c-${c.id}`, section: q ? 'Commands' : c.section, cmd: c }));
    if (q && projectData) {
      const rec: Item[] = [];
      const push = (s: number, it: Item) => s > 0 && rec.push(it);
      projectData.entities.forEach((e) =>
        push(scoreMatch(q, e.name, e.aliases.join(' '), e.type, e.tags?.join(' ')), {
          kind: 'record',
          key: `e-${e.id}`,
          section: 'Entities',
          label: e.name,
          hint: e.type,
          icon: <EntityIcon type={e.type} className="w-3.5 h-3.5" />,
          open: () => onOpenTab('entity', e.id, e.name),
        }),
      );
      projectData.sources.forEach((src) =>
        push(scoreMatch(q, src.title, src.url), {
          kind: 'record',
          key: `s-${src.id}`,
          section: 'Sources',
          label: src.title,
          hint: src.source_type ?? 'source',
          icon: <FileText className="w-3.5 h-3.5 opacity-70" />,
          open: () => onOpenTab('source', src.id, src.title),
        }),
      );
      projectData.notes.forEach((n) =>
        push(scoreMatch(q, n.title, n.tags.join(' ')), {
          kind: 'record',
          key: `n-${n.id}`,
          section: 'Notes',
          label: n.title,
          hint: 'note',
          icon: <StickyNote className="w-3.5 h-3.5 opacity-70" />,
          open: () => onOpenTab('note', n.id, n.title),
        }),
      );
      out.push(...rec.slice(0, 30));
    }
    return out;
  }, [isOpen, query, commands, projectData, onOpenTab]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, items]);

  if (!isOpen) return null;

  const choose = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    // Let the palette close first so the action's own dialog gets focus.
    setTimeout(() => (it.kind === 'command' ? it.cmd.run() : it.open()), 0);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  let lastSection = '';
  return (
    <div className="fixed inset-0 z-[70] bg-[var(--t-overlay)] flex items-start justify-center pt-24 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Command palette" className="bg-[var(--t-panel)] border border-[var(--t-border-strong)] rounded-[4px] max-w-xl w-full shadow-popover overflow-hidden text-[12px] flex flex-col">
        <div className="flex items-center px-3.5 py-3 border-b border-[var(--t-border)]">
          <Search className="w-4 h-4 text-zinc-500 mr-2.5" />
          <input
            type="text"
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type what you want to do, or a name to jump to…"
            aria-label="Search commands and records"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            className="flex-1 bg-transparent text-sm text-zinc-100 focus:outline-none placeholder:text-zinc-600"
          />
          <kbd className="t-kbd">ESC</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[360px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-zinc-500">
              Nothing matches “{query}”.
              <div className="text-[11px] text-zinc-600 mt-1">Try a shorter word, e.g. “export”, “backup”, “merge” or a person’s name.</div>
            </div>
          )}
          {items.map((it, i) => {
            const head = it.section !== lastSection ? it.section : null;
            lastSection = it.section;
            return (
              <React.Fragment key={it.key}>
                {head && <div className="t-label px-2 pt-2 pb-1">{head}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(it)}
                  className={`w-full px-2.5 h-[28px] flex items-center justify-between gap-3 rounded-[3px] text-left text-zinc-200 ${i === active ? 'bg-[var(--t-active)]' : ''}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-4 flex justify-center shrink-0 opacity-80">{it.kind === 'command' ? it.cmd.icon : it.icon}</span>
                    <span className="truncate">{it.kind === 'command' ? it.cmd.title : it.label}</span>
                  </span>
                  {it.kind === 'command' ? (
                    it.cmd.shortcut && <span className="t-kbd shrink-0">{it.cmd.shortcut}</span>
                  ) : (
                    <span className="text-[10.5px] text-zinc-500 font-mono shrink-0">{it.hint}</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-3 h-[26px] border-t border-[var(--t-border)] text-[10.5px] text-zinc-500">
          <span>↑↓ choose</span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" /> run
          </span>
          <span className="flex-1" />
          <span>{items.length} result{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
};
