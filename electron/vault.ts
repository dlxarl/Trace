/**
 * Encrypted cases ("vaults").
 *
 * Locking packs a case folder into one file, encrypts it with a passphrase and
 * removes the plain folder; unlocking reverses that. While a case is unlocked it
 * is an ordinary folder — encryption protects it at rest, not while you work.
 *
 * File format (all integers are bytes):
 *   "TRACEVLT" | version=1 | log2(N) | r | p | salt[16] | nonce[12] | ciphertext | tag[16]
 * Key: scrypt(passphrase, salt, N, r, p) → 32 bytes. Cipher: AES-256-GCM with the
 * 40-byte header as additional authenticated data, so changing any header byte
 * (e.g. weakening the KDF) makes decryption fail. There is NO recovery: a lost
 * passphrase means the data cannot be read.
 *
 * Pure Node + jszip: unit-testable without Electron.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const MAGIC = Buffer.from('TRACEVLT');
export const VAULT_EXT = '.trace-vault';
export const MIN_PASSPHRASE = 10;
export const DEFAULT_LOG_N = 17;
const HEADER_LEN = 8 + 1 + 1 + 1 + 1 + 16 + 12;
const TAG_LEN = 16;
const MAX_VAULT_BYTES = 1024 * 1024 * 1024;

export interface KdfParams {
  logN: number;
  r: number;
  p: number;
}
const DEFAULT_KDF: KdfParams = { logN: DEFAULT_LOG_N, r: 8, p: 1 };

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase, or the file is damaged.');
    this.name = 'WrongPassphraseError';
  }
}

export function checkPassphrase(pass: unknown): string | null {
  if (typeof pass !== 'string' || pass.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters. A few random words work well.`;
  if (pass.length > 1024) return 'The passphrase is too long.';
  return null;
}

function deriveKey(pass: string, salt: Buffer, k: KdfParams): Buffer {
  const N = 2 ** k.logN;
  // scrypt needs about 128·N·r bytes; give it headroom.
  return scryptSync(pass.normalize('NFKC'), salt, 32, { N, r: k.r, p: k.p, maxmem: 256 * N * k.r + 8 * 1024 * 1024 });
}

export function encryptBytes(plain: Buffer, pass: string, kdf: KdfParams = DEFAULT_KDF): Buffer {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header = Buffer.concat([MAGIC, Buffer.from([1, kdf.logN, kdf.r, kdf.p]), salt, nonce]);
  const c = createCipheriv('aes-256-gcm', deriveKey(pass, salt, kdf), nonce);
  c.setAAD(header);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([header, body, c.getAuthTag()]);
}

export function decryptBytes(blob: Buffer, pass: string): Buffer {
  if (blob.length < HEADER_LEN + TAG_LEN || !blob.subarray(0, 8).equals(MAGIC)) throw new Error('This is not a TRACE encrypted case.');
  if (blob[8] !== 1) throw new Error('This encrypted case was made by a newer version of TRACE.');
  const kdf: KdfParams = { logN: blob[9], r: blob[10], p: blob[11] };
  // Refuse absurd parameters from a crafted file (memory / CPU exhaustion).
  if (kdf.logN < 14 || kdf.logN > 20 || kdf.r < 1 || kdf.r > 16 || kdf.p < 1 || kdf.p > 4) throw new Error('This encrypted case uses unsupported settings.');
  const header = blob.subarray(0, HEADER_LEN);
  const salt = blob.subarray(12, 28);
  const nonce = blob.subarray(28, 40);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const body = blob.subarray(HEADER_LEN, blob.length - TAG_LEN);
  try {
    const d = createDecipheriv('aes-256-gcm', deriveKey(pass, salt, kdf), nonce);
    d.setAAD(header);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]);
  } catch {
    throw new WrongPassphraseError();
  }
}

// ── case <-> bytes ──────────────────────────────────────────────────────────

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function walk(dir: string, base = ''): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  let items: fs.Dirent[] = [];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    if (it.isSymbolicLink()) continue;
    const abs = path.join(dir, it.name);
    const rel = base ? `${base}/${it.name}` : it.name;
    if (it.isDirectory()) out.push(...walk(abs, rel));
    else if (it.isFile()) out.push({ rel, abs });
  }
  return out;
}

export async function packCase(caseDir: string): Promise<{ data: Buffer; manifest: Record<string, string> }> {
  const zip = new JSZip();
  const manifest: Record<string, string> = {};
  for (const f of walk(caseDir)) {
    const b = fs.readFileSync(f.abs);
    manifest[f.rel] = sha(b);
    zip.file(f.rel, b);
  }
  if (!manifest['project.md']) throw new Error('This folder is not a case (project.md is missing).');
  return { data: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }), manifest };
}

async function unpack(data: Buffer): Promise<{ path: string; data: Buffer }[]> {
  const zip = await JSZip.loadAsync(data);
  const entries: JSZip.JSZipObject[] = [];
  zip.forEach((_p, e) => {
    if (!e.dir) entries.push(e);
  });
  const out: { path: string; data: Buffer }[] = [];
  for (const e of entries) {
    const p = e.name.replace(/\\/g, '/');
    if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.split('/').includes('..')) throw new Error('The encrypted case contains an unsafe path.');
    out.push({ path: p, data: await e.async('nodebuffer') });
  }
  if (!out.some((f) => f.path === 'project.md')) throw new Error('The encrypted case does not contain project.md.');
  return out;
}

export const vaultPath = (workspace: string, id: string) => path.join(workspace, 'vaults', `${id}${VAULT_EXT}`);

export function listVaults(workspace: string): { id: string; bytes: number; mtime: Date }[] {
  const dir = path.join(workspace, 'vaults');
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { id: string; bytes: number; mtime: Date }[] = [];
  for (const n of names) {
    if (!n.endsWith(VAULT_EXT)) continue;
    const id = n.slice(0, -VAULT_EXT.length);
    if (!/^[a-zA-Z0-9_\-.]+$/.test(id) || id === '.' || id === '..') continue;
    const st = fs.statSync(path.join(dir, n));
    out.push({ id, bytes: st.size, mtime: st.mtime });
  }
  return out;
}

/**
 * Encrypts a case and removes the plain folder. The vault is written, read back
 * and verified (every file's hash) BEFORE anything is deleted.
 */
export async function lockCase(opts: { workspace: string; id: string; caseDir: string; pass: string; kdf?: KdfParams; also?: string[] }): Promise<{ vault: string; files: number }> {
  const bad = checkPassphrase(opts.pass);
  if (bad) throw new Error(bad);
  const target = vaultPath(opts.workspace, opts.id);
  if (fs.existsSync(target)) throw new Error('An encrypted copy of this case already exists.');
  const { data, manifest } = await packCase(opts.caseDir);
  if (data.length > MAX_VAULT_BYTES) throw new Error('This case is larger than 1 GB and cannot be locked.');
  const blob = encryptBytes(data, opts.pass, opts.kdf);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, blob, { mode: 0o600 });
  try {
    const back = await unpack(decryptBytes(fs.readFileSync(tmp), opts.pass));
    const seen = Object.fromEntries(back.map((f) => [f.path, sha(f.data)]));
    const same = Object.keys(manifest).length === back.length && Object.entries(manifest).every(([k, v]) => seen[k] === v);
    if (!same) throw new Error('Verification failed: the encrypted copy does not match the case. Nothing was removed.');
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fs.renameSync(tmp, target);
  fs.rmSync(opts.caseDir, { recursive: true, force: true });
  for (const extra of opts.also ?? []) fs.rmSync(extra, { recursive: true, force: true });
  return { vault: target, files: Object.keys(manifest).length };
}

/** Decrypts a vault into `caseDir` (which must not exist), then removes the vault file. */
export async function unlockCase(opts: { workspace: string; id: string; caseDir: string; pass: string }): Promise<{ files: number }> {
  const file = vaultPath(opts.workspace, opts.id);
  if (!fs.existsSync(file)) throw new Error('Encrypted case not found.');
  if (fs.existsSync(opts.caseDir)) throw new Error('A case with this id is already unlocked.');
  const files = await unpack(decryptBytes(fs.readFileSync(file), opts.pass)); // fails before touching disk
  const staging = `${opts.caseDir}.unlocking-${process.pid}`;
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    for (const f of files) {
      const t = path.join(staging, f.path);
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.writeFileSync(t, f.data);
    }
    fs.renameSync(staging, opts.caseDir);
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  fs.rmSync(file, { force: true });
  return { files: files.length };
}
