/**
 * Starting points for a new investigation. A template gives the case an
 * objective, an optional first entity (the subject) and a working checklist
 * note — no invented facts, only structure.
 */
import type { Entity, EntityType, Note } from '@/types';

export interface CaseTemplate {
  id: string;
  name: string;
  summary: string;
  subject?: { type: EntityType; label: string; placeholder: string };
  objective: string;
  checklistTitle: string;
  checklist: string[];
}

export const CASE_TEMPLATES: CaseTemplate[] = [
  {
    id: 'blank',
    name: 'Blank case',
    summary: 'Start empty and build it yourself.',
    objective: '',
    checklistTitle: '',
    checklist: [],
  },
  {
    id: 'person',
    name: 'Person / identity check',
    summary: 'Verify who someone is and what they are linked to.',
    subject: { type: 'person', label: 'Person’s name', placeholder: 'Full name as you know it' },
    objective: 'Establish the identity of the subject and the accounts, organisations and places they are connected to. Record every claim with its source.',
    checklistTitle: 'Checklist — person',
    checklist: [
      'Write down what you were given (names, handles, emails, phones) as separate attributes',
      'Search each handle and email on the Tools tab (Sherlock, Maigret, Holehe)',
      'Preserve every useful page with “Capture page” before it changes',
      'Rate each source (reliability and credibility)',
      'Check for the same person under other names, then merge duplicates',
      'Add relationships with dates (when did it start or end?)',
      'Mark links Confirmed only with two independent sources',
    ],
  },
  {
    id: 'domain',
    name: 'Domain & infrastructure',
    summary: 'Who runs a website, and what else do they run?',
    subject: { type: 'website', label: 'Domain', placeholder: 'example.com' },
    objective: 'Map the owner, hosting and related infrastructure of the domain, and find other sites or accounts that share it.',
    checklistTitle: 'Checklist — domain',
    checklist: [
      'Capture the home page and key pages now',
      'Record registrar, creation date and name servers from WHOIS / DNS',
      'Run DNSRecon and dnstwist from the Tools tab and import the results',
      'Note IP addresses and who hosts them',
      'Search for the same analytics IDs, emails and phone numbers on other sites',
      'Check the Wayback Machine for earlier versions',
      'Link the people or organisations behind it, with sources',
    ],
  },
  {
    id: 'company',
    name: 'Company due diligence',
    summary: 'Ownership, people and public records of an organisation.',
    subject: { type: 'company', label: 'Company name', placeholder: 'Legal or trading name' },
    objective: 'Understand who owns and runs the company, where it operates and what public records say about it.',
    checklistTitle: 'Checklist — company',
    checklist: [
      'Find the company in the official registry; record number, address and status',
      'List directors and owners as person entities and link them',
      'Record the website, social accounts and phone numbers',
      'Look for related companies at the same address or with the same directors',
      'Search news and court records; save each source with a rating',
      'Note anything you could not verify as Candidate or Unverified, not Confirmed',
    ],
  },
  {
    id: 'alias',
    name: 'Username / alias hunt',
    summary: 'Trace one handle across the internet.',
    subject: { type: 'account', label: 'Username', placeholder: 'the handle, without @' },
    objective: 'Find where the username appears and whether the accounts belong to the same person.',
    checklistTitle: 'Checklist — alias',
    checklist: [
      'Run Sherlock and Maigret on the handle; import the results',
      'Open each hit and note whether the profile really looks like the same person',
      'Capture profiles that matter before they are deleted',
      'Compare photos, bios, languages, time zones and writing style',
      'Look for the handle in breaches or paste sites (only where lawful)',
      'Record confidence honestly: a shared name alone is not proof',
    ],
  },
];

export const getTemplate = (id: string): CaseTemplate => CASE_TEMPLATES.find((t) => t.id === id) ?? CASE_TEMPLATES[0];

const stamp = () => Date.now().toString(36);

/** The records a template adds to a new case (never touches existing ones). */
export function buildTemplateRecords(template: CaseTemplate, subjectName: string, now = new Date()): { entity?: Entity; note?: Note } {
  const iso = now.toISOString();
  const out: { entity?: Entity; note?: Note } = {};
  const name = subjectName.trim();
  if (template.subject && name) {
    out.entity = {
      id: `${template.subject.type}-${stamp()}`,
      type: template.subject.type,
      name,
      aliases: [],
      created_at: iso,
      updated_at: iso,
      attributes: {},
      tags: ['subject'],
      markdownBody: `# ${name}\n\nSubject of this investigation.\n`,
    };
  }
  if (template.checklist.length) {
    out.note = {
      id: `note-${stamp()}`,
      type: 'note',
      title: template.checklistTitle,
      tags: ['checklist'],
      created_at: iso,
      updated_at: iso,
      markdownBody: `# ${template.checklistTitle}\n\n${template.checklist.map((c) => `- [ ] ${c}`).join('\n')}\n`,
    };
  }
  return out;
}
