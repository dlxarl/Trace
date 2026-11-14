import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/common/Dialog';

const KEY = 'trace_tour_done';
export const tourSeen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // cannot remember it: do not nag
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
};

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Everything is one shortcut away',
    body: 'Press ⌘K (Ctrl+K) and type what you want: “merge”, “backup”, “report”, “lock”, or a person’s name. It lists every action in the app, so you never have to hunt through menus.',
  },
  {
    title: 'The left rail switches views',
    body: 'Graph, Case brief, Search and Timeline are the four ways to look at a case. Use the button at the bottom of the rail to show labels next to the icons.',
  },
  {
    title: 'The inspector shows details',
    body: 'Pick an entity or a link and the panel on the right shows its properties, evidence and notes. With nothing selected it offers ways to add data: a new entity, text to scan, or tool output to import.',
  },
  {
    title: 'Your work is kept safe',
    body: 'Edits save themselves, versions are kept, and backups are made on a schedule (desktop). Open “History” in the Case brief to go back in time. You can change all of this in Settings.',
  },
];

/** Four short steps, shown once. Reopen it from the command palette. */
export const WelcomeTour: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (isOpen) setI(0);
  }, [isOpen]);
  const last = i === STEPS.length - 1;
  const done = () => {
    markSeen();
    onClose();
  };
  return (
    <Dialog
      isOpen={isOpen}
      onClose={done}
      title={`Welcome to Trace · ${i + 1} of ${STEPS.length}`}
      width={460}
      footer={
        <>
          <button type="button" className="t-btn mr-auto" onClick={done}>
            Skip
          </button>
          {i > 0 && (
            <button type="button" className="t-btn" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button type="button" className="t-btn t-btn-primary !px-4" autoFocus onClick={() => (last ? done() : setI(i + 1))}>
            {last ? 'Start' : 'Next'}
          </button>
        </>
      }
    >
      <div className="px-4 py-4">
        <h3 className="text-[13px] font-semibold text-zinc-100 mb-1.5">{STEPS[i].title}</h3>
        <p className="text-[12px] text-zinc-400 leading-relaxed">{STEPS[i].body}</p>
        <div className="flex gap-1.5 mt-4" aria-hidden>
          {STEPS.map((_, k) => (
            <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border)]'}`} />
          ))}
        </div>
      </div>
    </Dialog>
  );
};
