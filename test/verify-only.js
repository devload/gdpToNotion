// Run verifier against currently loaded Notion page without re-pasting
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { verify, parseExpectedStructure } = require('../src/verifier');

const mdFile = process.argv[2] || 'test/complex-test.md';
const title = process.argv[3] || null;

(async () => {
  const mdContent = fs.readFileSync(path.resolve(mdFile), 'utf8');

  // Show expected structure
  const expected = parseExpectedStructure(mdContent);
  console.log(`Expected blocks (${expected.length}):`);
  expected.forEach((b, i) => console.log(`  ${i}: ${b.type} "${(b.content || '').slice(0, 50)}"`));

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('notion.so'));

  const result = await verify(page, mdContent, { title });
  browser.disconnect();
})();
