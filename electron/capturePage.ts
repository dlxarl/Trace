/**
 * Loads a web page in an isolated, hidden window and returns a screenshot,
 * a PDF and an MHTML archive of it.
 *
 * The capture window is locked down: sandboxed, no preload, its own in-memory
 * session (no cookies or logins from the app), permission requests denied,
 * downloads and pop-ups blocked, audio muted, http(s) only, hard timeout.
 */
import { BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PageCapture {
  finalUrl: string;
  title: string;
  screenshot?: Buffer;
  pdf?: Buffer;
  mhtml?: Buffer;
  warnings: string[];
}

const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1_500;
const MAX_HEIGHT = 12_000;
const WIDTH = 1366;

export function assertHttpUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Enter a valid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https pages can be captured.');
  return u.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(message)), ms))]);
}

export async function capturePage(rawUrl: string, opts: { proxyRules?: string } = {}): Promise<PageCapture> {
  const url = assertHttpUrl(rawUrl);
  const ses = session.fromPartition(`trace-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`); // not persisted
  // With a proxy configured the page is fetched only through it (no direct fallback).
  if (opts.proxyRules) await ses.setProxy({ proxyRules: opts.proxyRules });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());

  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: 900,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      webSecurity: true,
    },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  // Do not let WebRTC reveal the real address when a proxy is in use.
  if (opts.proxyRules) wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const httpOnly = (e: Electron.Event, target: string) => {
    if (!/^https?:\/\//i.test(target)) e.preventDefault();
  };
  wc.on('will-navigate', httpOnly);
  wc.on('will-redirect', httpOnly);

  const warnings: string[] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-capture-'));
  try {
    try {
      await withTimeout(win.loadURL(url), LOAD_TIMEOUT_MS, 'The page took too long to load.');
    } catch (err: any) {
      // A page that loaded its document but is still fetching resources is still worth capturing.
      if (!wc.getURL() || wc.getURL() === 'about:blank') throw new Error(err?.message || 'The page could not be loaded.');
      warnings.push(`Page did not finish loading: ${err?.message || 'timeout'}`);
      wc.stop();
    }
    await sleep(SETTLE_MS);

    const result: PageCapture = { finalUrl: wc.getURL(), title: wc.getTitle(), warnings };

    try {
      const full = await wc.executeJavaScript(
        'Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)',
      );
      const height = Math.min(MAX_HEIGHT, Math.max(900, Number(full) || 900));
      if (Number(full) > MAX_HEIGHT) warnings.push(`Screenshot cut at ${MAX_HEIGHT}px; the PDF and MHTML contain the whole page.`);
      win.setContentSize(WIDTH, height);
      await sleep(400);
      const img = await wc.capturePage();
      if (!img.isEmpty()) result.screenshot = img.toPNG();
      else warnings.push('Screenshot was empty.');
    } catch (e: any) {
      warnings.push(`Screenshot failed: ${e?.message || e}`);
    }

    try {
      result.pdf = await withTimeout(wc.printToPDF({ printBackground: true }), 30_000, 'PDF timed out');
    } catch (e: any) {
      warnings.push(`PDF failed: ${e?.message || e}`);
    }

    try {
      const file = path.join(tmp, 'page.mhtml');
      await withTimeout(wc.savePage(file, 'MHTML'), 30_000, 'MHTML timed out');
      result.mhtml = fs.readFileSync(file);
    } catch (e: any) {
      warnings.push(`MHTML failed: ${e?.message || e}`);
    }

    return result;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
    ses.clearStorageData().catch(() => {});
  }
}
