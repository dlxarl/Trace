import { describe, it, expect } from 'vitest';
import {
  parseProxyUrl, normaliseNetwork, effectiveProxy, maskProxy, chromiumProxyRules, routeTool, proxyArgs, proxyEnv,
  fillKeys, placeholdersIn, redactSecrets, NetLog, logTarget, TOR_PROXY_URL, DEFAULT_NETWORK,
} from '../services/tools/proxy';
import { TOOL_CATALOG } from '../services/tools/catalog';

describe('proxy addresses', () => {
  it('accepts supported schemes and fills default ports', () => {
    expect(parseProxyUrl('socks5h://127.0.0.1:9050')).toMatchObject({ ok: true, url: 'socks5h://127.0.0.1:9050', secure: true });
    expect(parseProxyUrl('socks5://example.org')).toMatchObject({ ok: true, url: 'socks5://example.org:1080', secure: false });
    expect(parseProxyUrl('http://u:p@proxy.local:3128')).toMatchObject({ ok: true, url: 'http://u:p@proxy.local:3128' });
  });
  it('rejects bad input with a readable message', () => {
    for (const bad of ['', 'nope', 'ftp://a:1', 'socks5://:9050', 'socks5://h:99999', 'http://h:80/path']) {
      const r = parseProxyUrl(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });
  it('masks credentials', () => {
    expect(maskProxy('http://user:secret@proxy:3128')).toBe('http://•••@proxy:3128');
    expect(maskProxy(TOR_PROXY_URL)).toBe(TOR_PROXY_URL);
  });
  it('maps socks5h for Chromium', () => {
    expect(chromiumProxyRules('socks5h://127.0.0.1:9050')).toBe('socks5://127.0.0.1:9050');
    expect(chromiumProxyRules('http://p:1')).toBe('http://p:1');
  });
});

describe('network settings', () => {
  it('defaults to direct and ignores junk', () => {
    expect(normaliseNetwork(null)).toEqual(DEFAULT_NETWORK);
    expect(normaliseNetwork({ mode: 'weird' }).mode).toBe('off');
  });
  it('never claims to proxy with an invalid custom address', () => {
    const n = normaliseNetwork({ mode: 'custom', url: 'garbage' });
    expect(n.mode).toBe('off');
    expect(effectiveProxy(n)).toBeNull();
  });
  it('resolves tor and custom', () => {
    expect(effectiveProxy({ mode: 'tor', url: '', allowDirectTools: false })).toBe(TOR_PROXY_URL);
    expect(effectiveProxy({ mode: 'custom', url: 'socks5://h:1', allowDirectTools: false })).toBe('socks5://h:1');
  });
});

describe('routing tools', () => {
  const tor = { mode: 'tor' as const, url: '', allowDirectTools: false };
  const off = DEFAULT_NETWORK;
  it('adds nothing when off', () => {
    expect(routeTool('sherlock', 'Sherlock', off)).toEqual({ ok: true, args: [], env: {}, via: null });
  });
  it('uses --proxy for Sherlock and a socks5 address for Maigret (aiohttp-socks rejects socks5h)', () => {
    expect(proxyArgs('sherlock', TOR_PROXY_URL)).toEqual(['--proxy', 'socks5h://127.0.0.1:9050']);
    expect(proxyArgs('maigret', TOR_PROXY_URL)).toEqual(['--proxy', 'socks5://127.0.0.1:9050']);
  });
  it('uses environment variables for Holehe and Ignorant, including NO_PROXY cleared', () => {
    const env = proxyEnv('holehe', TOR_PROXY_URL);
    expect(env.ALL_PROXY).toBe(TOR_PROXY_URL);
    expect(env.HTTPS_PROXY).toBe(TOR_PROXY_URL);
    expect(env.NO_PROXY).toBe('');
    expect(proxyEnv('sherlock', TOR_PROXY_URL)).toEqual({});
  });
  it('blocks DNS tools while a proxy is on unless allowed', () => {
    const r = routeTool('dnsrecon', 'DNSRecon', tor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot use the proxy/);
    expect(routeTool('dnstwist', 'dnstwist', { ...tor, allowDirectTools: true })).toEqual({ ok: true, args: [], env: {}, via: null });
  });
  it('reports the route without credentials', () => {
    const r = routeTool('maigret', 'Maigret', { mode: 'custom', url: 'socks5://u:p@h:1', allowDirectTools: false });
    expect(r.ok && r.via).toBe('socks5://•••@h:1');
  });
  it('refuses to run when a custom proxy is configured but invalid, rather than going direct', () => {
    expect(routeTool('sherlock', 'Sherlock', { mode: 'custom', url: 'x', allowDirectTools: false }).ok).toBe(false);
  });
  it('every catalog tool has a routing decision', () => {
    for (const t of TOOL_CATALOG) expect(['ok', 'blocked']).toContain(routeTool(t.id, t.name, tor).ok ? 'ok' : 'blocked');
  });
});

describe('API keys', () => {
  it('fills placeholders and reports missing keys by name only', () => {
    expect(fillKeys('Bearer {{key:SHODAN}} / {{ key:alt.key }}', (n) => ({ SHODAN: 'abc', 'alt.key': 'xyz' } as Record<string, string>)[n])).toBe('Bearer abc / xyz');
    expect(() => fillKeys('{{key:NOPE}}', () => undefined)).toThrow(/“NOPE” is not saved/);
    expect(fillKeys('plain {{ not-a-key }}', () => 'x')).toBe('plain {{ not-a-key }}');
  });
  it('lists placeholders once', () => {
    expect(placeholdersIn('{{key:A}} {{key:B}} {{key:A}}')).toEqual(['A', 'B']);
  });
  it('redacts secrets an API echoed back', () => {
    expect(redactSecrets('your key abcdef123 works', ['abcdef123'])).toBe('your key •••••• works');
    expect(redactSecrets('short', ['ab'])).toBe('short');
  });
});

describe('outbound log', () => {
  it('keeps the newest entries and strips query strings and credentials from targets', () => {
    const log = new NetLog(3);
    for (let i = 0; i < 5; i++) log.add({ kind: 'api', target: `h${i}`, via: 'direct' }, new Date(2026, 0, 1, 0, 0, i));
    expect(log.list().map((e) => e.target)).toEqual(['h4', 'h3', 'h2']);
    expect(logTarget('https://user:pw@api.example.com/v1/x?key=SECRET#f')).toBe('api.example.com/v1/x');
    expect(logTarget('nonsense')).toBe('invalid address');
    log.clear();
    expect(log.list()).toEqual([]);
  });
});

// ── key store ──────────────────────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KeyStore, type Cipher } from '../../electron/keystore';

const fakeCipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (p) => Buffer.from(`ENC:${[...p].reverse().join('')}`),
  decrypt: (d) => {
    const t = d.toString();
    if (!t.startsWith('ENC:')) throw new Error('bad');
    return [...t.slice(4)].reverse().join('');
  },
});

describe('key store', () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-keys-')), 'keystore.json');

  it('stores values encrypted, never in plain text, and returns them to the main process', () => {
    const f = tmp();
    const ks = new KeyStore(f, fakeCipher());
    ks.set('SHODAN', 'super-secret-value');
    expect(fs.readFileSync(f, 'utf8')).not.toContain('super-secret-value');
    expect(ks.get('SHODAN')).toBe('super-secret-value');
    expect(ks.names()).toEqual(['SHODAN']);
    expect(ks.delete('SHODAN')).toBe(true);
    expect(ks.delete('SHODAN')).toBe(false);
    expect(ks.get('SHODAN')).toBeUndefined();
  });
  it('refuses to store anything when the OS has no secure storage', () => {
    const f = tmp();
    const ks = new KeyStore(f, fakeCipher(false));
    expect(() => ks.set('A', 'x')).toThrow(/secure storage/);
    expect(fs.existsSync(f)).toBe(false);
  });
  it('validates names and values and survives a damaged file or entry', () => {
    const f = tmp();
    const ks = new KeyStore(f, fakeCipher());
    expect(() => ks.set('bad name!', 'x')).toThrow(/key name/);
    expect(() => ks.set('OK', '')).toThrow(/key value/);
    fs.writeFileSync(f, '{not json');
    expect(ks.names()).toEqual([]);
    fs.writeFileSync(f, JSON.stringify({ v: 1, keys: { X: Buffer.from('garbage').toString('base64') } }));
    expect(ks.get('X')).toBeUndefined();
  });
});
