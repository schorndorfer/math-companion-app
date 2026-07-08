// extension/calculator.js
//
// Wires up the header's calculator toggle button (lazily points the embedded
// iframe at Desmos's scientific calculator on first expand) and the "Open
// Graphing Calculator" button (opens Desmos's graphing calculator in a
// popup window). Both load Desmos's own hosted pages directly — no API key
// or script injection needed.
let calculatorLoaded = false;

document.getElementById("calcToggle").addEventListener("click", () => {
  const panel = document.getElementById("calcPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden") && !calculatorLoaded) {
    document.getElementById("calcFrame").src = "https://www.desmos.com/scientific";
    calculatorLoaded = true;
  }
});

document.getElementById("openGraphingBtn").addEventListener("click", () => {
  chrome.windows.create({
    url: "https://www.desmos.com/calculator",
    type: "popup",
    width: 900,
    height: 700,
  });
});
