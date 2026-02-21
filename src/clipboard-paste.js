// HTML clipboard paste with 3-level fallback for Notion
const config = require('./config');
const { delay, waitForNewBlocks, getBlockCount } = require('./wait-utils');

/**
 * Paste HTML into the currently focused Notion block.
 * Tries 3 methods in sequence until one succeeds.
 */
async function pasteHtmlToNotion(page, html) {
  const methods = [
    { name: 'ClipboardEvent dispatch', fn: pasteViaClipboardEvent },
    { name: 'Clipboard API + Ctrl+V', fn: pasteViaClipboardApi },
    { name: 'CDP Input.dispatchKeyEvent', fn: pasteViaCdpKeyEvent },
  ];

  for (const method of methods) {
    console.log(`[paste] Trying: ${method.name}`);
    const beforeCount = await getBlockCount(page);

    try {
      await method.fn(page, html);
      await delay(config.timeouts.pasteSettle);

      const afterCount = await waitForNewBlocks(page, beforeCount, config.timeouts.blockAppear);
      if (afterCount > beforeCount) {
        console.log(`[paste] Success with ${method.name} (${afterCount - beforeCount} new blocks)`);
        return true;
      }
      console.log(`[paste] ${method.name}: no new blocks detected, trying next method`);
    } catch (err) {
      console.log(`[paste] ${method.name} failed: ${err.message}`);
    }
  }

  console.warn('[paste] All paste methods failed');
  return false;
}

/**
 * Method A: Synthetic ClipboardEvent dispatch
 */
async function pasteViaClipboardEvent(page, html) {
  await page.evaluate((htmlContent) => {
    const activeEl = document.activeElement;
    if (!activeEl) throw new Error('No active element');

    const dt = new DataTransfer();
    dt.setData('text/html', htmlContent);
    dt.setData('text/plain', htmlContent.replace(/<[^>]*>/g, ''));

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    activeEl.dispatchEvent(pasteEvent);
  }, html);
}

/**
 * Method B: Write to Clipboard API then trigger Ctrl+V
 */
async function pasteViaClipboardApi(page, html) {
  // Write HTML to clipboard via browser API
  await page.evaluate(async (htmlContent) => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const plainBlob = new Blob([htmlContent.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
    const item = new ClipboardItem({
      'text/html': blob,
      'text/plain': plainBlob,
    });
    await navigator.clipboard.write([item]);
  }, html);

  // Simulate Ctrl+V
  await page.keyboard.down('Control');
  await page.keyboard.press('v');
  await page.keyboard.up('Control');
}

/**
 * Method C: CDP-level key event dispatch
 */
async function pasteViaCdpKeyEvent(page, html) {
  // Set clipboard content first
  await page.evaluate(async (htmlContent) => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const plainBlob = new Blob([htmlContent.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
    const item = new ClipboardItem({
      'text/html': blob,
      'text/plain': plainBlob,
    });
    await navigator.clipboard.write([item]);
  }, html);

  // Use CDP Input.dispatchKeyEvent for Ctrl+V
  const cdpSession = await page.createCDPSession();

  await cdpSession.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: 2, // Ctrl
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
  });

  await cdpSession.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
  });

  await cdpSession.detach();
}

module.exports = { pasteHtmlToNotion };
