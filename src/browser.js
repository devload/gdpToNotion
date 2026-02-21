// Chrome CDP connection management
const puppeteer = require('puppeteer-core');
const config = require('./config');

async function connectToChrome() {
  const cdpUrl = config.chrome.cdpUrl;

  try {
    const browser = await puppeteer.connect({
      browserURL: cdpUrl,
      defaultViewport: null,
    });
    console.log('[browser] Connected to Chrome via CDP');
    return browser;
  } catch (err) {
    console.error(`[browser] Failed to connect to Chrome at ${cdpUrl}`);
    console.error('[browser] Make sure Chrome is running with:');
    console.error(`  "${config.chrome.executablePath}" --remote-debugging-port=${config.chrome.cdpPort}`);
    throw new Error(`CDP connection failed: ${err.message}`);
  }
}

async function findOrCreateNotionTab(browser, notionUrl) {
  const pages = await browser.pages();

  // Try to find an existing Notion tab with the target URL
  for (const page of pages) {
    const url = page.url();
    if (url.includes('notion.so')) {
      // Extract page ID from both URLs to compare
      const targetId = extractPageId(notionUrl);
      const currentId = extractPageId(url);
      if (targetId && currentId && targetId === currentId) {
        console.log('[browser] Found existing Notion tab with target page');
        await page.bringToFront();
        return page;
      }
    }
  }

  // Try to find any Notion tab and navigate it
  for (const page of pages) {
    if (page.url().includes('notion.so')) {
      console.log('[browser] Found Notion tab, navigating to target page');
      await page.goto(notionUrl, { waitUntil: 'domcontentloaded', timeout: config.timeouts.pageLoad });
      return page;
    }
  }

  // Create a new tab
  console.log('[browser] No Notion tab found, creating new one');
  const page = await browser.newPage();
  await page.goto(notionUrl, { waitUntil: 'domcontentloaded', timeout: config.timeouts.pageLoad });
  return page;
}

function extractPageId(url) {
  // Notion URLs end with a 32-char hex ID (with or without dashes)
  const match = url.match(/([a-f0-9]{32})\s*$/);
  if (match) return match[1];

  // Try with dashes: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const dashMatch = url.match(/([a-f0-9-]{36})\s*$/);
  if (dashMatch) return dashMatch[1].replace(/-/g, '');

  // Fallback: extract last path segment
  const pathMatch = url.match(/\/([^/?#]+)(?:\?|#|$)/);
  if (pathMatch) return pathMatch[1];

  return null;
}

module.exports = { connectToChrome, findOrCreateNotionTab };
