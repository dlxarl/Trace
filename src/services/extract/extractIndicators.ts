/**
 * Finds indicators (emails, links, domains, IPs, phone numbers, @handles,
 * crypto wallets) in free text — an article, a chat log, a note — and returns
 * them as an ImportBatch, so they go through the same review screen and
 * duplicate detection as any other import. Nothing is added automatically.
 */
import type { EntityType } from '@/types';
import type { ImportBatch, ImportEntity } from '@/services/import/types';

const FILE_LIKE_TLDS = new Set([
  'html', 'htm', 'php', 'asp', 'aspx', 'js', 'mjs', 'ts', 'css', 'json', 'xml', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'txt', 'md',
  'csv', 'zip', 'gz', 'tar', 'exe', 'dll', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'py', 'rb', 'java', 'cpp', 'log', 'tmp', 'bak', 'yml', 'yaml',
]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_RE = /https?:\/\/[^\s<>"'`\])}]+/gi;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.]*\d)/g;
const DOMAIN = /(?<![\w@./-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?![\w-])/gi;
const PHONE = /(?<![\w+])\+\d[\d\s().-]{6,18}\d(?!\d)/g;
const HANDLE = /(?<![\w@./])@[A-Za-z0-9_][A-Za-z0-9_.]{2,29}/g;
const ETH = /(?<![\w])0x[a-fA-F0-9]{40}(?![\w])/g;
const BTC = /(?<![\w])(?:bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})(?![\w])/g;

const trimTail = (s: string) => s.replace(/[.,;:!?)\]}'"]+$/, '');

export interface ExtractOptions {
  fileName?: string;
  /** Where the text came from, kept in provenance. */
  sourceUrl?: string;
}

export function extractIndicators(text: string, opts: ExtractOptions = {}): ImportBatch {
  const batch: ImportBatch = { format: 'text-extract', tool: 'Text extraction', fileName: opts.fileName, entities: [], relationships: [], unmapped: [], warnings: [] };
  const seen = new Set<string>();
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  let n = 0;

  const add = (type: EntityType, name: string, index: number, extra: Partial<ImportEntity> = {}) => {
    const key = `${type}|${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ctxStart = Math.max(0, index - 40);
    batch.entities.push({
      key: `x${n++}`,
      type,
      name,
      source_url: opts.sourceUrl,
      raw: { context: text.slice(ctxStart, index + name.length + 40).replace(/\s+/g, ' ').trim() },
      ...extra,
    });
  };
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) fn(m);
  };
  const claim = (m: RegExpExecArray, value: string) => taken.push([m.index, m.index + value.length]);

  // Most specific first; later passes skip text already claimed.
  scan(URL_RE, (m) => {
    const v = trimTail(m[0]);
    try {
      const u = new URL(v);
      claim(m, v);
      add('website', u.toString(), m.index, { source_url: u.toString() });
    } catch {
      /* not a URL */
    }
  });
  scan(EMAIL, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    const v = trimTail(m[0]);
    claim(m, v);
    add('email', v.toLowerCase(), m.index);
  });
  scan(ETH, (m) => {
    claim(m, m[0]);
    add('account', m[0], m.index, { attributes: { kind: 'Ethereum address' } });
  });
  scan(BTC, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    claim(m, m[0]);
    add('account', m[0], m.index, { attributes: { kind: 'Bitcoin address' } });
  });
  scan(IPV4, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    if (!m[0].split('.').every((o) => Number(o) <= 255 && String(Number(o)) === o)) return;
    claim(m, m[0]);
    add('ip', m[0], m.index);
  });
  scan(PHONE, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    const digits = (m[0].match(/\d/g) || []).length;
    if (digits < 8 || digits > 15) return;
    claim(m, m[0]);
    add('phone', m[0].replace(/\s+/g, ' ').trim(), m.index);
  });
  scan(HANDLE, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    const v = m[0].replace(/\.+$/, '');
    claim(m, v);
    add('account', v, m.index);
  });
  scan(DOMAIN, (m) => {
    if (overlaps(m.index, m.index + m[0].length)) return;
    const v = m[0].toLowerCase();
    const tld = v.slice(v.lastIndexOf('.') + 1);
    if (FILE_LIKE_TLDS.has(tld) || /^\d+(\.\d+)+$/.test(v)) return;
    claim(m, m[0]);
    add('domain', v, m.index);
  });

  if (batch.entities.length === 0) batch.warnings.push('No emails, links, domains, IP addresses, phone numbers or @handles were found in this text.');
  if (text.length > 2_000_000) batch.warnings.push('The text is very large; only indicators found in it are listed.');
  return batch;
}
