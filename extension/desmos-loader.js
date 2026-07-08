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
