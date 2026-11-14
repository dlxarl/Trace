import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { Row, Section } from '@/components/common/SettingsParts';
import { Toggle } from '@/components/common/Toggle';
import { KEY_NAME_RE, type NetLogEntry, type NetworkSettings, TOR_PROXY_URL } from '@/services/tools/proxy';

type Loaded = NetworkSettings & { active: string | null };
const MODES: { id: NetworkSettings['mode']; label: string }[] = [
  { id: 'off', label: 'Direct' },
  { id: 'tor', label: 'Tor' },
  { id: 'custom', label: 'Custom' },
];

/** Desktop only: proxy / Tor, API keys and the outbound request log. */
export const NetworkSection: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const net = api?.network;
  const keysApi = api?.keys;
  const [settings, setSettings] = useState<Loaded | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [keys, setKeys] = useState<{ available: boolean; names: string[] } | null>(null);
  const [keyName, setKeyName] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [log, setLog] = useState<NetLogEntry[] | null>(null);

  const load = useCallback(async () => {
    if (!net || !keysApi) return;
    const s = await net.getSettings();
    setSettings(s);
    setCustomUrl((cur) => cur || s.url);
    setKeys(await keysApi.status());
  }, [net, keysApi]);
  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!net || !keysApi) return null;

  const apply = async (next: NetworkSettings) => {
    setMsg(null);
    const r = await net.setSettings(next);
    if (!r.ok) {
      setMsg({ tone: 'error', text: r.error });
      return;
    }
    setSettings(r.settings);
    setCustomUrl(r.settings.url || customUrl);
  };

  const test = async () => {
    setTesting(true);
    setMsg(null);
    const r = await net.test();
    setTesting(false);
    setMsg(
      r.ok
        ? { tone: 'ok', text: `Websites see ${r.ip}${r.isTor ? ' — a Tor exit address.' : r.via === 'direct' ? ' — your own connection.' : '.'}` }
        : { tone: 'error', text: r.error },
    );
    if (log) setLog(await net.log());
  };

  const addKey = async () => {
    const r = await keysApi.set(keyName.trim(), keyValue);
    if (!r.ok) {
      setMsg({ tone: 'error', text: r.error });
      return;
    }
    setKeyName('');
    setKeyValue('');
    setMsg({ tone: 'ok', text: 'Key saved. Use it in an API request as {{key:NAME}}.' });
    setKeys(await keysApi.status());
  };

  const s = settings;
  return (
    <>
      <Section title="Network (proxy & Tor)">
        <Row label="Route traffic through" description="Applies to tool runs, page capture and API requests. If the proxy is unreachable, nothing is sent directly.">
          <div className="flex items-stretch h-[24px] border border-[var(--t-border)] rounded-[3px] overflow-hidden" role="radiogroup" aria-label="Proxy mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={s?.mode === m.id}
                onClick={() => s && apply({ mode: m.id, url: m.id === 'custom' ? customUrl : s.url, allowDirectTools: s.allowDirectTools })}
                className={`px-3 text-[11.5px] border-l border-[var(--t-border)] first:border-l-0 ${s?.mode === m.id ? 'bg-[var(--t-active)] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 hover:bg-[var(--t-hover)]'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Row>
        {s?.mode === 'tor' && (
          <Row label="Tor" description={`Expects Tor running on this computer at ${TOR_PROXY_URL.replace('socks5h://', '')} (the Tor service). Tor Browser uses 127.0.0.1:9150: choose Custom for that.`} stacked={false}>
            <span className="t-kbd">{TOR_PROXY_URL.replace('socks5h://', '')}</span>
          </Row>
        )}
        {s?.mode === 'custom' && (
          <Row label="Proxy address" description="http, https, socks5 or socks5h (recommended: names are resolved at the proxy)." stacked>
            <div className="flex items-center gap-2">
              <input className="t-input flex-1 font-mono" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="socks5h://127.0.0.1:9150" aria-label="Proxy address" />
              <button type="button" className="t-btn" onClick={() => apply({ mode: 'custom', url: customUrl, allowDirectTools: s.allowDirectTools })}>
                Apply
              </button>
            </div>
          </Row>
        )}
        {s && s.mode !== 'off' && (
          <Row label="Allow tools that cannot use a proxy" description="DNSRecon and dnstwist send DNS queries directly. Off: they are blocked while a proxy is on, so they cannot reveal your connection.">
            <Toggle on={s.allowDirectTools} onClick={() => apply({ mode: s.mode, url: s.url, allowDirectTools: !s.allowDirectTools })} />
          </Row>
        )}
        <Row label="Check connection" description="Shows the address websites see, and whether it is a Tor exit.">
          <button type="button" className="t-btn" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 opacity-70" />}
            Test
          </button>
        </Row>
        {msg && (
          <div role="status" className={`px-4 py-2 text-[11.5px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </div>
        )}
        <div className="px-4 py-2 text-[11px] text-zinc-600">Not covered: checking for app updates is made by the app window and always goes direct.</div>
      </Section>

      <Section title="API keys">
        <div className="px-4 py-3 text-[11.5px] text-zinc-500 leading-relaxed">
          Keys are encrypted with your system keychain and never shown again or written into cases. In an API request, write <span className="font-mono text-zinc-300">{'{{key:NAME}}'}</span> in the address, a header or the body.
        </div>
        {keys && !keys.available && <div className="px-4 py-2 text-[11.5px] text-amber-400">This computer has no secure storage available, so keys cannot be saved.</div>}
        {keys?.names.map((n) => (
          <div key={n} className="px-4 h-[34px] flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-mono text-[11.5px] text-zinc-200 flex-1">{n}</span>
            <span className="text-[11px] text-zinc-600">saved</span>
            <button type="button" className="t-icon-btn" title={`Delete ${n}`} aria-label={`Delete key ${n}`} onClick={async () => { await keysApi.remove(n); setKeys(await keysApi.status()); }}>
              <Trash2 />
            </button>
          </div>
        ))}
        <div className="px-4 py-3 flex items-center gap-2">
          <input className="t-input w-[150px] font-mono" placeholder="NAME" value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label="Key name" maxLength={64} />
          <input className="t-input flex-1 font-mono" type="password" autoComplete="off" placeholder="value" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} aria-label="Key value" />
          <button type="button" className="t-btn t-btn-primary" disabled={!KEY_NAME_RE.test(keyName.trim()) || !keyValue || keys?.available === false} onClick={addKey}>
            Save key
          </button>
        </div>
      </Section>

      <Section title="Outgoing requests">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="flex-1 text-[11.5px] text-zinc-500">What TRACE has sent from this session (addresses without query strings, never keys).</div>
          <button type="button" className="t-btn" onClick={async () => setLog(await net.log())}>
            {log ? 'Refresh' : 'Show'}
          </button>
          {log && log.length > 0 && (
            <button type="button" className="t-btn" onClick={async () => { await net.clearLog(); setLog([]); }}>
              Clear
            </button>
          )}
        </div>
        {log && (
          <div className="max-h-[180px] overflow-y-auto" aria-label="Outgoing requests">
            {log.length === 0 ? (
              <div className="px-4 py-3 text-[11.5px] text-zinc-600">Nothing sent yet.</div>
            ) : (
              log.map((e, i) => (
                <div key={i} className="px-4 h-[24px] flex items-center gap-2 text-[11px] border-t border-[var(--t-border-subtle)]">
                  <span className="font-mono text-zinc-600 w-[62px]">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
                  <span className="t-kbd !text-[9.5px] w-[54px] justify-center">{e.kind}</span>
                  <span className="text-zinc-300 truncate flex-1 font-mono">{e.target}</span>
                  <span className="text-zinc-500 shrink-0">{e.via}</span>
                </div>
              ))
            )}
          </div>
        )}
      </Section>
    </>
  );
};
