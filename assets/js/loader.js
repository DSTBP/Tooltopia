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

  if (document.readyState === 'complete') {
    markLoaded();
  } else {
    window.addEventListener('load', markLoaded, { once: true });
  }
})();
