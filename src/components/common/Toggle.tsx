import React from 'react';

/** On/off switch. */
export const Toggle: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={onClick}
    className={`w-8 h-[18px] rounded-full p-[2px] flex transition-colors ${on ? 'bg-[var(--t-accent)] justify-end' : 'bg-zinc-600 justify-start'}`}
  >
    <span className="w-[14px] h-[14px] rounded-full bg-[var(--t-on-accent)]" />
  </button>
);
