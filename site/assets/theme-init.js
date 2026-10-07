// Applies the saved site theme before first paint (no flash), and turns site motion on
// when the system allows it. Kept tiny and blocking.
(() => {
  try {
    const saved = localStorage.getItem('vitrine-site-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
    // Storage unavailable (private mode): follow the system preference.
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    document.documentElement.classList.add('motion');
})();
