/**
 * Minimal markdown renderer for assistant replies.
 *
 * Only the constructs a chat reply actually uses are supported, and everything
 * is HTML-escaped first, so untrusted model output cannot inject markup.
 * Angular's sanitizer still runs on the result as a second layer.
 */

const INLINE_CODE = /`([^`]+)`/g;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /(^|[\s(])\*([^*\n]+)\*(?=[\s.,)]|$)/g;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function renderMarkdownLite(text: string): string {
  if (!text) return '';

  const blocks: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map(item => `<li>${item}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      list.push(renderInline(bullet[1]));
    } else if (numbered) {
      list.push(renderInline(numbered[1]));
    } else if (!line.trim()) {
      flushList();
    } else {
      flushList();
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        blocks.push(`<p class="md-heading">${renderInline(heading[2])}</p>`);
      } else {
        blocks.push(`<p>${renderInline(line)}</p>`);
      }
    }
  }
  flushList();

  return blocks.join('');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(INLINE_CODE, (_match, code: string) => `<code>${code}</code>`)
    .replace(BOLD, (_match, bold: string) => `<strong>${bold}</strong>`)
    .replace(ITALIC, (_match, lead: string, italic: string) => `${lead}<em>${italic}</em>`)
    .replace(
      LINK,
      (_match, label: string, href: string) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
