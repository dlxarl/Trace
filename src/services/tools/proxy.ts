/**
 * Routing outgoing traffic through a proxy (for example Tor), and the helpers
 * the desktop app needs to do it safely. Pure functions: shared by the Electron
 * main process and the Settings screen.
 *
 * What is routed (and what is not) matters for anonymity, so it is explicit:
 *  - Sherlock and Maigret take a --proxy flag.
 *  - Holehe and Ignorant read ALL_PROXY / HTTP(S)_PROXY.
 *  - DNSRecon and dnstwist send raw DNS queries and cannot use a proxy. While a
 *    proxy is on they are blocked unless the user allows direct runs.
 *  - Page capture and API Quick Sources use a proxied Electron session.
 */
import type { ToolId } from './catalog';

export type ProxyMode = 'off' | 'tor' | 'custom';
export interface NetworkSettings {
  mode: ProxyMode;
  /** Used when mode is "custom". */
  url: string;
  /** Let tools that cannot use the proxy (DNS tools) run directly anyway. */
  allowDirectTools: boolean;
}

export const TOR_PROXY_URL = 'socks5h://127.0.0.1:9050';
export const DEFAULT_NETWORK: NetworkSettings = { mode: 'off', url: '', allowDirectTools: false };

const SCHEMES = new Set(['http:', 'https:', 'socks4:', 'socks5:', 'socks5h:']);

export type ParsedProxy = { ok: true; url: string; scheme: string; host: string; port: number; secure: boolean } | { ok: false; error: string };

export function parseProxyUrl(raw: string): ParsedProxy {
  const v = (raw ?? '').trim();
  if (!v) return { ok: false, error: 'Enter a proxy address, e.g. socks5h://127.0.0.1:9050' };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, error: 'Not a valid address. Use scheme://host:port, e.g. socks5h://127.0.0.1:9050' };
  }
  if (!SCHEMES.has(u.protocol)) return { ok: false, error: 'Use http, https, socks4, socks5 or socks5h.' };
  if (!u.hostname) return { ok: false, error: 'The proxy address needs a host.' };
  if (u.pathname !== '/' && u.pathname !== '') return { ok: false, error: 'A proxy address has no path.' };
  const port = u.port ? Number(u.port) : u.protocol.startsWith('socks') ? 1080 : u.protocol === 'https:' ? 443 : 8080;
  if (!(port >= 1 && port <= 65535)) return { ok: false, error: 'Port must be between 1 and 65535.' };
  const scheme = u.protocol.slice(0, -1);
  const auth = u.username ? `${u.username}${u.password ? `:${u.password}` : ''}@` : '';
  const host = u.hostname.includes(':') ? `[${u.hostname.replace(/^\[|\]$/g, '')}]` : u.hostname;
  return { ok: true, url: `${scheme}://${auth}${host}:${port}`, scheme, host: u.hostname, port, secure: ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) };
}

export function normaliseNetwork(raw: unknown): NetworkSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode: ProxyMode = o.mode === 'tor' || o.mode === 'custom' ? o.mode : 'off';
  const url = typeof o.url === 'string' ? o.url.slice(0, 300) : '';
  // A custom mode without a valid address would silently go direct — fall back to off instead of pretending.
  if (mode === 'custom' && !parseProxyUrl(url).ok) return { mode: 'off', url, allowDirectTools: o.allowDirectTools === true };
  return { mode, url, allowDirectTools: o.allowDirectTools === true };
}

/** The proxy to use right now, or null when traffic goes direct. */
export function effectiveProxy(n: NetworkSettings): string | null {
  if (n.mode === 'tor') return TOR_PROXY_URL;
  if (n.mode === 'custom') {
    const p = parseProxyUrl(n.url);
    return p.ok ? p.url : null;
  }
  return null;
}

/** Credentials never appear in the UI or the log. */
export function maskProxy(url: string): string {
  return url.replace(/\/\/[^@/]*@/, '//•••@');
}

/** Chromium has no "socks5h": SOCKS5 there always resolves names at the proxy. */
export function chromiumProxyRules(url: string): string {
  return url.replace(/^socks5h:/, 'socks5:');
}

export type ToolRouting = 'flag' | 'env' | 'none';
const ROUTING: Record<ToolId, ToolRouting> = {
  sherlock: 'flag',
  maigret: 'flag',
  holehe: 'env',
  ignorant: 'env',
  dnsrecon: 'none',
  dnstwist: 'none',
};
export const toolRouting = (id: ToolId): ToolRouting => ROUTING[id] ?? 'none';

/** Extra packages a tool needs to speak SOCKS. */
export const PROXY_EXTRAS: Partial<Record<ToolId, string[]>> = {
  sherlock: ['PySocks'],
  holehe: ['socksio'],
  ignorant: ['socksio'],
};

/** Command-line flags that route a tool's traffic. aiohttp-socks (Maigret) rejects "socks5h". */
export function proxyArgs(id: ToolId, url: string): string[] {
  if (toolRouting(id) !== 'flag') return [];
  return ['--proxy', id === 'maigret' ? url.replace(/^socks5h:/, 'socks5:') : url];
}

export function proxyEnv(id: ToolId, url: string): Record<string, string> {
  if (toolRouting(id) !== 'env') return {};
  return { ALL_PROXY: url, HTTP_PROXY: url, HTTPS_PROXY: url, all_proxy: url, http_proxy: url, https_proxy: url, NO_PROXY: '', no_proxy: '' };
}

export type RouteDecision = { ok: true; args: string[]; env: Record<string, string>; via: string | null } | { ok: false; error: string };

/** Decides how a tool run is routed; refuses when a proxy is on and the tool cannot use it. */
export function routeTool(id: ToolId, name: string, n: NetworkSettings): RouteDecision {
  const url = effectiveProxy(n);
  if (!url) {
    if (n.mode === 'custom') return { ok: false, error: 'The proxy address in Settings is not valid. Fix it or turn the proxy off.' };
    return { ok: true, args: [], env: {}, via: null };
  }
  if (toolRouting(id) === 'none') {
    if (n.allowDirectTools) return { ok: true, args: [], env: {}, via: null };
    return {
      ok: false,
      error: `${name} sends DNS queries directly and cannot use the proxy, so running it would reveal your connection. Turn the proxy off, or allow direct runs in Settings → Network.`,
    };
  }
  return { ok: true, args: proxyArgs(id, url), env: proxyEnv(id, url), via: maskProxy(url) };
}

// ── API keys: {{key:NAME}} placeholders ─────────────────────────────────────

export const KEY_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const PLACEHOLDER = /\{\{\s*key:([A-Za-z0-9_.-]{1,64})\s*\}\}/g;

export const placeholdersIn = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];

/** Replaces {{key:NAME}} with stored secrets. Throws on a missing key, naming it (never the value). */
export function fillKeys(text: string, get: (name: string) => string | undefined): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => {
    const v = get(name);
    if (v === undefined) throw new Error(`The API key “${name}” is not saved. Add it in Settings → Network & keys.`);
    return v;
  });
}

/** Removes secrets that an API echoed back, before the response reaches the UI. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 6) out = out.split(s).join('••••••');
  return out;
}

// ── Outbound request log ────────────────────────────────────────────────────

export interface NetLogEntry {
  at: string;
  kind: 'api' | 'capture' | 'tool' | 'check';
  /** Host (and path, without query) or tool name. */
  target: string;
  via: string;
  note?: string;
}

/** Host + path of a URL without query string or credentials. */
export function logTarget(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 200);
  } catch {
    return 'invalid address';
  }
}

export class NetLog {
  private items: NetLogEntry[] = [];
  constructor(private readonly max = 200) {}
  add(e: Omit<NetLogEntry, 'at'>, now = new Date()) {
    this.items.push({ ...e, at: now.toISOString() });
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }
  list(): NetLogEntry[] {
    return [...this.items].reverse();
  }
  clear() {
    this.items = [];
  }
}
