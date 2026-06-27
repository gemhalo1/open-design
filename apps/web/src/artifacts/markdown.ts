import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

export function renderMarkdownToSafeHtml(markdown: string): string {
  return postProcessMarkdownHtml(micromark(escapeTableCodePipes(markdown), {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  }));
}

function escapeTableCodePipes(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.includes('|') || !line.includes('`')) return line;
      return line.replace(/`([^`]*\|[^`]*)`/g, (match, code: string) =>
        `\`${code.replace(/\|/g, '\\|')}\``,
      );
    })
    .join('\n');
}

function postProcessMarkdownHtml(html: string): string {
  let out = html.trim();
  out = out.replace(/>\n+</g, '><');
  out = out.replace(/<pre><code([^>]*)>([\s\S]*?)\n<\/code><\/pre>/g, '<pre><code$1>$2</code></pre>');
  out = out.replace(/<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/g, '<blockquote>$1</blockquote>');
  out = out.replace(/\salign="(left|center|right)"/g, ' style="text-align:$1"');
  out = out.replace(/<table>/g, '<div class="md-table-wrap"><table class="md-table">');
  out = out.replace(/<\/table>/g, '</table></div>');
  out = out.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_match, rawHref: string, body: string) => {
    const href = normalizeSafeHref(rawHref);
    if (!href) return body;
    const safeHref = escapeHtmlAttribute(href);
    const rel = safeHref.startsWith('#') ? '' : ' rel="noreferrer noopener" target="_blank"';
    return `<a href="${safeHref}"${rel}>${body}</a>`;
  });
  return out;
}

function normalizeSafeHref(href: string): string | null {
  const decoded = decodeHref(href);
  const stripped = decoded.replace(/[!"')}\],.;:\s]+$/, '');
  if (
    stripped.startsWith('#') ||
    stripped.startsWith('/') ||
    stripped.startsWith('./') ||
    stripped.startsWith('../') ||
    /^https?:\/\//i.test(stripped) ||
    /^mailto:/i.test(stripped)
  ) {
    return stripped;
  }
  return null;
}

function decodeHref(href: string): string {
  const htmlDecoded = href
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  try {
    return decodeURIComponent(htmlDecoded);
  } catch {
    return htmlDecoded;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
