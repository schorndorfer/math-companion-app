# Math Equation Rendering & Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render LaTeX-style math (`$...$` inline, `$$...$$` display) in chat messages and the topic-log form, and give the chat input a live math preview as you type.

**Architecture:** KaTeX is vendored locally into `extension/vendor/katex/` and loaded via classic `<link>`/`<script>` tags — no build step, matching the rest of `extension/`. A new `extension/math-render.js` defines two shared globals: `renderMath(el)` (one-shot rendering of finalized content, via KaTeX's `auto-render` extension) and `attachMathPreview(sourceEl, previewEl)` (debounced live-preview wiring). These are used at three call sites: chat message rendering, the chat input's live preview, and the topic-log form's Explanation/Mistake previews. `backend/prompts/system_prompt.md` gets one added line instructing the model to use `$...$`/`$$...$$` delimiters. No backend code changes — `vault.py` already writes field text verbatim, so saved notes keep raw, Obsidian-renderable LaTeX.

**Tech Stack:** KaTeX 0.17.0 (vendored dist build) + its `auto-render` contrib extension. Vanilla JS, no bundler, Chrome Extension Manifest V3.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-08-math-equation-rendering-design.md`.

---

### Task 1: Vendor KaTeX

**Files:**
- Create: `extension/vendor/katex/katex.min.css`
- Create: `extension/vendor/katex/katex.min.js`
- Create: `extension/vendor/katex/auto-render.min.js`
- Create: `extension/vendor/katex/fonts/` (60 font files — `.ttf`/`.woff`/`.woff2` per KaTeX font family, copied verbatim from the npm package's `dist/fonts/`, not hand-authored)

KaTeX must be self-hosted, not loaded from a CDN — Manifest V3's default `extension_pages` CSP (`script-src 'self' 'wasm-unsafe-eval'`) blocks remote script hosts, the same constraint that forced the Desmos rewrite in commit `4abfa8b`. Same-origin local files need no CSP change at all.

- [ ] **Step 1: Download and verify the KaTeX package**

```bash
cd /tmp
curl -sL -o katex-0.17.0.tgz "https://registry.npmjs.org/katex/-/katex-0.17.0.tgz"
echo "252efd48f892d178136fe3ba3530d3718b2b087ea81c3a40a877227bc61d5256  katex-0.17.0.tgz" | shasum -a 256 -c -
```

Expected: `katex-0.17.0.tgz: OK`. If the checksum doesn't match, stop — don't proceed with a file that failed verification.

- [ ] **Step 2: Extract the dist files into the extension**

Run from the project root (`math-companion-app/`):

```bash
mkdir -p /tmp/katex-extract
tar xzf /tmp/katex-0.17.0.tgz -C /tmp/katex-extract
mkdir -p extension/vendor/katex/fonts
cp /tmp/katex-extract/package/dist/katex.min.css extension/vendor/katex/
cp /tmp/katex-extract/package/dist/katex.min.js extension/vendor/katex/
cp /tmp/katex-extract/package/dist/contrib/auto-render.min.js extension/vendor/katex/
cp /tmp/katex-extract/package/dist/fonts/* extension/vendor/katex/fonts/
rm -rf /tmp/katex-extract /tmp/katex-0.17.0.tgz
```

- [ ] **Step 3: Verify the vendored files**

```bash
ls extension/vendor/katex
ls extension/vendor/katex/fonts | wc -l
```

Expected: first command lists `auto-render.min.js`, `fonts`, `katex.min.css`, `katex.min.js`. Second command prints `60`.

- [ ] **Step 4: Commit**

```bash
git add extension/vendor
git commit -m "Vendor KaTeX 0.17.0 for local math rendering"
```

---

### Task 2: Shared math-rendering helper

**Files:**
- Create: `extension/math-render.js`
- Modify: `extension/sidepanel.html:1-7` (head) and `extension/sidepanel.html:76-79` (script tags)
- Modify: `extension/sidepanel.css` (append new rules at end of file)

This is a plain classic script (no bundler/module system in this project — see `extension/sidepanel.js`, `extension/calculator.js`), so it defines global functions any script tag loaded after it in the same document can call directly.

- [ ] **Step 1: Create math-render.js**

```js
// extension/math-render.js
//
// Shared KaTeX rendering helpers. Loaded after vendor/katex/katex.min.js
// and vendor/katex/auto-render.min.js, before any script that calls these
// globals (classic scripts sharing one global scope, not modules).
const MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\(", right: "\\)", display: false },
];

// Renders any $...$ / $$...$$ / \(...\) / \[...\] math found in el's text
// nodes in place. Malformed LaTeX renders as an inline KaTeX error span
// instead of throwing, so one bad expression can't break the rest of el.
function renderMath(el) {
  renderMathInElement(el, {
    delimiters: MATH_DELIMITERS,
    throwOnError: false,
  });
}

// Wires a debounced live preview: as sourceEl (an <input>/<textarea>) is
// typed into, previewEl is filled with the raw text and rendered via
// renderMath. previewEl is hidden whenever the source is empty.
function attachMathPreview(sourceEl, previewEl, delayMs = 150) {
  let timer = null;
  sourceEl.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = sourceEl.value;
      if (!text.trim()) {
        previewEl.classList.add("hidden");
        previewEl.textContent = "";
        return;
      }
      previewEl.classList.remove("hidden");
      previewEl.textContent = text;
      renderMath(previewEl);
    }, delayMs);
  });
}
```

- [ ] **Step 2: Verify the file parses cleanly**

Run: `node --check extension/math-render.js`
Expected: no output, exit code 0 (Node parses the file without executing it, so the browser-only `renderMathInElement` reference doesn't cause an error).

- [ ] **Step 3: Add the stylesheet link and script tags to sidepanel.html**

Current (`extension/sidepanel.html:1-7`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Math Academy Companion</title>
<link rel="stylesheet" href="sidepanel.css" />
</head>
```

Replace with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Math Academy Companion</title>
<link rel="stylesheet" href="sidepanel.css" />
<link rel="stylesheet" href="vendor/katex/katex.min.css" />
</head>
```

Current (`extension/sidepanel.html:76-79`):

```html
  <script src="calculator.js"></script>
  <script src="sidepanel.js"></script>
</body>
</html>
```

Replace with:

```html
  <script src="vendor/katex/katex.min.js"></script>
  <script src="vendor/katex/auto-render.min.js"></script>
  <script src="math-render.js"></script>
  <script src="calculator.js"></script>
  <script src="sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 4: Add supporting CSS**

Append to the end of `extension/sidepanel.css` (current last rule is `.muted`):

```css

.mathPreview {
  margin: 4px 0 8px;
  padding: 8px 10px;
  border: 1px dashed #ccc;
  border-radius: 6px;
  background: #fafafa;
  font-size: 13px;
}

.katex { font-size: 1em; }

.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
}
```

- [ ] **Step 5: Verify the extension still loads with no errors**

In Chrome, go to `chrome://extensions`, enable Developer mode, click "Load unpacked" (or "Reload" if already loaded) and select the `extension/` folder. Open the side panel.
Expected: no red error banner on the extension's card; the side panel opens and looks unchanged (no preview elements exist yet, so nothing new is visible this step — this just confirms the new `<link>`/`<script>` tags didn't break anything).

- [ ] **Step 6: Commit**

```bash
git add extension/math-render.js extension/sidepanel.html extension/sidepanel.css
git commit -m "Add shared KaTeX rendering helper"
```

---

### Task 3: Render math in chat messages

**Files:**
- Modify: `extension/sidepanel.js:26-28` (inside `renderMessages`)

- [ ] **Step 1: Call renderMath after setting message text**

Current (`extension/sidepanel.js:26-28`, inside the `renderMessages` loop body):

```js
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
    container.appendChild(div);
```

Replace with:

```js
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
    renderMath(div);
    container.appendChild(div);
```

- [ ] **Step 2: Verify manually — inline and display math**

Reload the unpacked extension (backend must be running — `cd backend && uv run python main.py`). Open the side panel and send: `Test: $x^2 + 1$ and $$\int_0^1 x\,dx = \tfrac{1}{2}$$`
Expected: in your own sent message bubble, `x^2 + 1` renders as formatted inline math and the integral renders as a centered display equation — not literal `$...$` text.

Then send a deliberately wide display equation: `$$a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 + a_9 + a_{10} + a_{11} = S$$`
Expected: the panel width doesn't grow and no content overflows its right edge — the equation area scrolls horizontally within its own box (confirms the `.katex-display { overflow-x: auto; }` rule from Task 2).

- [ ] **Step 3: Verify manually — malformed LaTeX doesn't break the message**

Send: `Broken: $\frac{1}{$ and this text should still be visible`
Expected: the broken expression shows as a KaTeX error span (typically red), but "and this text should still be visible" still renders as plain text after it — the whole message doesn't disappear or throw a JS error (check the DevTools console for the side panel is clean of uncaught exceptions).

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel.js
git commit -m "Render math in chat messages"
```

---

### Task 4: Chat input live preview

**Files:**
- Modify: `extension/sidepanel.html:38-42` (`chatInputRow`)
- Modify: `extension/sidepanel.js` (event wiring block near the bottom, before `init();`)

- [ ] **Step 1: Add the preview element and a math hint in the placeholder**

Current (`extension/sidepanel.html:38-42`):

```html
    <div class="chatInputRow">
      <textarea id="chatInput" rows="2" placeholder="Ask a question or say what you're stuck on..."></textarea>
      <button id="sendBtn">Send</button>
    </div>
```

Replace with:

```html
    <div class="chatInputRow">
      <textarea id="chatInput" rows="2" placeholder="Ask a question or say what you're stuck on... Type math like $x^2+1$"></textarea>
      <button id="sendBtn">Send</button>
    </div>
    <div id="chatMathPreview" class="mathPreview hidden"></div>
```

- [ ] **Step 2: Wire the preview**

Current (`extension/sidepanel.js`, near the bottom):

```js
el("contextBox").addEventListener("change", async () => {
  await chrome.storage.session.set({ contextText: el("contextBox").value });
});

init();
```

Replace with:

```js
el("contextBox").addEventListener("change", async () => {
  await chrome.storage.session.set({ contextText: el("contextBox").value });
});

attachMathPreview(el("chatInput"), el("chatMathPreview"));

init();
```

- [ ] **Step 3: Verify manually**

Reload the unpacked extension. Click into the chat input and type `Solve $\frac{x}{2} + 3 = 7$` without sending.
Expected: within ~150ms of pausing, a dashed-border preview box appears below the input showing the rendered fraction equation. Clear the textarea (select all, delete).
Expected: the preview box disappears (goes back to hidden). Send the message.
Expected: the sent message bubble renders the same equation (matches Task 3's rendering).

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel.html extension/sidepanel.js
git commit -m "Add live math preview to chat input"
```

---

### Task 5: Topic-log form preview

**Files:**
- Modify: `extension/sidepanel.html:57-61` (Explanation/Mistake fields)
- Modify: `extension/sidepanel.js` (event wiring block, alongside Task 4's line)

- [ ] **Step 1: Add preview elements under Explanation and Mistake**

Current (`extension/sidepanel.html:57-61`):

```html
      <label>In my own words</label>
      <textarea id="logExplanation" rows="3"></textarea>

      <label>Common mistake</label>
      <textarea id="logMistake" rows="2"></textarea>
```

Replace with:

```html
      <label>In my own words</label>
      <textarea id="logExplanation" rows="3"></textarea>
      <div id="logExplanationPreview" class="mathPreview hidden"></div>

      <label>Common mistake</label>
      <textarea id="logMistake" rows="2"></textarea>
      <div id="logMistakePreview" class="mathPreview hidden"></div>
```

- [ ] **Step 2: Wire the previews**

Current (`extension/sidepanel.js`, the line added in Task 4):

```js
attachMathPreview(el("chatInput"), el("chatMathPreview"));

init();
```

Replace with:

```js
attachMathPreview(el("chatInput"), el("chatMathPreview"));
attachMathPreview(el("logExplanation"), el("logExplanationPreview"));
attachMathPreview(el("logMistake"), el("logMistakePreview"));

init();
```

- [ ] **Step 3: Verify manually — preview renders and save keeps raw text**

Reload the unpacked extension. Have a short chat, then click "Draft topic log from this conversation" (or fill the form manually if drafting needs a real backend reply). In the "In my own words" field, type: `The slope is $\frac{\Delta y}{\Delta x}$`.
Expected: a preview box below the field shows the rendered fraction as you type/pause.

Fill in a Topic name (required) and click "Save to vault". Note the path shown in the save-status message, then check that file's contents:

```bash
cat "backend/vault/<Topic Name>.md"
```

(Substitute the actual filename Chrome/the save-status message reported; if you configured `VAULT_PATH` in `backend/.env`, check that folder instead.)

Expected: the "In my own words" section of the saved markdown contains the raw text `The slope is $\frac{\Delta y}{\Delta x}$` — unrendered, unescaped, exactly as typed — so Obsidian can render it independently.

- [ ] **Step 4: Commit**

```bash
git add extension/sidepanel.html extension/sidepanel.js
git commit -m "Add live math preview to topic-log form"
```

---

### Task 6: System prompt delimiter convention

**Files:**
- Modify: `backend/prompts/system_prompt.md` (`## Style` section)

- [ ] **Step 1: Instruct the model to use $ delimiters**

Current (`backend/prompts/system_prompt.md`, `## Style` section):

```markdown
## Style

Be concise. Don't lecture. Ask more than you tell. Match the energy of a good in-person tutor, not a textbook.
```

Replace with:

```markdown
## Style

Be concise. Don't lecture. Ask more than you tell. Match the energy of a good in-person tutor, not a textbook. When you write math, use LaTeX delimiters — `$...$` for inline expressions, `$$...$$` for standalone equations — so they render properly in the side panel.
```

- [ ] **Step 2: Verify manually**

The backend reads this file fresh on every request (`config.get_system_prompt()` calls `.read_text()` directly, no caching), so no backend restart is needed — just make sure `uv run python main.py` is already running. In the side panel, ask a question likely to produce math in the reply, e.g.: `What's the quadratic formula?`
Expected: the assistant's reply renders as formatted math (confirms the model followed the new instruction and Task 3's rendering picked it up), not literal `\frac`/`\pm` characters.

- [ ] **Step 3: Commit**

```bash
git add backend/prompts/system_prompt.md
git commit -m "Instruct the model to use LaTeX delimiters for math"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md` (step 5, "Chat normally below" bullet)

- [ ] **Step 1: Mention math rendering in the usage steps**

Current (`README.md`, within the numbered "## 4. Use it" list):

```markdown
5. Chat normally below. The companion asks what you've tried before explaining, gives hints in stages, and won't just hand you the answer — that's intentional (see `backend/prompts/system_prompt.md` if you want to tune the personality or rules).
```

Replace with:

```markdown
5. Chat normally below. The companion asks what you've tried before explaining, gives hints in stages, and won't just hand you the answer — that's intentional (see `backend/prompts/system_prompt.md` if you want to tune the personality or rules). Math renders automatically — type LaTeX like `$x^2+1$` for inline math or `$$...$$` for a standalone equation, and a live preview shows below the input as you type.
```

- [ ] **Step 2: Verify**

Read through the updated step in context and confirm it reads naturally and doesn't duplicate the existing sentence about hints/personality.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document math rendering support in the README"
```
