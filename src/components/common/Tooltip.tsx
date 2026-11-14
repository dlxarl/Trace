import React, { useEffect, useRef, useState } from 'react';

export interface TipContent {
  title: string;
  shortcut?: string;
  description?: string;
}

/**
 * Our own tooltip (native title tooltips are unreliable in the desktop shell
 * and cannot show a shortcut). Appears after a short delay on hover or keyboard
 * focus, to the right of the element by default, and never blocks clicks.
 */
export const Tooltip: React.FC<{ tip: TipContent; side?: 'right' | 'top'; children: React.ReactElement }> = ({ tip, side = 'right', children }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const el = useRef<HTMLElement | null>(null);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.current?.getBoundingClientRect();
      if (!r) return;
      setPos(side === 'right' ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top - 8 });
    }, 350);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const child = React.cloneElement(children as React.ReactElement<any>, {
    ref: (n: HTMLElement | null) => {
      el.current = n;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      (children.props as any).onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (children.props as any).onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (children.props as any).onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      (children.props as any).onBlur?.(e);
      hide();
    },
    onMouseDown: (e: React.MouseEvent) => {
      (children.props as any).onMouseDown?.(e);
      hide();
    },
    'aria-label': (children.props as any)['aria-label'] ?? tip.title,
  });

  return (
    <>
      {child}
      {pos && (
        <div
          role="tooltip"
          className="fixed z-[200] pointer-events-none max-w-[240px] rounded-[4px] border border-[var(--t-border-strong)] bg-[var(--t-panel)] px-2.5 py-1.5 shadow-popover text-[11.5px]"
          style={side === 'right' ? { left: pos.x, top: pos.y, transform: 'translateY(-50%)' } : { left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100">{tip.title}</span>
            {tip.shortcut && <span className="t-kbd !text-[10px]">{tip.shortcut}</span>}
          </div>
          {tip.description && <div className="text-zinc-500 leading-snug mt-0.5">{tip.description}</div>}
        </div>
      )}
    </>
  );
};
