import { contextBridge, ipcRenderer } from 'electron';

// Expose safe, isolated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,

  // Workspace & Project operations
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  saveWorkspace: (ws: any) => ipcRenderer.invoke('workspace:save', ws),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name: string, description?: string, id?: string) =>
    ipcRenderer.invoke('projects:create', { name, description, id }),
  getProject: (id: string) => ipcRenderer.invoke('projects:get', id),
  saveProject: (raw: string) => ipcRenderer.invoke('projects:save', raw),
  deleteProject: (id: string, mode?: 'delete' | 'keep' | 'trash') => ipcRenderer.invoke('projects:delete', id, mode),
  getStorageUsage: () => ipcRenderer.invoke('storage:usage'),

  // Encrypted cases
  vault: {
    lock: (id: string, pass: string) => ipcRenderer.invoke('vault:lock', id, pass),
    unlock: (id: string, pass: string) => ipcRenderer.invoke('vault:unlock', id, pass),
  },

  // Proxy / Tor, outbound log and API keys
  network: {
    getSettings: () => ipcRenderer.invoke('net:getSettings'),
    setSettings: (s: { mode: string; url: string; allowDirectTools: boolean }) => ipcRenderer.invoke('net:setSettings', s),
    test: () => ipcRenderer.invoke('net:test'),
    log: () => ipcRenderer.invoke('net:log'),
    clearLog: () => ipcRenderer.invoke('net:clearLog'),
  },
  keys: {
    status: () => ipcRenderer.invoke('keys:status'),
    set: (name: string, value: string) => ipcRenderer.invoke('keys:set', name, value),
    remove: (name: string) => ipcRenderer.invoke('keys:delete', name),
  },

  // History snapshots and backups
  history: {
    list: (projectId: string) => ipcRenderer.invoke('history:list', projectId),
    snapshot: (projectId: string, label?: string) => ipcRenderer.invoke('history:snapshot', projectId, label),
    changes: (projectId: string, id: string, against: 'previous' | 'current') => ipcRenderer.invoke('history:changes', projectId, id, against),
    file: (projectId: string, id: string, file: string) => ipcRenderer.invoke('history:file', projectId, id, file),
    restore: (projectId: string, id: string) => ipcRenderer.invoke('history:restore', projectId, id),
  },
  backups: {
    list: (projectId: string) => ipcRenderer.invoke('backup:list', projectId),
    create: (projectId: string, reason?: string) => ipcRenderer.invoke('backup:create', projectId, reason),
    remove: (projectId: string, id: string) => ipcRenderer.invoke('backup:delete', projectId, id),
    restore: (projectId: string, id: string, mode: 'copy' | 'replace') => ipcRenderer.invoke('backup:restore', projectId, id, mode),
    reveal: (projectId: string) => ipcRenderer.invoke('backup:reveal', projectId),
    getSettings: () => ipcRenderer.invoke('backup:getSettings'),
    setSettings: (s: { enabled: boolean; intervalMin: number; keep: number }) => ipcRenderer.invoke('backup:setSettings', s),
  },

  // Entities
  saveEntity: (projectId: string, entityId: string, raw: string) =>
    ipcRenderer.invoke('entities:save', { projectId, entityId, raw }),
  deleteEntity: (projectId: string, entityId: string) =>
    ipcRenderer.invoke('entities:delete', { projectId, entityId }),

  // Relationships
  saveRelationship: (projectId: string, relId: string, raw: string) =>
    ipcRenderer.invoke('relationships:save', { projectId, relId, raw }),
  deleteRelationship: (projectId: string, relId: string) =>
    ipcRenderer.invoke('relationships:delete', { projectId, relId }),

  // Sources
  saveSource: (projectId: string, sourceId: string, raw: string) =>
    ipcRenderer.invoke('sources:save', { projectId, sourceId, raw }),
  deleteSource: (projectId: string, sourceId: string) =>
    ipcRenderer.invoke('sources:delete', { projectId, sourceId }),

  // Notes
  saveNote: (projectId: string, noteId: string, raw: string) =>
    ipcRenderer.invoke('notes:save', { projectId, noteId, raw }),
  deleteNote: (projectId: string, noteId: string) =>
    ipcRenderer.invoke('notes:delete', { projectId, noteId }),

  // Graph Layout
  getGraphLayout: (projectId: string) => ipcRenderer.invoke('graph:getLayout', projectId),
  saveGraphLayout: (projectId: string, layout: any) =>
    ipcRenderer.invoke('graph:saveLayout', { projectId, layout }),

  // Search & Indexing
  search: (projectId: string, query: string) =>
    ipcRenderer.invoke('search:query', { projectId, query }),
  rebuildIndex: (projectId: string) => ipcRenderer.invoke('search:rebuild', projectId),

  // Import / Export
  exportProjectZip: (projectId: string) => ipcRenderer.invoke('projects:exportZip', projectId),
  importProjectZip: (buffer: ArrayBuffer) => ipcRenderer.invoke('projects:importZip', buffer),

  // File System Dialog & Open in Explorer
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  openInExplorer: (projectId?: string) => ipcRenderer.invoke('workspace:openInExplorer', projectId),

  // Storage Change Event Listener
  onStorageChange: (callback: (event: any) => void) => {
    const handler = (_: any, eventData: any) => callback(eventData);
    ipcRenderer.on('storage:changed', handler);
    return () => {
      ipcRenderer.removeListener('storage:changed', handler);
    };
  },

  // Platform & Window State
  platform: process.platform,
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  onFullScreenChange: (callback: (isFull: boolean) => void) => {
    const handler = (_: any, isFull: boolean) => callback(isFull);
    ipcRenderer.on('window:fullscreen-change', handler);
    return () => {
      ipcRenderer.removeListener('window:fullscreen-change', handler);
    };
  },

  // Network Request (Proxy for API Quick Sources)
  sendApiRequest: (req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => ipcRenderer.invoke('net:request', req),

  // App version
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Appearance (system / light / dark) → window background, title bar, native dialogs
  setTheme: (mode: 'system' | 'light' | 'dark') => ipcRenderer.invoke('app:setTheme', mode),

  // Import investigation (native dialog)
  pickImport: (mode: 'any' | 'zip' | 'folder') => ipcRenderer.invoke('import:pick', mode),

  // Evidence captures and reports
  evidence: {
    capture: (projectId: string, sourceId: string, url: string) => ipcRenderer.invoke('evidence:capture', { projectId, sourceId, url }),
    verify: (projectId: string, sourceId: string, capture: unknown) => ipcRenderer.invoke('evidence:verify', { projectId, sourceId, capture }),
    open: (projectId: string, sourceId: string, captureId: string, name?: string) =>
      ipcRenderer.invoke('evidence:open', { projectId, sourceId, captureId, name }),
    exportFiles: (projectId: string) => ipcRenderer.invoke('evidence:export', projectId),
    importFiles: (projectId: string, files: { path: string; data: Uint8Array }[]) => ipcRenderer.invoke('evidence:import', { projectId, files }),
  },
  saveReportPdf: (html: string, fileName: string) => ipcRenderer.invoke('report:savePdf', { html, fileName }),

  // External tools (marketplace)
  tools: {
    status: () => ipcRenderer.invoke('tools:status'),
    install: (id: string) => ipcRenderer.invoke('tools:install', id),
    installPython: () => ipcRenderer.invoke('tools:installPython'),
    uninstall: (id: string) => ipcRenderer.invoke('tools:uninstall', id),
    run: (id: string, input: string, runId: string) => ipcRenderer.invoke('tools:run', { id, input, runId }),
    cancel: (runId: string) => ipcRenderer.invoke('tools:cancel', runId),
    onLog: (cb: (e: { runId: string; line: string; stream: string }) => void) => {
      const handler = (_: unknown, e: { runId: string; line: string; stream: string }) => cb(e);
      ipcRenderer.on('tools:log', handler);
      return () => ipcRenderer.removeListener('tools:log', handler);
    },
  },

  // Read-only MCP server switch
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('mcp:setEnabled', enabled),
  },
});
