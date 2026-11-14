# Trace — Local-First OSINT Investigation & Link Analysis

<p align="center">
  <img src="./build/icon.png" alt="Trace Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>Trace</strong> is a desktop workbench for OSINT analysts, researchers and investigators. Map entities and relationships on a graph, back every claim with a preserved source, and keep the whole case as plain Markdown files on your own machine.
</p>

---
<p align="center">
  <img width="332" height="72" alt="trace-4x" src="https://github.com/user-attachments/assets/193f32d2-6dd4-4ab8-a61f-7d963827a479" />
</p>
<img width="1280" height="820" alt="Screenshot 2026-11-07 at 19 38 31" src="https://github.com/user-attachments/assets/5cd6b9de-4f24-4161-be9d-9f3d95153b00" />

## What it is for

- **Collect** with built-in tools (Sherlock, Maigret, Holehe and more), imports, transforms and text scanning, then review everything before it enters the case.
- **Analyse** on a graph, a timeline and a records table; find duplicates, hidden links and paths between entities.
- **Prove it**: cite sources with Admiralty ratings, preserve pages with SHA-256 hashes, export a report.
- **Protect it**: autosave, version history, backups, per-case encryption, Tor/proxy routing and a keychain for API keys.
- **Own it**: no accounts, no cloud, no telemetry. A case is a folder of Markdown that works with `git`.

## Quick start

1. Download Trace from [Releases](#download) and open the **Getting Started** case that ships with the app.
2. Press <kbd>⌘K</kbd> (<kbd>Ctrl+K</kbd>) and type what you want to do: *“new entity”*, *“import”*, *“backup”*, *“merge”*, *“report”*.
3. Add entities, link them, cite sources. Edits save themselves; **History** keeps earlier versions.
4. Open **Tools** to install a collector, run it on an entity and review the results before adding them.

A four-step welcome tour runs on first launch (<kbd>⌘K</kbd> → *tour* to replay).

---

## Features

### Working with the case

**Navigation**
- **Left rail**: Graph, Case brief, Records, Search, Timeline, Tools, plus import/export, shortcuts and settings. A button at its bottom shows labels next to the icons; every button has a tooltip with its shortcut.
- **Command palette** (<kbd>⌘K</kbd>): every action in the app with shortcuts, recent commands, arrow-key selection, and the entities, sources and notes of the case.
- **Case brief**: the `project.md` working document with statistics and the most connected entities. Main actions are on the toolbar, the rest under **More** (import, export, lock, reindex).
- **Explorer and inspector**: entities grouped by type, links, sources and notes on the left; properties, relationships, evidence, notes and transforms for the selection on the right. With nothing selected the inspector offers ways to add data.
- **Tabs**: preview and pinned tabs, resizable panels, status bar with a live *Saving… / Saved* indicator.
- **Light and dark themes** (System, Light, Dark) that the graph, icons and window chrome follow.

**Graph**
- Force-directed layout (ForceAtlas2-style, Barnes–Hut) that handles thousands of nodes, plus hierarchical, radial and grid layouts. Adding entities places only the new nodes; saved positions are kept.
- Readable at any scale: muted nodes by entity type, labels revealed by importance as you zoom, icons once nodes are large enough.
- **Verification is visible**: confirmed and supported links are solid; unverified, candidate and rejected links are dashed or dotted. A midpoint dot shows whether a link cites a source; hovering shows its sources.
- Multi-select, shortest path, collapse leaf entities, size by connections, filter by entity type and verification status, **As of date** (show the graph as it was on a day; undated links stay), find-in-graph.
- **Connect mode** (hold <kbd>C</kbd> or <kbd>⌥</kbd>, drag between nodes), entity palette (drag a type onto the canvas), `[[Entity]]` mentions in notes drawn as dotted links.

**Records** — every entity as a sortable table or as cards. Filter by name, alias, tag, type and link state (no links, links without a source); columns show link count, links without a source and the best Admiralty rating behind the entity's links. Select rows to add or remove a tag, merge, or delete.

**Timeline** — relationships can have *From* / *Until* dates (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`; empty end = ongoing). The Timeline draws them as bars coloured by verification status, with source dates as markers and a per-entity filter.

**Merge duplicates** — **Merge…** (entity editor, or Records) combines records of the same person, company or asset: names become aliases, relationships move to the entity you keep, duplicate relationships fold together with all their evidence and the stronger status, `[[links]]` in notes follow, conflicting attribute values are kept in the entity's notes, and the merge is recorded in `merged_from`. The dialog previews every change and suggests likely duplicates; on desktop a named version is saved first.

**Search** — local SQLite FTS5 over names, aliases, attributes, tags, relationships and Markdown bodies, with filters for entities, links, sources and notes, entity type and link status, and **saved searches** per case.

**Scratchpad** — a floating pad for quick captures. It is stored *inside the case* as the note “scratchpad”, so history, backups and encryption cover it. **Find entities** sends its text to the normal import review.

**New investigation templates** — person, domain, company, username: each adds the subject and a working checklist, with no invented facts.

### Collecting data

**Tools marketplace** — install and run well-known OSINT tools from the **Tools** tab: **Sherlock** and **Maigret** (usernames), **Holehe** and **Ignorant** (which services know an email or phone), **DNSRecon** (DNS) and **dnstwist** (look-alike domains). Each is installed from PyPI into its own isolated Python environment inside TRACE's data folder (system Python 3.9+, or a checksum-verified portable Python). Pick an entity, press **Run**, watch the live output, then **Review & add to case**. See [docs/TOOLS.md](docs/TOOLS.md).

**Import data** — SpiderFoot CSV, CSV with type/value columns, plain indicator lists and the canonical TRACE JSON. Every entity is reviewed first: likely duplicates are flagged and linked instead of overwritten; imported records are tagged `imported`, keep the tool's original record and timestamps, and cite an import source; imported relationships start as *Candidate*. See [docs/IMPORT.md](docs/IMPORT.md).

**Find entities in text** — paste an article or chat log; TRACE lists emails, links, domains, IPs, phone numbers, @handles and crypto wallets and sends them through the same review.

**Transforms** — run lookups on an entity from the inspector or its context menu; built-in machines cover domain footprinting, IP threat and infrastructure, and identity deep-dive.

**Discover** — scans a case for non-obvious links (shared surnames, phones, emails, corporate domains, IPs, employers, tax IDs, passports, handles, plates, names mentioned in attributes) and adds them as `unverified` candidates to confirm one by one or in bulk.

**Bookmarks and API console** — bookmark OSINT sites and JSON APIs (preset pack included); send requests with custom headers and body (in the desktop app they run in the main process, so CORS does not apply) and attach a response as a source, note or attribute.

### Evidence and reporting

- Sources are cited by relationships as evidence, each with a URL, capture date and the investigator's explanation. Every relationship has an **evidence class** derived from its status: *Observed fact*, *Hypothesis* or *Disproven*.
- **Capture page** (desktop): a full-page screenshot, a PDF and an MHTML archive, each with a recorded SHA-256, saved in the case's `evidence/` folder. **Verify** re-hashes them to show nothing changed. Look up or request a Wayback Machine snapshot from the same place.
- **Source ratings**: optional Admiralty code (reliability A–F, credibility 1–6) shown wherever the source is cited.
- **Report**: export the case as Markdown, HTML or PDF with findings, statuses, numbered sources, ratings and evidence hashes.
- **Export graph**: GraphML (Gephi, yEd, Cytoscape) or a STIX 2.1 bundle (MISP, OpenCTI).

Preserved evidence travels with a case `.zip` and is restored on import in the desktop app. See [docs/EVIDENCE.md](docs/EVIDENCE.md).

### Protecting your work

- **Autosave** (on by default): editors save about a second after you stop typing. Turn it off in **Settings → General** to save only with the Save button.
- **Version history** (desktop): a version is stored a few seconds after you stop editing, before a merge, before a bulk delete and before a restore. **History** shows what each version changed, a line diff of any file, and **Go back to this version**.
- **Backups** (desktop): rotating automatic `.zip` backups of the whole case, evidence included, only when the case changed. Choose interval and count; restore as a new case or replace the case.
- **Lock and encrypt a case** (desktop): passphrase protection at rest (scrypt + AES-256-GCM). The encrypted file is verified before the plain folder is removed. **There is no recovery for a lost passphrase.**
- **Network**: route tools, page capture and API requests through **Tor** or any SOCKS/HTTP proxy, with a connection test and a log of what the app sent. DNS-only tools are blocked while a proxy is on unless you allow them; nothing falls back to a direct connection.
- **API keys**: stored in the system keychain, used as `{{key:NAME}}` in API requests, never written into a case or shown again.

See [docs/SAFETY.md](docs/SAFETY.md) for exactly what each of these does and does not cover.

### AI agents (MCP, read-only)

A local [Model Context Protocol](https://modelcontextprotocol.io) server ships inside the app and lets AI agents explore your cases as graphs: list cases, search entities, read entity and relationship details, walk neighbourhoods, follow evidence and find paths. It is **read-only** and **off by default** (**Tools → MCP server**, which shows the ready-to-paste client configuration). Locked cases are not readable. See [docs/MCP.md](docs/MCP.md).

---

## Your data

No accounts, no cloud sync, no telemetry. Each case is a folder of Markdown files that diff well and work with `git`:

```
~/Documents/trace/projects/<project-id>/
├── project.md            # scope, status, briefing
├── entities/*.md         # one file per entity (YAML frontmatter + notes)
├── relationships/*.md    # direction, status, confidence, dates, evidence
├── sources/*.md          # evidence and provenance (rating, archive link, capture hashes)
├── evidence/<source>/<capture>/   # preserved copies: screenshot.png, page.pdf, page.mhtml, capture.json
├── notes/*.md            # analyst notes, including the scratchpad
└── graph-layout.json     # saved node positions
~/Documents/trace/.trace/history/   # version snapshots (desktop)
~/Documents/trace/.trace/backups/   # automatic and manual backups (desktop)
~/Documents/trace/vaults/           # encrypted cases (*.trace-vault)
~/Documents/trace/removed/          # cases removed from TRACE but kept on disk
```

Folders outside `projects/` are never read by the MCP server. The working folder can be changed in **Settings → Files & storage**, which also shows how much space cases, tools, Python, history and backups take and lets you remove investigations (**Remove from TRACE** keeps the files in `removed/`; **Remove from disk** moves the folder to the system Trash; a permanent delete also removes history and backups).

Cases are exported to a `.zip` and imported from a `.zip`, a case folder, or a `project.md` (**Import investigation…**; on macOS one dialog accepts all three). An import always creates a new case: if the id exists, it is saved as “<name> (imported)” and nothing is overwritten. The web build stores data in the browser instead, without history, backups, encryption, page capture or tool running.

---

## Download

Get the latest build from [**GitHub Releases**](https://github.com/dlxarl/Trace/releases): macOS (Apple Silicon and Intel), Windows x64 and Linux x64. The current version is `0.3.0-alpha.1`.

**Settings → About & updates → Check for Updates** compares your version with the newest GitHub release (alpha pre-releases included) and shows its notes. Nothing is downloaded or installed automatically. The installed version's release notes are shown under **Changelog** (cached, so they work offline), and a **What's new** dialog appears once after an update. Builds without a published release show no changelog.

Builds are not code-signed (macOS uses an ad-hoc signature), so your OS will warn on first launch. On macOS, right-click the app and choose Open; the first time you save an API key, macOS may ask for Keychain access: choose Allow.

## Development

**Requirements:** Node.js 18+ (20+ recommended) and npm.

```bash
git clone https://github.com/dlxarl/Trace.git
cd Trace
npm install
```

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Run in the browser |
| `npm run dev:electron` | Run as an Electron app |
| `npm test` | Run the tests (Vitest) |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build the web bundle |
| `npm run build:mcp` | Build the read-only MCP server to `dist-mcp/trace-mcp.mjs` (also part of `build:electron`) |
| `npm run mcp` | Build and run the MCP server on stdio |

## Packaging

Output goes to `release/`.

| Command | Produces |
| :--- | :--- |
| `npm run package:mac` | `.dmg` and `.zip` for arm64 and x64 |
| `npm run package:win` | NSIS installer and `.zip` (x64) |
| `npm run package:linux` | `.AppImage` and `.tar.gz` (x64) |
| `npm run package:all` | All of the above |
| `npm run package:dir` | Unpacked macOS `.app` for quick testing |

Intel artifacts are named `…-x86_64.*` (`build/renameArtifacts.cjs` renames electron-builder's `x64`), e.g. `Trace-0.3.0-alpha.1-mac-x86_64.dmg`. The MCP server is bundled automatically.

Every build gets a **Build ID** `YYYYMMDDHHMMSS-<12-char git commit>` (UTC time and commit; `unknown` without git), generated at compile time by `build/buildId.ts` and shown in the desktop app. It identifies a build; it is not a checksum of the binary.

The version has a single source: `version` in `package.json`, read by the renderer (`__APP_VERSION__`), Electron, electron-builder, the MCP server and the update checker.

---

## Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd> | Command palette |
| <kbd>Cmd/Ctrl</kbd> + <kbd>G</kbd> | Graph |
| <kbd>Cmd/Ctrl</kbd> + <kbd>O</kbd> | Case brief |
| <kbd>Cmd/Ctrl</kbd> + <kbd>F</kbd> | Full-text search |
| <kbd>Cmd/Ctrl</kbd> + <kbd>[</kbd> / <kbd>]</kbd> | Toggle explorer / inspector |
| <kbd>Cmd/Ctrl</kbd> + <kbd>,</kbd> | Settings |
| <kbd>/</kbd> | Focus find-in-graph |
| <kbd>F</kbd> / <kbd>L</kbd> / <kbd>N</kbd> | Fit view / re-run layout / new entity (graph focused) |
| <kbd>C</kbd> | Connect mode |
| <kbd>?</kbd> | Shortcut sheet |
| <kbd>Esc</kbd> | Close dialog, menu or clear search |

---

## Project structure

```
electron/                  Main and preload processes: filesystem, HTTP, window, tool runner, portable Python, disk usage,
                           case import, page capture, evidence store, history, backups, encryption (vault), key store
src/
├── components/
│   ├── common/            Dialog, tooltip, action menu, toggle, scratchpad, save badge, entity icons, Markdown editor
│   ├── layout/            Tab bar, explorer and rail, inspector, status bar
│   └── modals/            Settings, history & backups, passphrase, command palette, import review, merge, report, export, welcome tour
├── features/
│   ├── graph/             Graph view, force layout, theme, "as of" filter, palette, transform console
│   ├── records/           Records table and cards, filters, bulk actions
│   ├── timeline/          Timeline view and model
│   ├── tools/             Tools view: marketplace, runner, MCP switch
│   ├── search/            Full-text search, filters, saved searches
│   ├── projects/          Case brief
│   └── entities/ relationships/ sources/ notes/   Editors
├── core/                  Read-only investigation queries and sandboxed workspace reader
├── mcp/                   Read-only MCP server (stdio JSON-RPC) and tool definitions
├── services/
│   ├── storage/           Electron (disk) and browser adapters
│   ├── import/ extract/   Import adapters and review plan; indicator extraction from text
│   ├── merge/ report/ export/ templates/ diff/   Merge planning, report model, GraphML/STIX, case templates, line diff
│   ├── tools/             Tool catalog, output parsers, proxy and key helpers
│   ├── evidence/          Wayback Machine lookup
│   ├── updates/           SemVer comparison and GitHub Releases update checker
│   ├── transforms/ discovery/   Transform registry; relationship discovery heuristics
│   ├── theme.ts preferences.ts saveStatus.ts paletteRecent.ts
│   ├── markdownParser.ts  Frontmatter parser and serializer
│   └── sqliteIndex.ts     SQLite FTS5 indexer
├── tests/                 Vitest suites
└── types/                 Domain types and schemas
build/                     App icons, packaging hooks, Build ID generator
docs/                      TOOLS, IMPORT, EVIDENCE, MCP, SAFETY
```

---

## Security and privacy

- Data stays on your filesystem as readable Markdown, unless you lock a case.
- No telemetry, analytics or cloud services. The app only makes network requests you trigger: transforms, the API console, page capture, Wayback lookups, installing and running tools, and Check for Updates (the public GitHub Releases API).
- Tools run only when you press Run, from catalog-defined commands (no shell, validated input, isolated Python environments, hard timeout). They contact third-party sites from your computer, or through your proxy if one is set.
- Locking, history, backups, proxy routing and API keys are described, including their limits, in [docs/SAFETY.md](docs/SAFETY.md). Routing hides your IP address from the sites you contact; it does not make you anonymous by itself.
- The MCP server is off until you enable it. It reads only `projects/`, validates every id, refuses symlinks that point outside, and has no write operations.
- Everything else works fully offline.

## License

[MIT](LICENSE)
