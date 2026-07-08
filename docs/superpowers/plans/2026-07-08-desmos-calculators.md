# Desmos Scientific & Graphing Calculators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an embedded Desmos scientific calculator to the extension side panel, and a pop-out Desmos graphing calculator window, using a user-supplied Desmos API key.

**Architecture:** Entirely client-side inside `extension/`. A shared `desmos-loader.js` dynamically injects the Desmos Calculator API `<script>` tag (URL includes the user's API key, read from `chrome.storage.local`) and reports success/failure via callback. `calculator.js` uses it to lazily mount `Desmos.ScientificCalculator` into a collapsible panel in the side panel. A new standalone page (`graphing.html` / `graphing.js`) uses the same loader to mount `Desmos.GraphingCalculator` full-size in a popup window opened via `chrome.windows.create`.

**Tech Stack:** Vanilla JS (no build step, no framework), Chrome Extension Manifest V3, Desmos Calculator API (`https://www.desmos.com/api/v1.9/calculator.js`).

**Reference:** Design spec at `docs/superpowers/specs/2026-07-08-desmos-calculators-design.md`.

---

### Task 1: Manifest CSP update

**Files:**
- Modify: `extension/manifest.json`

Manifest V3 extension pages default to `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`, which blocks loading Desmos's remote script. We need to explicitly allow `https://www.desmos.com` as a script source while preserving the rest of the default policy. No other CSP directives (style-src, connect-src, img-src, font-src) are restricted by the MV3 baseline, so Desmos's fonts/XHRs/images will load fine without further changes. No `host_permissions` entry is needed — script loading is governed by CSP, not host permissions.

- [ ] **Step 1: Edit manifest.json**

Current file (`extension/manifest.json`):

```json
{
  "manifest_version": 3,
  "name": "Math Academy Companion",
  "version": "0.1.0",
  "description": "Socratic study companion side panel for Math Academy, with Obsidian-ready topic logging.",
  "permissions": ["sidePanel", "storage"],
  "host_permissions": ["http://127.0.0.1/*", "http://localhost/*"],
  "action": {
    "default_title": "Open Math Companion"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

Replace it with:

```json
{
  "manifest_version": 3,
  "name": "Math Academy Companion",
  "version": "0.1.0",
  "description": "Socratic study companion side panel for Math Academy, with Obsidian-ready topic logging.",
  "permissions": ["sidePanel", "storage"],
  "host_permissions": ["http://127.0.0.1/*", "http://localhost/*"],
  "action": {
    "default_title": "Open Math Companion"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval' https://www.desmos.com; object-src 'self';"
  }
}
```

- [ ] **Step 2: Verify the extension still loads with no manifest errors**

In Chrome, go to `chrome://extensions`, enable Developer mode, click "Load unpacked" (or "Reload" if already loaded) and select the `extension/` folder.
Expected: extension loads with no red error banner on its card. Click "Errors" if present to confirm there's no CSP parse error.

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "Allow Desmos script source in extension CSP"
```

---

### Task 2: Desmos API key settings field

**Files:**
- Modify: `extension/sidepanel.html:14-19`
- Modify: `extension/sidepanel.js:8-19` (init) and `extension/sidepanel.js:186-190` (saveSettings)

Add a field to the existing Settings panel so the user can paste in their own Desmos API key (from desmos.com/api), stored via `chrome.storage.local` exactly like the existing `backendUrl` setting.

- [ ] **Step 1: Add the input field to the Settings panel**

Current (`extension/sidepanel.html:14-19`):

```html
  <section id="settingsPanel" class="panel hidden">
    <label for="backendUrl">Backend URL</label>
    <input id="backendUrl" type="text" value="http://127.0.0.1:8420" />
    <button id="saveSettings">Save</button>
    <p id="healthStatus" class="muted"></p>
  </section>
```

Replace with:

```html
  <section id="settingsPanel" class="panel hidden">
    <label for="backendUrl">Backend URL</label>
    <input id="backendUrl" type="text" value="http://127.0.0.1:8420" />

    <label for="desmosApiKey">Desmos API key</label>
    <input id="desmosApiKey" type="text" placeholder="Get a free key at desmos.com/api" />

    <button id="saveSettings">Save</button>
    <p id="healthStatus" class="muted"></p>
  </section>
```

- [ ] **Step 2: Load the stored key on init**

Current (`extension/sidepanel.js:8-19`):

```js
async function init() {
  const stored = await chrome.storage.local.get(["backendUrl"]);
  backendUrl = stored.backendUrl || DEFAULT_BACKEND_URL;
  el("backendUrl").value = backendUrl;

  const session = await chrome.storage.session.get(["messages", "contextText"]);
  messages = session.messages || [];
  el("contextBox").value = session.contextText || "";
  renderMessages();

  checkHealth();
}
```

Replace with:

```js
async function init() {
  const stored = await chrome.storage.local.get(["backendUrl", "desmosApiKey"]);
  backendUrl = stored.backendUrl || DEFAULT_BACKEND_URL;
  el("backendUrl").value = backendUrl;
  el("desmosApiKey").value = stored.desmosApiKey || "";

  const session = await chrome.storage.session.get(["messages", "contextText"]);
  messages = session.messages || [];
  el("contextBox").value = session.contextText || "";
  renderMessages();

  checkHealth();
}
```

- [ ] **Step 3: Save the key alongside backendUrl**

Current (`extension/sidepanel.js:186-190`):

```js
el("saveSettings").addEventListener("click", async () => {
  backendUrl = el("backendUrl").value.trim() || DEFAULT_BACKEND_URL;
  await chrome.storage.local.set({ backendUrl });
  checkHealth();
});
```

Replace with:

```js
el("saveSettings").addEventListener("click", async () => {
  backendUrl = el("backendUrl").value.trim() || DEFAULT_BACKEND_URL;
  const desmosApiKey = el("desmosApiKey").value.trim();
  await chrome.storage.local.set({ backendUrl, desmosApiKey });
  checkHealth();
});
```

- [ ] **Step 4: Verify manually**

Reload the unpacked extension in `chrome://extensions`. Open the side panel, click the gear icon to open Settings, type a test value (e.g. `test-key-123`) into "Desmos API key", click Save. Close the side panel and reopen it, open Settings again.
Expected: the "Desmos API key" field still shows `test-key-123`.

- [ ] **Step 5: Commit**

```bash
git add extension/sidepanel.html extension/sidepanel.js
git commit -m "Add Desmos API key field to extension settings"
```

---

### Task 3: Shared Desmos API loader

**Files:**
- Create: `extension/desmos-loader.js`

A single, reusable function both the scientific calculator panel (Task 4) and the graphing calculator page (Task 5) call to load the Desmos Calculator API script and report whether it's ready. This is a plain classic script (no bundler/module system in this project — see `extension/sidepanel.js`, `extension/background.js`), so it defines a global function via `function` declaration, which any script tag loaded after it in the same document can call directly.

- [ ] **Step 1: Create the loader**

```js
// extension/desmos-loader.js
//
// Loads the Desmos Calculator API script on demand, using the API key the
// user entered in Settings. Callback receives `null` on success, or an
// Error with message "missing-key" (no key configured) or "load-error"
// (script failed to load — bad key, offline, etc.).
//
// Check https://www.desmos.com/api/v1.9/docs if this stops working.
function loadDesmosCalculatorApi(callback) {
  if (window.Desmos) {
    callback(null);
    return;
  }

  chrome.storage.local.get(["desmosApiKey"]).then(({ desmosApiKey }) => {
    if (!desmosApiKey) {
      callback(new Error("missing-key"));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${encodeURIComponent(desmosApiKey)}`;
    script.onload = () => callback(null);
    script.onerror = () => callback(new Error("load-error"));
    document.head.appendChild(script);
  });
}
```

- [ ] **Step 2: Verify the file parses cleanly**

This file isn't wired into any page yet (that happens in Task 4), so verify it purely for syntax correctness:

Run: `node --check extension/desmos-loader.js`
Expected: no output, exit code 0 (Node parses the file without executing it, so the browser-only `window`/`chrome` references don't cause errors).

Full behavioral verification (missing-key message, successful load, bad-key error) happens in Task 4 once `calculator.js` actually calls `loadDesmosCalculatorApi`.

- [ ] **Step 3: Commit**

```bash
git add extension/desmos-loader.js
git commit -m "Add shared Desmos Calculator API loader"
```

---

### Task 4: Scientific calculator panel

**Files:**
- Modify: `extension/sidepanel.html:9-12` (header) and after `extension/sidepanel.html:19` (new panel section)
- Modify: `extension/sidepanel.css:26-31` (icon button style)
- Create: `extension/calculator.js`
- Modify: `extension/sidepanel.html:68` (script tags)

Adds a 🧮 header button that toggles a collapsible panel containing the embedded scientific calculator, mounted lazily (only when first expanded) via the shared loader from Task 3.

- [ ] **Step 1: Add the header button**

Current (`extension/sidepanel.html:9-12`):

```html
  <header>
    <h1>Math Companion</h1>
    <button id="settingsToggle" title="Settings">&#9881;</button>
  </header>
```

Replace with:

```html
  <header>
    <h1>Math Companion</h1>
    <div class="headerActions">
      <button id="calcToggle" class="iconButton" title="Scientific Calculator">&#129518;</button>
      <button id="settingsToggle" class="iconButton" title="Settings">&#9881;</button>
    </div>
  </header>
```

- [ ] **Step 2: Add the calculator panel markup**

In `extension/sidepanel.html`, immediately after the `</section>` that closes `settingsPanel` (line 19) and before the `contextPanel` section, insert:

```html
  <section id="calcPanel" class="panel hidden">
    <p id="calcStatus" class="muted"></p>
    <p id="calcError" class="error hidden"></p>
    <div id="calcMount" class="calcMount"></div>
    <button id="openGraphingBtn">Open Graphing Calculator &#8599;</button>
  </section>
```

- [ ] **Step 3: Add script tags for the new files**

Current (`extension/sidepanel.html:68`):

```html
  <script src="sidepanel.js"></script>
```

Replace with:

```html
  <script src="desmos-loader.js"></script>
  <script src="calculator.js"></script>
  <script src="sidepanel.js"></script>
```

- [ ] **Step 4: Add supporting CSS**

Current (`extension/sidepanel.css:26-31`):

```css
#settingsToggle {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
}
```

Replace with:

```css
.headerActions {
  display: flex;
  gap: 6px;
}

.iconButton {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
}

.calcMount {
  width: 100%;
  height: 320px;
  margin: 8px 0;
}
```

- [ ] **Step 5: Create calculator.js**

```js
// extension/calculator.js
//
// Wires up the header's calculator toggle button and lazily mounts the
// Desmos Scientific Calculator the first time the panel is expanded.
let scientificCalculator = null;

function ensureScientificCalculatorMounted() {
  if (scientificCalculator) return;

  const statusEl = document.getElementById("calcStatus");
  const errorEl = document.getElementById("calcError");
  const mountEl = document.getElementById("calcMount");

  loadDesmosCalculatorApi((err) => {
    if (err && err.message === "missing-key") {
      statusEl.textContent = "Add your Desmos API key in Settings — free at desmos.com/api";
      return;
    }
    if (err) {
      errorEl.textContent = "Could not load the Desmos calculator. Check your internet connection and API key.";
      errorEl.classList.remove("hidden");
      return;
    }
    statusEl.textContent = "";
    scientificCalculator = Desmos.ScientificCalculator(mountEl);
  });
}

document.getElementById("calcToggle").addEventListener("click", () => {
  const panel = document.getElementById("calcPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    ensureScientificCalculatorMounted();
  }
});
```

- [ ] **Step 6: Verify manually — missing key case**

Reload the unpacked extension. Open Settings and clear the Desmos API key field (Save with it empty). Open the side panel, click the 🧮 icon.
Expected: the panel expands showing the text "Add your Desmos API key in Settings — free at desmos.com/api", no calculator UI, no error.

- [ ] **Step 7: Verify manually — working case**

You'll need a real Desmos API key for this step (sign up free at https://www.desmos.com/api). Open Settings, paste the real key, Save. Click the 🧮 icon again (collapse and re-expand if it was already open).
Expected: a live Desmos scientific calculator renders inside the panel. Click buttons to compute `2+2` and confirm `4` appears in the calculator's display.

- [ ] **Step 8: Verify manually — bad key case**

Open Settings, change the key to an obviously invalid value (e.g. `not-a-real-key`), Save. Collapse and re-expand the 🧮 panel.
Expected: the error message "Could not load the Desmos calculator. Check your internet connection and API key." appears. Restore your real key afterward and Save again.

- [ ] **Step 9: Commit**

```bash
git add extension/sidepanel.html extension/sidepanel.css extension/calculator.js
git commit -m "Add embedded scientific calculator panel"
```

---

### Task 5: Graphing calculator popup

**Files:**
- Create: `extension/graphing.html`
- Create: `extension/graphing.js`
- Modify: `extension/calculator.js` (add button wiring)

Adds the "Open Graphing Calculator" button's behavior (opens a popup window showing a new standalone extension page with a full-size Desmos graphing calculator).

- [ ] **Step 1: Create graphing.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Graphing Calculator</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #graphStatus, #graphError { padding: 10px 14px; font-size: 13px; }
  #graphStatus { color: #888; }
  #graphError { color: #c53030; }
  #graphMount { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
  .hidden { display: none; }
</style>
</head>
<body>
  <p id="graphStatus" class="hidden"></p>
  <p id="graphError" class="hidden"></p>
  <div id="graphMount"></div>
  <script src="desmos-loader.js"></script>
  <script src="graphing.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create graphing.js**

```js
// extension/graphing.js
//
// Standalone popup page: mounts a full-size Desmos Graphing Calculator.
const statusEl = document.getElementById("graphStatus");
const errorEl = document.getElementById("graphError");
const mountEl = document.getElementById("graphMount");

loadDesmosCalculatorApi((err) => {
  if (err && err.message === "missing-key") {
    statusEl.textContent = "Add your Desmos API key in the Math Companion side panel Settings — free at desmos.com/api";
    statusEl.classList.remove("hidden");
    return;
  }
  if (err) {
    errorEl.textContent = "Could not load the Desmos graphing calculator. Check your internet connection and API key.";
    errorEl.classList.remove("hidden");
    return;
  }
  Desmos.GraphingCalculator(mountEl);
});
```

- [ ] **Step 3: Wire the "Open Graphing Calculator" button**

In `extension/calculator.js`, after the existing `calcToggle` click listener added in Task 4, add:

```js
document.getElementById("openGraphingBtn").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("graphing.html"),
    type: "popup",
    width: 900,
    height: 700,
  });
});
```

- [ ] **Step 4: Verify manually — missing key case**

Reload the unpacked extension. Clear the Desmos API key in Settings (Save). Open the side panel, click 🧮 to expand the panel, click "Open Graphing Calculator ↗".
Expected: a new popup window opens showing "Add your Desmos API key in the Math Companion side panel Settings — free at desmos.com/api", no calculator.

- [ ] **Step 5: Verify manually — working case**

Paste your real Desmos API key back into Settings and Save. Click "Open Graphing Calculator ↗" again (a fresh popup, or reload the existing one).
Expected: a full-size interactive Desmos graphing calculator renders. Type `y=x^2` into the expression list and confirm the parabola plots on the graph.

- [ ] **Step 6: Verify blank-state behavior**

Close the graphing popup window and open it again via the button.
Expected: the calculator is blank again (no persisted expressions from the previous session) — this is intentional per the design (no persistence).

- [ ] **Step 7: Commit**

```bash
git add extension/graphing.html extension/graphing.js extension/calculator.js
git commit -m "Add pop-out graphing calculator window"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`

Document how to get a Desmos API key and where to enter it, so a new user isn't stuck when they see the "Add your Desmos API key" message.

- [ ] **Step 1: Add a setup step for the Desmos API key**

In `README.md`, after the existing "## 3. Load the extension" section and before "## 4. Use it", insert a new section:

```markdown
## 4. Get a Desmos API key (for the calculators)

The side panel includes an embedded scientific calculator and a pop-out graphing calculator, both powered by Desmos.

1. Go to [desmos.com/api](https://www.desmos.com/api) and sign up for a free API key (personal/education use).
2. Open the side panel, click the settings gear (⚙️), and paste the key into "Desmos API key".
3. Click Save.

Until a key is added, clicking the 🧮 calculator icon or "Open Graphing Calculator" will show a reminder to add one instead of a blank/broken calculator.
```

Renumber the existing "## 4. Use it" section to "## 5. Use it" and, in its step list, mention the new 🧮 icon:

Current text in that section's step 2 list (find the line starting with `2. Click the extension icon`) — after it, add a new step:

```markdown
3. Click the 🧮 icon to open a quick scientific calculator inline, or use "Open Graphing Calculator" inside that panel for a full graphing window.
```

Renumber subsequent steps in that section accordingly (shift each following step number up by one).

- [ ] **Step 2: Verify**

Read through the updated README top to bottom and confirm the numbered sections and step lists are sequential with no gaps or duplicate numbers.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Desmos API key setup for the calculators"
```
