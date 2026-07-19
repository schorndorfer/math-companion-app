// Watches the Math Academy page and reports the current topic to the
// extension's side panel via chrome.storage.session.
//
// Math Academy embeds the topic ID directly in the URL path, e.g.
//   /topics/1427                       (topic overview page)
//   /tasks/11722039/topics/1427/review (task/exercise page)
// The topic's human-readable name and prerequisite list aren't rendered on
// the exercise page itself, but the topic overview page (/topics/{id}) has
// them in a `#topicName` div and `.prerequisite` list respectively.
// So: read the ID from the URL, and if the info isn't on the current page,
// fetch the overview page for it (cached per ID to avoid refetching).

const POLL_INTERVAL_MS = 1500;
const topicInfoCache = new Map(); // topicId -> { name, prerequisites }

function extractTopicIdFromUrl() {
  const match = window.location.pathname.match(/\/topics\/(\d+)/);
  return match ? match[1] : null;
}

function extractTopicInfo(doc) {
  const name = doc.querySelector("#topicName")?.textContent?.trim();
  if (!name) return null;
  const prerequisites = Array.from(doc.querySelectorAll(".prerequisiteLink"))
    .map((a) => a.textContent.trim())
    .filter(Boolean);
  return { name, prerequisites };
}

async function resolveTopicInfo(topicId) {
  if (topicInfoCache.has(topicId)) return topicInfoCache.get(topicId);

  const onPage = extractTopicInfo(document);
  if (onPage) {
    topicInfoCache.set(topicId, onPage);
    return onPage;
  }

  try {
    const res = await fetch(`/topics/${topicId}`);
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const info = extractTopicInfo(doc);
    if (info) topicInfoCache.set(topicId, info);
    return info;
  } catch {
    return null; // network hiccup or page shape changed; just skip this round
  }
}

let lastTopicId = null;

async function pollForTopic() {
  const topicId = extractTopicIdFromUrl();
  if (!topicId || topicId === lastTopicId) return;
  lastTopicId = topicId;

  const info = await resolveTopicInfo(topicId);
  if (info) {
    chrome.storage.session
      .set({ detectedTopic: info.name, detectedPrerequisites: info.prerequisites })
      .catch(() => {
        // Side panel may not be open / storage session unavailable yet; ignore.
      });
  }
}

setInterval(pollForTopic, POLL_INTERVAL_MS);
pollForTopic();
