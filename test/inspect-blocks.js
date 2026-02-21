const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('notion.so'));

  const blocks = await page.evaluate(() => {
    const typeMap = {
      'notion-header-block': 'H1',
      'notion-sub_header-block': 'H2',
      'notion-sub_sub_header-block': 'H3',
      'notion-text-block': 'P',
      'notion-code-block': 'CODE',
      'notion-quote-block': 'QUOTE',
      'notion-bulleted_list-block': 'UL',
      'notion-numbered_list-block': 'OL',
      'notion-to_do-block': 'TODO',
      'notion-divider-block': 'HR',
      'notion-image-block': 'IMG',
      'notion-table-block': 'TABLE',
      'notion-collection_view-block': 'TABLE',
    };
    const container = document.querySelector('.notion-page-content');
    if (!container) return [];
    const allBlocks = container.querySelectorAll('.notion-selectable');
    const result = [];
    for (const el of allBlocks) {
      const cls = el.className || '';
      let type = '?';
      for (const [cn, t] of Object.entries(typeMap)) {
        if (cls.includes(cn)) { type = t; break; }
      }
      const parent = el.parentElement?.closest('.notion-selectable');
      if (parent && container.contains(parent)) continue;
      const text = (el.textContent || '').trim().slice(0, 60);
      result.push(type + ': ' + text);
    }
    return result;
  });

  console.log('Total blocks:', blocks.length);
  blocks.forEach((b, i) => console.log(i + ': ' + b));
  browser.disconnect();
})();
