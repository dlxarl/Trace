import React, { useMemo, useState } from 'react';
import { Camera, FileText } from 'lucide-react';
import type { ProjectData } from '@/types';
import { RELATIONSHIP_STATUSES } from '@/types';
import { Select } from '@/components/common/Select';
import { buildTimeline } from './buildTimeline';

interface Props {
  projectData: ProjectData;
  onOpenRelationship: (id: string) => void;
  onOpenSource: (id: string) => void;
}

const statusColor = (s: string) => `var(--t-status-${s})`;

/** Chronology of the case: relationship periods as bars on one axis, source dates as markers. */
export const TimelineView: React.FC<Props> = ({ projectData, onOpenRelationship, onOpenSource }) => {
  const [entityId, setEntityId] = useState('');
  const [includeSources, setIncludeSources] = useState(true);
  const tl = useMemo(() => buildTimeline(projectData, { entityId: entityId || null, includeSources }), [projectData, entityId, includeSources]);
  const span = tl.max - tl.min;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - tl.min) / span) * 100))}%`;
  const years = useMemo(() => {
    const a = new Date(tl.min).getUTCFullYear();
    const b = new Date(tl.max).getUTCFullYear();
    const step = Math.max(1, Math.ceil((b - a) / 8));
    const out: number[] = [];
    for (let y = a; y <= b + 1; y += step) out.push(y);
    return out.filter((y) => Date.UTC(y, 0, 1) >= tl.min - 1 && Date.UTC(y, 0, 1) <= tl.max + 1);
  }, [tl.min, tl.max]);

  return (
    <div className="h-full flex flex-col bg-[var(--t-bg)] text-[12px]">
      <div className="h-[32px] shrink-0 flex items-center gap-3 px-3 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <span className="t-label">Timeline</span>
        <span className="text-[11px] text-zinc-500 truncate">{tl.items.filter((i) => i.kind === 'period').length} periods · {tl.undated} relationship(s) have no dates</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-zinc-400">
          <input type="checkbox" checked={includeSources} onChange={(e) => setIncludeSources(e.target.checked)} />
          Source dates
        </label>
        <div className="w-[220px]">
          <Select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="t-input" aria-label="Filter by entity">
            <option value="">All entities</option>
            {[...projectData.entities].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {tl.items.length === 0 ? (
        <div className="p-6 text-zinc-500 max-w-[560px] leading-relaxed">
          Nothing to show yet. Open a relationship and fill in <span className="text-zinc-300">Time period</span> (for example “director from 2019-03 to 2022-06”) and it will
          appear here. Sources appear by the date they were accessed or captured.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* axis */}
          <div className="sticky top-0 z-10 bg-[var(--t-bg)] border-b border-[var(--t-border-subtle)] flex">
            <div className="w-[320px] shrink-0" />
            <div className="relative flex-1 h-[22px] mr-4">
              {years.map((y) => (
                <span key={y} className="absolute top-1 text-[10.5px] font-mono text-zinc-500 -translate-x-1/2" style={{ left: pct(Date.UTC(y, 0, 1)) }}>
                  {y}
                </span>
              ))}
            </div>
          </div>
          {tl.items.map((it) => (
            <div
              key={`${it.kind}-${it.id}`}
              onClick={() => (it.kind === 'period' ? onOpenRelationship(it.id) : onOpenSource(it.id))}
              className="flex items-center h-[30px] border-b border-[var(--t-border-subtle)] hover:bg-[var(--t-hover)] cursor-pointer"
              title={it.kind === 'period' ? `${it.label} (${it.type})\n${it.fromText} → ${it.toText}` : `${it.label}\n${it.atText}`}
            >
              <div className="w-[320px] shrink-0 px-3 flex items-center gap-2 min-w-0">
                {it.kind === 'period' ? (
                  <>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor(it.status) }} />
                    <span className="truncate text-zinc-200">{it.label}</span>
                    <span className="font-mono text-[10.5px] text-zinc-500 shrink-0 truncate max-w-[90px]">{it.type}</span>
                  </>
                ) : (
                  <>
                    {it.preserved ? <Camera className="w-3 h-3 text-zinc-500 shrink-0" /> : <FileText className="w-3 h-3 text-zinc-500 shrink-0" />}
                    <span className="truncate text-zinc-400">{it.label}</span>
                  </>
                )}
              </div>
              <div className="relative flex-1 h-full mr-4">
                {it.kind === 'period' ? (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[8px] rounded-full"
                    style={{
                      left: pct(it.from),
                      width: `max(6px, calc(${pct(it.to ?? tl.max)} - ${pct(it.from)}))`,
                      background: statusColor(it.status),
                      opacity: it.status === 'rejected' ? 0.35 : 0.85,
                      borderRight: it.to === null ? '2px dashed var(--t-bg)' : undefined,
                    }}
                  />
                ) : (
                  <div className="absolute top-1/2 -translate-y-1/2 w-[7px] h-[7px] rotate-45 bg-zinc-500" style={{ left: pct(it.at) }} />
                )}
              </div>
            </div>
          ))}
          <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            {RELATIONSHIP_STATUSES.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: statusColor(s.status) }} />
                {s.label}
              </span>
            ))}
            <span>◆ source date · a dashed end means ongoing</span>
          </div>
        </div>
      )}
    </div>
  );
};
