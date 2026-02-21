// Markdown to Notion-optimized HTML converter
const { Marked } = require('marked');

function convertMarkdownToHtml(markdownContent) {
  const instance = new Marked({ gfm: true, breaks: false });
  const html = instance.parse(markdownContent);
  return postProcessHtml(html);
}

/**
 * Insert a separator paragraph after </table> tags so Notion's paste handler
 * doesn't merge subsequent content into the table.
 */
function postProcessHtml(html) {
  return html.replace(/<\/table>/g, '</table>\n<p><br></p>');
}

module.exports = { convertMarkdownToHtml };
