import JSZip from 'jszip';
import {
  Entity,
  EvidenceCapture,
  GraphLayout,
  Note,
  Project,
  ProjectData,
  ProjectRemoveMode,
  ProjectSummary,
  Relationship,
  SearchResult,
  Source,
  StorageChangeEvent,
  StorageUsage,
  Workspace,
} from '@/types';
import { IStorageService } from './IStorageService';
import { applyImportTarget, readCaseBundle, zipToBundleFiles, type CaseBundle, type ImportedCase } from '../import/caseBundle';
import {
  parseEntityFile,
  parseNoteFile,
  parseProjectFile,
  parseRelationshipFile,
  parseSourceFile,
  serializeEntityFile,
  serializeNoteFile,
  serializeProjectFile,
  serializeRelationshipFile,
  serializeSourceFile,
} from '../markdownParser';
import { sqliteIndexService } from '../sqliteIndex';

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean;
      /** Tells the desktop shell the chosen appearance (window background, title bar, native dialogs). */
      setTheme?: (mode: 'system' | 'light' | 'dark') => Promise<'light' | 'dark'>;
      pickImport?: (mode: 'any' | 'zip' | 'folder') => Promise<
        | { ok: true; kind: 'zip'; name: string; data: Uint8Array }
        | { ok: true; kind: 'folder'; name: string; files: { path: string; text: string }[] }
        | { ok: false; error: string }
        | null
      >;
      getWorkspace: () => Promise<Workspace>;
      saveWorkspace: (ws: Workspace) => Promise<void>;
      listProjects: () => Promise<ProjectSummary[]>;
      createProject: (name: string, description?: string, id?: string) => Promise<Project>;
      getProject: (id: string) => Promise<{
        projectRaw: string;
        entities: { id: string; raw: string }[];
        relationships: { id: string; raw: string }[];
        sources: { id: string; raw: string }[];
        notes: { id: string; raw: string }[];
      } | null>;
      saveProject: (raw: string) => Promise<void>;
      deleteProject: (id: string, mode?: 'delete' | 'keep' | 'trash') => Promise<{ movedTo?: string } | void>;
      getStorageUsage?: () => Promise<StorageUsage>;
      saveEntity: (projectId: string, entityId: string, raw: string) => Promise<void>;
      deleteEntity: (projectId: string, entityId: string) => Promise<{ removedRelIds?: string[] } | void>;
      saveRelationship: (projectId: string, relId: string, raw: string) => Promise<void>;
      deleteRelationship: (projectId: string, relId: string) => Promise<void>;
      saveSource: (projectId: string, sourceId: string, raw: string) => Promise<void>;
      deleteSource: (projectId: string, sourceId: string) => Promise<void>;
      saveNote: (projectId: string, noteId: string, raw: string) => Promise<void>;
      deleteNote: (projectId: string, noteId: string) => Promise<void>;
      getGraphLayout: (projectId: string) => Promise<GraphLayout>;
      saveGraphLayout: (projectId: string, layout: GraphLayout) => Promise<void>;
      openInExplorer: (projectId?: string) => Promise<boolean>;
      onStorageChange: (callback: (event: StorageChangeEvent) => void) => () => void;
      selectDirectory: () => Promise<string | null>;
      sendApiRequest?: (req: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{
        success: boolean;
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        data?: any;
        error?: string;
        durationMs?: number;
      }>;
      getVersion?: () => Promise<string>;
      evidence?: {
        capture: (projectId: string, sourceId: string, url: string) => Promise<{ ok: true; capture: EvidenceCapture; warnings: string[] } | { ok: false; error: string }>;
        verify: (projectId: string, sourceId: string, capture: EvidenceCapture) => Promise<
          { ok: true; files: { name: string; status: 'ok' | 'modified' | 'missing' }[] } | { ok: false; error: string }
        >;
        open: (projectId: string, sourceId: string, captureId: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
        exportFiles: (projectId: string) => Promise<{ ok: true; files: { path: string; data: Uint8Array }[] } | { ok: false; error: string }>;
        importFiles: (projectId: string, files: { path: string; data: Uint8Array }[]) => Promise<{ ok: true; written: number; rejected: number } | { ok: false; error: string }>;
      };
      vault?: {
        lock: (id: string, pass: string) => Promise<{ ok: true; files: number } | { ok: false; error: string }>;
        unlock: (id: string, pass: string) => Promise<{ ok: true; files: number } | { ok: false; error: string; wrong?: boolean }>;
      };
      network?: {
        getSettings: () => Promise<import('@/services/tools/proxy').NetworkSettings & { active: string | null }>;
        setSettings: (s: import('@/services/tools/proxy').NetworkSettings) => Promise<{ ok: true; settings: import('@/services/tools/proxy').NetworkSettings & { active: string | null } } | { ok: false; error: string }>;
        test: () => Promise<{ ok: true; ip: string; isTor: boolean; via: string } | { ok: false; error: string }>;
        log: () => Promise<import('@/services/tools/proxy').NetLogEntry[]>;
        clearLog: () => Promise<void>;
      };
      keys?: {
        status: () => Promise<{ available: boolean; names: string[] }>;
        set: (name: string, value: string) => Promise<{ ok: true } | { ok: false; error: string }>;
        remove: (name: string) => Promise<boolean>;
      };
      history?: {
        list: (projectId: string) => Promise<import('@/types').SnapshotInfo[]>;
        snapshot: (projectId: string, label?: string) => Promise<import('@/types').SnapshotInfo | null>;
        changes: (projectId: string, id: string, against: 'previous' | 'current') => Promise<import('@/types').FileChange[]>;
        file: (projectId: string, id: string, file: string) => Promise<{ snapshot: string | null; now: string | null }>;
        restore: (projectId: string, id: string) => Promise<{ restored: number; removed: number }>;
      };
      backups?: {
        list: (projectId: string) => Promise<import('@/types').BackupInfo[]>;
        create: (projectId: string, reason?: string) => Promise<{ info: import('@/types').BackupInfo; skipped: string[] }>;
        remove: (projectId: string, id: string) => Promise<void>;
        restore: (projectId: string, id: string, mode: 'copy' | 'replace') => Promise<{ id: string }>;
        reveal: (projectId: string) => Promise<void>;
        getSettings: () => Promise<{ enabled: boolean; intervalMin: number; keep: number }>;
        setSettings: (s: { enabled: boolean; intervalMin: number; keep: number }) => Promise<{ enabled: boolean; intervalMin: number; keep: number }>;
      };
      saveReportPdf?: (html: string, fileName: string) => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>;
      tools?: {
        status: () => Promise<{
          python: { found: boolean; command?: string; version?: string; managed?: boolean };
          tools: { id: string; installed: boolean; version?: string; installedAt?: string }[];
          platform: string;
        }>;
        install: (id: string) => Promise<{ ok: boolean; error?: string }>;
        installPython: () => Promise<{ ok: boolean; error?: string }>;
        uninstall: (id: string) => Promise<{ ok: boolean; error?: string }>;
        run: (id: string, input: string, runId: string) => Promise<
          | { ok: true; value: string; exitCode: number | null; stdout: string; stderrTail: string; timedOut: boolean; cancelled: boolean; durationMs: number; startedAt: string }
          | { ok: false; error: string }
        >;
        cancel: (runId: string) => Promise<boolean>;
        onLog: (cb: (e: { runId: string; line: string; stream: string }) => void) => () => void;
      };
      mcp?: {
        status: () => Promise<{
          enabled: boolean;
          available: boolean;
          command: string;
          args: string[];
          env: Record<string, string>;
          workspacePath: string;
          configPath: string;
        }>;
        setEnabled: (enabled: boolean) => Promise<boolean>;
      };
    };
  }
}

export class ElectronStorageAdapter implements IStorageService {
  isDesktop(): boolean {
    return true;
  }

  private get api() {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available in browser mode');
    }
    return window.electronAPI;
  }

  async getWorkspace(): Promise<Workspace> {
    return this.api.getWorkspace();
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    return this.api.saveWorkspace(workspace);
  }

  async lockProject(id: string, passphrase: string): Promise<void> {
    const r = await this.api.vault?.lock(id, passphrase);
    if (!r) throw new Error('Encryption is not available.');
    if (!r.ok) throw new Error(r.error);
  }

  async unlockProject(id: string, passphrase: string): Promise<{ wrong?: boolean }> {
    const r = await this.api.vault?.unlock(id, passphrase);
    if (!r) throw new Error('Encryption is not available.');
    if (!r.ok) {
      if (r.wrong) return { wrong: true };
      throw new Error(r.error);
    }
    return {};
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.api.listProjects();
  }

  async createProject(name: string, description?: string, id?: string): Promise<Project> {
    return this.api.createProject(name, description, id);
  }

  async getProject(id: string): Promise<ProjectData | null> {
    const rawData = await this.api.getProject(id);
    if (!rawData || !rawData.projectRaw) return null;

    const project = parseProjectFile(rawData.projectRaw, id);
    const entities = (rawData.entities || []).map((e) => parseEntityFile(e.raw, e.id));
    const relationships = (rawData.relationships || []).map((r) => parseRelationshipFile(r.raw, r.id));
    const sources = (rawData.sources || []).map((s) => parseSourceFile(s.raw, s.id));
    const notes = (rawData.notes || []).map((n) => parseNoteFile(n.raw, n.id));

    const projectData: ProjectData = {
      project,
      entities,
      relationships,
      sources,
      notes,
    };

    // Lazily populate SQLite search index in the background without blocking UI
    setTimeout(() => {
      sqliteIndexService.init().then(() => {
        sqliteIndexService.rebuildIndex(projectData);
      }).catch(() => {});
    }, 1500);

    return projectData;
  }

  async saveProject(project: Project): Promise<void> {
    const raw = serializeProjectFile(project);
    return this.api.saveProject(raw);
  }

  async deleteProject(id: string, mode?: ProjectRemoveMode): Promise<void> {
    await this.api.deleteProject(id, mode);
  }

  async getStorageUsage(): Promise<StorageUsage> {
    if (!this.api.getStorageUsage) throw new Error('Storage usage is not available');
    return this.api.getStorageUsage();
  }

  async saveEntity(projectId: string, entity: Entity): Promise<void> {
    const raw = serializeEntityFile(entity);
    await this.api.saveEntity(projectId, entity.id, raw);
    sqliteIndexService.indexEntity(projectId, entity);
  }

  async deleteEntity(projectId: string, entityId: string): Promise<void> {
    const res = await this.api.deleteEntity(projectId, entityId);
    sqliteIndexService.removeDoc(entityId);
    if (res?.removedRelIds && Array.isArray(res.removedRelIds)) {
      for (const relId of res.removedRelIds) {
        sqliteIndexService.removeDoc(relId);
      }
    }
  }

  async saveRelationship(projectId: string, rel: Relationship): Promise<void> {
    const raw = serializeRelationshipFile(rel);
    await this.api.saveRelationship(projectId, rel.id, raw);
    sqliteIndexService.indexRelationship(projectId, rel);
  }

  async deleteRelationship(projectId: string, relId: string): Promise<void> {
    await this.api.deleteRelationship(projectId, relId);
    sqliteIndexService.removeDoc(relId);
  }

  async saveSource(projectId: string, source: Source): Promise<void> {
    const raw = serializeSourceFile(source);
    await this.api.saveSource(projectId, source.id, raw);
    sqliteIndexService.indexSource(projectId, source);
  }

  async deleteSource(projectId: string, sourceId: string): Promise<void> {
    await this.api.deleteSource(projectId, sourceId);
    sqliteIndexService.removeDoc(sourceId);
  }

  async saveNote(projectId: string, note: Note): Promise<void> {
    const raw = serializeNoteFile(note);
    await this.api.saveNote(projectId, note.id, raw);
    sqliteIndexService.indexNote(projectId, note);
  }

  async deleteNote(projectId: string, noteId: string): Promise<void> {
    await this.api.deleteNote(projectId, noteId);
    sqliteIndexService.removeDoc(noteId);
  }

  async getGraphLayout(projectId: string): Promise<GraphLayout> {
    return this.api.getGraphLayout(projectId);
  }

  async saveGraphLayout(projectId: string, layout: GraphLayout): Promise<void> {
    return this.api.saveGraphLayout(projectId, layout);
  }

  async search(projectId: string, query: string): Promise<SearchResult[]> {
    return sqliteIndexService.search(projectId, query);
  }

  async rebuildIndex(projectId: string): Promise<void> {
    const data = await this.getProject(projectId);
    if (!data) return;
    await sqliteIndexService.rebuildIndex(data);
  }

  async exportProjectZip(projectId: string): Promise<Blob> {
    const data = await this.getProject(projectId);
    if (!data) throw new Error(`Project ${projectId} not found`);

    const zip = new JSZip();
    zip.file('project.md', serializeProjectFile(data.project));

    const entFolder = zip.folder('entities');
    data.entities.forEach((ent) => {
      entFolder?.file(`${ent.id}.md`, serializeEntityFile(ent));
    });

    const relFolder = zip.folder('relationships');
    data.relationships.forEach((rel) => {
      relFolder?.file(`${rel.id}.md`, serializeRelationshipFile(rel));
    });

    const srcFolder = zip.folder('sources');
    data.sources.forEach((src) => {
      srcFolder?.file(`${src.id}.md`, serializeSourceFile(src));
    });

    const noteFolder = zip.folder('notes');
    data.notes.forEach((note) => {
      noteFolder?.file(`${note.id}.md`, serializeNoteFile(note));
    });

    const layout = await this.getGraphLayout(projectId);
    zip.file('graph-layout.json', JSON.stringify(layout, null, 2));

    // Preserved evidence (screenshots, PDFs, MHTML) travels with the case.
    const ev = await this.api.evidence?.exportFiles(projectId);
    if (ev && !ev.ok) throw new Error(ev.error);
    if (ev?.ok) ev.files.forEach((f) => zip.file(f.path, f.data));

    return zip.generateAsync({ type: 'blob' });
  }

  async importProjectZip(file: File | ArrayBuffer): Promise<string> {
    const bundle = await readCaseBundle(await zipToBundleFiles(file instanceof File ? await file.arrayBuffer() : file), file instanceof File ? file.name.replace(/\.zip$/i, '') : 'archive');
    return (await this.importProjectBundle(bundle)).id;
  }

  /** Stores an incoming case as a new project; an existing id is never overwritten. */
  async importProjectBundle(incoming: CaseBundle): Promise<ImportedCase> {
    const existing = (await this.listProjects()).map((p) => p.id);
    const { bundle, summary } = applyImportTarget(incoming, existing);
    const { project, entities, relationships, sources, notes } = bundle.data;
    await this.createProject(project.name, '', project.id);
    await this.saveProject(project);
    for (const e of entities) await this.saveEntity(project.id, e);
    for (const r of relationships) await this.saveRelationship(project.id, r);
    for (const s of sources) await this.saveSource(project.id, s);
    for (const n of notes) await this.saveNote(project.id, n);
    if (Object.keys(bundle.layout.positions).length > 0) await this.saveGraphLayout(project.id, bundle.layout);
    if (bundle.evidence?.length && this.api.evidence?.importFiles) {
      const files = await Promise.all(bundle.evidence.map(async (f) => ({ path: f.path, data: await f.bytes() })));
      const r = await this.api.evidence.importFiles(project.id, files);
      if (r.ok) summary.evidenceRestored = r.written;
    }
    await this.rebuildIndex(project.id);
    return summary;
  }

  async openInExplorer(projectId?: string): Promise<boolean> {
    return this.api.openInExplorer(projectId);
  }

  async selectDirectory(): Promise<string | null> {
    return this.api.selectDirectory();
  }

  onStorageChange(listener: (event: StorageChangeEvent) => void): () => void {
    return this.api.onStorageChange(listener);
  }
}
