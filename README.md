# Litigo
> Set your rules once. Enforce them everywhere.

Litigo is a Chrome browser extension that makes sure every AI chat follows your rules — no matter how many turns deep the conversation goes. It uses **Moss semantic search running as WASM locally** for sub-10ms meaning-based validation, falling back gracefully to keyword matching when Moss SDK is not bundled. Your data never leaves your device.

## Features

- **Real-time enforcement** — Catches violations as the AI types, word by word
- **🧠 Moss semantic mode** — Understands meaning, not just keywords ("Cupertino company" → "Apple")
- **🔍 Keyword fallback** — Works even without Moss SDK bundled
- **100% local processing** — Zero network calls for validation when Moss runs in-browser
- **Universal** — Works on ChatGPT, Claude, Gemini, Perplexity, and other LLM web interfaces
- **Compliance scoring** — Every response gets a 0–100% trust score + mode indicator (Moss/keyword)
- **Visual distinction** — 🔴 red for keyword catches, 🟣 purple + 🧠 for Moss semantic catches
- **Set and forget** — Define rules once, enforcement persists across all tabs

## How It Works

1. **Install & set your rules** — Add the extension, click the icon, define constraints
2. **Chat normally** — Open any LLM chat interface, type like you always do
3. **See violations caught live** — Rule-breaking text gets strikethrough in real-time
4. **View compliance badge** — Every response shows score + detection mode + latency

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Litigo Chrome Extension                                     │
│                                                              │
│  ┌─────────────┐     ┌────────────────────────────────┐    │
│  │  Popup UI   │────▶│  Background Service Worker      │    │
│  │  (rules mgmt)│     │  ┌──────────────────────────┐  │    │
│  └─────────────┘     │  │  Moss WASM Engine         │  │    │
│                       │  │  (sub-10ms semantic)      │  │    │
│                       │  └──────────────────────────┘  │    │
│                       └───────────────┬────────────────┘    │
│                                       │ message passing     │
│  ┌───────────────────────────────────▼────────────────┐    │
│  │  Content Script (injected into LLM websites)        │    │
│  │  • MutationObserver watches streaming DOM           │    │
│  │  • Detects AI response elements                     │    │
│  │  • Validates → Moss semantic OR keyword fallback    │    │
│  │  • Injects visual feedback (strikethrough + badges) │    │
│  └───────────────────────────────────┬────────────────┘    │
└──────────────────────────────────────│─────────────────────┘
                                       ▼
                         LLM Website DOM (ChatGPT, Claude, etc.)
```

## Project Structure

```
litigo/
├── index.html              # Landing page (marketing site)
├── styles.css              # Landing page styles
├── script.js               # Landing page interactions
├── test-extension.html     # Standalone demo — AI chat simulation
├── README.md               # This file
└── extension/              # Chrome extension source
    ├── manifest.json       # Extension manifest V3
    ├── background.js       # Service worker + Moss engine integration
    ├── content.js          # DOM observer + validation (Moss + keyword fallback)
    ├── content.css         # Visual feedback styles
    ├── moss.js             # Moss SDK placeholder — replace with real SDK
    ├── popup.html          # Extension popup UI
    ├── popup.js            # Popup logic
    ├── popup.css           # Popup styles
    └── icons/              # Extension icons (16, 48, 128)
```

## Technology

- **Moss** — Sub-10ms semantic search engine running as WASM
- **Chrome Extension Manifest V3** — Content script for DOM interception
- **Vanilla JS/HTML/CSS** — No heavy frameworks, fast and lightweight
- **chrome.storage.local** — Rule persistence, never leaves browser

## Development

### View the landing page:
```bash
python3 -m http.server 8080
# Open http://localhost:8080/index.html
```

### Try the standalone demo:
```bash
# Open http://localhost:8080/test-extension.html
# Simulates AI chat with Litigo validation logic embedded
```

### Load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

### Enable Moss semantic mode:
1. Get Moss browser SDK from `moss.dev/docs/sdk/browser` or `npm install @moss-dev/moss-web`
2. Replace `extension/moss.js` with the real SDK
3. Add `moss.wasm` to the `extension/` folder
4. Set your `projectId` + `apiKey` in `background.js` → `MossEngine.config`

## Built For

**YC Fall 2026 × Moss: The Zero Latency Builder Sprint**
Track 4 — Agent Reliability, Security & Evaluation

## License

MIT
