// HTML chunker: split large HTML into paste-friendly chunks
const { parse } = require('node-html-parser');
const config = require('./config');

/**
 * Split HTML into chunks respecting block limits and byte size.
 * Splits at semantic boundaries (h1-h3, hr) when possible.
 */
function chunkHtml(html) {
  const { maxBlocks, maxBytes } = config.chunking;
  const root = parse(html);
  const topLevelNodes = root.childNodes.filter(
    (n) => n.nodeType === 1 // Element nodes only
  );

  if (topLevelNodes.length === 0) {
    return [html];
  }

  const chunks = [];
  let currentNodes = [];
  let currentBlockCount = 0;
  let currentBytes = 0;

  for (let i = 0; i < topLevelNodes.length; i++) {
    const node = topLevelNodes[i];
    const prevNode = i > 0 ? topLevelNodes[i - 1] : null;
    const nodeHtml = node.outerHTML;
    const nodeBlocks = estimateBlockCount(node);
    const nodeBytes = Buffer.byteLength(nodeHtml, 'utf8');

    // Check if adding this node would exceed limits
    const wouldExceedBlocks = currentBlockCount + nodeBlocks > maxBlocks && currentNodes.length > 0;
    const wouldExceedBytes = currentBytes + nodeBytes > maxBytes && currentNodes.length > 0;

    // Don't split right after a table — keep table and its following content together
    // Check prev 2 nodes because postProcessHtml inserts a <p><br></p> separator after </table>
    const afterTable = isNearTable(topLevelNodes, i, 2);

    // Split at semantic boundaries (headings, hr) if current chunk is non-trivial
    const isSemanticBreak = isSplitPoint(node) && currentNodes.length > 0 && !afterTable;

    if (wouldExceedBlocks || wouldExceedBytes || (isSemanticBreak && currentBlockCount > maxBlocks / 2)) {
      chunks.push(currentNodes.map((n) => n.outerHTML).join('\n'));
      currentNodes = [];
      currentBlockCount = 0;
      currentBytes = 0;
    }

    currentNodes.push(node);
    currentBlockCount += nodeBlocks;
    currentBytes += nodeBytes;
  }

  // Flush remaining nodes
  if (currentNodes.length > 0) {
    chunks.push(currentNodes.map((n) => n.outerHTML).join('\n'));
  }

  console.log(`[chunker] Split into ${chunks.length} chunk(s)`);
  return chunks;
}

/**
 * Estimate how many Notion blocks a node will produce.
 */
function estimateBlockCount(node) {
  const tag = node.tagName?.toLowerCase();

  if (!tag) return 1;

  switch (tag) {
    case 'table': {
      const rows = node.querySelectorAll('tr');
      return 1 + rows.length; // Table header + rows
    }
    case 'ul':
    case 'ol': {
      const items = node.querySelectorAll('li');
      return items.length || 1;
    }
    case 'pre':
      return 1; // Code block is one block
    case 'blockquote':
      return 1;
    case 'hr':
      return 1;
    default:
      return 1; // p, h1-h6, etc.
  }
}

/**
 * Check if a node is a good split point.
 */
function isSplitPoint(node) {
  const tag = node.tagName?.toLowerCase();
  return ['h1', 'h2', 'h3', 'hr'].includes(tag);
}

/**
 * Check if a <table> exists within the previous N nodes.
 * Accounts for separator nodes inserted by postProcessHtml.
 */
function isNearTable(nodes, currentIdx, lookback) {
  for (let j = 1; j <= lookback && currentIdx - j >= 0; j++) {
    if (nodes[currentIdx - j].tagName?.toLowerCase() === 'table') return true;
  }
  return false;
}

module.exports = { chunkHtml };
