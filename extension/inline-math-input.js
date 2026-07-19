// extension/inline-math-input.js
//
// Turns a contenteditable div into a lightweight inline math input: once a
// $...$ / $$...$$ / \(...\) / \[...\] segment is complete, it renders as a
// KaTeX widget in place while the cursor is elsewhere, and reverts to
// editable raw LaTeX text when the cursor moves into it (or it's clicked).
// No separate preview element is needed.
//
// Loaded after vendor/katex/katex.min.js (for the `katex` global). The
// rebuild functions here always produce a flat list of children directly
// under the editable div — text nodes, <br> line breaks, and
// `.mathWidget` spans — never nested wrapper elements, which keeps the
// raw-text reconstruction below simple and reliable.

const INLINE_MATH_DELIMS = [
  ["$$", "$$", true],
  ["\\[", "\\]", true],
  ["$", "$", false],
  ["\\(", "\\)", false],
];

// Finds non-overlapping, completed math segments in raw text.
function findInlineMathMatches(raw) {
  const matches = [];
  let i = 0;
  while (i < raw.length) {
    let matched = false;
    for (const [left, right, display] of INLINE_MATH_DELIMS) {
      if (!raw.startsWith(left, i)) continue;
      const closeIdx = raw.indexOf(right, i + left.length);
      if (closeIdx === -1) continue;
      const content = raw.slice(i + left.length, closeIdx);
      if (!content.trim()) continue; // skip empty/whitespace-only (e.g. bare "$$")
      matches.push({
        start: i,
        end: closeIdx + right.length,
        raw: raw.slice(i, closeIdx + right.length),
        content,
        display,
      });
      i = closeIdx + right.length;
      matched = true;
      break;
    }
    if (!matched) i++;
  }
  return matches;
}

// Reconstructs the raw text of el's (flat) children, expanding math widgets
// back to their delimited source and <br> back to "\n". If targetNode is
// given (typically a Selection's anchor/focus container), also returns the
// corresponding character offset into that raw string.
function readRawTextAndCursor(el, targetNode, targetOffset) {
  let raw = "";
  let cursor = null;
  const children = el.childNodes;

  for (let i = 0; i < children.length; i++) {
    if (targetNode === el && targetOffset === i) cursor = raw.length;
    const node = children[i];
    if (node.nodeType === Node.TEXT_NODE) {
      if (node === targetNode) cursor = raw.length + targetOffset;
      raw += node.textContent;
    } else if (node.tagName === "BR") {
      raw += "\n";
    } else if (node.classList && node.classList.contains("mathWidget")) {
      if (node === targetNode) {
        cursor = raw.length + (targetOffset > 0 ? node.dataset.raw.length : 0);
      }
      raw += node.dataset.raw;
    }
  }
  if (targetNode === el && targetOffset === children.length) cursor = raw.length;

  return { raw, cursor };
}

// Returns the plain-text value of an inline-math editor div, with widgets
// expanded back to their raw `$...$`-delimited source.
function getInlineMathValue(el) {
  return readRawTextAndCursor(el, null, null).raw;
}

function currentSelectionInfo(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  return readRawTextAndCursor(el, range.startContainer, range.startOffset);
}

// Rebuilds el's contents from raw text: segments the cursor isn't inside
// render as KaTeX widgets, everything else stays as editable text/<br>.
function rebuildInlineMathEditor(el, raw, cursorOffset) {
  const matches = findInlineMathMatches(raw);
  el.innerHTML = "";
  let pos = 0;
  let newCursorNode = null;
  let newCursorOffset = 0;

  function appendText(text, textStart) {
    if (!text) return;
    let offset = textStart;
    const parts = text.split("\n");
    parts.forEach((part, idx) => {
      if (part) {
        const node = document.createTextNode(part);
        el.appendChild(node);
        if (
          cursorOffset !== null &&
          cursorOffset >= offset &&
          cursorOffset <= offset + part.length
        ) {
          newCursorNode = node;
          newCursorOffset = cursorOffset - offset;
        }
        offset += part.length;
      }
      if (idx < parts.length - 1) {
        el.appendChild(document.createElement("br"));
        offset += 1;
      }
    });
  }

  function appendWidget(match) {
    const span = document.createElement("span");
    span.className = "mathWidget";
    span.contentEditable = "false";
    span.dataset.raw = match.raw;
    try {
      katex.render(match.content, span, { throwOnError: false, displayMode: match.display });
    } catch {
      span.textContent = match.raw;
    }
    // Widgets aren't part of the editable text flow, so clicking one has to
    // explicitly swap it back to raw, editable text.
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const textNode = document.createTextNode(span.dataset.raw);
      span.replaceWith(textNode);
      const range = document.createRange();
      range.setStart(textNode, textNode.length);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();
    });
    el.appendChild(span);
  }

  for (const match of matches) {
    const cursorInside =
      cursorOffset !== null && cursorOffset > match.start && cursorOffset < match.end;
    if (cursorInside) {
      appendText(raw.slice(pos, match.end), pos);
      pos = match.end;
      continue;
    }
    appendText(raw.slice(pos, match.start), pos);
    appendWidget(match);
    pos = match.end;
  }
  appendText(raw.slice(pos), pos);

  if (newCursorNode) {
    const range = document.createRange();
    range.setStart(newCursorNode, Math.min(newCursorOffset, newCursorNode.textContent.length));
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// Replaces el's contents with text, rendering any completed math segments
// immediately (used for programmatic fills, e.g. a drafted topic log).
function setInlineMathValue(el, text) {
  rebuildInlineMathEditor(el, text || "", null);
}

// Wires up el (a contenteditable div) so completed math segments render as
// KaTeX widgets while the cursor is elsewhere. `options.onEnter(event)` can
// intercept the Enter key (return true to mean "handled, don't insert a
// line break"); Shift+Enter and any unhandled Enter insert a line break.
function setupInlineMathInput(el, options = {}) {
  let timer = null;
  const scheduleRerender = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const info = currentSelectionInfo(el) || { raw: getInlineMathValue(el), cursor: null };
      rebuildInlineMathEditor(el, info.raw, info.cursor);
    }, 120);
  };

  el.addEventListener("input", scheduleRerender);

  document.addEventListener("selectionchange", () => {
    if (document.activeElement !== el) return;
    scheduleRerender();
  });

  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const handled = options.onEnter ? options.onEnter(e) : false;
    if (!handled) {
      document.execCommand("insertLineBreak");
    }
  });

  // Force plain-text paste so we never end up with nested wrapper elements
  // that would break the flat raw-text reconstruction above.
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}
