import React, { useState } from 'react';
import saveAs from 'file-saver';
import { Dialog } from '@/components/common/Dialog';
import type { ProjectData } from '@/types';
import { toGraphML, toStix } from '@/services/export/graphExport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData | null;
  onDone: (message: string) => void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case';

export const ExportGraphModal: React.FC<Props> = ({ isOpen, onClose, projectData, onDone }) => {
  const [includeRejected, setIncludeRejected] = useState(false);
  if (!projectData) return null;
  const base = slug(projectData.project.name);

  const graphml = () => {
    saveAs(new Blob([toGraphML(projectData, { includeRejected })], { type: 'application/xml' }), `${base}.graphml`);
    onDone('Graph exported as GraphML');
    onClose();
  };
  const stix = () => {
    const r = toStix(projectData, { includeRejected });
    saveAs(new Blob([JSON.stringify(r.bundle, null, 2)], { type: 'application/json' }), `${base}.stix.json`);
    onDone(`STIX bundle exported · ${r.bundle.objects.length} objects${r.skipped.length ? ` · ${r.skipped.length} entities have no STIX type and were left out` : ''}`);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Export graph" width={520} footer={<button type="button" className="t-btn" onClick={onClose}>Close</button>}>
      <div className="p-3 space-y-3">
        <p className="text-[11.5px] text-zinc-500 leading-relaxed">
          Export entities and relationships for other tools. Notes and source texts are not included; use the report or the .zip for those.
        </p>
        <label className="flex items-center gap-2 text-[12px] text-zinc-200 cursor-pointer">
          <input type="checkbox" className="accent-[var(--t-accent)]" checked={includeRejected} onChange={(e) => setIncludeRejected(e.target.checked)} />
          Include links marked Rejected
        </label>
        <div className="grid gap-2">
          <button type="button" className="text-left px-3 py-2 rounded-[3px] border border-[var(--t-border)] hover:bg-[var(--t-hover)]" onClick={graphml}>
            <div className="text-zinc-100">GraphML (.graphml)</div>
            <div className="text-[11px] text-zinc-500">Opens in Gephi, yEd, Cytoscape and many graph tools. Keeps names, types, aliases, tags, link status, confidence and dates.</div>
          </button>
          <button type="button" className="text-left px-3 py-2 rounded-[3px] border border-[var(--t-border)] hover:bg-[var(--t-hover)]" onClick={stix}>
            <div className="text-zinc-100">STIX 2.1 bundle (.stix.json)</div>
            <div className="text-[11px] text-zinc-500">For threat-intelligence platforms (MISP, OpenCTI). People and organisations become identities; domains, IPs, emails, URLs and accounts become observables. Phone numbers and a few other types have no STIX equivalent and are left out.</div>
          </button>
        </div>
      </div>
    </Dialog>
  );
};
