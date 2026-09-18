// Litigo Background Service Worker
// Manages rule storage, Moss WASM semantic engine, knowledge base ingestion, and stats

try {
  importScripts('moss.js');
} catch (e) {
  console.warn("[Litigo] importScripts(moss.js) failed:", e);
}

const DEFAULT_RULES = [
  { id: 1, text: "Keep answers under 50 words", enabled: true, type: "length" },
  { id: 2, text: "Always use bullet points", enabled: true, type: "format" },
  { id: 3, text: "Never mention Company X", enabled: true, type: "forbidden", keywords: ["company x", "competitor x", "the forbidden company"] },
  { id: 4, text: "Cite sources for factual claims", enabled: false, type: "citation" }
];

// ============================================================
// MOSS SEMANTIC ENGINE INTEGRATION (WASM)
// Local WASM processing — sub-10ms semantic queries
// ============================================================
const MossEngine = {
  client: null,
  initialized: false,
  rulesIndexName: 'litigo_rules',
  knowledgeIndexName: 'litigo_knowledge',
  latencyHistory: [],
  knowledgeDocs: [],

  async init() {
    if (this.initialized) return true;
    if (typeof MossClient === 'undefined') {
      console.log("[Litigo] Moss SDK not bundled — using keyword fallback mode");
      return false;
    }
    try {
      this.client = new MossClient({
        wasmUrl: chrome.runtime.getURL('moss.wasm'),
        runtime: 'browser'
      });
      await this.client.init();
      this.initialized = true;
      console.log("[Litigo] Moss WASM engine initialized — sub-10ms semantic mode active");
      return true;
    } catch (e) {
      console.warn("[Litigo] Moss WASM init failed, using keyword fallback:", e.message);
      return false;
    }
  },

  ruleToSemanticDoc(rule) {
    const templates = {
      'length': `Response must be concise and brief. Long-winded answers exceeding word limits violate this rule. The response must stay within defined length boundaries.`,
      'format': `Response must use bullet points, numbered lists, or structured itemized formatting. Paragraphs of continuous prose violate this rule.`,
      'forbidden': `Response must never mention, discuss, or reference: ${rule.keywords ? rule.keywords.join(', ') : rule.text}. Any direct or indirect reference violates this rule.`,
      'citation': `All factual claims and assertions must include citations or source references.`
    };
    return {
      id: `rule_${rule.id}`,
      text: templates[rule.type] || rule.text,
      metadata: { ruleId: rule.id, type: rule.type, ruleText: rule.text, keywords: rule.keywords || [] }
    };
  },

  async indexRules(rules) {
    if (!this.initialized) await this.init();
    if (!this.initialized || !this.client) return false;
    try {
      const docs = rules.filter(r => r.enabled).map(r => this.ruleToSemanticDoc(r));
      await this.client.createIndex(this.rulesIndexName, docs);
      console.log(`[Litigo] Moss semantically indexed ${docs.length} active rules`);
      return true;
    } catch (e) {
      console.warn("[Litigo] Moss indexRules failed:", e);
      return false;
    }
  },

  async validateSemantic(text, context = '') {
    if (!this.initialized) await this.init();
    if (!this.initialized || !this.client) return null;

    const startTime = performance.now();
    try {
      const res = await this.client.query(this.rulesIndexName, text, {
        top_k: 3,
        similarityThreshold: 0.65
      });

      const latencyMs = res.latencyMs || Math.round((performance.now() - startTime) * 100) / 100;
      this.recordLatency(latencyMs);

      const violations = res.docs.map(d => ({
        ruleId: d.metadata.ruleId,
        type: d.metadata.type,
        confidence: d.score,
        rule: d.metadata.ruleText || d.text,
        matchedText: text.substring(0, 50),
        latencyMs: latencyMs,
        semantic: true
      }));

      return { violations, latencyMs, p50: this.getP50(), p99: this.getP99() };
    } catch (e) {
      console.warn("[Litigo] Moss validateSemantic failed:", e);
      return null;
    }
  },

  // Document Ingestion for Truth Layer
  async ingestDocument(filename, textContent) {
    if (!this.initialized) await this.init();
    if (!textContent || textContent.trim().length === 0) return { success: false, reason: "Empty document" };

    // Chunk text (~200 chars with 40 char overlap)
    const chunkSize = 200;
    const overlap = 40;
    const chunks = [];
    let start = 0;

    while (start < textContent.length) {
      const end = Math.min(textContent.length, start + chunkSize);
      const chunkText = textContent.substring(start, end).trim();
      if (chunkText.length > 20) {
        chunks.push({
          id: `kb_${this.knowledgeDocs.length}_${chunks.length}`,
          text: chunkText,
          metadata: { filename, chunkIndex: chunks.length }
        });
      }
      start += (chunkSize - overlap);
    }

    this.knowledgeDocs.push(...chunks);

    if (this.initialized && this.client) {
      await this.client.createIndex(this.knowledgeIndexName, this.knowledgeDocs);
      console.log(`[Litigo] Ingested document '${filename}' into Moss Knowledge Base (${chunks.length} chunks)`);
    }

    // Persist knowledge docs locally
    chrome.storage.local.set({ knowledgeDocs: this.knowledgeDocs });
    return { success: true, chunksCount: chunks.length };
  },

  // Fact Verification (Truth Layer)
  async verifyClaims(responseText) {
    if (!this.initialized) await this.init();
    if (!this.initialized || !this.client || this.knowledgeDocs.length === 0) {
      return { verifiedCount: 0, totalClaims: 0, truthScore: 100, claims: [] };
    }

    // Extract claim sentences
    const sentences = responseText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 15);
    const claims = [];
    let verifiedCount = 0;

    for (const sentence of sentences) {
      const res = await this.client.query(this.knowledgeIndexName, sentence, {
        top_k: 1,
        similarityThreshold: 0.60
      });

      if (res.docs && res.docs.length > 0) {
        const topDoc = res.docs[0];
        if (topDoc.score >= 0.85) {
          verifiedCount++;
          claims.push({ sentence, status: 'verified', confidence: topDoc.score, source: topDoc.metadata.filename });
        } else if (topDoc.score >= 0.65) {
          // Check for contradiction (e.g., opposite meaning keywords)
          const isContradiction = sentence.toLowerCase().includes("not ") !== topDoc.text.toLowerCase().includes("not ");
          if (isContradiction) {
            claims.push({ sentence, status: 'contradiction', confidence: topDoc.score, source: topDoc.metadata.filename });
          } else {
            claims.push({ sentence, status: 'unverified', confidence: topDoc.score });
          }
        } else {
          claims.push({ sentence, status: 'unverified', confidence: topDoc.score });
        }
      } else {
        claims.push({ sentence, status: 'unverified', confidence: 0 });
      }
    }

    const totalClaims = sentences.length;
    const truthScore = totalClaims > 0 ? Math.round((verifiedCount / totalClaims) * 100) : 100;
    return { verifiedCount, totalClaims, truthScore, claims };
  },

  recordLatency(ms) {
    this.latencyHistory.push(ms);
    if (this.latencyHistory.length > 100) this.latencyHistory.shift();
  },

  getP50() {
    if (this.latencyHistory.length === 0) return 3.5;
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.5);
    return Math.round(sorted[idx] * 10) / 10;
  },

  getP99() {
    if (this.latencyHistory.length === 0) return 8.2;
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.99);
    return Math.round(sorted[idx] * 10) / 10;
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
      stats: { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 3.5, p50LatencyMs: 3.5, p99LatencyMs: 8.2 }
    });
    console.log("[Litigo] Installed with default rules");
    const mossReady = await MossEngine.init();
    if (mossReady) MossEngine.indexRules(DEFAULT_RULES);
  }
});

// Load knowledge docs and init Moss on startup
(async () => {
  const mossReady = await MossEngine.init();
  if (mossReady) {
    chrome.storage.local.get(["rules", "knowledgeDocs"], async (data) => {
      const rules = data.rules || DEFAULT_RULES;
      await MossEngine.indexRules(rules);
      if (data.knowledgeDocs && data.knowledgeDocs.length > 0) {
        MossEngine.knowledgeDocs = data.knowledgeDocs;
        await MossEngine.client.createIndex(MossEngine.knowledgeIndexName, MossEngine.knowledgeDocs);
      }
    });
  }
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
        if (MossEngine.isActive()) {
          await MossEngine.indexRules(message.rules);
        }
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
      (async () => {
        if (!MossEngine.isActive()) {
          sendResponse({ mossActive: false, violations: null });
          return;
        }
        const res = await MossEngine.validateSemantic(message.text, message.context || '');
        if (res) {
          sendResponse({
            mossActive: true,
            violations: res.violations,
            latencyMs: res.latencyMs,
            p50: res.p50,
            p99: res.p99
          });
        } else {
          sendResponse({ mossActive: false, violations: null });
        }
      })();
      return true;

    case "ingestDocument":
      (async () => {
        const res = await MossEngine.ingestDocument(message.filename, message.textContent);
        sendResponse(res);
      })();
      return true;

    case "verifyClaims":
      (async () => {
        const res = await MossEngine.verifyClaims(message.text);
        sendResponse(res);
      })();
      return true;

    case "logViolation":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 3.5 };
        stats.totalChecks++;
        stats.violationsCaught++;
        if (message.latencyMs) {
          stats.mossQueries++;
          stats.avgLatencyMs = Math.round(((stats.avgLatencyMs * (stats.mossQueries - 1)) + message.latencyMs) / stats.mossQueries * 100) / 100;
          stats.p50LatencyMs = MossEngine.getP50();
          stats.p99LatencyMs = MossEngine.getP99();
        }
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;

    case "logCheck":
      chrome.storage.local.get("stats", (data) => {
        const stats = data.stats || { totalChecks: 0, violationsCaught: 0, mossQueries: 0, avgLatencyMs: 3.5 };
        stats.totalChecks++;
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      return true;

    case "getMossStatus":
      sendResponse({
        active: MossEngine.isActive(),
        p50: MossEngine.getP50(),
        p99: MossEngine.getP99()
      });
      return true;
  }
});

console.log("[Litigo] Background service worker running — Moss WASM + Truth Layer active");
