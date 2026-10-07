// @ts-check
/**
 * Markdown to sanitized DOM.
 *
 * Pipeline: marked (GFM) → HTML string → DOMPurify (strict allow-list, inert document)
 * → DOM fragment → enrichment (heading ids, anchors, code highlighting, table wrappers).
 *
 * @module components/markdown/render
 */
import { Marked } from 'marked';
import { h } from '../../core/dom.js';
import {
  highlight,
  isLanguageLoaded,
  loadLanguage,
  resolveLanguage,
} from '../../core/highlighter.js';
import { icon } from '../../core/icons.js';
import { sanitizeHtml } from '../../core/security.js';

/** Maximum number of headings listed in the table of contents. */
const MAX_TOC_ENTRIES = 300;

/**
 * Escapes text for inclusion in HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parser that shows raw HTML as text (default). */
const textHtmlParser = new Marked({
  gfm: true,
  breaks: false,
  async: false,
  renderer: {
    html(token) {
      const escaped = escapeHtml(token.text);
      return token.block ? `<p>${escaped}</p>` : escaped;
    },
  },
});

/** Parser that keeps raw HTML (still sanitized afterwards). */
const rawHtmlParser = new Marked({ gfm: true, breaks: false, async: false });

/**
 * @typedef {object} MarkdownOptions
 * @property {boolean} allowHtml - Keep raw HTML (sanitized) instead of showing it as text.
 * @property {"allow"|"block"|"same-origin"} images
 * @property {"new-tab"|"same"} externalLinks
 * @property {string} [baseUrl] - Base for relative links and images.
 * @property {boolean} anchors - Add permalink anchors to headings.
 * @property {string} anchorLabel - Accessible label of anchors.
 * @property {string} tableLabel - Accessible label of scrollable tables without a caption.
 * @property {number} highlightLimit - Code blocks longer than this are not highlighted.
 * @property {() => void} onLanguageLoaded - Called when a lazy language finished loading.
 */

/**
 * @typedef {object} Heading
 * @property {number} level
 * @property {string} text
 * @property {string} id
 */

/**
 * @typedef {object} RenderedMarkdown
 * @property {DocumentFragment} fragment
 * @property {Heading[]} headings
 * @property {HTMLElement[]} codeBlocks - `.code-block` wrappers, for copy buttons.
 */

/**
 * Renders Markdown to sanitized DOM nodes.
 *
 * @param {string} markdown
 * @param {MarkdownOptions} options
 * @returns {RenderedMarkdown}
 */
export function renderMarkdown(markdown, options) {
  const parser = options.allowHtml ? rawHtmlParser : textHtmlParser;
  const token = randomToken();
  const html = withLineMarkers(parser, markdown, token);
  const fragment = sanitizeHtml(html, {
    images: options.images,
    externalLinks: options.externalLinks,
    baseUrl: options.baseUrl,
    lineMarkers: token,
  });
  const headings = processHeadings(fragment, options);
  const codeBlocks = processCodeBlocks(fragment, options);
  // Task list checkboxes are labelled by their item text (WCAG 4.1.2).
  for (const box of Array.from(fragment.querySelectorAll('li > input[type="checkbox"]'))) {
    const label = (box.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (label) box.setAttribute('aria-label', label);
  }
  for (const table of Array.from(fragment.querySelectorAll('table'))) {
    const caption = table.querySelector('caption')?.textContent?.trim();
    const wrapper = h('div', {
      class: 'table-wrap',
      attrs: { tabindex: '0', role: 'region', 'aria-label': caption || options.tableLabel },
    });
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
  return { fragment, headings, codeBlocks };
}

/**
 * Renders Markdown block by block and puts an empty marker before each block with the
 * line where it starts in the source. The split view uses the markers to keep source
 * and preview scrolled to the same place. The concatenated output is identical to a
 * whole-document parse: marked renders top-level tokens one after the other.
 *
 * @param {Marked} parser
 * @param {string} markdown
 * @param {string} token - Signs the markers (see sanitizeHtml `lineMarkers`).
 * @returns {string}
 */
function withLineMarkers(parser, markdown, token) {
  const tokens = parser.lexer(markdown);
  let line = 1;
  let html = '';
  for (const block of tokens) {
    if (block.type !== 'space' && block.type !== 'def') {
      html += `<span data-vt-line="${line}:${token}"></span>`;
    }
    // Reference links are stored on the token list: keep them for each block.
    html += parser.parser(Object.assign([block], { links: tokens.links }));
    line += (block.raw.match(/\n/g) ?? []).length;
  }
  return html;
}

/** @returns {string} A random token for this render. */
function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gives headings unique ids and optional permalink anchors.
 *
 * @param {DocumentFragment} root
 * @param {MarkdownOptions} options
 * @returns {Heading[]}
 */
function processHeadings(root, options) {
  /** @type {Heading[]} */
  const headings = [];
  /** @type {Map<string, number>} */
  const used = new Map();
  for (const heading of Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    const text = (heading.textContent ?? '').trim();
    const id = uniqueSlug(text, used);
    heading.id = id;
    heading.setAttribute('tabindex', '-1');
    if (headings.length < MAX_TOC_ENTRIES) {
      headings.push({ level: Number(heading.localName[1]), text: text.slice(0, 200), id });
    }
    if (options.anchors) {
      const anchor = h('a', {
        class: 'anchor',
        part: 'anchor',
        attrs: { href: `#${id}`, 'aria-label': `${options.anchorLabel}: ${text.slice(0, 100)}` },
      });
      anchor.append(icon('link'));
      heading.append(anchor);
    }
  }
  return headings;
}

/**
 * Builds a unique heading id (GitHub-compatible slug).
 *
 * @param {string} text
 * @param {Map<string, number>} used
 * @returns {string}
 */
export function uniqueSlug(text, used) {
  // Same rules as GitHub, so `page.md#section` links work on GitHub and in Vitrine.
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-')
      .slice(0, 100) || 'section';
  let slug = base;
  for (let n = used.get(base) ?? 0; used.has(slug); n += 1) {
    slug = `${base}-${n + 1}`;
    used.set(base, n + 1);
  }
  used.set(slug, used.get(slug) ?? 0);
  return slug;
}

/**
 * Highlights fenced code blocks and wraps them for the copy button.
 *
 * @param {DocumentFragment} root
 * @param {MarkdownOptions} options
 * @returns {HTMLElement[]}
 */
function processCodeBlocks(root, options) {
  /** @type {HTMLElement[]} */
  const blocks = [];
  for (const code of Array.from(root.querySelectorAll('pre > code'))) {
    const pre = /** @type {HTMLElement} */ (code.parentElement);
    const requested = /language-([\w#+.-]+)/.exec(code.className)?.[1] ?? '';
    const language = resolveLanguage(requested);
    const text = (code.textContent ?? '').replace(/\n$/, '');
    if (language && language !== 'plaintext' && text.length <= options.highlightLimit) {
      if (isLanguageLoaded(language)) {
        code.replaceChildren(highlight(text, language));
      } else {
        loadLanguage(language).then((ok) => ok && options.onLanguageLoaded());
      }
    }
    pre.setAttribute('tabindex', '0');
    const wrapper = h('div', {
      class: 'code-block',
      part: 'code-block',
      attrs: { 'data-language': language ?? '' },
    });
    pre.replaceWith(wrapper);
    wrapper.append(pre);
    blocks.push(wrapper);
  }
  return blocks;
}
