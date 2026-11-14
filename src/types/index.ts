import { z } from 'zod';
import type React from 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

declare global {
  const __APP_VERSION__: string;
  /** `YYYYMMDDHHMMSS-<git commit>`, embedded at build time. */
  const __BUILD_ID__: string;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'company'
  | 'website'
  | 'domain'
  | 'account'
  | 'email'
  | 'phone'
  | 'ip'
  | 'location'
  | 'document'
  | 'event'
  | 'computer'
  | 'laptop'
  | 'smartphone'
  | 'server'
  | 'network_interface'
  | 'custom';

export const ENTITY_TYPES: { type: EntityType; label: string; color: string; iconName: string }[] = [
  { type: 'person', label: 'Person', color: '#8a7bb8', iconName: 'User' },
  { type: 'organization', label: 'Organization', color: '#c08a55', iconName: 'Users' },
  { type: 'company', label: 'Company', color: '#b5835a', iconName: 'Briefcase' },
  { type: 'website', label: 'Website', color: '#5c9e8f', iconName: 'Globe2' },
  { type: 'domain', label: 'Domain', color: '#4fa3a0', iconName: 'Network' },
  { type: 'account', label: 'Account', color: '#9a86b0', iconName: 'Fingerprint' },
  { type: 'email', label: 'Email Address', color: '#b7a165', iconName: 'Mail' },
  { type: 'phone', label: 'Phone Number', color: '#a8946a', iconName: 'Phone' },
  { type: 'ip', label: 'IP Address', color: '#5b7fae', iconName: 'Binary' },
  { type: 'location', label: 'Location', color: '#6f9a68', iconName: 'MapPin' },
  { type: 'document', label: 'Document', color: '#8b8f98', iconName: 'FileText' },
  { type: 'event', label: 'Event', color: '#a99b5e', iconName: 'Calendar' },
  { type: 'computer', label: 'Computer', color: '#6d8fa6', iconName: 'Monitor' },
  { type: 'laptop', label: 'Laptop', color: '#6a8aa0', iconName: 'Laptop' },
  { type: 'smartphone', label: 'Smartphone', color: '#7a92aa', iconName: 'Smartphone' },
  { type: 'server', label: 'Server', color: '#5f8796', iconName: 'Server' },
  { type: 'network_interface', label: 'Network Interface', color: '#5d9097', iconName: 'EthernetPort' },
  { type: 'custom', label: 'Custom', color: '#9b7f97', iconName: 'Boxes' },
];

export type RelationshipStatus =
  | 'candidate'
  | 'unverified'
  | 'supported'
  | 'confirmed'
  | 'rejected';

export const RELATIONSHIP_STATUSES: {
  status: RelationshipStatus;
  label: string;
  color: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
}[] = [
  { status: 'confirmed', label: 'Confirmed', color: '#6fae8c', borderStyle: 'solid' },
  { status: 'supported', label: 'Supported', color: '#739cc0', borderStyle: 'solid' },
  { status: 'unverified', label: 'Unverified', color: '#c6a463', borderStyle: 'dashed' },
  { status: 'candidate', label: 'Candidate', color: '#7c8088', borderStyle: 'dotted' },
  { status: 'rejected', label: 'Rejected', color: '#c97c7c', borderStyle: 'dashed' },
];

/**
 * Evidence class: how an investigator should read a relationship.
 * Derived from the verification status so existing projects need no migration.
 *  - observed:   backed by an observed fact (confirmed / supported)
 *  - hypothesis: plausible but not yet established (unverified / candidate)
 *  - disproven:  checked and found false (rejected)
 */
export type EvidenceClass = 'observed' | 'hypothesis' | 'disproven';

export const EVIDENCE_CLASSES: { cls: EvidenceClass; label: string; statuses: RelationshipStatus[] }[] = [
  { cls: 'observed', label: 'Observed fact', statuses: ['confirmed', 'supported'] },
  { cls: 'hypothesis', label: 'Hypothesis', statuses: ['unverified', 'candidate'] },
  { cls: 'disproven', label: 'Disproven', statuses: ['rejected'] },
];

export function evidenceClassOf(status: RelationshipStatus | string | undefined): EvidenceClass {
  if (status === 'confirmed' || status === 'supported') return 'observed';
  if (status === 'rejected') return 'disproven';
  return 'hypothesis';
}

export type SourceType =
  | 'webpage'
  | 'document'
  | 'social_post'
  | 'leak'
  | 'registry'
  | 'interview'
  | 'other';

export const SOURCE_TYPES: { type: SourceType; label: string }[] = [
  { type: 'webpage', label: 'Webpage' },
  { type: 'document', label: 'Document' },
  { type: 'social_post', label: 'Social Post' },
  { type: 'leak', label: 'Data Leak' },
  { type: 'registry', label: 'Public Registry' },
  { type: 'interview', label: 'Interview' },
  { type: 'other', label: 'Other' },
];

/**
 * Admiralty (NATO) rating: how reliable the source is (A–F) and how credible
 * this particular piece of information is (1–6). Optional on every source.
 */
export type SourceReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type InfoCredibility = '1' | '2' | '3' | '4' | '5' | '6';

export const SOURCE_RELIABILITY: { code: SourceReliability; label: string }[] = [
  { code: 'A', label: 'Completely reliable' },
  { code: 'B', label: 'Usually reliable' },
  { code: 'C', label: 'Fairly reliable' },
  { code: 'D', label: 'Not usually reliable' },
  { code: 'E', label: 'Unreliable' },
  { code: 'F', label: 'Reliability cannot be judged' },
];

export const INFO_CREDIBILITY: { code: InfoCredibility; label: string }[] = [
  { code: '1', label: 'Confirmed by other sources' },
  { code: '2', label: 'Probably true' },
  { code: '3', label: 'Possibly true' },
  { code: '4', label: 'Doubtful' },
  { code: '5', label: 'Improbable' },
  { code: '6', label: 'Truth cannot be judged' },
];

/** "B2", "A", "–3" or '' when unrated. */
export function admiraltyCode(s: { reliability?: string; credibility?: string }): string {
  if (!s.reliability && !s.credibility) return '';
  return `${s.reliability || '–'}${s.credibility || ''}`;
}

/** One file of a preserved copy of a source, with its SHA-256. */
export interface EvidenceFile {
  name: string;
  kind: 'screenshot' | 'pdf' | 'mhtml';
  sha256: string;
  bytes: number;
}

/** A preserved copy of a web source taken at a point in time (desktop app). */
export interface EvidenceCapture {
  /** Folder name under evidence/<source-id>/, a UTC timestamp. */
  id: string;
  captured_at: string;
  url: string;
  final_url?: string;
  title?: string;
  files: EvidenceFile[];
  /** TRACE version that made the capture. */
  tool?: string;
}

// Zod schemas for runtime validation
export const EntityFrontmatterSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  attributes: z.record(z.string(), z.any()).default({}),
  tags: z.array(z.string()).default([]),
  custom_type: z.string().optional(),
}).passthrough();

export const RelationshipFrontmatterSchema = z.object({
  id: z.string(),
  type: z.string(),
  source_entity: z.string(),
  target_entity: z.string(),
  directed: z.boolean().default(true),
  status: z.enum(['candidate', 'unverified', 'supported', 'confirmed', 'rejected']).default('candidate'),
  confidence: z.number().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  created_at: z.string(),
}).passthrough();

export const SourceFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('source'),
  title: z.string(),
  url: z.string().optional(),
  accessed_at: z.string(),
  source_type: z.string().default('webpage'),
}).passthrough();

export const ProjectFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('project'),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

export const NoteFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal('note'),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

// Domain Interfaces
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
  attributes: Record<string, any>;
  tags: string[];
  custom_type?: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Relationship {
  id: string;
  type: string;
  source_entity: string;
  target_entity: string;
  directed: boolean;
  status: RelationshipStatus;
  confidence: number | null;
  evidence: string[]; // source IDs
  /** When the relationship held (ISO date, optional): e.g. director from 2019-03 to 2022-06. */
  valid_from?: string;
  valid_to?: string;
  created_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Source {
  id: string;
  type: 'source';
  title: string;
  url?: string;
  accessed_at: string;
  source_type: SourceType;
  /** Admiralty rating (optional). */
  reliability?: SourceReliability;
  credibility?: InfoCredibility;
  /** Link to an archived copy (e.g. Wayback Machine). */
  archive_url?: string;
  /** Preserved copies with hashes (files live in evidence/<source-id>/<capture-id>/). */
  captures?: EvidenceCapture[];
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Note {
  id: string;
  type: 'note';
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface Project {
  id: string;
  type: 'project';
  name: string;
  created_at: string;
  updated_at: string;
  markdownBody: string;
  extraFrontmatter?: Record<string, any>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  entityCount: number;
  relationshipCount: number;
  sourceCount: number;
  noteCount: number;
  updated_at: string;
  /** Encrypted at rest; unlock it with its passphrase to open (desktop). */
  locked?: boolean;
}

export interface QuickSource {
  id: string;
  title: string;
  url?: string;
  source_type?: SourceType | string;
  description?: string;
  projectId?: string;
  created_at: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  headers?: Record<string, string> | string;
  body?: string;
  lastResponse?: {
    status?: number;
    statusText?: string;
    data?: any;
    durationMs?: number;
    timestamp?: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  activeProjectId?: string;
  workspacePath?: string;
  quickSources?: QuickSource[];
  created_at: string;
  updated_at: string;
}

export interface ProjectData {
  project: Project;
  entities: Entity[];
  relationships: Relationship[];
  sources: Source[];
  notes: Note[];
}

/** How much space TRACE's data takes (desktop: files on disk; web: browser storage). */
export interface StorageUsage {
  kind: 'disk' | 'browser';
  location: string;
  projects: { id: string; name: string; bytes: number; files?: number }[];
  projectsBytes: number;
  /** Cases removed from TRACE but kept on disk (desktop only). */
  removedBytes: number;
  /** Version history and backups (desktop only). */
  safetyBytes?: number;
  toolsBytes: number;
  pythonBytes: number;
  /** Everything above added up. */
  totalBytes: number;
  /** Browser only: bytes used / available according to the browser. */
  browserUsageBytes?: number;
  browserQuotaBytes?: number;
}

/** What happens to a case's files when it is removed (desktop). */
export type ProjectRemoveMode = 'delete' | 'keep' | 'trash';

export interface GraphLayout {
  positions: Record<string, { x: number; y: number }>;
}

export interface SearchResult {
  id: string;
  type: 'entity' | 'relationship' | 'source' | 'note' | 'project';
  title: string;
  subtitle: string;
  snippet?: string;
  tags?: string[];
  entityType?: EntityType;
  relStatus?: RelationshipStatus;
}

export type TabType =
  | 'overview'
  | 'graph'
  | 'entity'
  | 'relationship'
  | 'source'
  | 'note'
  | 'search'
  | 'tools'
  | 'timeline'
  | 'records'
  | 'settings';

export interface Tab {
  id: string;
  type: TabType;
  targetId?: string;
  title: string;
  isPinned?: boolean;
  isPreview?: boolean;
  isDirty?: boolean;
}

export interface StorageChangeEvent {
  type: 'reload' | 'create' | 'update' | 'delete';
  targetType: 'project' | 'entity' | 'relationship' | 'source' | 'note';
  targetId?: string;
}

/** Accepts YYYY, YYYY-MM or YYYY-MM-DD; anything else is not a usable date. */
export function parsePartialDate(v: unknown): { iso: string; ms: number; precision: 'year' | 'month' | 'day' } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCMonth() !== mo - 1) return null; // e.g. 2026-02-31
  return { iso: v.trim(), ms, precision: m[3] ? 'day' : m[2] ? 'month' : 'year' };
}

// ── History snapshots and backups (desktop) ─────────────────────────────────
export type SnapshotReason = 'auto' | 'manual' | 'before-restore' | 'before-merge' | 'import' | 'other';
export interface SnapshotInfo {
  id: string;
  at: string;
  reason: SnapshotReason;
  label?: string;
  fileCount: number;
}
export interface FileChange {
  path: string;
  status: 'added' | 'removed' | 'modified';
  label?: string;
}
export type BackupReason = 'auto' | 'manual' | 'before-restore' | 'before-delete' | 'before-merge';
export interface BackupInfo {
  id: string;
  file: string;
  reason: BackupReason;
  at: string;
  bytes: number;
}
