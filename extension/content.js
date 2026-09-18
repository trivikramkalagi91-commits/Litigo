// Letigo Content Script
// Injects into web pages, monitors AI chat outputs, validates against rules

let rules = [];
let extensionEnabled = true;
let processedNodes = new WeakSet();
let currentStats = { totalChecks: 0, violationsCaught: 0 };

// Initialize
function init() {
  chrome.runtime.sendMessage({ action: "getRules" }, (response) => {
    if (response) {
      rules = response.rules || [];
      extensionEnabled = response.enabled !== false;
      console.log("[Letigo] Loaded", rules.length, "rules, enabled:", extensionEnabled);
      startMonitoring();
    }
  });
}

// Listen for rule updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "rulesUpdated") {
    rules = message.rules || [];
    console.log("[Letigo] Rules updated:", rules.length);
  } else if (message.action === "enabledUpdated") {
    extensionEnabled = message.enabled;
    console.log("[Letigo] Enabled:", extensionEnabled);
  }
});

// Start monitoring DOM for AI chat output
function startMonitoring() {
  // Common AI chat selectors (ChatGPT, Claude, Gemini, etc.)
  const observer = new MutationObserver((mutations) => {
    if (!extensionEnabled) return;

    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this looks like an AI response container
          if (isLikelyAIResponse(node)) {
            processAIResponse(node);
          }
          // Also check children
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

  console.log("[Letigo] Monitoring active");
}

// Heuristic: detect if element is likely an AI response
function isLikelyAIResponse(el) {
  if (!el || !el.textContent || el.textContent.trim().length < 20) return false;
  
  const classNames = el.className ? String(el.className).toLowerCase() : '';
  const tagName = el.tagName.toLowerCase();
  
  // Common AI response indicators
  const aiIndicators = [
    'assistant', 'message-ai', 'ai-message', 'bot-message',
    'response', 'chat-response', 'model-response',
    'claude', 'gpt', 'gemini', 'copilot'
  ];
  
  // Check parent classes too
  const parentClass = el.parentElement?.className ? String(el.parentElement.className).toLowerCase() : '';
  
  const hasAIIndicator = aiIndicators.some(ind => 
    classNames.includes(ind) || parentClass.includes(ind)
  );
  
  // Also match on common AI chat structures
  const isStructured = tagName === 'div' && 
    el.children.length > 0 && 
    el.textContent.length > 30;
  
  // For demo chat pages, look for specific markers
  const hasDemoMarker = el.id === 'demo-ai-response' || 
    el.classList.contains('demo-ai-response') ||
    el.getAttribute && el.getAttribute('data-ai-response') === 'true';
  
  return hasAIIndicator || hasDemoMarker || 
    (isStructured && (classNames.includes('message') || classNames.includes('chat')));
}

// Process an AI response element
function processAIResponse(element) {
  if (processedNodes.has(element)) return;
  processedNodes.add(element);

  const text = element.textContent;
  if (!text || text.trim().length < 20) return;

  const violations = validateText(text);
  
  if (violations.length > 0) {
    highlightViolations(element, violations);
    chrome.runtime.sendMessage({ action: "logViolation" });
    currentStats.violationsCaught++;
    showComplianceBadge(element, violations);
  } else {
    chrome.runtime.sendMessage({ action: "logCheck" });
  }
  currentStats.totalChecks++;
}

// Validate text against all enabled rules
function validateText(text) {
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
                matchedText: findMatch(text, keyword)
              });
            }
          });
        } else {
          // Fallback: check if rule text itself appears
          const ruleWords = rule.text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
          const matches = ruleWords.filter(w => lowerText.includes(w));
          if (matches.length >= 2) {
            violations.push({
              rule: rule.text,
              type: "forbidden",
              matchedText: matches.join(", ")
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
            limit: 50
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
              issue: "No bullet points found"
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
            issue: "Factual claim without citation"
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
              issue: `${complexWords} complex words detected`
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
  // Simple heuristic: look for numbers, dates, statistics
  return /\d+(\.\d+)?%|\d{4}|percent|according to|study shows|research found/i.test(text);
}

function countComplexWords(text) {
  const complexPatterns = /\b(?:however|furthermore|nevertheless|consequently|subsequently|predominantly|notwithstanding|heretofore|herein|hereinafter)\b/gi;
  const matches = text.match(complexPatterns);
  return matches ? matches.length : 0;
}

// Highlight violations in the DOM
function highlightViolations(element, violations) {
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
            highlight.className = 'letigo-violation';
            highlight.title = `Letigo: "${v.rule}" — violation caught`;
            highlight.textContent = range.toString();
            
            range.deleteContents();
            range.insertNode(highlight);
            break;
          }
        }
      } catch (e) {
        // If DOM manipulation fails, add a marker instead
        addViolationMarker(element, v);
      }
    } else {
      addViolationMarker(element, v);
    }
  });
}

function addViolationMarker(element, violation) {
  const marker = document.createElement('span');
  marker.className = 'letigo-marker';
  marker.title = `Letigo: "${violation.rule}" — ${violation.issue || 'violation'}`;
  marker.textContent = '⚠';
  element.appendChild(marker);
}

// Show compliance score badge
function showComplianceBadge(element, violations) {
  // Don't add duplicate badges
  if (element.querySelector('.letigo-badge')) return;
  if (element.closest('.letigo-badge')) return;

  const badge = document.createElement('div');
  badge.className = 'letigo-badge';
  
  const totalWords = element.textContent.split(/\s+/).length;
  const violationCount = violations.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - (violationCount * 15))));
  
  badge.innerHTML = `
    <div class="letigo-badge-inner">
      <span class="letigo-badge-icon">🛡️</span>
      <span class="letigo-badge-score">Compliance: ${score}%</span>
      <span class="letigo-badge-detail">${violationCount} violation${violationCount > 1 ? 's' : ''} caught</span>
    </div>
  `;
  
  // Insert after the element
  element.style.position = 'relative';
  element.style.paddingBottom = element.style.paddingBottom || '8px';
  element.appendChild(badge);
}

init();