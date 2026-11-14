import React from 'react';

/** Settings section: label above one bordered group of rows. */
export const Section: React.FC<{ title: string; danger?: boolean; children: React.ReactNode }> = ({ title, danger, children }) => (
  <section>
    <h3 className={`t-label mb-2 ${danger ? '!text-rose-400/80' : '!text-zinc-500'}`}>{title}</h3>
    <div
      className={`rounded-[4px] border divide-y ${
        danger ? 'border-rose-500/25 divide-rose-500/15 bg-rose-950/10' : 'border-[var(--t-border)] divide-[var(--t-border)] bg-[var(--t-raised)]/40'
      }`}
    >
      {children}
    </div>
  </section>
);

/** One setting: label + description on the left, control right-aligned (or below when stacked). */
export const Row: React.FC<{ label: string; description?: string; stacked?: boolean; children: React.ReactNode }> = ({
  label,
  description,
  stacked,
  children,
}) =>
  stacked ? (
    <div className="px-4 py-3">
      <div className="text-[12px] font-medium text-zinc-200">{label}</div>
      {description && <div className="text-[11px] text-zinc-500 mt-0.5 mb-2">{description}</div>}
      {children}
    </div>
  ) : (
    <div className="px-4 py-3 flex items-center gap-6 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-zinc-200">{label}</div>
        {description && <div className="text-[11px] text-zinc-500 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
