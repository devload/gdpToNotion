// Verifier: compare expected MD structure with actual Notion DOM structure
const { marked } = require('marked');

/**
 * Parse markdown content into expected block structure using marked.lexer().
 * Only counts top-level list items (Notion groups nested items under parent block).
 * Detects image-only paragraphs and marks them as 'image' type.
 */
function parseExpectedStructure(mdContent) {
  const tokens = marked.lexer(mdContent);
  const blocks = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        blocks.push({ type: 'heading', depth: token.depth, content: token.text.slice(0, 80) });
        break;
      case 'paragraph': {
        // Detect image-only paragraphs (![alt](url) or [![alt](img)](link))
        const subTokens = token.tokens || [];
        const isImageOnly = subTokens.length > 0 && subTokens.every(t =>
          t.type === 'image' ||
          (t.type === 'link' && t.tokens?.some(lt => lt.type === 'image'))
        );
        blocks.push({
          type: isImageOnly ? 'image' : 'paragraph',
          content: (token.text || '').slice(0, 80),
        });
        break;
      }
      case 'code':
        blocks.push({ type: 'code', content: (token.lang || '') + ' ' + token.text.slice(0, 80) });
        break;
      case 'blockquote':
        blocks.push({ type: 'blockquote', content: token.raw.slice(0, 80).trim() });
        break;
      case 'list':
        // Top-level items only — Notion groups nested items under parent block
        for (const item of token.items || []) {
          blocks.push({ type: 'list-item', content: item.text.split('\n')[0].slice(0, 80) });
        }
        break;
      case 'table':
        blocks.push({ type: 'table', rows: (token.rows?.length || 0) + 1 });
        break;
      case 'hr':
        blocks.push({ type: 'divider' });
        break;
      case 'space':
        break;
      default:
        if (token.text || token.raw) {
          blocks.push({ type: token.type, content: (token.text || token.raw || '').slice(0, 80) });
        }
        break;
    }
  }

  return blocks;
}

/**
 * Extract actual block structure from Notion DOM via page.evaluate().
 * Only captures top-level blocks (skips blocks nested inside other blocks).
 */
async function extractActualStructure(page) {
  return page.evaluate(() => {
    const typeMap = {
      'notion-header-block': 'heading',
      'notion-sub_header-block': 'heading',
      'notion-sub_sub_header-block': 'heading',
      'notion-text-block': 'paragraph',
      'notion-code-block': 'code',
      'notion-quote-block': 'blockquote',
      'notion-bulleted_list-block': 'list-item',
      'notion-numbered_list-block': 'list-item',
      'notion-to_do-block': 'todo',
      'notion-divider-block': 'divider',
      'notion-image-block': 'image',
      'notion-table-block': 'table',
      'notion-collection_view-block': 'table',
      'notion-table_row-block': 'table-row',
    };

    const container = document.querySelector('.notion-page-content');
    if (!container) return [];

    const allBlocks = container.querySelectorAll('.notion-selectable');
    const blocks = [];

    for (const el of allBlocks) {
      const classList = el.className || '';

      // Detect type
      let type = 'unknown';
      for (const [className, mappedType] of Object.entries(typeMap)) {
        if (classList.includes(className)) {
          type = mappedType;
          break;
        }
      }

      // Skip table-row blocks (part of table)
      if (type === 'table-row') continue;

      // Skip blocks nested inside another notion-selectable (e.g. table sub-blocks)
      const parent = el.parentElement?.closest('.notion-selectable');
      if (parent && container.contains(parent)) continue;

      const content = (el.textContent || '').trim().slice(0, 80);
      blocks.push({ type, content });
    }

    return blocks;
  });
}

/**
 * Compare expected and actual structures using look-ahead alignment.
 * When a mismatch occurs, searches ahead in both sequences to find the best
 * realignment point, preventing cascade errors from a single desync.
 * Returns { pass, mismatches, expectedCount, actualCount }.
 */
function compareStructures(expected, actual) {
  const mismatches = [];
  let ei = 0;
  let ai = 0;
  const LOOKAHEAD = 4;

  while (ei < expected.length && ai < actual.length) {
    const exp = expected[ei];
    const act = actual[ai];

    // Direct type match
    if (isCompatible(exp.type, act.type)) {
      ei++;
      ai++;
      continue;
    }

    // Skip unknown/empty actual blocks (Notion may add spacer blocks)
    if (act.type === 'unknown' || (act.type === 'paragraph' && act.content === '')) {
      ai++;
      continue;
    }

    // Look ahead to find best realignment point
    const realign = findRealignment(expected, actual, ei, ai, LOOKAHEAD);

    if (realign) {
      // Report critical issues for the mismatched pair at current position
      const critical = isCriticalMismatch(exp, act);
      if (critical) {
        mismatches.push({
          position: ai,
          expected: exp.type,
          actual: act.type,
          content: exp.content || act.content || '',
          rule: critical,
        });
      }
      // Jump to realignment point
      ei = realign.ei;
      ai = realign.ai;
    } else {
      // No realignment found — report if critical and advance both
      const critical = isCriticalMismatch(exp, act);
      if (critical) {
        mismatches.push({
          position: ai,
          expected: exp.type,
          actual: act.type,
          content: exp.content || act.content || '',
          rule: critical,
        });
      }
      ei++;
      ai++;
    }
  }

  // Only report missing blocks for critical types (heading, code, table)
  const criticalMissing = ['heading', 'code', 'table'];
  while (ei < expected.length) {
    if (criticalMissing.includes(expected[ei].type)) {
      mismatches.push({
        position: -1,
        expected: expected[ei].type,
        actual: '(없음)',
        content: expected[ei].content || '',
        rule: 'missing',
      });
    }
    ei++;
  }

  return {
    pass: mismatches.length === 0,
    mismatches,
    expectedCount: expected.length,
    actualCount: actual.length,
  };
}

/**
 * Find the best realignment point by looking ahead in both sequences.
 * Prefers fewer skips and more consecutive matches after realignment.
 * Returns { ei, ai } or null if no good realignment found.
 */
function findRealignment(expected, actual, ei, ai, maxLook) {
  let bestScore = -1;
  let best = null;

  for (let de = 0; de <= maxLook; de++) {
    for (let da = 0; da <= maxLook; da++) {
      if (de === 0 && da === 0) continue;
      const nei = ei + de;
      const nai = ai + da;
      if (nei >= expected.length || nai >= actual.length) continue;

      if (isCompatible(expected[nei].type, actual[nai].type)) {
        // Count consecutive matches from this realignment point
        let consecutive = 0;
        for (let k = 0; nei + k < expected.length && nai + k < actual.length; k++) {
          if (isCompatible(expected[nei + k].type, actual[nai + k].type)) {
            consecutive++;
          } else {
            break;
          }
        }
        // Score: more consecutive matches is better, fewer skips is better
        const score = consecutive * 10 - de - da;
        if (score > bestScore) {
          bestScore = score;
          best = { ei: nei, ai: nai };
        }
      }
    }
  }

  return best;
}

/**
 * Check if expected and actual types are compatible.
 */
function isCompatible(expType, actType) {
  if (expType === actType) return true;

  const compatMap = {
    'paragraph': ['paragraph', 'unknown', 'image'],
    'list-item': ['list-item', 'todo'],
    'heading': ['heading'],
    'code': ['code'],
    'blockquote': ['blockquote'],
    'table': ['table'],
    'divider': ['divider'],
    'html': ['paragraph', 'unknown'],
    'image': ['image', 'paragraph', 'unknown'],
  };

  const allowed = compatMap[expType];
  return allowed ? allowed.includes(actType) : false;
}

/**
 * Detect critical structural problems.
 * Returns rule name if critical, null otherwise.
 */
function isCriticalMismatch(exp, act) {
  // 테이블 밖 블록이 테이블 안으로 병합됨
  if (exp.type !== 'table' && act.type === 'table') {
    return 'table-merge';
  }
  // heading이 다른 타입으로 변환됨
  if (exp.type === 'heading' && act.type !== 'heading') {
    return 'heading-lost';
  }
  // 코드블록이 사라짐
  if (exp.type === 'code' && act.type !== 'code') {
    return 'code-lost';
  }
  // 인용문이 일반 텍스트로 변환됨
  if (exp.type === 'blockquote' && act.type === 'paragraph') {
    return 'quote-flattened';
  }
  return null;
}

/**
 * Print verification report to console.
 */
function printReport(result) {
  console.log('\n[verify] 검증 시작...');
  console.log(`[verify] 기대 블록: ${result.expectedCount}개, 실제 블록: ${result.actualCount}개`);

  if (result.pass) {
    console.log('[verify] PASS - 구조 일치');
  } else {
    for (let i = 0; i < result.mismatches.length; i++) {
      const m = result.mismatches[i];
      const pos = m.position >= 0 ? `위치 ${m.position}` : '누락';
      const rule = m.rule ? ` [${m.rule}]` : '';
      console.log(`[verify] MISMATCH #${i + 1}: ${pos} - 기대: ${m.expected}, 실제: ${m.actual}${rule}${m.content ? ` ("${m.content.slice(0, 50)}")` : ''}`);
    }
    console.log(`[verify] FAIL - ${result.mismatches.length}개 불일치 발견`);
  }
}

/**
 * Extract actual page title from Notion DOM.
 */
async function extractActualTitle(page) {
  return page.evaluate(() => {
    const selectors = [
      'h1.content-editable-leaf-rtl[contenteditable="true"]',
      '.notion-page-block [placeholder]',
      '.notion-page-block .notranslate[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || '').trim();
        return text || null;
      }
    }
    return null;
  });
}

/**
 * Main verify function: parse MD, extract Notion DOM, compare, report.
 * @param {object} options - Optional: { title: string } to verify title
 * Returns { pass, mismatches }.
 */
async function verify(page, mdContent, options = {}) {
  const expected = parseExpectedStructure(mdContent);
  const actual = await extractActualStructure(page);
  const result = compareStructures(expected, actual);

  // Title verification
  if (options.title) {
    const actualTitle = await extractActualTitle(page);
    if (!actualTitle) {
      result.mismatches.unshift({
        position: -1,
        expected: `title: "${options.title}"`,
        actual: '(타이틀 비어있음)',
        content: '',
        rule: 'title-missing',
      });
      result.pass = false;
    } else if (actualTitle !== options.title) {
      result.mismatches.unshift({
        position: -1,
        expected: `title: "${options.title}"`,
        actual: `title: "${actualTitle}"`,
        content: '',
        rule: 'title-mismatch',
      });
      result.pass = false;
    }
  }

  printReport(result);
  return result;
}

module.exports = { verify, parseExpectedStructure, extractActualStructure, compareStructures };
