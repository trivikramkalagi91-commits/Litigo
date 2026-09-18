// ============================================================
// Litigo — Moss SDK Placeholder
// ============================================================
// This file is a STUB. To enable full Moss semantic search:
//
// 1. Get Moss browser SDK from: https://moss.dev/docs/sdk/browser
//    or install via: npm install @moss-dev/moss-web
//
// 2. Copy the SDK distribution files into this extension folder:
//    - moss.js   (the main SDK)
//    - moss.wasm (the WASM runtime binary, ~20kB)
//
// 3. Get your Moss Project ID + API key from moss.dev dashboard
//    and set them in background.js -> MossEngine.config
//
// WHEN MOSS IS NOT BUNDLED:
// Litigo automatically falls back to keyword-based validation.
// The extension still works — it just can't do semantic meaning
// detection (e.g., catching "Cupertino company" = "Apple").
// ============================================================

console.log("[Litigo] Moss SDK placeholder loaded — running in keyword fallback mode");
console.log("[Litigo] To enable Moss semantic mode: add moss.js + moss.wasm from @moss-dev/moss-web");

// MossClient stub — background.js checks typeof MossClient === 'undefined'
// to determine whether to use fallback mode. We intentionally do NOT
// define it here so the fallback activates correctly.
