/** Recently used palette commands (per computer) and the default suggestions. */
const KEY = 'trace_palette_recent';
export const SUGGESTED_IDS = ['go-graph', 'new-entity', 'new-rel', 'import-data', 'report', 'history', 'settings'];

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: string, current: string[] = loadRecent()): string[] {
  const next = [id, ...current.filter((x) => x !== id)].slice(0, 5);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/** What to show before the user types: recent first, then suggestions, only commands that exist now. */
export function pickDefault<T extends { id: string }>(commands: T[], recent: string[]): { recent: T[]; suggested: T[] } {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const r = recent.map((id) => byId.get(id)).filter((c): c is T => !!c);
  const seen = new Set(r.map((c) => c.id));
  const s = SUGGESTED_IDS.map((id) => byId.get(id)).filter((c): c is T => !!c && !seen.has(c.id));
  return { recent: r, suggested: s };
}
