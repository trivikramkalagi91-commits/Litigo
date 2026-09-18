// Litigo Content Script
// Injects into web pages, monitors AI chat outputs, validates against rules
// Uses Moss semantic search (sub-10ms) when available, falls back to keyword matching
let rules = [];
let extensionEnabled = true;
let mossActive = false;
let processedNodes = new WeakSet();
let currentStats = { totalChecks: 0, violationsCaught: 0 };

// Initialize
function init() {
  chrome.runtime.sendMessage({ action: "getRules" }, (response) => {
    if (response) {
      rules = response.rules || [];
      extensionEnabled = response.enabled !== false;
      mossActive = response.mossActive === true;
      console.log(`[Litigo] Loaded ${rules.length} rules, enabled: ${extensionEnabled}, Moss: ${mossActive ? 'SEMANTIC' : 'keyword fallback'}`);
      startMonitoring();
    }
  });
}

// Listen for rule updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "rulesUpdated") {
    rules = message.rules || [];
    if (message.mossActive !== undefined) mossActive = message.mossActive;
    console.log(`[Litigo] Rules updated: ${rules.length}, Moss: ${mossActive}`);
  } else if (message.action === "enabledUpdated") {
    extensionEnabled = message.enabled;
    console.log("[Litigo] Enabled:", extensionEnabled);
  }
});

// Start monitoring DOM for AI chat output
function startMonitoring() {
  const observer = new MutationObserver((mutations) => {
    if (!extensionEnabled) return;
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isLikelyAIResponse(node)) {
            processAIResponse(node);
          }
          node.querySelectorAll && node.querySelectorAll('*').forEach(child => {
            if (isLikelyAIResponse(child) && !processedNodes.has(child)) {
              processAIResponse(child);
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Also scan existing content
  document.querySelectorAll('*').forEach(el => {
    if (isLikelyAIResponse(el)) processAIResponse(el);
  });

  console.log("[Litigo] Monitoring active — " + (mossActive ? "Moss semantic mode" : "keyword fallback mode"));
}

// Heuristic: detect if element is likely an AI response
function isLikelyAIResponse(el) {
  if (!el || !el.textContent || el.textContent.trim().length < 20) return false;

  const classNames = el.className ? String(el.className).toLowerCase() : '';
  const tagName = el.tagName.toLowerCase();

  const aiIndicators = [
    'assistant', 'message-ai', 'ai-message', 'bot-message',
    'response', 'chat-response', 'model-response',
    'claude', 'gpt', 'gemini', 'copilot'
  ];

  const parentClass = el.parentElement?.className ? String(el.parentElement.className).toLowerCase() : '';

  const hasAIIndicator = aiIndicators.some(ind =>
    classNames.includes(ind) || parentClass.includes(ind)
  );

  const isStructured = tagName === 'div' &&
    el.children.length > 0 &&
    el.textContent.length > 30;

  const hasDemoMarker = el.id === 'demo-ai-response' ||
    el.classList.contains('demo-ai-response') ||
    el.getAttribute && el.getAttribute('data-ai-response') === 'true';

  return hasAIIndicator || hasDemoMarker ||
    (isStructured && (classNames.includes('message') || classNames.includes('chat')));
}

// Process an AI response element — tries Moss first, falls back to keywords
async function processAIResponse(element) {
  if (processedNodes.has(element)) return;
  processedNodes.add(element);

  const text = element.textContent;
  if (!text || text.trim().length < 20) return;

  let violations = [];
  let usedMoss = false;
  let latencyMs = null;

  // ============================================================
  // PATH 1: Moss Semantic Validation (sub-10ms, meaning-based)
  // Asks background service worker to run Moss WASM query
  // ============================================================
  if (mossActive) {
    try {
      const contextWindow = text.substring(0, 200);
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: "validateSemantic",
          text: text,
          context: contextWindow
        }, resolve);
      });

      if (response && response.mossActive && response.violations !== null) {
        violations = response.violations;
        usedMoss = true;
        if (violations.length > 0) {
          latencyMs = violations[0].latencyMs;
        }
        console.log(`[Litigo] Moss semantic: ${violations.length} violations`);
      }
    } catch (e) {
      console.warn("[Litigo] Moss query failed, falling back to keywords:", e);
    }
  }

  // ============================================================
  // PATH 2: Keyword Fallback (when Moss not bundled)
  // ============================================================
  if (!usedMoss) {
    violations = validateTextKeyword(text);
  }

  // Apply visual feedback
  if (violations.length > 0) {
    highlightViolations(element, violations, usedMoss);
    chrome.runtime.sendMessage({ action: "logViolation", latencyMs });
    currentStats.violationsCaught++;
    showComplianceBadge(element, violations, usedMoss, latencyMs);
  } else {
    chrome.runtime.sendMessage({ action: "logCheck" });
    showCleanBadge(element, usedMoss);
  }

  currentStats.totalChecks++;
}

// ============================================================
// KEYWORD FALLBACK VALIDATION
// Used when Moss WASM is not bundled in the extension
// ============================================================
function validateTextKeyword(text) {
  const violations = [];
  const lowerText = text.toLowerCase();

  rules.filter(r => r.enabled).forEach(rule => {
    switch (rule.type) {
      case "forbidden":
        if (rule.keywords && rule.keywords.length > 0) {
          rule.keywords.forEach(keyword => {
            if (lowerText.includes(keyword.toLowerCase())) {
              violations.push({
                rule: rule.text,
                keyword: keyword,
                type: "forbidden",
                matchedText: findMatch(text, keyword),
                semantic: false
              });
            }
          });
        } else {
          const ruleWords = rule.text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
          const matches = ruleWords.filter(w => lowerText.includes(w));
          if (matches.length >= 2) {
            violations.push({
              rule: rule.text,
              type: "forbidden",
              matchedText: matches.join(", "),
              semantic: false
            });
          }
        }
        break;

      case "length":
        const wordCount = text.split(/\s+/).length;
        if (wordCount > 50) {
          violations.push({
            rule: rule.text,
            type: "length",
            wordCount: wordCount,
            limit: 50,
            semantic: false
          });
        }
        break;

      case "format":
        if (rule.text.toLowerCase().includes("bullet")) {
          const hasBullets = /[•\-*]/.test(text) || /^\s*\d+\./m.test(text);
          if (!hasBullets && text.split(/\s+/).length > 20) {
            violations.push({
              rule: rule.text,
              type: "format",
              issue: "No bullet points found",
              semantic: false
            });
          }
        }
        break;

      case "citation":
        const hasCitation = /\[(?:\d+|[^\]]+\))\]|\(https?:\/\/[^\)]+\)|source:|cited from/i.test(text);
        if (!hasCitation && containsFactualClaim(text)) {
          violations.push({
            rule: rule.text,
            type: "citation",
            issue: "Factual claim without citation",
            semantic: false
          });
        }
        break;

      case "style":
        if (rule.text.toLowerCase().includes("simple")) {
          const complexWords = countComplexWords(text);
          if (complexWords > 5) {
            violations.push({
              rule: rule.text,
              type: "style",
              issue: `${complexWords} complex words detected`,
              semantic: false
            });
          }
        }
        break;
    }
  });

  return violations;
}

function findMatch(text, keyword) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx >= 0) {
    return text.substring(idx, idx + keyword.length);
  }
  return keyword;
}

function containsFactualClaim(text) {
  return /\d+(\.\d+)?%|\d{4}|percent|according to|study shows|research found/i.test(text);
}

function countComplexWords(text) {
  const complexPatterns = /\b(?:however|furthermore|nevertheless|consequently|subsequently|predominantly|notwithstanding|heretofore|herein|hereinafter)\b/gi;
  const matches = text.match(complexPatterns);
  return matches ? matches.length : 0;
}

// Highlight violations in the DOM
function highlightViolations(element, violations, usedMoss) {
  violations.forEach(v => {
    if (v.matchedText) {
      try {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
          const nodeText = node.textContent;
          const idx = nodeText.toLowerCase().indexOf(v.matchedText.toLowerCase());
          if (idx >= 0) {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + v.matchedText.length);

            const highlight = document.createElement('span');
            highlight.className = 'litigo-violation' + (usedMoss ? ' litigo-semantic' : '');
            const modeLabel = usedMoss ? 'semantic detection' : 'keyword match';
            highlight.title = `Litigo [${modeLabel}]: "${v.rule}" — violation caught${v.confidence ? ` (confidence: ${Math.round(v.confidence * 100)}%)` : ''}`;
            highlight.textContent = range.toString();

            range.deleteContents();
            range.insertNode(highlight);
            break;
          }
        }
      } catch (e) {
        addViolationMarker(element, v);
      }
    } else {
      addViolationMarker(element, v);
    }
  });
}

function addViolationMarker(element, violation) {
  const marker = document.createElement('span');
  marker.className = 'litigo-marker';
  marker.title = `Litigo: "${violation.rule}" — ${violation.issue || 'violation'}`;
  marker.textContent = '⚠';
  element.appendChild(marker);
}

// Show compliance score badge with mode indicator
function showComplianceBadge(element, violations, usedMoss, latencyMs) {
  if (element.querySelector('.litigo-badge')) return;
  if (element.closest('.litigo-badge')) return;

  const badge = document.createElement('div');
  badge.className = 'litigo-badge';

  const violationCount = violations.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - (violationCount * 15))));
  const modeLabel = usedMoss ? '🧠 Moss semantic' : '🔍 Keyword';
  const latencyLabel = latencyMs ? ` · ${latencyMs}ms` : '';

  badge.innerHTML = `
    <div class="litigo-badge-inner ${score < 70 ? 'low-score' : ''}">
      <span class="litigo-badge-icon">🛡️</span>
      <span class="litigo-badge-score">Compliance: ${score}%</span>
      <span class="litigo-badge-detail">${violationCount} violation${violationCount > 1 ? 's' : ''} · ${modeLabel}${latencyLabel}</span>
    </div>
  `;

  element.style.position = 'relative';
  element.style.paddingBottom = element.style.paddingBottom || '8px';
  element.appendChild(badge);
}

// Show clean badge when no violations found
function showCleanBadge(element, usedMoss) {
  if (element.querySelector('.litigo-badge')) return;

  const badge = document.createElement('div');
  badge.className = 'litigo-badge';
  const modeLabel = usedMoss ? '🧠 Moss semantic' : '🔍 Keyword';

  badge.innerHTML = `
    <div class="litigo-badge-inner">
      <span class="litigo-badge-icon">🛡️</span>
      <span class="litigo-badge-score">Compliance: 100%</span>
      <span class="litigo-badge-detail">All rules satisfied · ${modeLabel}</span>
    </div>
  `;

  element.style.position = 'relative';
  element.style.paddingBottom = element.style.paddingBottom || '8px';
  element.appendChild(badge);
}

init();
