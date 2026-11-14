import { describe, it, expect, vi } from 'vitest';
import { scoreMatch } from '../components/modals/CommandPaletteModal';
import { buildPaletteCommands, type PaletteContext } from '../components/modals/paletteCommands';

const ctx = (over: Partial<PaletteContext> = {}): PaletteContext => {
  const fn = vi.fn();
  return {
    hasProject: true,
    isDesktop: true,
    mod: '⌘',
    hasSelectedEntity: true,
    autosave: true,
    projects: [
      { id: 'a', name: 'Alpha', active: true },
      { id: 'b', name: 'Beta', active: false },
    ],
    go: fn, newEntity: fn, newRelationship: fn, newSource: fn, newNote: fn, newProject: fn, importCase: fn,
    mergeSelected: fn, importData: fn, report: fn, exportZip: fn, history: fn, rebuildIndex: fn, revealFolder: fn,
    settings: fn, shortcuts: fn, tour: fn, toggleLeft: fn, toggleRight: fn, setTheme: fn, toggleAutosave: fn, switchProject: fn,
    ...over,
  };
};

describe('command palette search', () => {
  it('requires every word and ranks title-start matches first', () => {
    expect(scoreMatch('exp rep', 'Export report', 'Case')).toBeGreaterThan(0);
    expect(scoreMatch('zzz', 'Export report')).toBe(0);
    expect(scoreMatch('report export', 'Export report')).toBeGreaterThan(0);
    expect(scoreMatch('exp', 'Export report')).toBeGreaterThan(scoreMatch('exp', 'Rebuild search index', 'Case', 'reexport'));
  });
  it('finds commands by keyword, not only title', () => {
    const cmds = buildPaletteCommands(ctx());
    const hit = (q: string) => cmds.filter((c) => scoreMatch(q, c.title, c.section, c.keywords) > 0).map((c) => c.id);
    expect(hit('backup')).toContain('history');
    expect(hit('undo')).toContain('history');
    expect(hit('pdf')).toContain('report');
    expect(hit('print')).toContain('report');
    expect(hit('dedupe')).toContain('merge');
    expect(hit('sherlock')).toContain('go-tools');
  });
  it('lists only what applies', () => {
    const none = buildPaletteCommands(ctx({ hasProject: false, hasSelectedEntity: false }));
    expect(none.some((c) => c.id === 'new-entity' || c.id === 'report' || c.id === 'history')).toBe(false);
    expect(none.some((c) => c.id === 'settings' && c.id)).toBe(true);
    const web = buildPaletteCommands(ctx({ isDesktop: false }));
    expect(web.some((c) => c.id === 'history')).toBe(false);
    expect(buildPaletteCommands(ctx({ hasSelectedEntity: false })).some((c) => c.id === 'merge')).toBe(false);
  });
  it('offers other investigations but not the active one, and toggles autosave wording', () => {
    const cmds = buildPaletteCommands(ctx());
    expect(cmds.filter((c) => c.section === 'Switch investigation').map((c) => c.title)).toEqual(['Beta']);
    expect(cmds.find((c) => c.id === 'autosave')?.title).toBe('Turn autosave off');
    expect(buildPaletteCommands(ctx({ autosave: false })).find((c) => c.id === 'autosave')?.title).toBe('Turn autosave on');
  });
});

import { pickDefault, pushRecent, SUGGESTED_IDS } from '../services/paletteRecent';
describe('palette defaults', () => {
  const cmds = [...SUGGESTED_IDS, 'lock', 'merge'].map((id) => ({ id }));
  it('puts recent first, then suggestions without repeats, only existing commands', () => {
    const d = pickDefault(cmds, ['lock', 'gone', 'report']);
    expect(d.recent.map((c) => c.id)).toEqual(['lock', 'report']);
    expect(d.suggested.map((c) => c.id)).not.toContain('report');
    expect(d.suggested.length).toBe(SUGGESTED_IDS.length - 1);
  });
  it('keeps at most five distinct recents, newest first', () => {
    let r: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'c']) r = pushRecent(id, r);
    expect(r).toEqual(['c', 'f', 'e', 'd', 'b']);
  });
});
