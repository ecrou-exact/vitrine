/**
 * Docs page: renders docs/<page>.md with <vt-markdown>. Only pages listed in the
 * sidebar can be loaded; links between Markdown files stay inside the site.
 */
const doc = document.getElementById('doc');
const links = Array.from(document.querySelectorAll('.docs-nav a[data-page]'));
const pages = new Set(links.map((link) => link.dataset.page));
const DEFAULT_PAGE = 'getting-started';

/** @param {string | null} page */
function show(page) {
  const name = page && pages.has(page) ? page : DEFAULT_PAGE;
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

/** Scrolls to a heading inside the rendered document once it is ready. */
function scrollToSection(hash) {
  if (!hash) return;
  const id = decodeURIComponent(hash.slice(1));
  const reveal = () => {
    const target = doc.shadowRoot?.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  };
  doc.addEventListener('vt-ready', reveal, { once: true });
}

function navigate(page, hash = '') {
  scrollToSection(hash);
  const name = show(page);
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

window.addEventListener('popstate', () => show(new URLSearchParams(location.search).get('page')));
scrollToSection(location.hash);
show(new URLSearchParams(location.search).get('page'));
