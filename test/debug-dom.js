const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('notion.so'));

  if (!page) {
    console.log('No Notion tab, creating one');
    page = await browser.newPage();
  }

  // Navigate to target page
  const targetUrl = 'https://www.notion.so/devload/30e40edd3a66800dbdd9d5062d381426';
  console.log('Navigating to target page...');
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 6000));

  const info = await page.evaluate(() => {
    const results = {};
    results.url = location.href;
    results.title = document.title;

    const contentEl = document.querySelector('.notion-page-content');
    results.hasContent = Boolean(contentEl);
    if (contentEl) {
      results.contentChildren = contentEl.children.length;
      // Get first few child tag names
      results.childTags = Array.from(contentEl.children).slice(0, 5).map(c => c.tagName + '.' + c.className.substring(0, 40));
    }

    const editables = document.querySelectorAll('[contenteditable="true"]');
    results.editableCount = editables.length;
    results.editables = Array.from(editables).slice(0, 8).map(el => ({
      tag: el.tagName,
      cls: el.className.substring(0, 60),
      text: el.textContent.substring(0, 40),
      ph: el.getAttribute('placeholder') || '',
      leaf: el.getAttribute('data-content-editable-leaf') || '',
    }));

    const blocks = document.querySelectorAll('.notion-selectable');
    results.blockCount = blocks.length;

    // Check for placeholders
    const phs = document.querySelectorAll('[placeholder]');
    results.placeholders = Array.from(phs).slice(0, 8).map(el => ({
      tag: el.tagName,
      ph: el.getAttribute('placeholder').substring(0, 60),
      editable: el.getAttribute('contenteditable') || '',
    }));

    return results;
  });

  console.log(JSON.stringify(info, null, 2));
  browser.disconnect();
})();
