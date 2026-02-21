// Debug: try multiple clear strategies with screenshots
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, '../screenshots');

async function run() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('notion.so'));

  const snap = async (name) => {
    await page.screenshot({ path: path.join(DIR, `dbg-${name}.png`), fullPage: false });
    console.log(`[snap] ${name}`);
  };
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const countBlocks = () => page.evaluate(() =>
    document.querySelectorAll('.notion-page-content .notion-selectable').length
  );

  // Scroll to top
  await page.evaluate(() => {
    document.querySelectorAll('.notion-scroller').forEach(el => { el.scrollTop = 0; });
  });
  await delay(1000);

  console.log(`\n=== 초기: ${await countBlocks()} blocks ===`);
  await snap('00-initial');

  // ---- Strategy A: window.getSelection() + range spanning all content ----
  console.log('\n=== Strategy A: selectNodeContents(.notion-page-content) ===');
  const target = await page.evaluate(() => {
    const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
    for (const block of blocks) {
      const cls = block.className || '';
      if (cls.includes('notion-table') || cls.includes('notion-collection_view')) continue;
      const rect = block.getBoundingClientRect();
      if (rect.top > 0 && rect.top < window.innerHeight && rect.height > 5) {
        return { x: rect.x + 50, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  });
  if (target) await page.mouse.click(target.x, target.y);
  await delay(500);

  await page.evaluate(() => {
    const content = document.querySelector('.notion-page-content');
    if (!content) return;
    const range = document.createRange();
    range.selectNodeContents(content);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await delay(800);
  await snap('A1-range-selected');

  await page.keyboard.press('Backspace');
  await delay(2000);
  console.log(`Strategy A result: ${await countBlocks()} blocks`);
  await snap('A2-after-backspace');

  // ---- Strategy B: first block click → Shift+Click last block ----
  console.log('\n=== Strategy B: 첫 블록 클릭 → Shift+마지막 블록 클릭 ===');
  const firstAndLast = await page.evaluate(() => {
    const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
    if (blocks.length < 2) return null;
    const first = blocks[0].getBoundingClientRect();
    const last = blocks[blocks.length - 1].getBoundingClientRect();
    return {
      first: { x: first.x + 50, y: first.y + first.height / 2 },
      last: { x: last.x + 50, y: last.y + last.height / 2 },
    };
  });

  if (firstAndLast) {
    // Scroll to top first
    await page.evaluate(() => {
      document.querySelectorAll('.notion-scroller').forEach(el => { el.scrollTop = 0; });
    });
    await delay(500);

    await page.mouse.click(firstAndLast.first.x, firstAndLast.first.y);
    await delay(500);
    await snap('B1-first-clicked');

    // Scroll to bottom
    await page.evaluate(() => {
      document.querySelectorAll('.notion-scroller').forEach(el => { el.scrollTop = el.scrollHeight; });
    });
    await delay(1000);

    // Get last block position after scroll
    const lastPos = await page.evaluate(() => {
      const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
      const last = blocks[blocks.length - 1].getBoundingClientRect();
      return { x: last.x + 50, y: last.y + last.height / 2 };
    });

    await page.keyboard.down('Shift');
    await page.mouse.click(lastPos.x, lastPos.y);
    await page.keyboard.up('Shift');
    await delay(800);
    await snap('B2-shift-clicked-last');

    await page.keyboard.press('Backspace');
    await delay(2000);
    console.log(`Strategy B result: ${await countBlocks()} blocks`);
    await snap('B3-after-backspace');
  }

  // ---- Strategy C: CDP Input.dispatchKeyEvent ----
  console.log('\n=== Strategy C: Raw CDP dispatchKeyEvent (Ctrl+A) ===');
  const t2 = await page.evaluate(() => {
    const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
    for (const block of blocks) {
      const cls = block.className || '';
      if (cls.includes('notion-table') || cls.includes('notion-collection_view')) continue;
      const rect = block.getBoundingClientRect();
      if (rect.top > 0 && rect.top < window.innerHeight && rect.height > 5) {
        return { x: rect.x + 50, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  });
  if (t2) await page.mouse.click(t2.x, t2.y);
  await delay(500);

  const client = await page.createCDPSession();

  // Send Ctrl+A via raw CDP twice with proper key event sequence
  for (let i = 0; i < 2; i++) {
    await client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65,
      key: 'a', code: 'KeyA',
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'char', modifiers: 2, text: '\x01', // Ctrl+A char
      key: 'a', code: 'KeyA',
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65,
      key: 'a', code: 'KeyA',
    });
    await delay(500);
    await snap(`C${i + 1}-cdp-ctrlA-${i + 1}`);
  }

  await page.keyboard.press('Backspace');
  await delay(2000);
  console.log(`Strategy C result: ${await countBlocks()} blocks`);
  await snap('C3-after-backspace');

  console.log('\n=== 완료 ===');
  await client.detach();
  browser.disconnect();
}

run().catch(e => console.error('Error:', e.message));
