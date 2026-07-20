const DEFAULT_BACKEND_URL = "http://127.0.0.1:8420";

let backendUrl = DEFAULT_BACKEND_URL;
let messages = []; // { role: "user" | "assistant", content: string }
let detectedPrerequisites = []; // prerequisite topic names for the currently detected topic
let lastTopicValue = ""; // last known value of the topic box, used to detect topic changes

const el = (id) => document.getElementById(id);

async function init() {
  const stored = await chrome.storage.local.get(["backendUrl"]);
  backendUrl = stored.backendUrl || DEFAULT_BACKEND_URL;
  el("backendUrl").value = backendUrl;

  const session = await chrome.storage.session.get([
    "messages",
    "contextText",
    "detectedTopic",
    "detectedPrerequisites",
  ]);
  messages = session.messages || [];
  lastTopicValue = session.contextText || "";
  el("contextBox").value = lastTopicValue;
  detectedPrerequisites = session.detectedPrerequisites || [];
  renderMessages();

  if (session.detectedTopic) {
    applyDetectedTopic(session.detectedTopic);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    if (changes.detectedTopic) {
      applyDetectedTopic(changes.detectedTopic.newValue);
    }
    if (changes.detectedPrerequisites) {
      detectedPrerequisites = changes.detectedPrerequisites.newValue || [];
    }
  });

  checkHealth();
}

// Clears the chat history when the topic changes, since prior messages
// are no longer relevant to the new topic.
function clearChatHistory() {
  messages = [];
  renderMessages();
  chrome.storage.session.set({ messages: [] });
}

// Silently keeps the context box in sync with whatever topic the content
// script detects on the page, overwriting any manually-typed text.
function applyDetectedTopic(topic) {
  if (!topic) return;
  if (topic !== lastTopicValue) {
    lastTopicValue = topic;
    clearChatHistory();
  }
  el("contextBox").value = topic;
  chrome.storage.session.set({ contextText: topic });
}

// Builds the context string sent to the backend: the student's own
// (possibly auto-filled) context text, plus the detected topic's
// prerequisites, if any, so the tutor can align with what Math Academy
// already assumes the student knows.
function buildChatContext() {
  const context = el("contextBox").value.trim();
  if (!context || detectedPrerequisites.length === 0) return context || null;
  return `${context}\n\nPrerequisite topics for this material: ${detectedPrerequisites.join(", ")}`;
}

function renderMessages() {
  const container = el("messages");
  container.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
    renderMath(div);
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

function showError(msg) {
  const box = el("chatError");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function clearError() {
  el("chatError").classList.add("hidden");
}

async function checkHealth() {
  const statusEl = el("healthStatus");
  try {
    const res = await fetch(`${backendUrl}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    statusEl.textContent = `Connected. Vault: ${data.vault}`;
  } catch (e) {
    statusEl.textContent = `Backend not reachable at ${backendUrl}. Is it running?`;
  }
}

async function sendMessage() {
  const input = el("chatInput");
  const text = getInlineMathValue(input).trim();
  if (!text) return;

  clearError();
  messages.push({ role: "user", content: text });
  renderMessages();
  input.innerHTML = "";
  el("sendBtn").disabled = true;

  try {
    const res = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        context: buildChatContext(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }
    const data = await res.json();
    messages.push({ role: "assistant", content: data.reply });
    renderMessages();
    await chrome.storage.session.set({ messages });
  } catch (e) {
    showError(e.message);
    messages.pop(); // roll back the user message since we never got a reply
    renderMessages();
  } finally {
    el("sendBtn").disabled = false;
  }
}

async function draftTopicLog() {
  clearError();
  if (messages.length === 0) {
    showError("Have a conversation first, then draft a log from it.");
    return;
  }
  el("draftBtn").disabled = true;
  el("draftBtn").textContent = "Drafting...";
  try {
    const res = await fetch(`${backendUrl}/draft-topic-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }
    const draft = await res.json();
    if (draft.error) {
      showError(draft.error);
      return;
    }
    el("logTopic").value = draft.topic || "";
    el("logStatus").value = draft.status || "learning";
    setInlineMathValue(el("logExplanation"), draft.explanation || "");
    setInlineMathValue(el("logMistake"), draft.mistake || "");
    el("logPrereqs").value = (draft.prerequisites || []).join(", ");
    el("logTags").value = (draft.tags || ["math-academy"]).join(", ");
    el("logLean").value = draft.lean_snippet || "";
    el("logForm").classList.remove("hidden");
  } catch (e) {
    showError(e.message);
  } finally {
    el("draftBtn").disabled = false;
    el("draftBtn").textContent = "Draft topic log from this conversation";
  }
}

function splitCsv(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function saveTopic() {
  const statusEl = el("saveStatus");
  const topic = el("logTopic").value.trim();
  if (!topic) {
    statusEl.textContent = "Topic name is required.";
    return;
  }

  const payload = {
    topic,
    explanation: getInlineMathValue(el("logExplanation")).trim(),
    mistake: getInlineMathValue(el("logMistake")).trim(),
    prerequisites: splitCsv(el("logPrereqs").value),
    tags: splitCsv(el("logTags").value),
    lean_snippet: el("logLean").value.trim(),
    status: el("logStatus").value,
  };

  try {
    const res = await fetch(`${backendUrl}/save-topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }
    const data = await res.json();
    statusEl.textContent = `Saved to ${data.path}`;
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

el("sendBtn").addEventListener("click", sendMessage);
el("draftBtn").addEventListener("click", draftTopicLog);
el("saveTopicBtn").addEventListener("click", saveTopic);

el("settingsToggle").addEventListener("click", () => {
  el("settingsPanel").classList.toggle("hidden");
});
el("saveSettings").addEventListener("click", async () => {
  backendUrl = el("backendUrl").value.trim() || DEFAULT_BACKEND_URL;
  await chrome.storage.local.set({ backendUrl });
  checkHealth();
});
el("contextBox").addEventListener("change", async () => {
  const newValue = el("contextBox").value;
  if (newValue !== lastTopicValue) {
    lastTopicValue = newValue;
    clearChatHistory();
  }
  await chrome.storage.session.set({ contextText: newValue });
});

setupInlineMathInput(el("chatInput"), {
  onEnter: (e) => {
    if (e.shiftKey) return false; // let the default handler insert a line break
    sendMessage();
    return true;
  },
});
setupInlineMathInput(el("logExplanation"));
setupInlineMathInput(el("logMistake"));

init();
