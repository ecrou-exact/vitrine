// Applies the saved site theme before first paint (no flash). Kept tiny and blocking.
(() => {
  try {
    const saved = localStorage.getItem('vitrine-site-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
    // Storage unavailable (private mode): follow the system preference.
  }
})();
