// Litigo Popup Script
// Works both as Chrome extension popup and standalone test page

const DEFAULT_RULES = [
  { id: 1, text: "Keep answers under 50 words", enabled: true, type: "length" },
  { id: 2, text: "Always use bullet points", enabled: true, type: "format" },
  { id: 3, text: "Never mention Company X", enabled: true, type: "forbidden", keywords: ["company x", "competitor x", "the forbidden company"] },
  { id: 4, text: "No future predictions", enabled: false, type: "forbidden", keywords: ["will", "going to", "predict", "forecast", "expected to"] }
];

const IS_EXTENSION = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

let rules = [];
let enabled = true;

// Storage abstraction
const storage = {
  get(key, callback) {
    if (IS_EXTENSION) {
      chrome.storage.local.get(key, callback);
    } else {
      const data = {};
      try {
        const stored = localStorage.getItem('litigo_' + key);
        data[key] = stored ? JSON.parse(stored) : undefined;
      } catch(e) { data[key] = undefined; }
      callback(data);
    }
  },
  set(obj, callback) {
    if (IS_EXTENSION) {
      chrome.storage.local.set(obj, callback);
    } else {
      Object.keys(obj).forEach(key => {
        localStorage.setItem('litigo_' + key, JSON.stringify(obj[key]));
      });
      callback && callback();
    }
  }
};

// Message abstraction
function sendMessage(msg, callback) {
  if (IS_EXTENSION) {
    chrome.runtime.sendMessage(msg, callback);
  } else {
    if (msg.action === "getRules") {
      storage.get("rules", (data) => {
        storage.get("enabled", (data2) => {
          callback({
            rules: data.rules || DEFAULT_RULES,
            enabled: data2.enabled !== false
          });
        });
      });
    } else if (msg.action === "saveRules") {
      storage.set({ rules: msg.rules }, () => {
        rules = msg.rules;
        callback && callback({ success: true });
      });
    } else if (msg.action === "toggleEnabled") {
      storage.set({ enabled: msg.enabled }, () => {
        callback && callback({ success: true });
      });
    } else if (msg.action === "logViolation") {
      storage.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0 };
        stats.totalChecks++;
        stats.violationsCaught++;
        storage.set({ stats });
        callback && callback({ success: true });
      });
    } else if (msg.action === "logCheck") {
      storage.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0 };
        stats.totalChecks++;
        storage.set({ stats });
        callback && callback({ success: true });
      });
    }
  }
}

function loadRules() {
  sendMessage({ action: "getRules" }, (response) => {
    rules = response.rules || [];
    enabled = response.enabled;
    document.getElementById("masterEnabled").checked = enabled;
    renderRules();
    loadStats();
  });
}

function renderRules() {
  const list = document.getElementById("rulesList");
  list.innerHTML = "";

  if (rules.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:12px;">No rules yet. Add one below!</div>';
    return;
  }

  rules.forEach(rule => {
    const item = document.createElement("div");
    item.className = "rule-item";
    item.innerHTML = `
      <div class="rule-toggle ${rule.enabled ? 'active' : ''}" data-id="${rule.id}"></div>
      <span class="rule-text">${escapeHtml(rule.text)}</span>
      <button class="rule-delete" data-id="${rule.id}">×</button>
    `;
    list.appendChild(item);
  });

  document.querySelectorAll(".rule-toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const id = parseInt(toggle.dataset.id);
      rules = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
      saveRules();
    });
  });

  document.querySelectorAll(".rule-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id);
      rules = rules.filter(r => r.id !== id);
      saveRules();
    });
  });
}

function saveRules() {
  sendMessage({ action: "saveRules", rules }, () => {
    renderRules();
  });
}

function loadStats() {
  storage.get("stats", (data) => {
    const stats = data.stats || { totalChecks: 0, violationsCaught: 0 };
    document.getElementById("statChecks").textContent = `${stats.totalChecks} checks`;
    document.getElementById("statCaught").textContent = `${stats.violationsCaught} caught`;
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addNewRule(text, extra = {}) {
  if (!text.trim()) return;
  const newRule = {
    id: Date.now(),
    text: text.trim(),
    enabled: true,
    type: extra.type || "forbidden",
    keywords: extra.keywords || extractKeywords(text.trim())
  };
  rules = [...rules, newRule];
  document.getElementById("newRuleInput").value = "";
  saveRules();
}

function extractKeywords(text) {
  const quoted = text.match(/"([^"]+)"/g) || [];
  const keywords = quoted.map(q => q.slice(1, -1).toLowerCase());
  const mentionMatch = text.match(/never mention\s+(.+?)(?:\.|$|,)/i);
  if (mentionMatch) keywords.push(mentionMatch[1].trim().toLowerCase());
  return keywords;
}

document.addEventListener("DOMContentLoaded", () => {
  loadRules();

  document.getElementById("masterEnabled").addEventListener("change", (e) => {
    enabled = e.target.checked;
    sendMessage({ action: "toggleEnabled", enabled });
  });

  document.getElementById("addRuleBtn").addEventListener("click", () => {
    const input = document.getElementById("newRuleInput");
    addNewRule(input.value);
  });

  document.getElementById("newRuleInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addNewRule(e.target.value);
  });

  document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const data = JSON.parse(btn.dataset.rule);
      addNewRule(data.text, data);
    });
  });
});

setInterval(loadStats, 2000);