// Wait utilities for Notion page interactions
const config = require('./config');

async function waitForNotionPage(page) {
  console.log('[wait] Waiting for Notion page to load...');

  // Wait for main content area to appear
  const contentSelectors = config.selectors.content;
  let found = false;

  for (const selector of contentSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: config.timeouts.pageLoad });
      console.log(`[wait] Page loaded (matched: ${selector})`);
      found = true;
      break;
    } catch {
      // Try next selector
    }
  }

  if (!found) {
    // Fallback: wait for any contenteditable element
    try {
      await page.waitForSelector('[contenteditable="true"]', {
        timeout: config.timeouts.pageLoad,
      });
      console.log('[wait] Page loaded (fallback: contenteditable found)');
      found = true;
    } catch {
      throw new Error('Notion page did not load within timeout');
    }
  }

  // Extra settle time for Notion's JS to initialize
  await delay(config.timeouts.mediumDelay);
}

async function waitForNewBlocks(page, previousCount, timeout) {
  const effectiveTimeout = timeout || config.timeouts.blockAppear;
  const selector = config.selectors.block;
  const startTime = Date.now();

  while (Date.now() - startTime < effectiveTimeout) {
    const currentCount = await page.$$eval(selector, (els) => els.length).catch(() => 0);
    if (currentCount > previousCount) {
      return currentCount;
    }
    await delay(200);
  }

  // Return current count even if no new blocks appeared
  return await page.$$eval(selector, (els) => els.length).catch(() => previousCount);
}

async function getBlockCount(page) {
  const selector = config.selectors.block;
  return await page.$$eval(selector, (els) => els.length).catch(() => 0);
}

async function scrollToBottom(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector('.notion-scroller') || document.documentElement;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await delay(config.timeouts.shortDelay);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  waitForNotionPage,
  waitForNewBlocks,
  getBlockCount,
  scrollToBottom,
  delay,
};
