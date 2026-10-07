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
    '.section-head',
    '.components > .component',
    '.reasons > .reason',
    '.showcase',
    '.example-group > h2',
    '.example',
    '.integration',
    '.binding',
    '.builder > *',
    '.lab > *',
    '.site-footer .wrap > *',
  ].join(', ');

  if (motion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = /** @type {HTMLElement} */ (entry.target);
          observer.unobserve(el);
          el.classList.add('is-visible');
          // Once in place, hover transitions take over without the reveal delay.
          el.addEventListener(
            'transitionend',
            () => {
              el.removeAttribute('data-reveal');
              el.classList.remove('is-visible');
              el.style.removeProperty('--reveal-delay');
            },
            { once: true },
          );
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    for (const el of document.querySelectorAll(REVEAL)) {
      const element = /** @type {HTMLElement} */ (el);
      const index = Array.prototype.indexOf.call(element.parentElement?.children ?? [], element);
      const grid = element.matches('.component, .reason, .builder > *, .site-footer .wrap > *');
      if (grid) element.style.setProperty('--reveal-delay', `${Math.min(index % 3, 2) * 80}ms`);
      element.setAttribute('data-reveal', '');
      observer.observe(element);
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
