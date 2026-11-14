import React from 'react';
import {
  Network,
  Compass,
  Search,
  CalendarRange,
  Wrench,
  Plus,
  Share2,
  FileText,
  StickyNote,
  FolderPlus,
  GitMerge,
  FileInput,
  FileDown,
  ScanText,
  Share,
  Archive,
  History,
  RefreshCw,
  FolderOpen,
  Settings,
  Keyboard,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  Monitor,
  Save,
  ArrowUpFromLine,
  Briefcase,
  HelpCircle,
  Lock,
} from 'lucide-react';
import type { PaletteCommand } from './CommandPaletteModal';

const I = (C: React.ComponentType<{ className?: string }>) => <C className="w-3.5 h-3.5" />;

export interface PaletteContext {
  hasProject: boolean;
  isDesktop: boolean;
  mod: string;
  hasSelectedEntity: boolean;
  autosave: boolean;
  projects: { id: string; name: string; active: boolean }[];
  go: (type: 'graph' | 'overview' | 'search' | 'timeline' | 'tools') => void;
  newEntity: () => void;
  newRelationship: () => void;
  newSource: () => void;
  newNote: () => void;
  newProject: () => void;
  importCase: () => void;
  mergeSelected: () => void;
  importData: () => void;
  extractText: () => void;
  exportGraph: () => void;
  report: () => void;
  exportZip: () => void;
  history: () => void;
  lockCase: () => void;
  rebuildIndex: () => void;
  revealFolder: () => void;
  settings: () => void;
  shortcuts: () => void;
  tour: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setTheme: (m: 'system' | 'light' | 'dark') => void;
  toggleAutosave: () => void;
  switchProject: (id: string) => void;
}

/** Everything the app can do, in one searchable list. */
export function buildPaletteCommands(c: PaletteContext): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  const add = (cmd: PaletteCommand, when = true) => when && out.push(cmd);
  const p = c.hasProject;

  add({ id: 'go-graph', section: 'Go to', title: 'Graph', keywords: 'canvas network map visual', shortcut: `${c.mod}G`, icon: I(Network), run: () => c.go('graph') }, p);
  add({ id: 'go-overview', section: 'Go to', title: 'Case brief', keywords: 'overview summary project scope', shortcut: `${c.mod}O`, icon: I(Compass), run: () => c.go('overview') }, p);
  add({ id: 'go-search', section: 'Go to', title: 'Full-text search', keywords: 'find query', shortcut: `${c.mod}F`, icon: I(Search), run: () => c.go('search') }, p);
  add({ id: 'go-timeline', section: 'Go to', title: 'Timeline', keywords: 'dates periods chronology', icon: I(CalendarRange), run: () => c.go('timeline') }, p);
  add({ id: 'go-tools', section: 'Go to', title: 'Tools', keywords: 'sherlock maigret marketplace osint mcp run install', icon: I(Wrench), run: () => c.go('tools') });

  add({ id: 'new-entity', section: 'Create', title: 'New entity…', keywords: 'person organization domain add', icon: I(Plus), run: c.newEntity }, p);
  add({ id: 'new-rel', section: 'Create', title: 'New relationship…', keywords: 'link connection edge add', icon: I(Share2), run: c.newRelationship }, p);
  add({ id: 'new-source', section: 'Create', title: 'New source', keywords: 'evidence url reference add', icon: I(FileText), run: c.newSource }, p);
  add({ id: 'new-note', section: 'Create', title: 'New note', keywords: 'write observation add', icon: I(StickyNote), run: c.newNote }, p);
  add({ id: 'new-case', section: 'Create', title: 'New investigation…', keywords: 'case project', icon: I(FolderPlus), run: c.newProject });
  add({ id: 'import-case', section: 'Create', title: 'Import investigation (.zip or folder)…', keywords: 'open case archive', icon: I(ArrowUpFromLine), run: c.importCase });

  add({ id: 'merge', section: 'Case', title: 'Merge duplicate entities…', keywords: 'combine dedupe duplicates same person', icon: I(GitMerge), run: c.mergeSelected }, p && c.hasSelectedEntity);
  add({ id: 'import-data', section: 'Case', title: 'Import tool output…', keywords: 'spiderfoot csv json indicators maigret holehe', icon: I(FileInput), run: c.importData }, p);
  add({ id: 'extract', section: 'Case', title: 'Find entities in pasted text…', keywords: 'extract paste article emails domains phones handles indicators ioc', icon: I(ScanText), run: c.extractText }, p);
  add({ id: 'export-graph', section: 'Case', title: 'Export graph (GraphML, STIX)…', keywords: 'gephi maltego misp cytoscape neo4j interchange', icon: I(Share), run: c.exportGraph }, p);
  add({ id: 'report', section: 'Case', title: 'Export report (Markdown, HTML, PDF)', keywords: 'print document summary', icon: I(FileDown), run: c.report }, p);
  add({ id: 'export', section: 'Case', title: 'Export case as .zip', keywords: 'download archive share save', icon: I(Archive), run: c.exportZip }, p);
  add({ id: 'history', section: 'Case', title: 'History & backups…', keywords: 'undo restore version snapshot backup recover rollback', icon: I(History), run: c.history }, p && c.isDesktop);
  add({ id: 'lock', section: 'Case', title: 'Lock and encrypt this case…', keywords: 'password passphrase encrypt protect secure vault', icon: I(Lock), run: c.lockCase }, p && c.isDesktop);
  add({ id: 'reindex', section: 'Case', title: 'Rebuild search index', keywords: 'reindex fix search', icon: I(RefreshCw), run: c.rebuildIndex }, p);
  add({ id: 'reveal', section: 'Case', title: c.isDesktop ? 'Reveal case folder' : 'Download case files', keywords: 'finder explorer open folder', icon: I(FolderOpen), run: c.revealFolder }, p);

  add({ id: 'settings', section: 'App', title: 'Settings', keywords: 'preferences storage updates changelog appearance', shortcut: `${c.mod},`, icon: I(Settings), run: c.settings });
  add({ id: 'shortcuts', section: 'App', title: 'Keyboard shortcuts', keywords: 'keys help cheatsheet', shortcut: '?', icon: I(Keyboard), run: c.shortcuts });
  add({ id: 'tour', section: 'App', title: 'Show the welcome tour', keywords: 'help intro guide onboarding start', icon: I(HelpCircle), run: c.tour });
  add({ id: 'left', section: 'App', title: 'Toggle left sidebar', keywords: 'hide show panel', shortcut: `${c.mod}[`, icon: I(PanelLeft), run: c.toggleLeft });
  add({ id: 'right', section: 'App', title: 'Toggle inspector', keywords: 'hide show panel right', shortcut: `${c.mod}]`, icon: I(PanelRight), run: c.toggleRight }, p);
  add({ id: 'theme-light', section: 'App', title: 'Theme: light', keywords: 'appearance', icon: I(Sun), run: () => c.setTheme('light') });
  add({ id: 'theme-dark', section: 'App', title: 'Theme: dark', keywords: 'appearance', icon: I(Moon), run: () => c.setTheme('dark') });
  add({ id: 'theme-system', section: 'App', title: 'Theme: follow system', keywords: 'appearance auto', icon: I(Monitor), run: () => c.setTheme('system') });
  add({ id: 'autosave', section: 'App', title: c.autosave ? 'Turn autosave off' : 'Turn autosave on', keywords: 'save automatically', icon: I(Save), run: c.toggleAutosave });

  c.projects.filter((x) => !x.active).forEach((x) => add({ id: `case-${x.id}`, section: 'Switch investigation', title: x.name, keywords: 'open case project switch', icon: I(Briefcase), run: () => c.switchProject(x.id) }));
  return out;
}
