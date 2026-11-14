import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}
export interface MenuGroup {
  heading?: string;
  actions: MenuAction[];
}

/** A button that opens a grouped menu. Closes on outside click, Escape and after choosing. */
export const ActionMenu: React.FC<{ label: React.ReactNode; title?: string; groups: MenuGroup[]; align?: 'left' | 'right' }> = ({ label, title, groups, align = 'right' }) => {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        btn.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pos]);

  const visible = groups.filter((g) => g.actions.length > 0);
  if (visible.length === 0) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="t-btn"
        title={title}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : align === 'right' ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { top: r.bottom + 4, left: r.left });
        }}
      >
        {label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[79]" onMouseDown={close} />
          <div role="menu" className="t-menu fixed z-[80] w-[280px] max-h-[70vh] overflow-y-auto" style={pos}>
            {visible.map((g, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="t-menu-sep" />}
                {g.heading && <div className="t-label px-3 pt-1.5 pb-1">{g.heading}</div>}
                {g.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    disabled={a.disabled}
                    className={`t-menu-item ${a.danger ? '!text-rose-400' : ''}`}
                    onClick={() => {
                      close();
                      a.onSelect();
                    }}
                  >
                    <span className="w-4 shrink-0 flex justify-center opacity-80">{a.icon}</span>
                    <span className="flex-1 truncate text-left">{a.label}</span>
                    {a.hint && <span className="text-[10.5px] text-zinc-600 shrink-0">{a.hint}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};
