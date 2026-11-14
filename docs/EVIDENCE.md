# Evidence, source ratings and reports

## Preserved copies

Pages change and disappear. In the desktop app, a source with an http(s) URL has a **Capture page** button that saves:

| File | What it is |
| :--- | :--- |
| `screenshot.png` | Full-page screenshot (up to 12,000 px tall) |
| `page.pdf` | Print of the page with backgrounds |
| `page.mhtml` | Complete web archive of the page with its resources |
| `capture.json` | Manifest: URL, final URL after redirects, title, time (UTC), SHA-256 of each file |

Files are written to `<case>/evidence/<source-id>/<capture-id>/`, where the capture id is a UTC timestamp such as `20261113T104500Z`. Existing evidence is never overwritten; a new capture always gets a new folder.

The SHA-256 of every file is also recorded in the source's frontmatter (`captures:`). **Verify** re-hashes the files and reports each as intact, modified or missing. Hashes are shown in the editor and printed in reports.

Capturing saves the source and sets its "accessed at" date to the capture time.

### How the page is loaded

The page is opened in a separate hidden window that is sandboxed, has no access to the app, uses its own in-memory session (no cookies or logins), denies every permission request, blocks downloads and pop-ups, is muted, accepts only http(s) and is closed after a 30-second load timeout. The request goes directly from your computer to the site.

Pages behind a login cannot be captured this way; attach your own screenshot to the case folder instead.

### Archives

**Find in Wayback** looks up the closest snapshot on archive.org and fills in the *Archived copy* field; **Save page now** opens archive.org's own save page. Both send the URL to archive.org and run only when you click them. Only `web.archive.org` links are accepted from the lookup.

### Export and import

- **Export .zip** includes the `evidence/` folder (up to 500 MB).
- **Import** from a .zip restores the records and hashes but not yet the evidence files; copy the `evidence/` folder into the imported case by hand, then use Verify. Moving or importing a whole case *folder* on disk keeps everything.

## Source ratings (Admiralty code)

Each source can be rated on two independent scales:

| Reliability of the source | Credibility of the information |
| :--- | :--- |
| A — Completely reliable | 1 — Confirmed by other sources |
| B — Usually reliable | 2 — Probably true |
| C — Fairly reliable | 3 — Possibly true |
| D — Not usually reliable | 4 — Doubtful |
| E — Unreliable | 5 — Improbable |
| F — Reliability cannot be judged | 6 — Truth cannot be judged |

The combined code (for example `B2`) is shown in the source editor, in the inspector's evidence list, in reports and to MCP clients (`rating`). Ratings are optional and stored as `reliability` / `credibility` in the source's frontmatter.

## Reports

**Case brief → Report** exports the investigation as Markdown, a self-contained HTML page, or PDF (desktop).

A report contains: the case summary, headline numbers, the graph picture (HTML and PDF; taken from the graph as last laid out), key entities, every relationship with its status, evidence class, confidence and numbered source references, the reasoning written on relationships, entities grouped by type, and the numbered source list with ratings, archive links and the SHA-256 of preserved copies. Relationships without a source are counted and flagged.

Options: author line, graph image, entity attributes, investigator notes (off by default) and disproven relationships (off by default).

All text is escaped; only http(s) links are clickable. The PDF is rendered in a sandboxed window with JavaScript disabled.

## Moving a case with its evidence

Exporting a case as a `.zip` includes `evidence/`. **Importing that .zip in the desktop app restores the preserved files** next to the case (only files named `screenshot.png`, `page.pdf`, `page.mhtml` or `capture.json` inside `evidence/<source>/<capture>/` are accepted, and an existing file is never overwritten). The recorded SHA-256 hashes then verify again with **Verify**. Importing in the browser build keeps the hashes but not the files.
