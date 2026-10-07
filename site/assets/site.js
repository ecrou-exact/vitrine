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

document.querySelector('.theme-btn')?.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('vitrine-site-theme', next);
  } catch {
    // Not persisted: fine.
  }
  syncComponents();
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
