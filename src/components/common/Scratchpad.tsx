import React, { useEffect, useRef, useState } from 'react';
import { NotebookPen, ScanText, X, ExternalLink } from 'lucide-react';
import type { Note } from '@/types';

export const SCRATCH_ID = 'scratchpad';

/** Body of the scratchpad note as plain text ("" when it does not exist yet). */
export const scratchText = (notes: Note[]): string => notes.find((n) => n.id === SCRATCH_ID)?.markdownBody ?? '';
export const countLines = (text: string): number => text.split('\n').filter((l) => l.trim()).length;

interface Props {
  projectId: string;
  notes: Note[];
  onSave: (text: string) => Promise<void>;
  onExtract: (text: string) => void;
  onOpenAsNote: () => void;
}

/**
 * A floating place for quick captures. The text is stored in the case as the
 * note “scratchpad”, so it is covered by history, backups and encryption like
 * everything else.
 */
export const Scratchpad: React.FC<Props> = ({ projectId, notes, onSave, onExtract, onOpenAsNote }) => {
  const stored = scratchText(notes);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(stored);
  const savedRef = useRef(stored);
  const dirtyRef = useRef(false);

  // A different case, or a restore: show what is stored — unless the user is mid-edit.
  useEffect(() => {
    setText(stored);
    savedRef.current = stored;
    dirtyRef.current = false;
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The note was changed elsewhere (note editor, restore): follow it unless there are unsaved edits here.
  useEffect(() => {
    if (!dirtyRef.current && stored !== savedRef.current) {
      setText(stored);
      savedRef.current = stored;
    }
  }, [stored]);

  useEffect(() => {
    if (text === savedRef.current) return;
    dirtyRef.current = true;
    const t = setTimeout(async () => {
      try {
        await onSave(text);
        savedRef.current = text;
        dirtyRef.current = false;
      } catch {
        /* stays dirty; the next edit retries */
      }
    }, 700);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = countLines(text);
  return (
    <div className="fixed right-4 bottom-[34px] z-[60] flex flex-col items-end gap-2 pointer-events-none">
      {open && (
        <div role="dialog" aria-label="Scratchpad" className="pointer-events-auto w-[340px] rounded-[6px] border border-[var(--t-border-strong)] bg-[var(--t-panel)] shadow-popover text-[12px] flex flex-col">
          <div className="h-[30px] flex items-center gap-2 pl-3 pr-1.5 border-b border-[var(--t-border)]">
            <span className="font-semibold text-zinc-100">Scratchpad</span>
            <span className="text-[10.5px] text-zinc-600">saved with the case</span>
            <div className="flex-1" />
            <button type="button" className="t-icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close scratchpad">
              <X />
            </button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="Jot down handles, numbers, links, ideas…"
            aria-label="Scratchpad text"
            className="t-input !h-[180px] !rounded-none !border-0 !border-b !border-[var(--t-border)] resize-none font-mono text-[11.5px] leading-relaxed p-2.5"
          />
          <div className="flex items-center gap-1.5 p-1.5">
            <button type="button" className="t-btn" disabled={!text.trim()} onClick={() => onExtract(text)} title="List emails, domains, phones and handles in this text and review them before adding">
              <ScanText className="w-3 h-3" />
              Find entities
            </button>
            <button type="button" className="t-btn" disabled={!text.trim()} onClick={onOpenAsNote} title="Open it as a note to format it">
              <ExternalLink className="w-3 h-3" />
              Open as note
            </button>
            <div className="flex-1" />
            <button type="button" className="t-btn" disabled={!text} onClick={() => setText('')}>
              Clear
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Scratchpad: quick notes saved with the case"
        className="pointer-events-auto h-[28px] pl-2.5 pr-3 flex items-center gap-1.5 rounded-full border border-[var(--t-border-strong)] bg-[var(--t-panel)] text-zinc-300 hover:text-zinc-50 shadow-popover text-[11.5px]"
      >
        <NotebookPen className="w-3.5 h-3.5" />
        Scratchpad
        {n > 0 && <span className="font-mono text-[10px] text-[var(--t-accent-strong)]">{n}</span>}
      </button>
    </div>
  );
};
