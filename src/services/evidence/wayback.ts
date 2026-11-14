/**
 * Wayback Machine lookup: finds the closest archived snapshot of a URL using
 * the public availability API. Only runs when the user asks for it — the URL
 * is sent to archive.org.
 */
export interface WaybackSnapshot {
  url: string;
  timestamp: string; // ISO
}

export const waybackSaveUrl = (url: string) => `https://web.archive.org/save/${url}`;

/** Parses the availability API response; returns null when nothing is archived. */
export function parseWaybackResponse(body: unknown): WaybackSnapshot | null {
  const closest = (body as any)?.archived_snapshots?.closest;
  if (!closest || closest.available !== true || typeof closest.url !== 'string') return null;
  let u: URL;
  try {
    u = new URL(closest.url);
  } catch {
    return null;
  }
  if (u.hostname !== 'web.archive.org') return null; // never trust another host
  u.protocol = 'https:';
  const t = typeof closest.timestamp === 'string' ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(closest.timestamp) : null;
  return { url: u.toString(), timestamp: t ? `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}Z` : '' };
}

export async function findWaybackSnapshot(pageUrl: string): Promise<WaybackSnapshot | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(pageUrl)}`;
  const desktop = typeof window !== 'undefined' ? window.electronAPI?.sendApiRequest : undefined;
  if (desktop) {
    const r = await desktop({ url: api, method: 'GET' });
    if (!r.success || (r.status ?? 500) >= 400) throw new Error(r.error || `archive.org responded with HTTP ${r.status}`);
    return parseWaybackResponse(typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  }
  const res = await fetch(api);
  if (!res.ok) throw new Error(`archive.org responded with HTTP ${res.status}`);
  return parseWaybackResponse(await res.json());
}
