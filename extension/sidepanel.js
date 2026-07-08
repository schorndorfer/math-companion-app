const DEFAULT_BACKEND_URL = "http://127.0.0.1:8420";

let backendUrl = DEFAULT_BACKEND_URL;
let messages = []; // { role: "user" | "assistant", content: string }

const el = (id) => document.getElementById(id);

async function init() {
  const stored = await chrome.storage.local.get(["backendUrl", "desmosApiKey"]);
  backendUrl = stored.backendUrl || DEFAULT_BACKEND_URL;
  el("backendUrl").value = backendUrl;
  el("desmosApiKey").value = stored.desmosApiKey || "";

  const session = await chrome.storage.session.get(["messages", "contextText"]);
  messages = session.messages || [];
  el("contextBox").value = session.contextText || "";
  renderMessages();

  checkHealth();
}

function renderMessages() {
  const container = el("messages");
  container.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    div.textContent = m.content;
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
  const text = input.value.trim();
  if (!text) return;

  clearError();
  messages.push({ role: "user", content: text });
  renderMessages();
  input.value = "";
  el("sendBtn").disabled = true;

  try {
    const res = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        context: el("contextBox").value.trim() || null,
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
    el("logExplanation").value = draft.explanation || "";
    el("logMistake").value = draft.mistake || "";
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
    explanation: el("logExplanation").value.trim(),
    mistake: el("logMistake").value.trim(),
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
el("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
el("draftBtn").addEventListener("click", draftTopicLog);
el("saveTopicBtn").addEventListener("click", saveTopic);

el("settingsToggle").addEventListener("click", () => {
  el("settingsPanel").classList.toggle("hidden");
});
el("saveSettings").addEventListener("click", async () => {
  backendUrl = el("backendUrl").value.trim() || DEFAULT_BACKEND_URL;
  const desmosApiKey = el("desmosApiKey").value.trim();
  await chrome.storage.local.set({ backendUrl, desmosApiKey });
  checkHealth();
});
el("contextBox").addEventListener("change", async () => {
  await chrome.storage.session.set({ contextText: el("contextBox").value });
});

init();
