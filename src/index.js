#!/usr/bin/env node
// CLI entry point: MD file → Notion page via CDP

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { connectToChrome, findOrCreateNotionTab } = require('./browser');
const { convertMarkdownToHtml } = require('./markdown');
const { waitForNotionPage } = require('./wait-utils');
const { setTitle, clearContent, pasteContent, setProperty, screenshot } = require('./notion-page');
const { verify } = require('./verifier');

function parseArgs(argv) {
  const args = {
    mdFile: null,
    notionUrl: config.notion.defaultUrl,
    title: null,
    clear: false,
    verify: true,
    properties: [],
  };

  let i = 2; // skip node and script path
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--title' && argv[i + 1]) {
      args.title = argv[++i];
    } else if (arg === '--clear') {
      args.clear = true;
    } else if (arg === '--verify') {
      args.verify = true;
    } else if (arg === '--no-verify') {
      args.verify = false;
    } else if (arg === '--property' && argv[i + 1]) {
      args.properties.push(argv[++i]);
    } else if (!arg.startsWith('--')) {
      if (!args.mdFile) {
        args.mdFile = arg;
      } else {
        args.notionUrl = arg;
      }
    }
    i++;
  }

  return args;
}

function printUsage() {
  console.log(`
Usage: node src/index.js <md-file> [notion-url] [options]

Arguments:
  md-file       Path to Markdown file (required)
  notion-url    Notion page URL (default: configured URL)

Options:
  --title "제목"           Set page title
  --clear                  Clear existing content before pasting
  --verify                 구조 검증 실행 (기본값)
  --no-verify              검증 건너뛰기
  --property "Key=Value"   Set a property value (can repeat)

Prerequisites:
  Chrome must be running with: --remote-debugging-port=${config.chrome.cdpPort}
  You must be logged into Notion in that Chrome instance.

Example:
  node src/index.js README.md --clear --title "My Document"
  node src/index.js doc.md https://notion.so/page/abc123 --title "Test"
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.mdFile) {
    printUsage();
    process.exit(1);
  }

  // Resolve MD file path
  const mdPath = path.resolve(args.mdFile);
  if (!fs.existsSync(mdPath)) {
    console.error(`Error: File not found: ${mdPath}`);
    process.exit(1);
  }

  console.log(`[main] Reading: ${mdPath}`);
  const mdContent = fs.readFileSync(mdPath, 'utf8');

  // Convert MD to HTML
  console.log('[main] Converting Markdown to HTML...');
  const html = convertMarkdownToHtml(mdContent);
  console.log(`[main] HTML generated (${Buffer.byteLength(html, 'utf8')} bytes)`);

  // Connect to Chrome
  let browser;
  try {
    browser = await connectToChrome();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  try {
    // Find or create Notion tab
    const page = await findOrCreateNotionTab(browser, args.notionUrl);

    // Wait for page to fully load
    await waitForNotionPage(page);

    // Clear content if requested (before setting title, as clear wipes title too)
    if (args.clear) {
      const cleared = await clearContent(page);
      if (!cleared) {
        console.warn('[main] Warning: 페이지가 완전히 비워지지 않았습니다. 계속 진행합니다.');
      }
    }

    // Set title if provided (after clear so it's not wiped)
    if (args.title) {
      await setTitle(page, args.title);
    }

    // Paste content
    const success = await pasteContent(page, html);

    // Set properties if any
    for (const prop of args.properties) {
      const eqIdx = prop.indexOf('=');
      if (eqIdx > 0) {
        const key = prop.substring(0, eqIdx).trim();
        const value = prop.substring(eqIdx + 1).trim();
        await setProperty(page, key, value);
      }
    }

    // Run structure verification
    if (success && args.verify) {
      const result = await verify(page, mdContent, { title: args.title });
      if (!result.pass) {
        console.warn(`\n[main] Warning: ${result.mismatches.length}개 구조 불일치 발견 (붙여넣기 자체는 완료됨)`);
      }
    }

    if (success) {
      console.log('\n[main] Done! Content has been pasted to Notion.');
    } else {
      console.error('\n[main] Some content may not have been pasted correctly.');
      process.exit(1);
    }
  } finally {
    // Don't close the browser - we're connecting to user's existing Chrome
    browser.disconnect();
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err.message);
  process.exit(1);
});
