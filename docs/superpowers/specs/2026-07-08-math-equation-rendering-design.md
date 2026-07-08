# Math equation rendering & entry — design

## Problem

Chat messages render via `div.textContent = m.content` — completely plain text. Any LaTeX-style math notation the model writes (or the student types) shows up as raw `\frac{x}{2}` characters instead of a formatted equation. There's also no assistance for typing math in the chat input or the topic-log form — just plain textareas.

This adds math rendering to assistant/user chat messages and the topic-log form's Explanation/Mistake fields, plus a live-preview aid for typing math in the chat input. General markdown (bold, lists, code) is explicitly out of scope — this is math-notation only.

## Library & convention

**KaTeX**, vendored locally into `extension/vendor/katex/` (`katex.min.css`, `katex.min.js`, `contrib/auto-render.min.js`, `fonts/`) — no CDN. This mirrors the lesson from the Desmos rewrite: MV3's default `extension_pages` CSP (`script-src 'self'`) blocks remote script hosts, but same-origin local files need no CSP changes at all. KaTeX is chosen over MathJax for speed and synchronous rendering, which matters more in a chat UI that re-renders on every message than MathJax's broader (but slower) LaTeX/AMS coverage.

Delimiter convention: inline math as `$...$`, display/block math as `$$...$$` — the same convention used by ChatGPT/Claude.ai. `backend/prompts/system_prompt.md` gets one line added to its "Style" section instructing the model to use these delimiters for any math it writes.

Rendering mechanism: KaTeX's `auto-render` extension (`renderMathInElement`) walks an element's text nodes, finds delimiter-wrapped spans, and replaces just those with rendered math — everything else stays escaped text. This means the existing `div.textContent = m.content` line is untouched (still safe against HTML injection); we just call `renderMathInElement(div, KATEX_OPTIONS)` immediately after. No hand-rolled parsing, no `innerHTML`, no new injection surface.

`KATEX_OPTIONS` sets `throwOnError: false`, so a malformed expression (e.g. mismatched braces) renders as KaTeX's built-in inline error span for just that piece, rather than breaking the rest of the message.

A single shared helper, `renderMath(el)`, wraps this call and is used at all three call sites below — no duplicated rendering logic.

## Chat input: live preview

Below the existing `chatInputRow`, add a preview panel that:
- Is hidden when the input is empty.
- On the `input` event (debounced ~150ms), copies the raw textarea value into the preview element and calls `renderMath()` on it.
- Is purely a look-before-you-send aid — the message is stored and sent exactly as typed (raw `$...$` text), matching what the preview showed.

This applies to the chat input only (not the pinned "what are you working on" context box).

Messages are rendered the same way on both sides: user bubbles and assistant bubbles both run through `renderMath()`, so a student's own typed `$\frac{x}{2}=7$` renders too, not just the model's replies.

## Topic-log form preview

Add a small preview `<div>` under the **Explanation** and **Mistake** textareas only:
- Same debounced `renderMath()` call as the chat input preview.
- Not added to Topic/Prereqs/Tags (too short to plausibly contain math) or the Lean snippet field (that's code, not LaTeX).

No backend changes. The payload sent to `/save-topic` is unchanged — raw text with `$...$`/`$$...$$` preserved verbatim. Obsidian renders that same delimiter convention natively, so the saved note is just as readable in Obsidian as the preview was in the side panel.

## Styling

The side panel is narrow (~320–400px). Add a small CSS override to:
- Slightly reduce KaTeX's default font-size so inline math doesn't dominate a message line.
- Let `$$...$$` display-mode equations scroll horizontally (`overflow-x: auto`) rather than overflow the panel.

## Data flow summary

```
Model reply / user input (raw text with $...$)
                │
       messages[] array (unchanged, stores raw text)
                │
       renderMessages() → div.textContent = m.content
                │
       renderMath(div)  ──> KaTeX auto-render replaces
                               delimiter spans in place

Chat input textarea ──(debounced input event)──> preview div
                                                        │
                                                  renderMath(preview)

Log form Explanation/Mistake textareas ──(debounced input event)──> preview div
                                                                          │
                                                                    renderMath(preview)
                                                                          │
                                        (Save button still sends raw textarea value,
                                         untouched, to /save-topic)
```

## Testing / verification

No automated test suite exists for the extension (consistent with current project scope); none is being introduced here. Verification is manual, loading the unpacked extension in Chrome:

1. Send a chat message containing inline (`$...$`) and display (`$$...$$`) math; confirm both render correctly in the assistant reply and in your own sent message bubble.
2. Send a message with deliberately malformed LaTeX (mismatched brace); confirm it shows a KaTeX error span in place, without breaking the rest of the message.
3. Type math into the chat input; confirm the live preview updates and matches what renders once sent.
4. Draft a topic log whose Explanation or Mistake contains math; confirm the preview under each field updates live as you edit.
5. Save that topic log; open the resulting markdown file and confirm it contains raw, unrendered `$...$`/`$$...$$` (i.e. nothing was HTML-escaped or transformed on save).
6. Confirm a long display-mode equation scrolls horizontally instead of overflowing the panel width.

## Out of scope

- General markdown rendering (bold, lists, code blocks, headers) — math notation only.
- Rendering math in the pinned context box, Topic/Prereqs/Tags fields, or the Lean snippet field.
- Any WYSIWYG/math-field input widget (e.g. MathLive) — considered and deferred; plain-text LaTeX with live preview was chosen since it reuses the same KaTeX pipeline needed for display anyway. Can revisit later if hand-typing LaTeX proves too much friction.
- Streaming/incremental rendering — the `/chat` endpoint returns a complete reply in one response, so rendering happens once per message, not token-by-token.
