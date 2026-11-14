import * as yaml from 'js-yaml';
import {
  Entity,
  EntityFrontmatterSchema,
  parsePartialDate,
  EvidenceCapture,
  EvidenceFile,
  InfoCredibility,
  SourceReliability,
  EntityType,
  Note,
  NoteFrontmatterSchema,
  Project,
  ProjectFrontmatterSchema,
  Relationship,
  RelationshipFrontmatterSchema,
  RelationshipStatus,
  Source,
  SourceFrontmatterSchema,
  SourceType,
} from '@/types';

export interface ParsedMarkdown<T = Record<string, any>> {
  frontmatter: T;
  content: string;
}

/**
 * Splits raw markdown into YAML frontmatter object and body content
 */
export function parseMarkdownFrontmatter(rawContent: string): ParsedMarkdown {
  // Support both Unix (\n) and Windows (\r\n) newlines, requiring opening delimiter on first line
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: rawContent };
  }

  const yamlString = match[1].trim();
  const content = match[2];

  let frontmatter: Record<string, any> = {};
  try {
    const loaded = yaml.load(yamlString);
    if (loaded && typeof loaded === 'object') {
      frontmatter = loaded as Record<string, any>;
    }
  } catch (err) {
    console.error('Failed to parse YAML frontmatter:', err);
  }

  return { frontmatter, content };
}

/**
 * Serializes frontmatter object and markdown body into standard file string
 */
export function serializeMarkdownFrontmatter(
  frontmatter: Record<string, any>,
  content: string
): string {
  // Clean up undefined values
  const cleanFrontmatter: Record<string, any> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) {
      cleanFrontmatter[key] = value;
    }
  }

  const yamlStr = yaml.dump(cleanFrontmatter, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trim();

  return `---\n${yamlStr}\n---\n\n${content.trim()}\n`;
}

// Entity Serializers & Parsers
export function parseEntityFile(raw: string, fallbackId: string): Entity {
  const { frontmatter, content } = parseMarkdownFrontmatter(raw);
  const validated = EntityFrontmatterSchema.safeParse(frontmatter);

  const now = new Date().toISOString();
  if (!validated.success) {
    return {
      id: (frontmatter.id as string) || fallbackId,
      type: ((frontmatter.type as EntityType) || 'custom'),
      name: (frontmatter.name as string) || fallbackId,
      aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
      created_at: (frontmatter.created_at as string) || now,
      updated_at: (frontmatter.updated_at as string) || now,
      attributes: typeof frontmatter.attributes === 'object' && frontmatter.attributes ? frontmatter.attributes : {},
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      custom_type: frontmatter.custom_type as string | undefined,
      markdownBody: content,
      extraFrontmatter: frontmatter,
    };
  }

  const data = validated.data;
  const extra: Record<string, any> = {};
  const knownKeys = ['id', 'type', 'name', 'aliases', 'created_at', 'updated_at', 'attributes', 'tags', 'custom_type'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!knownKeys.includes(k)) {
      extra[k] = v;
    }
  }

  return {
    id: data.id,
    type: (data.type as EntityType) || 'custom',
    name: data.name,
    aliases: data.aliases || [],
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    attributes: data.attributes || {},
    tags: data.tags || [],
    custom_type: data.custom_type,
    markdownBody: content,
    extraFrontmatter: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function serializeEntityFile(entity: Entity): string {
  const frontmatter: Record<string, any> = {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    attributes: entity.attributes,
    tags: entity.tags,
  };

  if (entity.custom_type) {
    frontmatter.custom_type = entity.custom_type;
  }

  if (entity.extraFrontmatter) {
    Object.assign(frontmatter, entity.extraFrontmatter);
  }

  const defaultBody = `# ${entity.name}\n\n## Summary\n\nAdd a summary of the available information.\n\n## Findings\n\nRecord observations and analysis.\n\n## Sources\n\nReference source files or external URLs.`;
  return serializeMarkdownFrontmatter(frontmatter, entity.markdownBody || defaultBody);
}

// Relationship Serializers & Parsers

/** YAML turns a bare 2019-03-05 into a Date; keep dates as the text the user wrote. Invalid values are dropped. */
function relDates(fm: Record<string, any>): { valid_from?: string; valid_to?: string } {
  const text = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v) : v);
  const from = text(fm.valid_from);
  const to = text(fm.valid_to);
  return { valid_from: parsePartialDate(from) ? (from as string) : undefined, valid_to: parsePartialDate(to) ? (to as string) : undefined };
}
export function parseRelationshipFile(raw: string, fallbackId: string): Relationship {
  const { frontmatter, content } = parseMarkdownFrontmatter(raw);
  const validated = RelationshipFrontmatterSchema.safeParse(frontmatter);

  const now = new Date().toISOString();
  if (!validated.success) {
    return {
      id: (frontmatter.id as string) || fallbackId,
      type: (frontmatter.type as string) || 'associated_with',
      source_entity: (frontmatter.source_entity as string) || '',
      target_entity: (frontmatter.target_entity as string) || '',
      directed: frontmatter.directed !== false,
      status: ((frontmatter.status as RelationshipStatus) || 'candidate'),
      confidence: typeof frontmatter.confidence === 'number' ? frontmatter.confidence : null,
      evidence: Array.isArray(frontmatter.evidence) ? frontmatter.evidence : [],
      ...relDates(frontmatter),
      created_at: (frontmatter.created_at as string) || now,
      markdownBody: content,
      extraFrontmatter: frontmatter,
    };
  }

  const data = validated.data;
  const extra: Record<string, any> = {};
  const knownKeys = ['id', 'type', 'source_entity', 'target_entity', 'directed', 'status', 'confidence', 'evidence', 'valid_from', 'valid_to', 'created_at'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!knownKeys.includes(k)) {
      extra[k] = v;
    }
  }

  return {
    id: data.id,
    type: data.type,
    source_entity: data.source_entity,
    target_entity: data.target_entity,
    directed: data.directed,
    status: data.status,
    confidence: data.confidence ?? null,
    evidence: data.evidence || [],
    ...relDates(frontmatter),
    created_at: data.created_at || now,
    markdownBody: content,
    extraFrontmatter: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function serializeRelationshipFile(rel: Relationship): string {
  const frontmatter: Record<string, any> = {
    id: rel.id,
    type: rel.type,
    source_entity: rel.source_entity,
    target_entity: rel.target_entity,
    directed: rel.directed,
    status: rel.status,
    confidence: rel.confidence,
    evidence: rel.evidence,
    valid_from: rel.valid_from || undefined,
    valid_to: rel.valid_to || undefined,
    created_at: rel.created_at,
  };

  if (rel.extraFrontmatter) {
    Object.assign(frontmatter, rel.extraFrontmatter);
  }

  const defaultBody = `# Relationship: ${rel.type}\n\n## Explanation\n\nDescribe why this relationship is being considered.\n\n## Evidence\n\nDocument supporting and contradicting observations.`;
  return serializeMarkdownFrontmatter(frontmatter, rel.markdownBody || defaultBody);
}

// Source Serializers & Parsers
const RELIABILITY = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
const CREDIBILITY = new Set(['1', '2', '3', '4', '5', '6']);
const SHA256_RE = /^[0-9a-f]{64}$/;
const CAPTURE_FILE_KINDS = new Set(['screenshot', 'pdf', 'mhtml']);

/** Reads the optional rating / archive / capture fields; anything malformed is dropped, not guessed. */
function sourceExtras(fm: Record<string, any>): Pick<Source, 'reliability' | 'credibility' | 'archive_url' | 'captures'> {
  const rel = typeof fm.reliability === 'string' ? fm.reliability.toUpperCase() : '';
  const cred = fm.credibility == null ? '' : String(fm.credibility);
  const captures: EvidenceCapture[] = [];
  if (Array.isArray(fm.captures)) {
    for (const c of fm.captures) {
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[0-9A-Za-z_-]{1,40}$/.test(c.id)) continue;
      const files: EvidenceFile[] = (Array.isArray(c.files) ? c.files : [])
        .filter((f: any) => f && typeof f.name === 'string' && /^[a-z]+\.[a-z]+$/.test(f.name) && CAPTURE_FILE_KINDS.has(f.kind) && typeof f.sha256 === 'string' && SHA256_RE.test(f.sha256))
        .map((f: any) => ({ name: f.name, kind: f.kind, sha256: f.sha256, bytes: Number(f.bytes) || 0 }));
      captures.push({
        id: c.id,
        captured_at: typeof c.captured_at === 'string' ? c.captured_at : '',
        url: typeof c.url === 'string' ? c.url : '',
        final_url: typeof c.final_url === 'string' ? c.final_url : undefined,
        title: typeof c.title === 'string' ? c.title : undefined,
        files,
        tool: typeof c.tool === 'string' ? c.tool : undefined,
      });
    }
  }
  return {
    reliability: RELIABILITY.has(rel) ? (rel as SourceReliability) : undefined,
    credibility: CREDIBILITY.has(cred) ? (cred as InfoCredibility) : undefined,
    archive_url: typeof fm.archive_url === 'string' && /^https?:\/\//i.test(fm.archive_url) ? fm.archive_url : undefined,
    captures: captures.length ? captures : undefined,
  };
}

export function parseSourceFile(raw: string, fallbackId: string): Source {
  const { frontmatter, content } = parseMarkdownFrontmatter(raw);
  const validated = SourceFrontmatterSchema.safeParse(frontmatter);
  const now = new Date().toISOString();
  const knownKeys = ['id', 'type', 'title', 'url', 'accessed_at', 'source_type', 'reliability', 'credibility', 'archive_url', 'captures'];
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!knownKeys.includes(k)) extra[k] = v;
  }
  const extraFrontmatter = Object.keys(extra).length > 0 ? extra : undefined;

  if (!validated.success) {
    return {
      id: (frontmatter.id as string) || fallbackId,
      type: 'source',
      title: (frontmatter.title as string) || fallbackId,
      url: frontmatter.url as string | undefined,
      accessed_at: (frontmatter.accessed_at as string) || now,
      source_type: ((frontmatter.source_type as SourceType) || 'webpage'),
      ...sourceExtras(frontmatter),
      markdownBody: content,
      extraFrontmatter,
    };
  }

  const data = validated.data;
  return {
    id: data.id,
    type: 'source',
    title: data.title,
    url: data.url,
    accessed_at: data.accessed_at || now,
    source_type: (data.source_type as SourceType) || 'webpage',
    ...sourceExtras(frontmatter),
    markdownBody: content,
    extraFrontmatter,
  };
}

export function serializeSourceFile(source: Source): string {
  const frontmatter: Record<string, any> = {
    id: source.id,
    type: 'source',
    title: source.title,
    url: source.url,
    accessed_at: source.accessed_at,
    source_type: source.source_type,
    reliability: source.reliability,
    credibility: source.credibility,
    archive_url: source.archive_url,
    // JSON round-trip drops undefined members, which YAML cannot hold
    captures: source.captures?.length ? JSON.parse(JSON.stringify(source.captures)) : undefined,
  };

  if (source.extraFrontmatter) {
    Object.assign(frontmatter, source.extraFrontmatter);
  }

  const defaultBody = `# ${source.title}\n\n## Extract\n\nRecord the relevant excerpt.\n\n## Notes\n\nExplain what this source does and does not establish.`;
  return serializeMarkdownFrontmatter(frontmatter, source.markdownBody || defaultBody);
}

// Note Serializers & Parsers
export function parseNoteFile(raw: string, fallbackId: string): Note {
  const { frontmatter, content } = parseMarkdownFrontmatter(raw);
  const validated = NoteFrontmatterSchema.safeParse(frontmatter);
  const now = new Date().toISOString();

  if (!validated.success) {
    return {
      id: (frontmatter.id as string) || fallbackId,
      type: 'note',
      title: (frontmatter.title as string) || fallbackId,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      created_at: (frontmatter.created_at as string) || now,
      updated_at: (frontmatter.updated_at as string) || now,
      markdownBody: content,
      extraFrontmatter: frontmatter,
    };
  }

  const data = validated.data;
  const extra: Record<string, any> = {};
  const knownKeys = ['id', 'type', 'title', 'tags', 'created_at', 'updated_at'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!knownKeys.includes(k)) {
      extra[k] = v;
    }
  }

  return {
    id: data.id,
    type: 'note',
    title: data.title,
    tags: data.tags || [],
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    markdownBody: content,
    extraFrontmatter: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function serializeNoteFile(note: Note): string {
  const frontmatter: Record<string, any> = {
    id: note.id,
    type: 'note',
    title: note.title,
    tags: note.tags,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };

  if (note.extraFrontmatter) {
    Object.assign(frontmatter, note.extraFrontmatter);
  }

  const defaultBody = `# ${note.title}\n\nAdd note content here...`;
  return serializeMarkdownFrontmatter(frontmatter, note.markdownBody || defaultBody);
}

// Project Serializers & Parsers
export function parseProjectFile(raw: string, fallbackId: string): Project {
  const { frontmatter, content } = parseMarkdownFrontmatter(raw);
  const validated = ProjectFrontmatterSchema.safeParse(frontmatter);
  const now = new Date().toISOString();

  if (!validated.success) {
    return {
      id: (frontmatter.id as string) || fallbackId,
      type: 'project',
      name: (frontmatter.name as string) || fallbackId,
      created_at: (frontmatter.created_at as string) || now,
      updated_at: (frontmatter.updated_at as string) || now,
      markdownBody: content,
      extraFrontmatter: frontmatter,
    };
  }

  const data = validated.data;
  const extra: Record<string, any> = {};
  const knownKeys = ['id', 'type', 'name', 'created_at', 'updated_at'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!knownKeys.includes(k)) {
      extra[k] = v;
    }
  }

  return {
    id: data.id,
    type: 'project',
    name: data.name,
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    markdownBody: content,
    extraFrontmatter: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function serializeProjectFile(project: Project): string {
  const frontmatter: Record<string, any> = {
    id: project.id,
    type: 'project',
    name: project.name,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };

  if (project.extraFrontmatter) {
    Object.assign(frontmatter, project.extraFrontmatter);
  }

  const defaultBody = `# ${project.name}\n\n## Objective\n\nDescribe the investigation objective.\n\n## Notes\n\nAdd general project notes here.`;
  return serializeMarkdownFrontmatter(frontmatter, project.markdownBody || defaultBody);
}
