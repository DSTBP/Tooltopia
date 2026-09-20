(() => {
  let loaded = false;

  const markLoaded = () => {
    if (loaded) return;
    loaded = true;

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

  const waitForTranslate = () => {
    const host = document.querySelector('[data-translate-host]');
    if (!host) {
      markLoaded();
      return;
    }

    const isLanguageListReady = () => Boolean(host.querySelector('select'));
    if (isLanguageListReady()) {
      markLoaded();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!isLanguageListReady()) return;
      observer.disconnect();
      markLoaded();
    });

    observer.observe(host, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForTranslate, { once: true });
  } else {
    waitForTranslate();
  }
})();
