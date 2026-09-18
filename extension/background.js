// Letigo Background Service Worker
// Manages rule storage and communication between popup & content scripts

const DEFAULT_RULES = [
  { id: 1, text: "Keep answers under 50 words", enabled: true, type: "length" },
  { id: 2, text: "Always use bullet points", enabled: true, type: "format" },
  { id: 3, text: "Never mention Company X", enabled: true, type: "forbidden", keywords: ["company x", "competitor x", "the forbidden company"] },
  { id: 4, text: "Cite sources for factual claims", enabled: false, type: "citation" }
];

// Initialize storage on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      rules: DEFAULT_RULES,
      enabled: true,
      stats: { totalChecks: 0, violationsCaught: 0 }
    });
    console.log("[Letigo] Installed with default rules");
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getRules":
      chrome.storage.local.get(["rules", "enabled"], (data) => {
        sendResponse({ rules: data.rules || DEFAULT_RULES, enabled: data.enabled !== false });
      });
      return true; // async response

    case "saveRules":
      chrome.storage.local.set({ rules: message.rules }, () => {
        sendResponse({ success: true });
        // Notify all content scripts of update
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "rulesUpdated", rules: message.rules })
              .catch(() => {}); // Tab might not have content script
          });
        });
      });
      return true;

    case "toggleEnabled":
      chrome.storage.local.set({ enabled: message.enabled }, () => {
        sendResponse({ success: true });
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "enabledUpdated", enabled: message.enabled })
              .catch(() => {});
          });
        });
      });
      return true;

    case "logViolation":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0 };
        stats.totalChecks++;
        stats.violationsCaught++;
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;

    case "logCheck":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0 };
        stats.totalChecks++;
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;
  }
});

console.log("[Letigo] Background service worker running");