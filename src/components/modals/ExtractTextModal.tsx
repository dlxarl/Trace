import React, { useState } from 'react';
import { ScanText } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { extractIndicators } from '@/services/extract/extractIndicators';
import type { ImportBatch } from '@/services/import/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the batch; the caller opens the usual import review. */
  onExtracted: (batch: ImportBatch) => void;
}

export const ExtractTextModal: React.FC<Props> = ({ isOpen, onClose, onExtracted }) => {
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    const url = sourceUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError('The source address must start with http:// or https://');
      return;
    }
    const batch = extractIndicators(text, { fileName: 'pasted text', sourceUrl: url || undefined });
    if (batch.entities.length === 0) {
      setError(batch.warnings[0] ?? 'Nothing found.');
      return;
    }
    setError(null);
    onExtracted(batch);
    setText('');
    setSourceUrl('');
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Find entities in text"
      width={600}
      footer={
        <>
          <button type="button" className="t-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="t-btn t-btn-primary" disabled={!text.trim()} onClick={go}>
            <ScanText className="w-3.5 h-3.5" />
            Find and review
          </button>
        </>
      }
    >
      <div className="p-3 space-y-3">
        <p className="text-[11.5px] text-zinc-500 leading-relaxed">
          Paste an article, chat log or page text. TRACE lists the emails, links, domains, IP addresses, phone numbers, @handles and crypto wallets in it. You review the list before anything is added, and ones you already have are marked.
        </p>
        <textarea
          autoFocus
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text here…"
          aria-label="Text to search"
          className="t-input !h-auto py-1.5 font-mono text-[11.5px] resize-y"
        />
        <div>
          <label htmlFor="extract-src" className="block text-[11px] text-zinc-500 mb-1">
            Where is this text from? (optional web address, kept as the source)
          </label>
          <input id="extract-src" className="t-input" placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </div>
        {error && (
          <div role="alert" className="text-[11.5px] text-amber-400">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
};
