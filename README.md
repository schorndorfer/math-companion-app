# Math Academy Companion

A Chrome side panel that sits next to your Math Academy tab: a Socratic chat companion on one side, and a way to log what you've learned as Obsidian-ready markdown notes (linked by prerequisite, so Obsidian's graph view becomes your personal knowledge graph).

Two pieces:
- `backend/` — a local Python (FastAPI) server. Holds your Anthropic API key, talks to Claude, writes the markdown files. Runs on your machine only (`127.0.0.1`).
- `extension/` — the Chrome side panel UI. Talks only to your local backend, never to Anthropic directly.

## 1. Get an Anthropic API key (skip if you already have one)

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in / sign up.
2. Go to **API Keys** and create a new key.
3. Note that this is billed separately from any claude.ai subscription — it's pay-per-use. Costs for a study session are typically small (a few cents to low dollars depending on how much you chat), but keep an eye on usage if that matters to you.

## 2. Set up the backend

Requires [uv](https://docs.astral.sh/uv/) (`brew install uv`, or see the uv docs for other platforms).

```bash
cd backend
uv sync
cp .env.example .env
```

Open `.env` and paste in your key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

By default, topic notes get written to `backend/vault/`. To have them land directly in your real Obsidian vault, add a line pointing at it:

```
VAULT_PATH=/absolute/path/to/YourVault/Math Academy
```

(Create that folder first, or add it as a subfolder inside a vault you already have open in Obsidian. Any folder inside an existing vault works — Obsidian picks up new notes automatically.)

Run it:

```bash
uv run python main.py
```

You should see it come up on `http://127.0.0.1:8420`. Leave this running while you study — it needs to be up for the side panel to work. Visit `http://127.0.0.1:8420/health` in a browser to sanity-check it's alive.

## 3. Load the extension

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the extension (puzzle-piece icon in the toolbar → pin) so it's easy to reach.

## 4. Use it

1. Open Math Academy in a tab.
2. Click the extension icon — the side panel opens next to your tab.
3. Click the 🧮 icon to open a quick embedded scientific calculator (Desmos), or use "Open Graphing Calculator" inside that panel for a full graphing window — no signup or setup needed for either.
4. Type what you're working on into the "What are you working on?" box at the top — this stays pinned and gets sent along with every chat message, so you don't have to repeat yourself each turn.
5. Chat normally below. The companion asks what you've tried before explaining, gives hints in stages, and won't just hand you the answer — that's intentional (see `backend/prompts/system_prompt.md` if you want to tune the personality or rules). Math renders automatically — type LaTeX like `$x^2+1$` for inline math or `$$...$$` for a standalone equation, and a live preview shows below the input as you type.
6. When you've worked through a topic, click **Draft topic log from this conversation**. It'll propose a topic name, a plain-language explanation, a common mistake, prerequisite topics, and a Lean snippet if one came up — review/edit any of it, then **Save to vault**.
7. Open your Obsidian vault and look at Graph View — topics you've logged with prerequisites will show up as linked nodes, mirroring Math Academy's own prerequisite structure but built from what you actually worked through.

## Notes and known limitations

- **The backend must be running** for the side panel to work. If you see "Backend not reachable," check the terminal where you ran `uv run python main.py`.
- **Context capture is manual** (by design, for v1) — the extension doesn't read the Math Academy page itself. You tell it what you're working on. This was a deliberate tradeoff: reading Math Academy's page reliably would require reverse-engineering their DOM, which breaks silently if they change their site.
- **Chat history is per-browser-session** (`chrome.storage.session`) — it clears when you close Chrome, but survives closing/reopening the side panel. Topic-log drafts pull from whatever's in that history, so draft a log before closing the browser if you want it captured.
- **The backend binds to 127.0.0.1 only.** Don't change `HOST` in `.env` to `0.0.0.0` unless you understand the implications — CORS is currently wide open (`*`) on the assumption that only local processes can reach it.
- **Model name**: `backend/config.py` defaults to `claude-sonnet-5`. If Anthropic renames or retires a model, check [docs.claude.com](https://docs.claude.com) for the current slug and set `ANTHROPIC_MODEL` in `.env`.

## Natural next steps (not built yet)

- Auto-reading the Math Academy page via a content script, once the manual version has proven itself worth keeping open daily.
- A "Related topics" search so the log form can autocomplete prerequisites from what's already in your vault (the backend's `/topics` endpoint already lists existing notes — just needs wiring into the UI).
- Packaging the backend as a background service (e.g. a launchd/systemd unit) so you don't have to remember to start it manually.
