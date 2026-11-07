/**
 * Shared website behavior: theme switch (synced with the components), mobile menu,
 * current page in the navigation. No innerHTML anywhere: the site runs under
 * enforced Trusted Types, like the pages it recommends.
 */
const root = document.documentElement;
const dark = matchMedia('(prefers-color-scheme: dark)');

/** @returns {'light' | 'dark'} */
function currentTheme() {
  const forced = root.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return dark.matches ? 'dark' : 'light';
}

function syncComponents() {
  // Components follow the site theme unless a theme attribute is set on them.
  window.Vitrine?.configure({ theme: root.dataset.theme ? currentTheme() : 'auto' });
  const button = document.querySelector('.theme-btn');
  if (button)
    button.setAttribute(
      'aria-label',
      currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    );
}

const motion = root.classList.contains('motion');

document.querySelector('.theme-btn')?.addEventListener('click', (event) => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const apply = () => {
    root.dataset.theme = next;
    try {
      localStorage.setItem('vitrine-site-theme', next);
    } catch {
      // Not persisted: fine.
    }
    syncComponents();
  };
  if (!motion || typeof document.startViewTransition !== 'function') {
    apply();
    return;
  }
  // The new theme spreads in a circle from the button.
  const button = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
  const x = button.left + button.width / 2;
  const y = button.top + button.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('theme-switching');
  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 520,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      ),
    )
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove('theme-switching'));
});
dark.addEventListener('change', syncComponents);

const menu = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');
menu?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open') ?? false;
  menu.setAttribute('aria-expanded', String(open));
});

const page = document.body.dataset.page;
document.querySelector(`.site-nav [data-nav="${page}"]`)?.setAttribute('aria-current', 'page');

syncComponents();

// ---------------------------------------------------------------- motion
// In a block: classic scripts share one global scope with the page scripts.
{
  const header = document.querySelector('.site-header');
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  header?.append(progress);

  let scrollFrame = 0;
  function onScroll() {
    scrollFrame = 0;
    header?.classList.toggle('scrolled', scrollY > 8);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--progress', String(max > 0 ? Math.min(1, scrollY / max) : 0));
  }
  addEventListener(
    'scroll',
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(onScroll);
    },
    { passive: true },
  );
  addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /** Blocks that rise in as they are reached. Siblings in a grid follow each other. */
  const REVEAL = [
    '.page-head > *',
    '.subnav',
    '.section-head',
    '.components > .component',
    '.reasons > .reason',
    '.showcase',
    '.install-tabs',
    '.example-group > h2',
    '.example',
    '.integration',
    '.binding',
    '.builder > *',
    '.playground > *',
    '.theme-grid > *',
    '.syntax-explorer > *',
    '.trials > .trial',
    '.lab > .verdict',
    '.docs-nav',
    '.docs-content',
    '.legal > .legal-card',
    '.site-footer .wrap > *',
  ].join(', ');
  /** Grids whose items follow each other. */
  const STAGGERED =
    '.component, .reason, .builder > *, .theme-grid > *, .trials > .trial, .page-head > *, .site-footer .wrap > *';

  if (motion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = /** @type {HTMLElement} */ (entry.target);
          observer.unobserve(el);
          el.classList.add('is-visible');
          // Once in place, hover transitions take over without the reveal delay.
          const done = () => {
            el.removeAttribute('data-reveal');
            el.classList.remove('is-visible');
            el.style.removeProperty('--reveal-delay');
          };
          el.addEventListener('transitionend', done, { once: true });
          setTimeout(done, 1600);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );
    const seen = new WeakSet();
    /** @param {Element} element */
    const register = (element) => {
      if (seen.has(element)) return;
      seen.add(element);
      const el = /** @type {HTMLElement} */ (element);
      if (el.matches(STAGGERED)) {
        const index = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el);
        el.style.setProperty('--reveal-delay', `${Math.min(index % 3, 2) * 80}ms`);
      }
      el.setAttribute('data-reveal', '');
      observer.observe(el);
    };
    for (const el of document.querySelectorAll(REVEAL)) register(el);
    // Galleries and lists built by page scripts after load.
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.matches(REVEAL)) register(node);
        }
      }
    }).observe(document.getElementById('main') ?? document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Section list (examples): go to the chosen section, and follow the section being read.
  const sectionMenu = /** @type {HTMLSelectElement | null} */ (
    document.querySelector('[data-section-menu]')
  );
  if (sectionMenu) {
    const ids = Array.from(sectionMenu.options, (option) => option.value);
    if (ids.includes(location.hash.slice(1))) sectionMenu.value = location.hash.slice(1);
    sectionMenu.addEventListener('change', () => {
      const section = document.getElementById(sectionMenu.value);
      if (!section) return;
      history.replaceState(null, '', `#${sectionMenu.value}`);
      section.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
    if ('IntersectionObserver' in window) {
      const visible = new Set();
      const spy = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target.id);
            else visible.delete(entry.target.id);
          }
          const current = ids.find((id) => visible.has(id));
          if (current && document.activeElement !== sectionMenu) sectionMenu.value = current;
        },
        { rootMargin: '-30% 0px -60% 0px' },
      );
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section) spy.observe(section);
      }
    }
  }

  // Section menus (examples, integrations): mark the section being read.
  const jumpLinks = Array.from(document.querySelectorAll('.jump a[href^="#"]'));
  if (jumpLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(jumpLinks.map((link) => [link.getAttribute('href')?.slice(1), link]));
    const visible = new Set();
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const current = jumpLinks.find((link) => visible.has(link.getAttribute('href')?.slice(1)));
        for (const link of jumpLinks) {
          if (link === current) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const id of byId.keys()) {
      const section = id ? document.getElementById(id) : null;
      if (section) spy.observe(section);
    }
  }
}

// ---------------------------------------------------------------- titles
// Section and page titles rise in word by word as they are reached.
{
  const titles = document.querySelectorAll(
    '.page-head h1, .section-head h2, .example-group > h2, .cta h2',
  );
  if (root.classList.contains('motion') && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          entry.target.classList.add('words-in');
        }
      },
      { threshold: 0.4 },
    );
    for (const title of titles) {
      let index = 0;
      // Only text nodes are split: inline elements (code) move as one word.
      for (const node of Array.from(title.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const parts = (node.nodeValue ?? '').split(/(\s+)/);
          const fragment = document.createDocumentFragment();
          for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              fragment.append(part);
              continue;
            }
            const word = document.createElement('span');
            word.className = 'word';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', String(index++));
            word.append(inner);
            fragment.append(word);
          }
          node.replaceWith(fragment);
        } else if (node instanceof HTMLElement) {
          const word = document.createElement('span');
          word.className = 'word';
          node.style.setProperty('--i', String(index++));
          node.replaceWith(word);
          word.append(node);
        }
      }
      title.classList.add('words');
      observer.observe(title);
    }
  }
}

// ---------------------------------------------------------------- back to top
{
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'to-top';
  button.setAttribute('aria-label', 'Back to top');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('class', 'to-top-track');
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('class', 'to-top-ring');
  for (const circle of [track, ring]) {
    circle.setAttribute('cx', '24');
    circle.setAttribute('cy', '24');
    circle.setAttribute('r', '21');
    circle.setAttribute('pathLength', '100');
  }
  const arrow = document.createElementNS(NS, 'path');
  arrow.setAttribute('d', 'M24 31V17M17 23l7-7 7 7');
  svg.append(track, ring, arrow);
  button.append(svg);
  document.body.append(button);
  button.addEventListener('click', () =>
    scrollTo({ top: 0, behavior: root.classList.contains('motion') ? 'smooth' : 'auto' }),
  );
  let pending = 0;
  const update = () => {
    pending = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const progress = max > 0 ? Math.min(1, scrollY / max) : 0;
    button.classList.toggle('shown', scrollY > 600);
    ring.style.strokeDashoffset = String(100 - progress * 100);
  };
  addEventListener(
    'scroll',
    () => {
      if (!pending) pending = requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

// ---------------------------------------------------------------- search
// Site-wide search over every page and docs section, with the library's own <vt-search>:
// Ctrl+K, ⌘K or "/" from anywhere.
{
  const header = document.querySelector('.site-header .wrap');
  const themeButton = document.querySelector('.theme-btn');
  const search = document.createElement('vt-search');
  search.className = 'site-search';
  search.setAttribute('index-src', 'assets/search-index.json');
  search.setAttribute('label', 'Search the site');
  search.setAttribute('placeholder', 'Search docs, examples and pages');
  search.setAttribute('shortcut', 'mod+k /');
  if (header && themeButton) header.insertBefore(search, themeButton);
}

// ---------------------------------------------------------------- typing
// Components on the site can type their content in, like a person writing it:
// `data-type-in="chars"` (code, Markdown) or `"lines"` (trees, tables, HTTP).
{
  const motion = root.classList.contains('motion');

  /**
   * Types text into a Vitrine element through its content property.
   *
   * @param {HTMLElement & { content: string }} element
   * @param {string} text
   * @param {'chars' | 'lines'} mode
   * @param {number} [duration] - Total time in milliseconds.
   * @returns {Promise<void>}
   */
  function typeInto(element, text, mode, duration = 1400) {
    if (!motion || !text) {
      element.content = text;
      return Promise.resolve();
    }
    const token = Symbol('typing');
    /** @type {any} */ (element).__typing = token;
    const lines = text.split('\n');
    const total = mode === 'lines' ? lines.length : text.length;
    const steps = Math.max(1, Math.min(total, Math.round(duration / 24)));
    let step = 0;
    element.classList.add('is-typing');
    return new Promise((resolve) => {
      const tick = () => {
        if (/** @type {any} */ (element).__typing !== token) return resolve();
        step += 1;
        const count = Math.ceil((total * step) / steps);
        element.content =
          mode === 'lines' ? lines.slice(0, count).join('\n') : text.slice(0, count);
        if (step < steps) setTimeout(tick, duration / steps);
        else {
          element.classList.remove('is-typing');
          resolve();
        }
      };
      element.content = '';
      setTimeout(tick, 80);
    });
  }
  /** @type {any} */ (window).siteTyping = { typeInto };

  if (motion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const element = /** @type {HTMLElement & { content: string }} */ (entry.target);
          const mode = element.dataset.typeIn === 'lines' ? 'lines' : 'chars';
          typeInto(element, element.content, mode, mode === 'lines' ? 900 : 1300);
        }
      },
      { threshold: 0.5 },
    );
    for (const element of document.querySelectorAll('[data-type-in]')) {
      // Wait until the element has read its inline content.
      customElements.whenDefined(element.localName).then(() => {
        if (/** @type {any} */ (element).content) observer.observe(element);
        else element.addEventListener('vt-ready', () => observer.observe(element), { once: true });
      });
    }
  }
}
