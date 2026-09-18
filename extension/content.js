// Litigo Content Script
// Injects into web pages, monitors AI chat outputs, enforces active rules, validates against Moss WASM & Truth Layer

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
      setupPreInjection();
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

// ============================================================
// DELIVERABLE 1 — PRE-INJECTION SYSTEM
// Silently appends active rules to EVERY user prompt before sending
// Format: "[ENFORCE: rule1; rule2; rule3]" (invisible to user)
// Works reliably on ChatGPT, Claude, Gemini, Perplexity, DeepSeek
// ============================================================
function setupPreInjection() {
  const getActiveRuleString = () => {
    const active = rules.filter(r => r.enabled);
    if (active.length === 0) return '';
    return `[ENFORCE: ${active.map(r => r.text).join('; ')}]`;
  };

  const findActiveInput = () => {
    const selectors = [
      '#prompt-textarea',
      'div[contenteditable="true"]',
      '.ProseMirror',
      '[role="textbox"]',
      'textarea',
      'input[type="text"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) return el;
    }
    return document.activeElement;
  };

  const handlePromptSubmit = (event) => {
    if (!extensionEnabled) return;
    const ruleString = getActiveRuleString();
    if (!ruleString) return;

    const inputEl = findActiveInput();
    if (!inputEl) return;

    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      if (!inputEl.value.includes('[ENFORCE:')) {
        const original = inputEl.value;
        inputEl.value = `${original}\n\n${ruleString}`;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("[Litigo] Pre-injected enforcement prompt into textarea/input:", ruleString);
      }
    } else if (inputEl.getAttribute('contenteditable') === 'true' || inputEl.classList.contains('ProseMirror')) {
      if (!inputEl.textContent.includes('[ENFORCE:')) {
        const p = inputEl.querySelector('p') || inputEl;
        p.textContent = `${p.textContent}\n\n${ruleString}`;
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Litigo] Pre-injected enforcement prompt into rich-text contenteditable:", ruleString);
      }
    }
  };

  // Intercept Enter key in capture phase
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handlePromptSubmit(e);
    }
  }, true);

  // Intercept click on send buttons in capture phase (ChatGPT, Claude, Gemini, etc.)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, [role="button"]');
    if (btn) {
      const btnText = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
      const btnTestId = btn.getAttribute('data-testid') || '';
      if (btnText.includes('send') || btnText.includes('submit') || btnTestId.includes('send') || btn.querySelector('svg')) {
        handlePromptSubmit(e);
      }
    }
  }, true);
}

// Hide pre-injected [ENFORCE: ...] text ONLY inside user chat history speech bubbles, NEVER in input boxes!
function hideEnforceTextFromUserBubbles() {
  const userBubbles = document.querySelectorAll('user-query, [data-message-author-role="user"], .user-message, .font-user-message');
  userBubbles.forEach(el => {
    if (el.textContent && el.textContent.includes('[ENFORCE:')) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('[ENFORCE:')) {
          node.textContent = node.textContent.replace(/\[ENFORCE:.*?\]/g, '').trim();
        }
      }
    }
  });
}

// Start monitoring DOM for AI chat output
function startMonitoring() {
  const observer = new MutationObserver((mutations) => {
    if (!extensionEnabled) return;
    hideEnforceTextFromUserBubbles();

    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isLikelyAIResponse(node)) {
            handleStreamingOrFullResponse(node);
          }
          node.querySelectorAll && node.querySelectorAll('*').forEach(child => {
            if (isLikelyAIResponse(child) && !processedNodes.has(child)) {
              handleStreamingOrFullResponse(child);
            }
          });
        } else if (mutation.type === 'characterData' && mutation.target.parentElement) {
          const parent = mutation.target.parentElement.closest('*');
          if (parent && isLikelyAIResponse(parent)) {
            handleStreamingOrFullResponse(parent);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Scan existing content
  document.querySelectorAll('*').forEach(el => {
    if (isLikelyAIResponse(el)) handleStreamingOrFullResponse(el);
  });

  console.log("[Litigo] Universal monitoring active — " + (mossActive ? "Moss WASM mode" : "keyword fallback mode"));
}

// Universal Heuristic: Explicitly detect AI response elements for ChatGPT, Claude, Gemini, Perplexity & DeepSeek
function isLikelyAIResponse(el) {
  if (!el || !el.textContent || el.textContent.trim().length < 20) return false;

  const tagName = el.tagName.toLowerCase();
  if (['input', 'textarea', 'form', 'button', 'script', 'style', 'nav', 'header'].includes(tagName)) return false;
  if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return false;
  if (el.closest && (el.closest('form') || el.closest('.input-area') || el.closest('[contenteditable="true"]') || el.closest('user-query'))) return false;

  // EXCLUDE User message containers across ChatGPT, Claude, Gemini, Perplexity
  const classNames = el.className ? String(el.className).toLowerCase() : '';
  const idStr = el.id ? String(el.id).toLowerCase() : '';
  const parentClass = el.parentElement?.className ? String(el.parentElement.className).toLowerCase() : '';
  const authorRole = el.getAttribute ? (el.getAttribute('data-message-author-role') || '').toLowerCase() : '';

  if (authorRole === 'user') return false;
  if (classNames.includes('user') || parentClass.includes('user') || idStr.includes('user')) return false;
  if (el.closest && (
    el.closest('[data-message-author-role="user"]') ||
    el.closest('.user-message') ||
    el.closest('.font-user-message') ||
    el.closest('user-query')
  )) return false;

  // DETECT Assistant/Model AI Messages
  if (authorRole === 'assistant') return true;

  const aiIndicators = [
    'assistant', 'font-claude-message', 'message-ai', 'ai-message', 'bot-message',
    'chat-response', 'model-response', 'response-container-content',
    'agent-turn', 'claude', 'gpt', 'gemini', 'copilot'
  ];

  const hasAIIndicator = aiIndicators.some(ind =>
    classNames.includes(ind) || parentClass.includes(ind) || idStr.includes(ind)
  );

  const hasDemoMarker = el.id === 'demo-ai-response' ||
    el.classList.contains('demo-ai-response') ||
    (el.getAttribute && el.getAttribute('data-ai-response') === 'true');

  const isProseContainer = (classNames.includes('prose') || classNames.includes('markdown')) &&
    !classNames.includes('user') &&
    el.textContent.length > 35;

  return hasAIIndicator || hasDemoMarker || isProseContainer;
}

// Real-time streaming enforcement + Post-generation validation
function handleStreamingOrFullResponse(element) {
  enforceStreamingWordLimit(element);

  if (element.litigoTimer) clearTimeout(element.litigoTimer);
  element.litigoTimer = setTimeout(() => {
    processAIResponse(element);
  }, 400);
}

// ============================================================
// STREAMING ENFORCEMENT & WARNING PLACEMENT
// Appends warning marker cleanly at the VERY BOTTOM of the AI response card
// ============================================================
function enforceStreamingWordLimit(element) {
  const lengthRule = rules.find(r => r.enabled && r.type === 'length');
  if (!lengthRule) return;

  const limitMatch = lengthRule.text.match(/(\d+)\s*words?/i);
  const limit = limitMatch ? parseInt(limitMatch[1]) : 50;

  const fullText = element.textContent || '';
  const words = fullText.trim().split(/\s+/);

  if (words.length > limit) {
    if (!element.querySelector('.litigo-warning')) {
      const warningMarker = document.createElement('div');
      warningMarker.className = 'litigo-violation litigo-warning';
      warningMarker.style.cssText = 'background:rgba(255,107,107,0.12);color:#D64545;font-size:12px;font-weight:600;padding:6px 12px;border-radius:6px;margin-top:8px;display:inline-block;';
      warningMarker.title = `Litigo Enforcement: Exceeded ${limit} words limit (${words.length} words total)`;
      warningMarker.textContent = `⚠ Exceeded length limit of ${limit} words (${words.length} words typed)`;
      element.appendChild(warningMarker);
      console.log(`[Litigo] Streaming enforcement triggered cleanly at bottom: ${words.length} > ${limit} words`);
    }
  }
}

// Process full AI response (Dual Path Validation + Truth Layer Verification)
async function processAIResponse(element) {
  if (processedNodes.has(element)) return;
  processedNodes.add(element);

  const text = element.textContent;
  if (!text || text.trim().length < 20) return;

  let violations = [];
  let usedMoss = false;
  let latencyMs = null;

  // DUAL VALIDATION PATH (Run both Semantic & Keyword, prioritize Semantic if confidence > 0.7)
  let keywordViolations = validateTextKeyword(text);
  let semanticViolations = [];

  if (mossActive) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: "validateSemantic",
          text: text,
          context: text.substring(0, 200)
        }, resolve);
      });

      if (response && response.mossActive && response.violations) {
        semanticViolations = response.violations;
        usedMoss = true;
        latencyMs = response.latencyMs;
      }
    } catch (e) {
      console.warn("[Litigo] Moss query failed, falling back to keywords:", e);
    }
  }

  // Combine & prioritize results (Semantic overrides if confidence > 0.7)
  if (usedMoss && semanticViolations.length > 0 && semanticViolations[0].confidence > 0.7) {
    violations = semanticViolations;
  } else {
    violations = keywordViolations;
    usedMoss = false;
  }

  // TRUTH LAYER FACT VERIFICATION (Deliverable 3)
  let truthData = null;
  try {
    truthData = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "verifyClaims",
        text: text
      }, resolve);
    });
  } catch (e) {}

  // Apply visual feedback & badges cleanly at bottom into EXISTING UI
  if (violations.length > 0) {
    highlightViolations(element, violations, usedMoss);
    chrome.runtime.sendMessage({ action: "logViolation", latencyMs });
    currentStats.violationsCaught++;
    showComplianceBadge(element, violations, usedMoss, latencyMs, truthData);
  } else {
    chrome.runtime.sendMessage({ action: "logCheck" });
    showCleanBadge(element, usedMoss, truthData);
  }

  // Highlight Truth Layer contradictions if found
  if (truthData && truthData.claims) {
    truthData.claims.filter(c => c.status === 'contradiction').forEach(c => {
      highlightContradiction(element, c);
    });
  }

  currentStats.totalChecks++;
}

// Keyword Validation Baseline
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
          const entityMatch = rule.text.match(/(?:never|don't|do not)\s+mention\s+(.+?)(?:\.|$|,)/i);
          const targetTerm = entityMatch ? entityMatch[1].trim().toLowerCase() : null;
          if (targetTerm && lowerText.includes(targetTerm)) {
            violations.push({
              rule: rule.text,
              type: "forbidden",
              matchedText: findMatch(text, targetTerm),
              semantic: false
            });
          }
        }
        break;

      case "length":
        const limitMatch = rule.text.match(/(\d+)\s*words?/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 50;
        const words = text.trim().split(/\s+/);
        if (words.length > limit) {
          violations.push({
            rule: rule.text,
            type: "length",
            wordCount: words.length,
            limit: limit,
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
        if (!hasCitation && /\d{4}|\d+%|according to|research shows/i.test(text)) {
          violations.push({
            rule: rule.text,
            type: "citation",
            issue: "Factual claim without citation",
            semantic: false
          });
        }
        break;
    }
  });

  return violations;
}

function findMatch(text, keyword) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx >= 0) return text.substring(idx, idx + keyword.length);
  return keyword;
}

// Highlight forbidden phrase violations in DOM (Strikethrough)
function highlightViolations(element, violations, usedMoss) {
  violations.filter(v => v.type !== 'length').forEach(v => {
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
            highlight.style.cssText = 'text-decoration:line-through;background:rgba(255,107,107,0.15);color:#D64545;padding:1px 4px;border-radius:3px;';
            const modeLabel = usedMoss ? '🧠 Moss semantic' : '🔍 Keyword match';
            highlight.title = `Litigo [${modeLabel}]: "${v.rule}" — violation caught`;
            highlight.textContent = range.toString();

            range.deleteContents();
            range.insertNode(highlight);
            break;
          }
        }
      } catch (e) {}
    }
  });
}

function highlightContradiction(element, contradictionClaim) {
  try {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes(contradictionClaim.sentence.substring(0, 15))) {
        const span = document.createElement('span');
        span.className = 'litigo-violation litigo-contradiction';
        span.style.cssText = 'text-decoration:line-through;background:rgba(255,0,0,0.2);color:#B71C1C;padding:1px 4px;border-radius:3px;';
        span.title = `🔴 Litigo Truth Layer: Contradiction found against Knowledge Base source (${contradictionClaim.source || 'KB'})`;
        span.textContent = node.textContent;
        node.parentNode.replaceChild(span, node);
        break;
      }
    }
  } catch(e) {}
}

// Feed results into EXISTING compliance badge cleanly positioned at the BOTTOM of the response
function showComplianceBadge(element, violations, usedMoss, latencyMs, truthData) {
  if (element.children.length > 25) return;
  if (element.querySelector('.litigo-badge')) return;
  if (element.closest('.litigo-badge')) return;

  const badge = document.createElement('div');
  badge.className = 'litigo-badge';

  const violationCount = violations.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - (violationCount * 15))));
  const modeLabel = usedMoss ? '🧠 Moss semantic' : '🔍 Keyword';
  const latencyLabel = latencyMs ? ` · ${latencyMs}ms` : '';
  const truthLabel = (truthData && truthData.totalClaims > 0) ? ` · Truth: ${truthData.truthScore}%` : '';

  badge.innerHTML = `
    <div class="litigo-badge-inner ${score < 70 ? 'low-score' : ''}">
      <span class="litigo-badge-icon">🛡️</span>
      <span class="litigo-badge-score">Compliance: ${score}%</span>
      <span class="litigo-badge-detail">${violationCount} violation${violationCount > 1 ? 's' : ''} · ${modeLabel}${latencyLabel}${truthLabel}</span>
    </div>
  `;

  element.style.position = 'relative';
  element.style.paddingBottom = element.style.paddingBottom || '8px';
  element.appendChild(badge);
}

function showCleanBadge(element, usedMoss, truthData) {
  if (element.children.length > 25) return;
  if (element.querySelector('.litigo-badge')) return;

  const badge = document.createElement('div');
  badge.className = 'litigo-badge';
  const modeLabel = usedMoss ? '🧠 Moss semantic' : '🔍 Keyword';
  const truthLabel = (truthData && truthData.totalClaims > 0) ? ` · Truth: ${truthData.truthScore}% (🟢 Verified)` : '';

  badge.innerHTML = `
    <div class="litigo-badge-inner">
      <span class="litigo-badge-icon">🛡️</span>
      <span class="litigo-badge-score">Compliance: 100%</span>
      <span class="litigo-badge-detail">All rules satisfied · ${modeLabel}${truthLabel}</span>
    </div>
  `;

  element.style.position = 'relative';
  element.style.paddingBottom = element.style.paddingBottom || '8px';
  element.appendChild(badge);
}

init();
