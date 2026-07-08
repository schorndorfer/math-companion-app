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
