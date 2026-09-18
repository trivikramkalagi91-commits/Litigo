// Litigo Background Service Worker
// Manages rule storage, Moss semantic indexing, and communication
const DEFAULT_RULES = [
  { id: 1, text: "Keep answers under 50 words", enabled: true, type: "length" },
  { id: 2, text: "Always use bullet points", enabled: true, type: "format" },
  { id: 3, text: "Never mention Company X", enabled: true, type: "forbidden", keywords: ["company x", "competitor x", "the forbidden company"] },
  { id: 4, text: "Cite sources for factual claims", enabled: false, type: "citation" }
];

// ============================================================
// MOSS SEMANTIC ENGINE INTEGRATION
// Moss runs as WASM locally — sub-10ms semantic queries
// Falls back gracefully to keyword matching when Moss SDK
// (moss.js + moss.wasm) is not bundled in the extension
// ============================================================
const MossEngine = {
  client: null,
  initialized: false,
  rulesIndexName: 'litigo_rules',
  knowledgeIndexName: 'litigo_knowledge',
  config: {
    projectId: null,    // Set via extension settings or env
    apiKey: null,       // Set via extension settings or env
    wasmUrl: null       // chrome.runtime.getURL('moss.wasm')
  },

  async init() {
    if (this.initialized) return true;
    if (typeof MossClient === 'undefined') {
      console.log("[Litigo] Moss SDK not bundled — using keyword fallback mode");
      return false;
    }
    try {
      this.config.wasmUrl = chrome.runtime.getURL('moss.wasm');
      this.client = new MossClient({
        projectId: this.config.projectId || 'demo-project',
        apiKey: this.config.apiKey || 'demo-key',
        wasmUrl: this.config.wasmUrl,
        runtime: 'browser'
      });
      this.initialized = true;
      console.log("[Litigo] Moss WASM engine initialized — sub-10ms semantic mode active");
      return true;
    } catch (e) {
      console.warn("[Litigo] Moss init failed, using keyword fallback:", e.message);
      return false;
    }
  },

  // Convert a rule to semantic text for Moss indexing
  ruleToSemanticDoc(rule) {
    const templates = {
      'length': `Response must be concise and brief. Long-winded answers exceeding word limits violate this rule. The response must stay within defined length boundaries. Rambling, verbose, or unnecessarily elaborate text violates this constraint.`,
      'format': `Response must use bullet points, numbered lists, or structured itemized formatting. Paragraphs of continuous prose without bullet structure violate this rule. Output must be organized and scannable.`,
      'forbidden': `Response must never mention, discuss, or reference: ${rule.keywords ? rule.keywords.join(', ') : rule.text}. Any direct or indirect semantic reference to these topics, entities, or concepts violates this rule.`,
      'citation': `All factual claims, statistics, data points, and assertions must include citations, source references, or supporting evidence. Uncited factual statements presented as truth violate this rule.`,
      'style.simple': `Response must use simple, plain, accessible language. Complex vocabulary, technical jargon, and overly sophisticated phrasing violate this rule.`
    };
    const key = rule.type === 'format' && rule.text.toLowerCase().includes('bullet') ? 'format' : rule.type;
    return {
      text: templates[key] || templates['forbidden'],
      metadata: { ruleId: rule.id, type: rule.type, ruleText: rule.text, severity: rule.severity || 'hard' }
    };
  },

  async indexRules(rules) {
    if (!this.initialized) return false;
    try {
      const docs = rules.filter(r => r.enabled).map(r => this.ruleToSemanticDoc(r));
      await this.client.createIndex(this.rulesIndexName, docs, {
        embeddingModel: 'moss-light',
        indexType: 'semantic'
      });
      await this.client.loadIndex(this.rulesIndexName); // Load into memory = <10ms queries
      console.log(`[Litigo] Moss semantically indexed ${docs.length} rules`);
      return true;
    } catch (e) {
      console.warn("[Litigo] Moss indexRules failed:", e);
      return false;
    }
  },

  // Semantic validation — catches meaning, not just keywords
  // e.g., "Cupertino company" → matches rule about "Apple"
  async validateSemantic(text, context = '') {
    if (!this.initialized) return null;
    const startTime = performance.now();
    try {
      const query = `Context: ${context.substring(0, 200)}\nEvaluate this AI output against behavioral constraints: "${text.substring(0, 300)}"\nDoes this text violate rules about conciseness, formatting, forbidden topics, tone, or citation requirements?`;
      const results = await this.client.query(this.rulesIndexName, query, {
        top_k: 3,
        similarityThreshold: 0.72,
        includeMetadata: true
      });
      const latency = Math.round((performance.now() - startTime) * 100) / 100;
      const violations = results.docs
        .filter(d => d.score >= 0.72)
        .map(d => ({
          ruleId: d.metadata.ruleId,
          type: d.metadata.type,
          confidence: d.score,
          rule: d.metadata.ruleText || d.text.substring(0, 80),
          latencyMs: latency,
          semantic: true
        }));
      console.log(`[Litigo] Moss semantic query in ${latency}ms — ${violations.length} violations`);
      return violations;
    } catch (e) {
      console.warn("[Litigo] Moss semantic query failed:", e);
      return null;
    }
  },

  isActive() {
    return this.initialized;
  }
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      rules: DEFAULT_RULES,
      enabled: true,
      stats: { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 0 }
    });
    console.log("[Litigo] Installed with default rules");
    // Try to init Moss and index default rules
    const mossReady = await MossEngine.init();
    if (mossReady) MossEngine.indexRules(DEFAULT_RULES);
  }
});

// Also try init on service worker startup
(async () => {
  await MossEngine.init();
})();

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getRules":
      chrome.storage.local.get(["rules", "enabled"], (data) => {
        sendResponse({
          rules: data.rules || DEFAULT_RULES,
          enabled: data.enabled !== false,
          mossActive: MossEngine.isActive()
        });
      });
      return true;

    case "saveRules":
      chrome.storage.local.set({ rules: message.rules }, async () => {
        sendResponse({ success: true });
        // Re-index rules in Moss if active
        if (MossEngine.isActive()) {
          await MossEngine.indexRules(message.rules);
        }
        // Notify all content scripts of update
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: "rulesUpdated",
              rules: message.rules,
              mossActive: MossEngine.isActive()
            }).catch(() => {});
          });
        });
      });
      return true;

    case "toggleEnabled":
      chrome.storage.local.set({ enabled: message.enabled }, () => {
        sendResponse({ success: true });
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: "enabledUpdated",
              enabled: message.enabled
            }).catch(() => {});
          });
        });
      });
      return true;

    case "validateSemantic":
      // Content script asks background to run Moss semantic validation
      (async () => {
        if (!MossEngine.isActive()) {
          sendResponse({ mossActive: false, violations: null });
          return;
        }
        const violations = await MossEngine.validateSemantic(message.text, message.context || '');
        sendResponse({ mossActive: true, violations });
      })();
      return true;

    case "logViolation":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 0 };
        stats.totalChecks++;
        stats.violationsCaught++;
        if (message.latencyMs) {
          stats.mossQueries++;
          stats.avgLatencyMs = Math.round(((stats.avgLatencyMs * (stats.mossQueries - 1)) + message.latencyMs) / stats.mossQueries * 100) / 100;
        }
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;

    case "logCheck":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 0 };
        stats.totalChecks++;
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;

    case "getMossStatus":
      sendResponse({ active: MossEngine.isActive() });
      return true;
  }
});

console.log("[Litigo] Background service worker running — Moss architecture ready");
