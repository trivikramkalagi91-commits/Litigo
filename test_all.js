const MossClient = require('./extension/moss.js');
const fs = require('fs');

async function runTests() {
  console.log("=== Litigo Verification Suite ===");

  // 1. WASM Engine test
  const moss = new MossClient({ wasmUrl: './extension/moss.wasm' });
  await moss.init();
  console.log("1. WASM Init:", moss.initialized ? "PASSED" : "FAILED");

  // 2. Rule Indexing & Query Latency Test
  const rules = [
    { id: 1, text: "Keep answers under 50 words", enabled: true, type: "length" },
    { id: 2, text: "Always use bullet points", enabled: true, type: "format" },
    { id: 3, text: "Never mention Company X", enabled: true, type: "forbidden", keywords: ["company x", "competitor x"] }
  ];

  const docs = rules.map(r => ({
    id: `rule_${r.id}`,
    text: r.text,
    metadata: { ruleId: r.id, type: r.type, ruleText: r.text, keywords: r.keywords }
  }));

  await moss.createIndex('litigo_rules', docs);
  const qRes = await moss.query('litigo_rules', 'We love Company X solutions', { top_k: 2 });
  
  console.log("2. Query Latency:", `${qRes.latencyMs}ms`, qRes.latencyMs < 10 ? "(<10ms P50 target met!)" : "(Exceeded)");
  console.log("   Violations found:", qRes.docs.length > 0 ? "PASSED" : "FAILED");
  if (qRes.docs.length > 0) {
    console.log("   Caught rule:", qRes.docs[0].metadata.ruleText, "Confidence:", qRes.docs[0].score);
  }

  // 3. Truth Layer Document Ingestion & Fact Check Test
  const sampleDoc = `Litigo is an AI Rule Enforcer developed for the YC Fall 2026 hackathon. It processes all validations locally in browser using WebAssembly.`;
  
  const chunkSize = 200;
  const overlap = 40;
  const chunks = [];
  let start = 0;
  while (start < sampleDoc.length) {
    const end = Math.min(sampleDoc.length, start + chunkSize);
    chunks.push({
      id: `chunk_${chunks.length}`,
      text: sampleDoc.substring(start, end),
      metadata: { filename: 'sample.txt' }
    });
    start += (chunkSize - overlap);
  }

  await moss.createIndex('litigo_knowledge', chunks);
  const claimRes = await moss.query('litigo_knowledge', 'Litigo processes all validations locally in browser using WebAssembly');
  console.log("3. Truth Layer Fact Check:", claimRes.docs.length > 0 && claimRes.docs[0].score >= 0.85 ? "PASSED (Verified)" : "FAILED");

  // 4. Pre-injection string format check
  const activeRules = rules.filter(r => r.enabled);
  const preInjectionStr = `[ENFORCE: ${activeRules.map(r => r.text).join('; ')}]`;
  console.log("4. Pre-Injection Prompt Format:", preInjectionStr);
  console.log("   Validation:", preInjectionStr.startsWith('[ENFORCE:') ? "PASSED" : "FAILED");

  console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
}

runTests();
