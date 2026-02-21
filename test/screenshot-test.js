const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../screenshots');

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('notion.so'));
  if (!page) page = await browser.newPage();

  // Step 1: Navigate
  console.log('Step 1: Navigate to target page');
  await page.goto('https://www.notion.so/devload/30e40edd3a66800dbdd9d5062d381426', {
    waitUntil: 'networkidle2',
    timeout: 20000,
  });
  await delay(3000);
  await snap(page, '01-loaded');

  // Step 2: Inspect DOM and find title
  console.log('Step 2: Find title element');
  const titleInfo = await page.evaluate(() => {
    // Try multiple selectors
    const selectors = [
      '[data-content-editable-leaf="true"]',
      'h1[contenteditable="true"]',
      '[placeholder="새 페이지"]',
      '[placeholder="Untitled"]',
      '.notion-page-block [contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return { found: true, selector: sel, tag: el.tagName, text: el.textContent.substring(0, 30) };
      }
    }
    return { found: false };
  });
  console.log('  Title info:', JSON.stringify(titleInfo));

  if (!titleInfo.found) {
    console.log('  FAIL: No title element found');
    browser.disconnect();
    return;
  }

  // Step 3: Click title, type new title
  console.log('Step 3: Set title');
  // Use evaluate to click (page.click can hang on Notion overlays)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.click(); el.focus(); }
  }, titleInfo.selector);
  await delay(500);
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await delay(100);
  await page.keyboard.type('CDP Screenshot Test', { delay: 20 });
  await delay(500);
  await snap(page, '02-title-set');

  // Step 4: Press Enter to go to body
  console.log('Step 4: Enter to body');
  await page.keyboard.press('Enter');
  await delay(1500);
  await snap(page, '03-in-body');

  // Check where we are now
  const bodyInfo = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      tag: active ? active.tagName : 'none',
      cls: active ? active.className.substring(0, 60) : '',
      editable: active ? active.getAttribute('contenteditable') : '',
      text: active ? active.textContent.substring(0, 30) : '',
    };
  });
  console.log('  Active element:', JSON.stringify(bodyInfo));

  // Step 5: Grant clipboard permission and paste
  console.log('Step 5: Paste HTML');
  const context = browser.defaultBrowserContext();
  try {
    await context.overridePermissions('https://www.notion.so', [
      'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write',
    ]);
  } catch (e) {
    console.log('  Permission error (non-fatal):', e.message);
  }

  const testHtml = `<h2>Test Heading</h2>
<p>This is <strong>bold</strong> and <em>italic</em> text with <code>inline code</code>.</p>
<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
<pre><code class="language-javascript">console.log("Hello from CDP!");</code></pre>
<blockquote>This is a blockquote</blockquote>`;

  try {
    await page.evaluate(async (html) => {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([html.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
      ]);
    }, testHtml);
    console.log('  Clipboard written');

    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');
    console.log('  Ctrl+V sent');

    await delay(3000);
    await snap(page, '04-after-paste');
  } catch (e) {
    console.log('  Paste error:', e.message);
    await snap(page, '04-paste-error');
  }

  // Step 6: Final
  await snap(page, '05-final');

  const blockCount = await page.evaluate(() => document.querySelectorAll('.notion-selectable').length);
  console.log('  Final block count:', blockCount);

  browser.disconnect();
  console.log('\nDone!');
}

async function snap(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  [snap] ${name}.png`);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(e => console.error('Error:', e.message));
