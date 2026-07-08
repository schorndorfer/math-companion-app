// extension/calculator.js
//
// Wires up the header's calculator toggle button and lazily mounts the
// Desmos Scientific Calculator the first time the panel is expanded.
let scientificCalculator = null;
let calculatorMounting = false;

function ensureScientificCalculatorMounted() {
  if (scientificCalculator || calculatorMounting) return;
  calculatorMounting = true;

  const statusEl = document.getElementById("calcStatus");
  const errorEl = document.getElementById("calcError");
  const mountEl = document.getElementById("calcMount");

  loadDesmosCalculatorApi((err) => {
    calculatorMounting = false;
    statusEl.textContent = "";
    errorEl.textContent = "";
    errorEl.classList.add("hidden");

    if (err && err.message === "missing-key") {
      statusEl.textContent = "Add your Desmos API key in Settings — free at desmos.com/api";
      return;
    }
    if (err) {
      errorEl.textContent = "Could not load the Desmos calculator. Check your internet connection and API key.";
      errorEl.classList.remove("hidden");
      return;
    }
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

document.getElementById("openGraphingBtn").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("graphing.html"),
    type: "popup",
    width: 900,
    height: 700,
  });
});
