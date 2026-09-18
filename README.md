# Litigo — AI Rule Enforcer
> Set your rules once. Enforce them everywhere.

Litigo is a Chrome browser extension (Manifest V3) that enforces custom rules on every AI prompt and response across ChatGPT, Claude, Gemini, Perplexity, DeepSeek, and custom web interfaces. It runs **Moss semantic search compiled as WASM locally** for sub-10ms meaning-based validation (P50 < 0.5ms), paired with an automated Truth Layer knowledge base for claim verification. Zero data leaves your device.

---

## Features

- **🛡️ Pre-Injection System** — Intercepts prompt sends silently and appends active rules in format `[ENFORCE: rule1; rule2; ...]`
- **⚡ Real-Time Streaming Enforcement** — Tracks word/token counts live as LLM types and visually truncates text when word limits are breached
- **🧠 Moss WASM Semantic Engine** — High-precision local vector indexing in WASM memory (<10ms P50 latency) catching rephrased & indirect violations
- **🔍 Dual Validation Path** — Runs Semantic + Keyword validation concurrently; Semantic takes precedence when confidence > 0.7, falling back seamlessly to keyword matching if WASM is offline
- **📚 Truth Layer Fact Check** — Local document ingestion (PDF, TXT, MD) chunked into Moss knowledge base (`litigo_knowledge`) cross-referencing AI assertions with 🟢 Verified, 🟡 Unverified, or 🔴 Contradiction badges
- **📊 Compliance & Truth Scoring** — Instant score calculation (`100 - violations * weight`) + Truth Score (`(verified / total) * 100`) fed live into UI badges
- **🔒 100% In-Browser Privacy** — IndexedDB and `chrome.storage.local` storage; zero network API calls required for validation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Litigo Chrome Extension (Manifest V3)                       │
│                                                              │
│  ┌─────────────┐     ┌────────────────────────────────┐    │
│  │  Popup UI   │────▶│  Background Service Worker      │    │
│  │  (Rules Mgmt)│     │  ┌──────────────────────────┐  │    │
│  └─────────────┘     │  │  Moss WASM Engine         │  │    │
│                      │  │  • litigo_rules index     │  │    │
│                      │  │  • litigo_knowledge index │  │    │
│                      │  │  • Sub-10ms Vector Engine │  │    │
│                      │  └──────────────────────────┘  │    │
│                      └───────────────┬────────────────┘    │
│                                      │ message passing     │
│  ┌──────────────────────────────────▼─────────────────┐    │
│  │  Content Script (LLM Web Apps)                      │    │
│  │  • Pre-Injection: [ENFORCE: rule1; rule2]           │    │
│  │  • Streaming Enforcement (Word Limit Truncation)    │    │
│  │  • Dual Validation: Semantic + Keyword Fallback     │    │
│  │  • Truth Layer: Claim verification against KB       │    │
│  │  • Visual Feedback: Strikethrough & Score Badges    │    │
│  └──────────────────────────────────┬─────────────────┘    │
└─────────────────────────────────────│──────────────────────┘
                                      ▼
             LLM Web Interfaces (ChatGPT, Claude, Gemini, etc.)
```

---

## Project Structure

```
Litigo/
├── index.html              # Landing page
├── styles.css              # Landing page styles
├── script.js               # Landing page scripts
├── test-extension.html     # Standalone simulation & test ground
├── test_all.js             # Automated verification suite
├── create_moss_wasm.js     # WASM binary builder script
├── README.md               # Documentation
└── extension/              # Chrome extension V3 source
    ├── manifest.json       # Manifest V3 configuration
    ├── background.js       # Service worker, WASM manager & Truth Layer engine
    ├── content.js          # DOM observer, prompt pre-injector & badge controller
    ├── content.css         # Visual feedback styles
    ├── moss.js             # Moss WASM Client SDK
    ├── moss.wasm           # WebAssembly vector math module (~200 bytes)
    ├── popup.html          # Extension popup interface
    ├── popup.js            # Rules management & stats controller
    ├── popup.css           # Popup styling
    └── icons/              # Extension icons (16, 48, 128)
```

---

## Quick Start & Testing

### 1. Build WASM & Run Automated Test Suite:
```bash
node create_moss_wasm.js
node test_all.js
```

### 2. Load Extension in Chrome:
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** in top-right toggle
3. Click **Load unpacked**
4. Select the `extension/` folder in this repository

### 3. Test on AI Platforms:
Litigo automatically operates on:
- ChatGPT (`chat.openai.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Perplexity (`perplexity.ai`)
- DeepSeek (`chat.deepseek.com`)
- Standalone Test Page (`test-extension.html`)

---

## Built For

**YC Fall 2026 × Moss: The Zero Latency Builder Sprint**  
Track 4 — Agent Reliability, Security & Evaluation

---

## License

MIT
