// Script to generate extension/moss.wasm binary module
const fs = require('fs');
const path = require('path');

function encodeULEB128(v) {
  const b = [];
  do {
    let x = v & 0x7f;
    v >>= 7;
    if (v !== 0) x |= 0x80;
    b.push(x);
  } while (v !== 0);
  return b;
}

function makeVector(data) {
  return [...encodeULEB128(data.length), ...data.flat()];
}

function makeSection(type, data) {
  return [type, ...encodeULEB128(data.length), ...data];
}

// WASM Header
const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

// Type Section: 
// Type 0: (i32, i32, i32) -> f32  [dot_product, cosine_similarity]
// Type 1: (i32, i32) -> f32       [vector_norm]
const typeSection = makeSection(1, makeVector([
  [0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7d], // (i32, i32, i32) -> f32
  [0x60, 2, 0x7f, 0x7f, 1, 0x7d]        // (i32, i32) -> f32
]));

// Function Section: Function 0 -> Type 0, Function 1 -> Type 1, Function 2 -> Type 0
const funcSection = makeSection(3, makeVector([0, 1, 0]));

// Memory Section: 1 page (min=1, no max)
const memorySection = makeSection(5, makeVector([
  [0x00, 0x01] // limits: flags=0, initial=1 page
]));

// Export Section:
function makeExport(name, kind, index) {
  const nameBytes = Buffer.from(name, 'utf8');
  return [...encodeULEB128(nameBytes.length), ...nameBytes, kind, index];
}

const exportSection = makeSection(7, makeVector([
  makeExport("memory", 0x02, 0),
  makeExport("dot_product", 0x00, 0),
  makeExport("vector_norm", 0x00, 1),
  makeExport("cosine_similarity", 0x00, 2)
]));

// Func 0: dot_product(ptr1, ptr2, len) -> f32
const func0Body = [
  2, 1, 0x7d, 1, 0x7f,
  0x43, 0x00, 0x00, 0x00, 0x00, 0x21, 0x03,
  0x41, 0x00, 0x21, 0x04,
  0x02, 0x40,
  0x03, 0x40,
  0x20, 0x04, 0x20, 0x02, 0x4e, 0x0d, 0x01,
  0x20, 0x03,
  0x20, 0x00, 0x20, 0x04, 0x41, 0x04, 0x6c, 0x6a, 0x2a, 0x02, 0x00,
  0x20, 0x01, 0x20, 0x04, 0x41, 0x04, 0x6c, 0x6a, 0x2a, 0x02, 0x00,
  0x92, 0x90, 0x21, 0x03,
  0x20, 0x04, 0x41, 0x01, 0x6a, 0x21, 0x04,
  0x0c, 0x00,
  0x0b,
  0x0b,
  0x20, 0x03, 0x0b
];

// Func 1: vector_norm(ptr, len) -> f32 = sqrt(dot_product(ptr, ptr, len))
const func1Body = [
  0,
  0x20, 0x00, 0x20, 0x00, 0x20, 0x01, 0x10, 0x00, 0x91, 0x0b
];

// Func 2: cosine_similarity(ptr1, ptr2, len) -> f32
const func2Body = [
  0,
  0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0x10, 0x00, // dot_product(ptr1, ptr2, len)
  0x20, 0x00, 0x20, 0x02, 0x10, 0x01,             // vector_norm(ptr1, len)
  0x20, 0x01, 0x20, 0x02, 0x10, 0x01,             // vector_norm(ptr2, len)
  0x92,                                           // f32.mul
  0x93,                                           // f32.div
  0x0b
];

function makeCode(body) {
  return [...encodeULEB128(body.length), ...body];
}

const codeSection = makeSection(10, makeVector([
  makeCode(func0Body),
  makeCode(func1Body),
  makeCode(func2Body)
]));

const wasmBytes = Uint8Array.from([
  ...header,
  ...typeSection,
  ...funcSection,
  ...memorySection,
  ...exportSection,
  ...codeSection
]);

const targetPath = path.join(__dirname, 'extension', 'moss.wasm');
fs.writeFileSync(targetPath, wasmBytes);
console.log(`Successfully generated WASM binary at ${targetPath} (${wasmBytes.length} bytes)`);
