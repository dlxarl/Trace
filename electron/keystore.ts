/**
 * API-key store. Values are encrypted with the operating system's keychain
 * (Electron safeStorage) before they touch the disk, are never sent to the
 * window, and are only substituted into outgoing requests in the main process
 * (see {{key:NAME}} in API Quick Sources).
 * The cipher is injected so the logic is testable without Electron.
 */
import fs from 'node:fs';
import path from 'node:path';
import { KEY_NAME_RE } from '../src/services/tools/proxy';

export interface Cipher {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export class KeyStore {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  private read(): Record<string, string> {
    try {
      const o = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return o && typeof o.keys === 'object' && o.keys ? (o.keys as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
  private write(keys: Record<string, string>) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, keys }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** False when the OS offers no secure storage: keys are then refused, never stored in plain text. */
  available() {
    return this.cipher.available();
  }

  names(): string[] {
    return Object.keys(this.read()).sort((a, b) => a.localeCompare(b));
  }

  set(name: string, value: string) {
    if (!KEY_NAME_RE.test(name)) throw new Error('A key name may use letters, digits, dot, dash and underscore (up to 64).');
    if (!value || value.length > 4096) throw new Error('Enter the key value (up to 4096 characters).');
    if (!this.cipher.available()) throw new Error('This computer has no secure storage for secrets, so TRACE will not save the key.');
    const keys = this.read();
    keys[name] = this.cipher.encrypt(value).toString('base64');
    this.write(keys);
  }

  get(name: string): string | undefined {
    const enc = this.read()[name];
    if (!enc || !this.cipher.available()) return undefined;
    try {
      return this.cipher.decrypt(Buffer.from(enc, 'base64'));
    } catch {
      return undefined; // damaged or from another user account
    }
  }

  delete(name: string): boolean {
    const keys = this.read();
    if (!(name in keys)) return false;
    delete keys[name];
    this.write(keys);
    return true;
  }
}
