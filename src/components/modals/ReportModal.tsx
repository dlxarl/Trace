import React, { useMemo, useState } from 'react';
import saveAs from 'file-saver';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import type { ProjectData } from '@/types';
import { buildReportModel, renderReportHtml, renderReportMarkdown, reportFileName } from '@/services/report/buildReport';
import { takeGraphSnapshot } from '@/features/graph/graphSnapshot';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData | null;
  onDone?: (message: string) => void;
}

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-2.5 px-3 py-2 border-b border-[var(--t-border-subtle)] last:border-b-0 ${disabled ? 'opacity-50' : ''}`}>
    <input type="checkbox" className="mt-[3px]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-zinc-200">{label}</span>
      {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
    </span>
  </label>
);

/** Export the case as a report: Markdown, HTML, or PDF (desktop). */
export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, projectData, onDone }) => {
  const [author, setAuthor] = useState('');
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeAttributes, setIncludeAttributes] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeRejected, setIncludeRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pdfApi = typeof window !== 'undefined' ? window.electronAPI?.saveReportPdf : undefined;

  // Taken when the dialog opens: live if the graph tab is open, otherwise the last picture of this case.
  const projectId = projectData?.project.id;
  const graphImage = useMemo(() => (isOpen && projectId ? takeGraphSnapshot(projectId) : undefined), [isOpen, projectId]);

  if (!projectData) return null;
  const model = () =>
    buildReportModel(projectData, {
      author,
      includeAttributes,
      includeNotes,
      includeRejected,
      graphImage: includeGraph ? graphImage : undefined,
      appVersion: __APP_VERSION__,
    });
  const name = reportFileName(projectData.project.name);

  const finish = (msg: string) => {
    onDone?.(msg);
    onClose();
  };
  const saveMarkdown = () => {
    saveAs(new Blob([renderReportMarkdown(model())], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
    finish('Report saved as Markdown');
  };
  const saveHtml = () => {
    saveAs(new Blob([renderReportHtml(model())], { type: 'text/html;charset=utf-8' }), `${name}.html`);
    finish('Report saved as HTML');
  };
  const savePdf = async () => {
    if (!pdfApi || busy) return;
    setBusy(true);
    setError('');
    const r = await pdfApi(renderReportHtml(model()), name);
    setBusy(false);
    if (r.ok) finish('Report saved as PDF');
    else if (!r.cancelled) setError(r.error || 'Could not create the PDF');
  };

  const rels = projectData.relationships;
  const unsourced = rels.filter((r) => r.status !== 'rejected' && (!r.evidence || r.evidence.length === 0)).length;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Export report"
      subtitle={projectData.project.name}
      width={540}
      footer={
        <>
          <button type="button" className="t-btn mr-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="t-btn" onClick={saveMarkdown}>
            <FileText className="w-3.5 h-3.5 opacity-70" />
            Markdown
          </button>
          <button type="button" className={`t-btn ${pdfApi ? '' : 't-btn-primary'}`} onClick={saveHtml}>
            <FileDown className="w-3.5 h-3.5 opacity-70" />
            HTML
          </button>
          {pdfApi && (
            <button type="button" className="t-btn t-btn-primary" onClick={savePdf} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              PDF
            </button>
          )}
        </>
      }
    >
      <div className="px-3 py-2.5 text-[11.5px] text-zinc-400 border-b border-[var(--t-border-subtle)]">
        Summary, key entities, every relationship with its status and numbered sources, and the source list with ratings and the SHA-256 of
        preserved copies.
        {unsourced > 0 && <span className="text-amber-400"> {unsourced} relationship(s) have no source and will be flagged.</span>}
      </div>
      <div className="px-3 py-2.5 border-b border-[var(--t-border-subtle)]">
        <label className="block text-[11px] text-zinc-500 mb-1">Author / organisation (optional)</label>
        <input className="t-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Shown under the title" />
      </div>
      <Check
        checked={includeGraph && !!graphImage}
        onChange={setIncludeGraph}
        disabled={!graphImage}
        label="Graph image"
        hint={graphImage ? 'A picture of the graph as currently laid out (HTML and PDF only)' : 'Open the graph once to include a picture of it'}
      />
      <Check checked={includeAttributes} onChange={setIncludeAttributes} label="Entity attributes" hint="Phone numbers, emails and other attributes under each entity" />
      <Check checked={includeNotes} onChange={setIncludeNotes} label="Investigator notes" hint="Working notes are left out unless you add them" />
      <Check checked={includeRejected} onChange={setIncludeRejected} label="Disproven relationships" hint="Links marked Rejected, shown as Disproven" />
      {error && <div className="mx-3 my-2 px-2.5 py-2 rounded-[3px] border border-rose-500/30 text-rose-300 text-[11.5px]">{error}</div>}
    </Dialog>
  );
};
