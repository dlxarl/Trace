// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPassphrase, decryptBytes, encryptBytes, listVaults, lockCase, unlockCase, vaultPath, WrongPassphraseError } from '../../electron/vault';

// Fast KDF for tests only; the file format records the parameters used.
const FAST = { logN: 14, r: 8, p: 1 };
const PASS = 'correct horse battery';
let ws: string;
let caseDir: string;

beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-vault-'));
  caseDir = path.join(ws, 'projects', 'c1');
  fs.mkdirSync(path.join(caseDir, 'entities'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'evidence/s1/20260101T000000Z'), { recursive: true });
  fs.writeFileSync(path.join(caseDir, 'project.md'), '---\nid: c1\nname: "Secret case"\n---\n');
  fs.writeFileSync(path.join(caseDir, 'entities/e1.md'), '---\nname: Alice Secretname\n---\n');
  fs.writeFileSync(path.join(caseDir, 'evidence/s1/20260101T000000Z/screenshot.png'), Buffer.from([1, 2, 3, 250]));
});
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

describe('encryption primitives', () => {
  it('round-trips and hides the plain text', () => {
    const blob = encryptBytes(Buffer.from('hello secret world'), PASS, FAST);
    expect(blob.toString('latin1')).not.toContain('secret');
    expect(decryptBytes(blob, PASS).toString()).toBe('hello secret world');
  });
  it('works with the production KDF settings in reasonable time', () => {
    const t0 = Date.now();
    const blob = encryptBytes(Buffer.from('x'), PASS);
    expect(decryptBytes(blob, PASS).toString()).toBe('x');
    expect(blob[9]).toBe(17);
    expect(Date.now() - t0).toBeLessThan(8000);
  });
  it('uses a fresh salt and nonce each time', () => {
    const a = encryptBytes(Buffer.from('x'), PASS, FAST);
    const b = encryptBytes(Buffer.from('x'), PASS, FAST);
    expect(a.equals(b)).toBe(false);
  });
  it('rejects a wrong passphrase and any tampering', () => {
    const blob = encryptBytes(Buffer.from('hello'), PASS, FAST);
    expect(() => decryptBytes(blob, 'wrong passphrase!')).toThrow(WrongPassphraseError);
    for (const i of [0, 9, 20, 40, blob.length - 20, blob.length - 1]) {
      const t = Buffer.from(blob);
      t[i] ^= 0x01;
      expect(() => decryptBytes(t, PASS)).toThrow();
    }
    expect(() => decryptBytes(blob.subarray(0, 30), PASS)).toThrow(/not a TRACE/);
  });
  it('refuses unreasonable KDF settings in a crafted file', () => {
    const blob = Buffer.from(encryptBytes(Buffer.from('x'), PASS, FAST));
    blob[9] = 30;
    expect(() => decryptBytes(blob, PASS)).toThrow(/unsupported/);
  });
  it('enforces a minimum passphrase length', () => {
    expect(checkPassphrase('short')).toMatch(/at least/);
    expect(checkPassphrase('long enough pass')).toBeNull();
    expect(checkPassphrase(undefined)).not.toBeNull();
  });
});

describe('locking and unlocking a case', () => {
  it('locks: plain folder gone, vault holds no plain text, history and backups removed', async () => {
    const hist = path.join(ws, '.trace', 'history', 'c1');
    fs.mkdirSync(hist, { recursive: true });
    fs.writeFileSync(path.join(hist, 'x'), 'plain');
    await lockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS, kdf: FAST, also: [hist] });
    expect(fs.existsSync(caseDir)).toBe(false);
    expect(fs.existsSync(hist)).toBe(false);
    const raw = fs.readFileSync(vaultPath(ws, 'c1')).toString('latin1');
    expect(raw).not.toContain('Secretname');
    expect(raw).not.toContain('Secret case');
    expect(listVaults(ws).map((v) => v.id)).toEqual(['c1']);
  });
  it('unlocks to the same files, including binary evidence, and removes the vault', async () => {
    await lockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS, kdf: FAST });
    const r = await unlockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS });
    expect(r.files).toBe(3);
    expect(fs.readFileSync(path.join(caseDir, 'entities/e1.md'), 'utf8')).toContain('Alice Secretname');
    expect([...fs.readFileSync(path.join(caseDir, 'evidence/s1/20260101T000000Z/screenshot.png'))]).toEqual([1, 2, 3, 250]);
    expect(listVaults(ws)).toEqual([]);
  });
  it('a wrong passphrase changes nothing', async () => {
    await lockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS, kdf: FAST });
    await expect(unlockCase({ workspace: ws, id: 'c1', caseDir, pass: 'not the passphrase' })).rejects.toThrow(WrongPassphraseError);
    expect(fs.existsSync(caseDir)).toBe(false);
    expect(fs.existsSync(vaultPath(ws, 'c1'))).toBe(true);
  });
  it('refuses a weak passphrase before touching the case', async () => {
    await expect(lockCase({ workspace: ws, id: 'c1', caseDir, pass: 'short', kdf: FAST })).rejects.toThrow(/at least/);
    expect(fs.existsSync(caseDir)).toBe(true);
    expect(listVaults(ws)).toEqual([]);
  });
  it('never overwrites an existing vault or an unlocked folder', async () => {
    await lockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS, kdf: FAST });
    fs.mkdirSync(caseDir, { recursive: true });
    fs.writeFileSync(path.join(caseDir, 'project.md'), 'new');
    await expect(unlockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS })).rejects.toThrow(/already unlocked/);
    await expect(lockCase({ workspace: ws, id: 'c1', caseDir, pass: PASS, kdf: FAST })).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(path.join(caseDir, 'project.md'), 'utf8')).toBe('new');
  });
  it('refuses to lock a folder that is not a case', async () => {
    const other = path.join(ws, 'projects', 'junk');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'a.txt'), 'x');
    await expect(lockCase({ workspace: ws, id: 'junk', caseDir: other, pass: PASS, kdf: FAST })).rejects.toThrow(/not a case/);
    expect(fs.existsSync(other)).toBe(true);
  });
  it('ignores vault files with unsafe names', () => {
    fs.mkdirSync(path.join(ws, 'vaults'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'vaults', '..trace-vault'), 'x');
    fs.writeFileSync(path.join(ws, 'vaults', 'bad:name.trace-vault'), 'x');
    fs.writeFileSync(path.join(ws, 'vaults', 'a b.trace-vault'), 'x');
    fs.writeFileSync(path.join(ws, 'vaults', 'ok-1.trace-vault'), 'x');
    expect(listVaults(ws).map((v) => v.id)).toEqual(['ok-1']);
  });
});
