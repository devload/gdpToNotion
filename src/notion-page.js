// Notion page orchestrator: title, content, properties
const config = require('./config');
const { delay, scrollToBottom } = require('./wait-utils');
const { chunkHtml } = require('./chunker');

const SCREENSHOT_DIR = require('path').join(__dirname, '../screenshots');

async function screenshot(page, name) {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = require('path').join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[snap] ${name}.png`);
}

/**
 * Click an element via page.evaluate (avoids Notion overlay hang with page.click).
 */
async function evalClick(page, selector, description) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.click(); el.focus(); return true; }
    return false;
  }, selector);
  if (clicked) {
    console.log(`[notion] Clicked ${description} (${selector})`);
    await delay(config.timeouts.shortDelay);
  }
  return clicked;
}

/**
 * Find and click title using multiple selectors.
 */
async function clickTitle(page) {
  const selectors = config.selectors.title;
  for (const sel of selectors) {
    if (await evalClick(page, sel, 'title')) return true;
  }
  // Fallback: click first contenteditable
  return await page.evaluate(() => {
    const el = document.querySelector('[data-content-editable-leaf="true"]');
    if (el) { el.click(); el.focus(); return true; }
    return false;
  });
}

/**
 * Set the page title.
 */
async function setTitle(page, title) {
  console.log(`[notion] Setting title: "${title}"`);

  // Use real mouse click on the title element (evalClick doesn't reliably focus Notion title)
  const titleClicked = await page.evaluate(() => {
    const selectors = [
      'h1.content-editable-leaf-rtl[contenteditable="true"]',
      '.notion-page-block [placeholder]',
      '.notion-page-block .notranslate[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, sel };
      }
    }
    return null;
  });

  if (titleClicked) {
    await page.mouse.click(titleClicked.x, titleClicked.y);
    console.log(`[notion] Mouse-clicked title at (${Math.round(titleClicked.x)}, ${Math.round(titleClicked.y)})`);
  } else {
    await clickTitle(page);
  }
  await delay(config.timeouts.shortDelay);

  // Select all existing title text and replace
  await page.keyboard.down(config.modKey);
  await page.keyboard.press('a');
  await page.keyboard.up(config.modKey);
  await delay(100);
  await page.keyboard.press('Backspace');
  await delay(100);

  // Type title character by character (most reliable for Notion title)
  await page.keyboard.type(title, { delay: 15 });

  await delay(config.timeouts.shortDelay);
  await screenshot(page, 'step-title-set');

  // Press Enter to move to content area
  await page.keyboard.press('Enter');
  await delay(config.timeouts.mediumDelay);

  console.log('[notion] Title set');
}

/**
 * Focus the content/body area of the page.
 */
async function focusContentArea(page) {
  // Use real mouse click on the first content block (evaluate clicks don't activate Notion editor)
  const box = await page.evaluate(() => {
    const leaf = document.querySelector('.notion-page-content [data-content-editable-leaf="true"]');
    if (leaf) {
      const rect = leaf.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    const content = document.querySelector('.notion-page-content');
    if (content) {
      const rect = content.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 50 };
    }
    return null;
  });

  if (box) {
    await page.mouse.click(box.x, box.y);
    console.log(`[notion] Mouse-clicked content area at (${Math.round(box.x)}, ${Math.round(box.y)})`);
    await delay(config.timeouts.mediumDelay);
    return true;
  }

  console.warn('[notion] Could not focus content area');
  return false;
}

/**
 * Clear all existing content on the page.
 */
async function clearContent(page) {
  console.log('[notion] Clearing existing content...');

  // Scroll to top first
  await page.evaluate(() => {
    document.querySelectorAll('.notion-scroller').forEach(el => { el.scrollTop = 0; });
  });
  await delay(config.timeouts.mediumDelay);

  // Clear title first
  await clickTitle(page);
  await delay(config.timeouts.shortDelay);
  await page.keyboard.down(config.modKey);
  await page.keyboard.press('a');
  await page.keyboard.up(config.modKey);
  await delay(100);
  await page.keyboard.press('Backspace');
  await delay(config.timeouts.shortDelay);
  console.log('[notion] Title cleared');

  const countBlocks = () => page.evaluate(() =>
    document.querySelectorAll('.notion-page-content .notion-selectable').length
  );

  // Click a non-table text block to place cursor in editor
  const clickContentBlock = async () => {
    const pos = await page.evaluate(() => {
      const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
      for (const block of blocks) {
        const cls = block.className || '';
        if (cls.includes('notion-table') || cls.includes('notion-collection_view')) continue;
        const rect = block.getBoundingClientRect();
        if (rect.top > 0 && rect.top < window.innerHeight && rect.height > 5) {
          return { x: rect.x + 50, y: rect.y + rect.height / 2 };
        }
      }
      // Fallback: click any visible block
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (rect.top > 0 && rect.top < window.innerHeight) {
          return { x: rect.x + 50, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    });
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await delay(500);
      return true;
    }
    return false;
  };

  await clickContentBlock();

  // Phase 1: selectNodeContents to select all text content, then Backspace
  // This clears most blocks but tables may survive
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await countBlocks();
    if (before <= 1) break;

    await page.evaluate(() => {
      const content = document.querySelector('.notion-page-content');
      if (!content) return;
      const range = document.createRange();
      range.selectNodeContents(content);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await delay(config.timeouts.mediumDelay);

    await page.keyboard.press('Backspace');
    await delay(config.timeouts.longDelay);

    const after = await countBlocks();
    console.log(`[notion] Phase 1 attempt ${attempt}: ${before} → ${after} blocks`);
    if (after <= 1 || after === before) break;
  }

  // Phase 2: Raw CDP Ctrl+A to select remaining blocks (tables etc), then Backspace
  // Puppeteer's keyboard.press('a') doesn't trigger Notion's block-level select-all,
  // but raw CDP Input.dispatchKeyEvent does.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await countBlocks();
    if (before <= 1) break;

    // Click below the last block to place cursor outside any table
    const clicked = await page.evaluate(() => {
      const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
      if (blocks.length === 0) return null;
      const last = blocks[blocks.length - 1];
      const rect = last.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.bottom + 20 };
    });
    if (clicked) {
      await page.mouse.click(clicked.x, clicked.y);
      await delay(300);
    }
    // Escape to ensure we're not inside a table cell
    await page.keyboard.press('Escape');
    await delay(300);

    const client = await page.createCDPSession();
    await client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', modifiers: config.modBit, windowsVirtualKeyCode: 65,
      key: 'a', code: 'KeyA',
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'char', modifiers: config.modBit, text: '\x01',
      key: 'a', code: 'KeyA',
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp', modifiers: config.modBit, windowsVirtualKeyCode: 65,
      key: 'a', code: 'KeyA',
    });
    await delay(config.timeouts.mediumDelay);

    await page.keyboard.press('Backspace');
    await delay(config.timeouts.longDelay);
    await client.detach();

    const after = await countBlocks();
    console.log(`[notion] Phase 2 attempt ${attempt}: ${before} → ${after} blocks`);
    if (after <= 1 || after === before) break;
  }

  // Phase 3: Clear any leftover text in the remaining block(s)
  const remainingText = await page.evaluate(() => {
    const content = document.querySelector('.notion-page-content');
    return content ? (content.textContent || '').trim() : '';
  });
  if (remainingText) {
    console.log(`[notion] Phase 3: Remaining text found: "${remainingText.slice(0, 50)}"`);
    await clickContentBlock();
    await delay(config.timeouts.shortDelay);
    await page.keyboard.down(config.modKey);
    await page.keyboard.press('a');
    await page.keyboard.up(config.modKey);
    await delay(200);
    await page.keyboard.press('Backspace');
    await delay(config.timeouts.mediumDelay);
    console.log(`[notion] Phase 3: ${await countBlocks()} blocks after text clear`);
  }

  await screenshot(page, 'step-content-cleared');

  // Verify clear result: block count, title empty, AND content empty
  const finalBlocks = await countBlocks();
  const titleEmpty = await page.evaluate(() => {
    const selectors = [
      'h1.content-editable-leaf-rtl[contenteditable="true"]',
      '.notion-page-block [placeholder]',
      '.notion-page-block .notranslate[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return (el.textContent || '').trim() === '';
    }
    return true;
  });
  const contentEmpty = await page.evaluate(() => {
    const content = document.querySelector('.notion-page-content');
    return content ? (content.textContent || '').trim() === '' : true;
  });

  if (finalBlocks <= 1 && titleEmpty && contentEmpty) {
    console.log(`[notion] Clear verified: ${finalBlocks} block(s), title empty, content empty`);
    return true;
  }

  const issues = [];
  if (finalBlocks > 1) issues.push(`${finalBlocks} blocks remaining`);
  if (!titleEmpty) issues.push('title not cleared');
  if (!contentEmpty) issues.push('content text remaining');
  console.error(`[notion] Clear incomplete: ${issues.join(', ')}`);
  return false;
}

/**
 * Paste a single HTML chunk using Clipboard API + Ctrl+V.
 */
async function pasteHtmlChunk(page, html) {
  // Method 1: Dispatch synthetic ClipboardEvent (most reliable cross-platform)
  const pasted = await page.evaluate((htmlContent) => {
    const activeEl = document.activeElement;
    if (!activeEl) return false;

    const dt = new DataTransfer();
    dt.setData('text/html', htmlContent);
    dt.setData('text/plain', htmlContent.replace(/<[^>]*>/g, ''));

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    return activeEl.dispatchEvent(pasteEvent);
  }, html);

  if (!pasted) {
    // Fallback: Clipboard API + keyboard shortcut
    console.log('[notion] ClipboardEvent dispatch returned false, trying keyboard fallback');
    await page.evaluate(async (htmlContent) => {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([htmlContent.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
      ]);
    }, html);

    await page.keyboard.down(config.modKey);
    await page.keyboard.press('v');
    await page.keyboard.up(config.modKey);
  }

  await delay(config.timeouts.pasteSettle);
}

/**
 * Paste HTML content into the Notion page, chunking if necessary.
 */
async function pasteContent(page, html) {
  const chunks = chunkHtml(html);
  console.log(`[notion] Pasting ${chunks.length} chunk(s)`);

  // Grant clipboard permissions
  const browser = page.browser();
  const context = browser.defaultBrowserContext();
  try {
    await context.overridePermissions('https://www.notion.so', [
      'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write',
    ]);
  } catch {
    console.log('[notion] Clipboard permission override failed (non-fatal)');
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[notion] Pasting chunk ${i + 1}/${chunks.length} (${Buffer.byteLength(chunks[i], 'utf8')} bytes)`);

    // For first chunk, the cursor should already be in content area (after setTitle Enter or clearContent)
    // For subsequent chunks, position cursor at end using real mouse click
    if (i > 0) {
      await scrollToBottom(page);
      await delay(config.timeouts.shortDelay);

      // Position cursor at end of document for next chunk.
      // Strategy: click last text block → Ctrl+End → Enter to create a new empty block.
      // (clicking below blocks creates ghost blocks; clicking inside quotes merges content)
      const lastTextPos = await page.evaluate(() => {
        const blocks = document.querySelectorAll('.notion-page-content .notion-selectable');
        // Find last non-table text block
        for (let i = blocks.length - 1; i >= 0; i--) {
          const cls = blocks[i].className || '';
          if (cls.includes('notion-table') || cls.includes('notion-collection_view')) continue;
          const rect = blocks[i].getBoundingClientRect();
          if (rect.height > 0) {
            return { x: rect.x + 50, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      });

      if (lastTextPos) {
        await page.mouse.click(lastTextPos.x, lastTextPos.y);
        await delay(config.timeouts.shortDelay);
      }
      // Cmd+End (Mac) or Ctrl+End (Windows) moves cursor to absolute end of page content
      await page.keyboard.down(config.modKey);
      await page.keyboard.press('End');
      await page.keyboard.up(config.modKey);
      await delay(200);
      // Enter to exit current block context (quote, list, etc.) and create new empty block
      await page.keyboard.press('Enter');
      await delay(config.timeouts.shortDelay);
      console.log(`[notion] Cursor positioned at end of document`);
    }

    await pasteHtmlChunk(page, chunks[i]);
    await screenshot(page, `step-paste-chunk-${i + 1}`);

    if (i < chunks.length - 1) {
      await delay(config.timeouts.betweenChunks);
    }
  }

  await screenshot(page, 'step-paste-done');
  console.log('[notion] All content pasted');
  return true;
}

/**
 * Set a text property value on a database page.
 */
async function setProperty(page, key, value) {
  console.log(`[notion] Setting property: ${key} = ${value}`);

  const found = await page.evaluate((propKey) => {
    const rows = document.querySelectorAll('.notion-collection-property, [data-testid*="property"]');
    for (const row of rows) {
      if (row.textContent.includes(propKey)) {
        const valueEl = row.querySelector('[contenteditable="true"]') || row.querySelector('[role="button"]');
        if (valueEl) { valueEl.click(); return true; }
      }
    }
    return false;
  }, key);

  if (!found) {
    console.warn(`[notion] Property "${key}" not found`);
    return false;
  }

  await delay(config.timeouts.shortDelay);
  await page.keyboard.down(config.modKey);
  await page.keyboard.press('a');
  await page.keyboard.up(config.modKey);
  await page.keyboard.type(value, { delay: 10 });
  await page.keyboard.press('Enter');
  await delay(config.timeouts.shortDelay);

  console.log(`[notion] Property "${key}" set`);
  return true;
}

module.exports = {
  setTitle,
  clearContent,
  pasteContent,
  setProperty,
  focusContentArea,
  screenshot,
};
