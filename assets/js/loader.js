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

  const waitForTranslate = done => {
    const host = document.querySelector('[data-translate-host]');
    if (!host) {
      done();
      return;
    }

    const start = Date.now();
    const timeoutMs = 6000;

    const isTranslateReady = () => {
      const translateApi = window.translate;
      const hasApi =
        translateApi &&
        typeof translateApi === 'object' &&
        typeof translateApi.version === 'string' &&
        translateApi.service &&
        typeof translateApi.service.use === 'function';
      const hasSelect = document.querySelector('#translate select');
      return Boolean(hasApi && hasSelect);
    };

    const check = () => {
      if (isTranslateReady() || Date.now() - start > timeoutMs) {
        done();
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  };

  const onLoad = () => {
    waitForTranslate(markLoaded);
  };

  if (document.readyState === 'complete') {
    onLoad();
  } else {
    window.addEventListener('load', onLoad, { once: true });
  }
})();
