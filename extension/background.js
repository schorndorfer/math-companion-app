// Makes clicking the toolbar icon open the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// chrome.storage.session is restricted to trusted (extension) contexts by
// default. The content script needs to write detected topics into it, so
// opt in to letting content scripts access it too.
chrome.storage.session
  .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
  .catch((error) => console.error(error));
