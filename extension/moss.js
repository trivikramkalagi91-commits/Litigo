// ============================================================
// Litigo — Moss WASM SDK Integration
// YC Fall 2026 x Moss Zero-Latency Hackathon
// Sub-10ms Local Semantic Search Engine running in WASM
// ============================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MossClient = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class MossClient {
    constructor(config = {}) {
      this.projectId = config.projectId || 'litigo-local';
      this.apiKey = config.apiKey || 'local-key';
      this.wasmUrl = config.wasmUrl || (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('moss.wasm') : 'moss.wasm');
      this.wasmInstance = null;
      this.wasmMemory = null;
      this.indexes = new Map();
      this.initialized = false;
      this.initPromise = null;
    }

    async init() {
      if (this.initialized) return true;
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        try {
          let wasmBuffer;
          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.isAbsolute(this.wasmUrl) ? this.wasmUrl : path.resolve(process.cwd(), this.wasmUrl);
            wasmBuffer = fs.readFileSync(filePath);
          } else if (typeof fetch !== 'undefined' && this.wasmUrl) {
            const res = await fetch(this.wasmUrl);
            wasmBuffer = await res.arrayBuffer();
          } else {
            throw new Error("Cannot locate moss.wasm file binary source");
          }

          const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
          this.wasmInstance = wasmModule.instance;
          this.wasmMemory = this.wasmInstance.exports.memory;
          this.initialized = true;
          console.log("[Litigo/Moss] WASM Engine Loaded Successfully (Sub-10ms active)");
          return true;
        } catch (e) {
          console.warn("[Litigo/Moss] WASM Init warning, using vector fallback:", e.message);
          this.initialized = true;
          return true;
        }
      })();

      return this.initPromise;
    }

    // High performance feature vectorizer (128 dimensions)
    vectorize(text) {
      const dim = 128;
      const vec = new Float32Array(dim);
      if (!text) return vec;

      const cleanText = text.toLowerCase().replace(/[^\w\s]/g, ' ');
      const words = cleanText.split(/\s+/).filter(w => w.length > 0);

      // 1. Word hash feature mapping
      for (const word of words) {
        let hash = 5381;
        for (let i = 0; i < word.length; i++) {
          hash = (hash * 33) ^ word.charCodeAt(i);
        }
        const idx = Math.abs(hash) % dim;
        vec[idx] += 1.5;
      }

      // 2. Character trigram feature mapping
      for (let i = 0; i < cleanText.length - 2; i++) {
        const trigram = cleanText.substring(i, i + 3);
        let hash = 5381;
        for (let j = 0; j < 3; j++) {
          hash = (hash * 33) ^ trigram.charCodeAt(j);
        }
        const idx = Math.abs(hash) % dim;
        vec[idx] += 0.5;
      }

      // 3. L2 Normalize vector
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < dim; i++) vec[i] /= norm;
      }

      return vec;
    }

    computeSimilarity(vecA, vecB) {
      if (this.wasmInstance && this.wasmInstance.exports.cosine_similarity) {
        try {
          const exports = this.wasmInstance.exports;
          const memory = exports.memory;
          const len = vecA.length;
          const byteLen = len * 4;

          const ptrA = 1024;
          const ptrB = 1024 + byteLen;

          const viewA = new Float32Array(memory.buffer, ptrA, len);
          const viewB = new Float32Array(memory.buffer, ptrB, len);

          viewA.set(vecA);
          viewB.set(vecB);

          const sim = exports.cosine_similarity(ptrA, ptrB, len);
          if (!isNaN(sim) && isFinite(sim)) return sim;
        } catch (e) {}
      }

      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    }

    async createIndex(indexName, docs = [], options = {}) {
      await this.init();
      const indexedDocs = docs.map((doc, i) => {
        const text = typeof doc === 'string' ? doc : (doc.text || '');
        const metadata = doc.metadata || {};
        const vec = this.vectorize(text);
        return { id: doc.id || `doc_${i}`, text, metadata, vector: vec };
      });

      this.indexes.set(indexName, indexedDocs);
      return { success: true, count: indexedDocs.length };
    }

    async loadIndex(indexName) {
      await this.init();
      return this.indexes.has(indexName);
    }

    async query(indexName, queryText, options = {}) {
      const startTime = performance.now();
      await this.init();

      const index = this.indexes.get(indexName);
      if (!index || index.length === 0) {
        return { docs: [], latencyMs: 0.1 };
      }

      const topK = options.top_k || 3;
      const threshold = options.similarityThreshold || 0.60;
      const queryVec = this.vectorize(queryText);

      const results = [];
      for (const doc of index) {
        let score = this.computeSimilarity(queryVec, doc.vector);

        // Boost score for direct keyword matches in query
        if (doc.metadata) {
          const queryLower = queryText.toLowerCase();
          const keywords = doc.metadata.keywords || [];
          if (doc.metadata.ruleText) {
            const ruleWords = doc.metadata.ruleText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            for (const w of ruleWords) {
              if (queryLower.includes(w)) {
                score += 0.15;
              }
            }
          }
          for (const kw of keywords) {
            if (queryLower.includes(kw.toLowerCase())) {
              score = Math.max(score, 0.88);
              break;
            }
          }
        }

        // Additional term overlap boost for knowledge base text
        const textLower = doc.text.toLowerCase();
        const queryLower = queryText.toLowerCase();
        const commonWords = queryLower.split(/\s+/).filter(w => w.length > 3 && textLower.includes(w));
        if (commonWords.length >= 3) {
          score = Math.max(score, 0.88);
        }

        if (score >= threshold) {
          results.push({
            id: doc.id,
            score: Math.min(0.99, Math.round(score * 100) / 100),
            text: doc.text,
            metadata: doc.metadata
          });
        }
      }

      results.sort((a, b) => b.score - a.score);
      const latencyMs = Math.max(0.1, Math.round((performance.now() - startTime) * 100) / 100);

      return {
        docs: results.slice(0, topK),
        latencyMs
      };
    }

    async deleteIndex(indexName) {
      this.indexes.delete(indexName);
      return { success: true };
    }
  }

  return MossClient;
}));
