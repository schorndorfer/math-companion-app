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
