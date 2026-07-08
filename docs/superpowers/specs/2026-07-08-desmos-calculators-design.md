# Desmos scientific & graphing calculators — design

## Problem

The side panel currently has no way to do quick math (scientific calculation) or plot a function while studying. Desmos provides a JS Calculator API (`Desmos.ScientificCalculator`, `Desmos.GraphingCalculator`) that can be embedded into a page. This feature adds both calculators to the extension.

## Placement

The side panel is narrow (~360–400px), which is workable for a scientific calculator but cramped for a graphing calculator. Chosen approach (hybrid):

- **Scientific calculator**: embedded directly in the side panel as a collapsible panel, following the same show/hide pattern already used for the Settings panel.
- **Graphing calculator**: opened in its own popup browser window (via `chrome.windows.create`), sized for real use, since graphing genuinely needs more screen space than the panel can offer.

No persistence of calculator state — both always start blank on open. No backend involvement; this is entirely client-side inside `extension/`.

## API key handling

Desmos's Calculator API requires an API key in the script URL (`https://www.desmos.com/api/v1.9/calculator.js?apiKey=...`). The user will obtain their own free key from desmos.com/api (personal/education use).

The key is **not** hardcoded into any committed file. It's entered into a new "Desmos API key" field in the existing Settings panel and stored via `chrome.storage.local`, the same mechanism already used for the Backend URL setting. The Desmos script tag is created dynamically at runtime (not statically declared in HTML), with the key read from storage at that point.

## Manifest / CSP changes

Manifest V3 extension pages default to `script-src 'self'`, which blocks loading Desmos's remote script. `manifest.json` needs an explicit CSP override:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://www.desmos.com; object-src 'self'"
}
```

This is acceptable because the extension is used unpacked/locally and not distributed via the Chrome Web Store (which applies stricter remote-code review to published extensions). No `host_permissions` entry is needed for `www.desmos.com` — script loading is governed by CSP, not host permissions, since there's no cross-origin `fetch`/XHR to that domain from extension code.

`chrome.windows.create` (used to open the graphing popup) requires no manifest permission — it's part of the always-available `chrome.windows` API.

## Components

### Settings panel (`sidepanel.html`, `sidepanel.js`)

Add a text input for the Desmos API key next to the existing Backend URL field, persisted to `chrome.storage.local` under a new `desmosApiKey` key, loaded on `init()` the same way `backendUrl` is.

### Scientific calculator panel (`sidepanel.html`, `sidepanel.css`, new `calculator.js`)

- New header button (🧮, next to the existing ⚙️ settings toggle) toggles visibility of a new `calcPanel` section, following the exact `classList.toggle("hidden")` pattern used for `settingsPanel`.
- `calcPanel` contains an empty mount `<div id="calcMount">` with a fixed height suited to the panel width (e.g. ~320px), plus a small status/error line.
- Lazy init: the Desmos script and `Desmos.ScientificCalculator` instance are only created the *first* time the panel is expanded — not on page load — so users who never open it never need a key configured or hit the network.
- Reads `desmosApiKey` from `chrome.storage.local` at expand time:
  - Missing key → show inline message: "Add your Desmos API key in Settings — free at desmos.com/api" (no network request attempted).
  - Key present → dynamically create `<script src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=...">`, and on `load`, call `Desmos.ScientificCalculator(mountDiv)`. On `error`, show an inline error message in place of the calculator instead of leaving a blank box.
  - If the script was already loaded (panel closed and reopened in the same session), skip re-loading it and just re-show the existing mounted calculator.

### Graphing calculator window (new `graphing.html`, new `graphing.js`)

- Minimal standalone extension page: full-viewport mount div, same lazy-load-with-error-handling logic as the scientific calculator (loads Desmos script using the stored API key, mounts `Desmos.GraphingCalculator`).
- Triggered by a new button in `calcPanel` ("Open Graphing Calculator ↗"), which calls `chrome.windows.create({ url: chrome.runtime.getURL("graphing.html"), type: "popup", width: 900, height: 700 })`.
- Same missing-key / load-error handling as the scientific calculator, shown inline in that window.

## Data flow summary

```
Settings panel ──(save)──> chrome.storage.local.desmosApiKey
                                      │
                     ┌────────────────┴─────────────────┐
                     ▼                                   ▼
       calcPanel expand (sidepanel.js/calculator.js)   "Open Graphing Calculator" click
                     │                                   │
        read desmosApiKey, inject Desmos script      chrome.windows.create(graphing.html)
                     │                                   │
        mount Desmos.ScientificCalculator          graphing.js reads desmosApiKey,
        into #calcMount, or show error              injects script, mounts
                                                     Desmos.GraphingCalculator, or shows error
```

## Testing / verification

No automated test suite exists for the extension, and none is being introduced for this feature (consistent with current project scope). Verification is manual, by loading the unpacked extension in Chrome and driving it end-to-end:

1. Confirm the scientific calculator panel shows the "add your API key" message when no key is set.
2. Enter a real Desmos API key in Settings, save, expand the scientific calculator panel, confirm it renders and computes (e.g. `2+2`).
3. Click "Open Graphing Calculator", confirm the popup window opens, renders, and can plot a function (e.g. `y=x^2`).
4. Confirm closing and reopening the side panel resets the scientific calculator to blank (no persistence), and likewise for a freshly opened graphing window.

## Out of scope

- Persisting calculator state across sessions.
- Any integration between the calculators and the topic-log/vault backend (they're standalone utilities).
- Publishing the extension to the Chrome Web Store (the CSP relaxation here assumes unpacked/developer-mode use).
