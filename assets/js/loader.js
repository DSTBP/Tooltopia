(() => {
  const markLoaded = () => {
    const root = document.documentElement;
    root.classList.add('is-loaded');
    root.classList.remove('is-loading');

    const loader = document.getElementById('page-loader');
    if (!loader) return;

    loader.setAttribute('aria-busy', 'false');
    setTimeout(() => {
      if (loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    }, 500);
  };

  const showPage = () => setTimeout(markLoaded, 0);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showPage, { once: true });
  } else {
    showPage();
  }
})();
