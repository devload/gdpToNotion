const fs = require('fs');
const path = require('path');
const { convertMarkdownToHtml } = require('../src/markdown');
const { chunkHtml } = require('../src/chunker');

const mdFile = process.argv[2] || 'test/complex-test.md';
const mdContent = fs.readFileSync(path.resolve(mdFile), 'utf8');
const html = convertMarkdownToHtml(mdContent);

console.log('=== Full HTML ===');
console.log(html);
console.log('\n=== Chunks ===');
const chunks = chunkHtml(html);
chunks.forEach((c, i) => {
  console.log(`\n--- Chunk ${i + 1} (${Buffer.byteLength(c, 'utf8')} bytes) ---`);
  console.log(c);
});
