// Configuration for MD-to-Notion CDP tool

const config = {
  chrome: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    cdpPort: 9222,
    cdpUrl: 'http://127.0.0.1:9222',
  },

  notion: {
    defaultUrl: 'https://www.notion.so/devload/30e40edd3a66800dbdd9d5062d381426',
  },

  selectors: {
    // Title area
    title: [
      'h1.content-editable-leaf-rtl[contenteditable="true"]',
      '.notion-page-block [placeholder="새 페이지"]',
      '.notion-page-block [placeholder="Untitled"]',
      '.notion-page-block .notranslate[contenteditable="true"]',
      '[data-content-editable-leaf="true"][contenteditable="true"]',
    ],
    // Content area (body)
    content: [
      '.notion-page-content',
      '.notion-selectable:last-child',
      '[data-content-editable-root="true"]',
    ],
    // Editable block area for clicking into
    editableBlock: [
      '.notion-page-content [data-content-editable-leaf="true"]',
      '.notion-page-content [contenteditable="true"]',
      '.notion-page-content .notranslate',
    ],
    // Individual blocks for counting
    block: '.notion-selectable',
    // Property rows
    propertyRow: '.notion-collection-property',
  },

  timeouts: {
    pageLoad: 15000,
    blockAppear: 5000,
    pasteSettle: 2000,
    betweenChunks: 1500,
    shortDelay: 300,
    mediumDelay: 800,
    longDelay: 1500,
  },

  chunking: {
    maxBlocks: 80,
    maxBytes: 400 * 1024, // 400KB
  },
};

module.exports = config;
