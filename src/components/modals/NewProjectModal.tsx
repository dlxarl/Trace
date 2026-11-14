import React, { useState } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { X, FolderPlus } from 'lucide-react';
import { CASE_TEMPLATES, getTemplate } from '@/services/templates/caseTemplates';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, template?: { id: string; subject: string }) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [subject, setSubject] = useState('');
  const template = getTemplate(templateId);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim() || template.objective, { id: templateId, subject: subject.trim() });
    setName('');
    setDescription('');
    setTemplateId('blank');
    setSubject('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--t-overlay)] flex items-center justify-center p-4">
      <div className="bg-[var(--t-panel)] border border-[var(--t-border-strong)] rounded-[4px] max-w-md w-full shadow-popover overflow-hidden text-[12px]">
        <div className="h-[32px] flex items-center justify-between pl-3 pr-1.5 border-b border-[var(--t-border)]">
          <div className="flex items-center space-x-2 font-semibold text-obsidian-text">
            <FolderPlus className="w-4 h-4 text-obsidian-accent" />
            <span>New Investigation Project</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="t-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <div className="block text-[11px] text-zinc-500 mb-1">Start from</div>
            <div className="grid grid-cols-1 gap-1" role="radiogroup" aria-label="Template">
              {CASE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={templateId === t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`text-left px-2.5 py-1.5 rounded-[3px] border ${templateId === t.id ? 'border-[var(--t-accent)] bg-[var(--t-active)]' : 'border-[var(--t-border)] hover:bg-[var(--t-hover)]'}`}
                >
                  <span className="text-zinc-100">{t.name}</span>
                  <span className="block text-[11px] text-zinc-500">{t.summary}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Operation Nightfall, Domain Clustered Research..."
              className="t-input"
              required
            />
          </div>

          {template.subject && (
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{template.subject.label} (optional)</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={template.subject.placeholder} className="t-input" />
            </div>
          )}

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Investigation Objective & Scope
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={template.objective || 'Document the primary focus, target suspects, and research bounds...'}
              className="t-input !h-auto py-1.5 resize-none leading-relaxed"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-obsidian-border">
            <button
              type="button"
              onClick={onClose}
              className="t-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="t-btn t-btn-primary"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
