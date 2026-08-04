# Bitrix24 Forms Analyzer (BFA)

A Manifest V3 Chrome control center for Bitrix24 web forms. It inventories and
scores every form, exposes fleet-wide analytics, safely edits selected forms,
and produces an interactive dashboard plus XLSX/JSONL exports for BI.

This is a ground-up rewrite of an earlier one-off console script
(`forms_all_in_one v4`) as a proper extension: persistent UI, incremental
sync, region-specific rule profiles, run history, and optional alerting.

## Features

- **Full form crawl** via `crm.api.form.list` / `crm.api.form.get`
- **Scoring** — every form gets a severity (`CRIT` / `WARN` / `INFO` / `OK`)
  and a 0–100 Quality Score
- **Checks**: consent version presence/consistency, consent ≠ subscription
  mismatches, non-standard consent versions, Email/VisitorID/Marketo ID
  presence, captcha, redirect issues (HTTP, relative, dev/staging URLs),
  preset-value validation against per-field regex patterns
- **Analysis**: near-duplicate detection (Jaccard similarity), anomalous
  fields, required-field consistency across form types, agreement conflicts
  (same agreement ID with different text across forms), a consent map by
  language
- **History & diff** — every run is compared against the previous snapshot
  (IndexedDB), with a per-form timeline of severity/consent changes
- **Exports**: `Forms_Analysis.xlsx` (18+ sheets), `forms_analysis.jsonl`
  (for BI ingestion), `forms_raw.json`
- **Live dashboard** — charts, tabs, filters, sorting, print-to-PDF
- **Optional webhook** (Slack/Jira-compatible) summarizing CRIT findings
- **Scheduled runs** via `chrome.alarms`

## 2026 control center

The v6 redesign combines 10 operational features in one workflow:

1. **Fleet command center** — dense health KPIs, charts, risk queues, and searchable inventory.
2. **Bulk scope control** — select individual forms or every row in the current smart filter.
3. **Safe editor** — change names, titles, buttons, HTTPS redirects, existing presets, and field visibility/required state.
4. **Exact dry-run preview** — fetches fresh forms and shows before/after values before any mutation.
5. **Risk-aware changes** — every edit is labeled LOW, MEDIUM, or HIGH.
6. **Explicit approval** — applying requires the generated `APPLY N` confirmation within 15 minutes.
7. **Conflict protection** — the full form is fingerprinted; concurrent changes cancel the write.
8. **Verified apply and rollback** — every save is read back; failed verification restores the pre-edit form.
9. **Governance trail** — 100 change runs and rollback backups for the latest 20 runs are retained.
10. **Policy and evidence** — regional rule profiles, 30-run drift history, XLSX/JSONL/raw exports, and webhook alerts.

Bulk edits are intentionally limited to 100 forms per approved batch. The
extension updates only properties whose structure is present in the freshly
fetched form; it never invents missing fields or preset definitions.

Desktop and mobile previews: [screenshots](docs/screenshots/).

## Install

1. Open `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select this repository's root folder

## Usage

1. Open a Bitrix24 / `kasperskyform.eu` tab and sign in
2. Click the extension icon → pick a rule profile → **Run analysis**
3. On completion the export files download automatically; **📊 Report**
   opens the live dashboard

## Rule profiles

Configure profiles under **Options → Rule profiles**. A profile is a named
set of requirements plus preset-value regex patterns (edited as JSON).
Built-in profiles:

| Profile | Difference from `Default` |
|---|---|
| `Default` | baseline requirements |
| `LATAM` | requires Marketo ID |
| `RU` | requires captcha |

Add your own (e.g. `META`, `EMEA`) with different requirements per region.

## How it works / architecture

```
manifest.json           MV3 manifest
core/
  service-worker.js      orchestrator: list -> fetch -> analyze -> diff -> export -> webhook
  content.js              runs on the Bitrix24 tab; extracts sessid, proxies fetch to ajax.php
  api.js                   retry/backoff + bounded-concurrency worker pool
  cache.js                 IndexedDB (form cache, run history, diff snapshot)
  rules.js                 rule profiles, preset validators, severity/score engine
analyzers/
  analyze.js               per-form scoring, duplicate clustering, anomaly/consistency checks
  diff.js                   snapshot diffing between runs
  export.js                 builds all XLSX sheets + JSONL
ui/
  popup.html / popup.js     toolbar popup: run, profile picker, live progress
  options.html / options.js settings + rule profile editor
  report.html / report.js   standalone dashboard (charts, filters, print)
vendor/
  xlsx.full.min.js          bundled SheetJS, wrapped as an ES module (no CDN load, avoids CSP issues)
icons/
```

Because the Bitrix24 session (`sessid`) lives in the page's `MAIN` world and
`PHPSESSID` is typically `HttpOnly`, the service worker cannot read it
directly. `content.js` injects a small probe into the page to read
`BX.bitrix_sessid()` and proxies the actual `ajax.php` calls from the
content-script context (which shares the tab's authenticated session)
instead of using a stored token.

### Notable differences from the original script

- Modular architecture instead of a single 500-line IIFE
- Rules live in an editable config, not hardcoded
- XLSX is bundled locally instead of loaded from a CDN (works under CSP)
- `sessid` is obtained legitimately from a content script on the active tab
- Incremental mode: cached forms are not re-fetched unless forced
- A static HTML dump was replaced with a live, interactive dashboard
- Region-based rule profiles and webhook alerting

## Data & scope

The extension only runs on tabs matching `*.bitrix24.eu`, `kasperskyform.eu`,
and `*.kasperskyform.eu` (see `host_permissions` in `manifest.json`). All
API calls are made from the browser using the signed-in user's own session;
no credentials are stored or transmitted by the extension itself. Exported
files are saved locally via `chrome.downloads`. The webhook URL (if
configured) is user-supplied and only receives a CRIT summary, never raw
form data.

## Development

Plain ES modules, no build step. Load the folder as an unpacked extension
and reload it from `chrome://extensions` after making changes. The service
worker can be inspected via **Service worker** → **Inspect** on the
extension's card; the popup/options/report pages can be inspected like any
normal page via DevTools.

Run the dependency-free checks with Node.js 20 or newer:

```sh
npm test
```

When a webhook is saved, Chrome asks for access only to that webhook's HTTPS
origin. BFA does not request blanket access to external sites at install time.
