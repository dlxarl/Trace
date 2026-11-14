# Saving, history, backups, encryption and network

All of this is about protecting your work and your connection. Features marked *desktop* need the desktop app; the browser build keeps cases in browser storage.

## Autosave

Editors (entity, relationship, source, note) save about a second after you stop typing. A save that finishes while you keep typing never overwrites the newer text. Switch it off in **Settings → Saving** (or ⌘K → “autosave”); then only the Save button saves. The preference is per computer.

## Version history (desktop)

TRACE keeps its own snapshots of a case's Markdown files and graph layout in `<workspace>/.trace/history/<case>/` (not inside the case folder, so it never ends up in an export). A snapshot is taken 15 seconds after the last edit, when you press **Save version now**, before a restore and before a merge. Identical states are not stored twice; file contents are stored once by SHA-256.

**History** (Case brief toolbar) lists versions. For a version you can see which files it added, changed or removed, read a line diff of one file, compare it with the current case, and **Go back to this version**. Restoring first saves the current state, verifies the snapshot, then rewrites the case files; evidence files are not touched. Up to 300 automatic versions are kept; named ones are never removed automatically.

## Backups (desktop)

A backup is a `.zip` of the whole case folder, evidence included, in `<workspace>/.trace/backups/<case>/`.

- **Automatic**: at most every N minutes (default 30) and only if the case changed; the newest N (default 10) are kept.
- **Manual**: **Back up now**. Manual and “before restore” backups are never removed automatically.
- **Restore as copy** creates a new case (`<id>-restored`) and leaves the current one alone. **Replace case** first takes a safety backup, validates the archive, then replaces the folder.
- Files over 200 MB are skipped and reported.

Removing a case *permanently* also removes its history and backups. “Keep files” or “Move to Trash” leaves them.

## Lock and encrypt a case (desktop)

**Lock** (Case brief toolbar, ⌘K → “lock”) packs the case into `<workspace>/vaults/<id>.trace-vault`, encrypted with a passphrase, and removes the plain folder together with the case's history and backups (they contain plain copies).

- Key: scrypt (N=2¹⁷, r=8, p=1) from the passphrase and a random salt. Cipher: AES-256-GCM; the header, including the key-derivation settings, is authenticated.
- The encrypted file is read back and every file is verified **before** anything is deleted. A weak passphrase (under 10 characters) is refused.
- **There is no recovery.** Lose the passphrase and the data is gone.
- Locked cases appear in the case list with a lock. Open one to be asked for the passphrase; unlocking restores the folder and removes the encrypted file until you lock it again.
- **What it does not do**: while a case is unlocked it is an ordinary folder, readable by anything on your computer. The case id (folder name) stays visible. The search index lives in memory only. If the app is killed while a case is unlocked, the plain folder remains.
- The MCP server cannot read locked cases.

## Network: proxy and Tor (desktop)

**Settings → Network** routes outgoing traffic through Tor (`socks5h://127.0.0.1:9050`, i.e. a Tor service on this computer; Tor Browser uses 9150, choose Custom) or any `http`, `https`, `socks4`, `socks5`, `socks5h` proxy.

| Traffic | Routed? |
| :--- | :--- |
| Sherlock, Maigret | Yes (`--proxy`) |
| Holehe, Ignorant | Yes (`ALL_PROXY` / `HTTP(S)_PROXY`; the SOCKS helper package is installed with them or added on first proxied run) |
| DNSRecon, dnstwist | **No**: they send raw DNS queries. While a proxy is on they are blocked, unless you allow direct runs |
| Page capture (screenshot / PDF / MHTML) | Yes; WebRTC address leaks are disabled |
| API requests and Wayback lookups | Yes |
| Update check | No (made by the app window) |

If the proxy is unreachable nothing falls back to a direct connection. A custom address that is not valid keeps the proxy “off” in the settings and tools refuse to run rather than pretending to be proxied. **Test** shows the address websites see and whether it is a Tor exit. **Outgoing requests** lists what the app sent in this session (host and path, never query strings or keys).

Routing hides your IP address from the sites you contact; it does not make you anonymous by itself (accounts, cookies you provide, timing and the content of requests can still identify you).

## API keys (desktop)

**Settings → API keys** stores secrets encrypted with the operating-system keychain (Electron `safeStorage`). Values cannot be read back in the UI and are never written into a case. In an API request write `{{key:NAME}}` in the address, a header or the body; the app substitutes the value in the main process only. If a response echoes the key it is replaced with `••••••`. When the system offers no secure storage, keys are refused rather than stored in plain text. On macOS the first save or use may show a Keychain permission prompt (the app is not signed with a developer certificate); choose Allow.
