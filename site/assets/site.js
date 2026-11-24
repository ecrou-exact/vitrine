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

  // Section list (examples): go to the chosen section, and follow the section being read.
  const sectionMenu = /** @type {HTMLSelectElement | null} */ (
    document.querySelector('[data-section-menu]')
  );
  if (sectionMenu) {
    const toc = document.getElementById('examples-toc');
    const groups = new Map();
    const sections = Array.from(sectionMenu.options, (option) => {
      let list = toc?.querySelector('ol');
      const group = option.closest('optgroup');
      if (list && group) {
        if (!groups.has(group)) {
          const item = document.createElement('li');
          const title = document.createElement('p');
          title.className = 'group';
          title.textContent = group.label;
          const children = document.createElement('ol');
          item.append(title, children);
          list.append(item);
          groups.set(group, children);
        }
        list = groups.get(group);
      }
      const link = document.createElement('a');
      link.setAttribute('href', `#${option.value}`);
      link.textContent = option.textContent;
      const item = document.createElement('li');
      item.append(link);
      list?.append(item);
      const section = document.getElementById(option.value);
      // A category jump should mark its first component before that demo reaches the top.
      const start =
        option === group?.firstElementChild
          ? (section?.closest('.example-category') ?? section)
          : section;
      return { id: option.value, section, start, link };
    }).filter((entry) => entry.section);
    if (toc) toc.hidden = sections.length === 0;
    const byId = new Map(sections.map((entry) => [entry.id, entry]));
    for (const entry of sections) {
      if (entry.start !== entry.section) {
        byId.set(entry.start.id, { ...entry, id: entry.start.id, section: entry.start });
      }
    }
    let current = null;
    let frame = 0;

    const followSection = () => {
      frame = 0;
      let next = sections[0];
      for (const entry of sections) {
        const offset = parseFloat(getComputedStyle(entry.start).scrollMarginTop) || 88;
        if (entry.start.getBoundingClientRect().top > offset + 8) break;
        next = entry;
      }
      if (document.activeElement !== sectionMenu) sectionMenu.value = next.id;
      if (current !== next) {
        current?.link.removeAttribute('aria-current');
        current = next;
        current.link.setAttribute('aria-current', 'location');
        if (toc?.getClientRects().length) {
          const bounds = toc.getBoundingClientRect();
          const item = current.link.getBoundingClientRect();
          if (item.top < bounds.top || item.bottom > bounds.bottom) {
            toc.scrollTop += item.top - bounds.top - (toc.clientHeight - item.height) / 2;
          }
        }
      }
    };
    const scheduleSection = () => {
      if (!frame && sections.length) frame = requestAnimationFrame(followSection);
    };
    const goToSection = (id, pushHistory = true) => {
      const entry = byId.get(id);
      if (!entry) return;
      if (pushHistory && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
      window.scrollTo({
        top:
          scrollY +
          entry.section.getBoundingClientRect().top -
          (parseFloat(getComputedStyle(entry.section).scrollMarginTop) || 88),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      const heading = entry.section.querySelector('h2, h3');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      scheduleSection();
    };
    sectionMenu.addEventListener('change', () => goToSection(sectionMenu.value));
    const onSectionClick = (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      event.preventDefault();
      goToSection(link.getAttribute('href').slice(1));
    };
    toc?.addEventListener('click', onSectionClick);
    document.querySelector('.example-categories')?.addEventListener('click', onSectionClick);
    addEventListener('scroll', scheduleSection, { passive: true });
    addEventListener('resize', scheduleSection, { passive: true });
    addEventListener('load', () => {
      if (location.hash) goToSection(location.hash.slice(1), false);
      else scheduleSection();
    });
    addEventListener('hashchange', () => goToSection(location.hash.slice(1), false));
    scheduleSection();
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
