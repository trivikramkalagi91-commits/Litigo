# Letigo

> Set your rules once. Enforce them everywhere.

Letigo is a browser extension that makes sure every AI chat follows your rules — no matter how many turns deep the conversation goes. It runs locally in your browser using Moss WASM for sub-10ms semantic validation. Your data never leaves your device.

## Features

- **Real-time enforcement** — Catches violations as the AI types, word by word
- **100% local processing** — Moss runs as WASM, zero network calls for validation
- **Semantic understanding** — Moss catches meaning, not just keywords ("Cupertino company" → Apple)
- **Universal** — Works on ChatGPT, Claude, Gemini, and any LLM web interface
- **Compliance scoring** — Every response gets a 0-100% trust score
- **Set and forget** — Define rules once, enforcement persists forever

## How It Works

1. **Install & set your rules** — Add the extension, click the icon, define your constraints
2. **Chat normally** — Open any LLM chat interface, type like you always do
3. **See violations caught live** — Rule-breaking text gets red strikethrough in real-time

## Technology

- **Moss** — Sub-10ms semantic search engine running as WASM (<20kB)
- **Chrome Extension Manifest V3** — Content script for DOM interception
- **LiveKit** (optional) — For voice-agent integration paths
- **Vanilla JS/HTML/CSS** — No heavy frameworks, fast and lightweight

## Architecture

```
LLM Website → DOM Injection → Letigo Content Script → Moss WASM (local) → Visual Feedback
     ↓                                                                 ↑
  Streaming text ──────────────────────────────────────────────────────┘
```

## Development

```bash
# Open index.html in a browser to view the landing page
# or serve locally:
python3 -m http.server 8000
```

## Project Structure

```
letigo/
├── index.html      # Landing page
├── styles.css      # Design system & animations
├── script.js       # Interactions & effects
└── README.md       # This file
```

## Built For

**YC Fall 2026 × Moss: The Zero Latency Builder Sprint**

Track 4 — Agent Reliability, Security & Evaluation

## License

MIT
