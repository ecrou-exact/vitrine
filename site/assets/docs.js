/**
 * Docs page: renders docs/<page>.md with <vt-markdown>. Only pages listed in the
 * sidebar can be loaded; links between Markdown files stay inside the site.
 */
const doc = document.getElementById('doc');
const links = Array.from(document.querySelectorAll('.docs-nav a[data-page]'));
const pages = new Set(links.map((link) => link.dataset.page));
const DEFAULT_PAGE = 'getting-started';
const toc = document.getElementById('doc-toc');
const tocList = toc.querySelector('ol');
const preview = document.getElementById('doc-preview');
const previewCanvas = document.getElementById('doc-preview-canvas');
let previewTemplate = null;
let sections = [];
let activeLink = null;
let scrollFrame = 0;
let currentPage = null;
let pendingHash = null;

/** Reset the disclosure on page changes; mount its live demo only when opened. */
function showPreview(page) {
  const name = page.startsWith('components/') ? page.slice('components/'.length) : '';
  previewTemplate = document.getElementById(`doc-preview-${name}`);
  preview.open = false;
  preview.hidden = !previewTemplate;
  previewCanvas.replaceChildren();
  document.getElementById('doc-preview-name').textContent = name ? `<vt-${name}>` : '';
  document.getElementById('doc-preview-title').textContent =
    previewTemplate?.dataset.title ?? 'Result';
  document.getElementById('doc-preview-link').setAttribute('href', `examples.html#${name}`);
}

preview.addEventListener('toggle', () => {
  if (preview.open && previewTemplate && !previewCanvas.hasChildNodes()) {
    previewCanvas.append(previewTemplate.content.cloneNode(true));
  }
  scheduleCurrentSection();
});

/** Reveals a title inside the shadow root, leaving room for the fixed header. */
function revealSection(hash, behavior = 'instant') {
  if (!hash) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const target = doc.shadowRoot?.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) return;
  // Entrance transforms must finish before measuring a title's final position.
  for (const element of [doc, doc.parentElement]) {
    for (const animation of element.getAnimations()) animation.finish();
  }
  window.scrollTo({
    top: window.scrollY + target.getBoundingClientRect().top - 104,
    behavior,
  });
  target.focus({ preventScroll: true });
  scheduleCurrentSection();
}

/** Both the sidebar and the article's title links use the same section navigation. */
function visitSection(hash) {
  if (location.hash !== hash) history.pushState(history.state, '', hash);
  revealSection(
    hash,
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  );
}

/** Keeps the current section visible inside the sidebar without scrolling the page. */
function updateCurrentSection() {
  scrollFrame = 0;
  let current = sections[0];
  for (const section of sections) {
    if (section.heading.getBoundingClientRect().top > 112) break;
    current = section;
  }
  if (!current || current.link === activeLink) return;
  activeLink?.removeAttribute('aria-current');
  activeLink = current.link;
  activeLink.setAttribute('aria-current', 'location');
  if (!toc.getClientRects().length) return;
  const bounds = toc.getBoundingClientRect();
  const item = activeLink.getBoundingClientRect();
  if (item.top < bounds.top || item.bottom > bounds.bottom) {
    toc.scrollTop += item.top - bounds.top - (toc.clientHeight - item.height) / 2;
  }
}

function scheduleCurrentSection() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateCurrentSection);
}

// Rebuild from the component's own TOC so its labels, anchors and nesting stay in sync.
doc.addEventListener('vt-ready', () => {
  const source = doc.shadowRoot?.querySelector('[part="toc"] ol');
  tocList.replaceChildren(
    ...(source ? Array.from(source.children, (item) => item.cloneNode(true)) : []),
  );
  sections = Array.from(tocList.querySelectorAll('a'), (link) => ({
    link,
    heading: doc.shadowRoot.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))),
  })).filter((section) => section.heading);
  toc.hidden = sections.length === 0;
  activeLink = null;
  toc.scrollTop = 0;
  if (pendingHash !== null) {
    revealSection(pendingHash);
    pendingHash = null;
  }
  scheduleCurrentSection();
});

toc.addEventListener('click', (event) => {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.button !== 0
  )
    return;
  const link = event.target.closest('a');
  const section = sections.find((section) => section.link === link);
  if (!section) return;
  event.preventDefault();
  visitSection(link.getAttribute('href'));
});

// Capture fragment links before the Markdown component handles them, including
// heading permalinks and the inline TOC on small screens.
doc.addEventListener(
  'click',
  (event) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    )
      return;
    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    const hash = anchor?.getAttribute('href');
    if (!hash?.startsWith('#')) return;
    event.preventDefault();
    visitSection(hash);
  },
  { capture: true },
);

window.addEventListener('scroll', scheduleCurrentSection, { passive: true });
window.addEventListener('resize', scheduleCurrentSection, { passive: true });

/** @param {string | null} page */
function show(page, hash = '') {
  const name = page && pages.has(page) ? page : DEFAULT_PAGE;
  if (name === currentPage) {
    revealSection(hash);
    return name;
  }
  currentPage = name;
  pendingHash = hash;
  showPreview(name);
  doc.setAttribute('src', `docs/${name}.md`);
  for (const link of links) {
    if (link.dataset.page === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // The new page rises in once rendered.
  doc.addEventListener(
    'vt-ready',
    () => {
      doc.classList.remove('switching');
      void doc.offsetWidth;
      doc.classList.add('switching');
    },
    { once: true },
  );
  const label = links.find((link) => link.dataset.page === name)?.textContent ?? 'Docs';
  document.title = `${label} — Vitrine docs`;
  return name;
}

/** Maps a URL of a Markdown file inside docs/ to a page name and section, or null. */
function pageFromUrl(href) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return null;
  const match = /\/docs\/(.+)\.md$/.exec(url.pathname);
  return match && pages.has(match[1]) ? { page: match[1], hash: url.hash } : null;
}

function navigate(page, hash = '') {
  const name = show(page, hash);
  history.pushState({ page: name }, '', `docs.html?page=${encodeURIComponent(name)}${hash}`);
  if (!hash) window.scrollTo({ top: 0 });
}

for (const link of links) {
  link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(link.dataset.page);
  });
}

// Links inside the rendered Markdown live in the shadow root: read the composed path.
doc.addEventListener('click', (event) => {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.button !== 0
  )
    return;
  const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
  const target = anchor ? pageFromUrl(anchor.href) : null;
  if (!target) return;
  event.preventDefault();
  navigate(target.page, target.hash);
});

window.addEventListener('popstate', () =>
  show(new URLSearchParams(location.search).get('page'), location.hash),
);
window.addEventListener('hashchange', () => revealSection(location.hash));
show(new URLSearchParams(location.search).get('page'), location.hash);
