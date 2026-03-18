(() => {
    const BOOTSTRAP_KEY = '__weylTranslateBootstrap__';
    if (window[BOOTSTRAP_KEY]) return;
    window[BOOTSTRAP_KEY] = true;

    const TRANSLATE_SRC = '../LightsOut/assets/js/translate.js';
    const HOST_SELECTOR = '[data-translate-host]';

    const getHost = () => {
        const host = document.querySelector(HOST_SELECTOR) || document.getElementById('translate');
        if (!host) return null;
        if (!host.id) host.id = 'translate';
        host.classList.add('language-selector');
        return host;
    };

    const isTranslateLibrary = translateApi => (
        translateApi &&
        typeof translateApi === 'object' &&
        typeof translateApi.version === 'string' &&
        translateApi.service &&
        typeof translateApi.service.use === 'function'
    );

    const configureTranslate = translateApi => {
        if (!isTranslateLibrary(translateApi)) return false;

        translateApi.service.use('client.edge');
        translateApi.language.setDefaultTo('chinese_simplified');
        translateApi.language.setLocal('chinese_simplified');
        translateApi.listener.start();
        translateApi.selectLanguageTag.show = true;
        if (typeof translateApi.setAutoDiscriminateLocalLanguage === 'function') {
            translateApi.setAutoDiscriminateLocalLanguage();
        }

        if (!translateApi.ignore) translateApi.ignore = {};
        if (!Array.isArray(translateApi.ignore.class)) {
            translateApi.ignore.class = [];
        }
        if (!translateApi.ignore.class.includes('no-translate')) {
            translateApi.ignore.class.push('no-translate');
        }
        return true;
    };

    const loadTranslateScript = () => {
        if (isTranslateLibrary(window.translate)) {
            return Promise.resolve(window.translate);
        }

        const existing = document.querySelector('script[data-translate-script="true"]');
        if (existing) {
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(window.translate), { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = TRANSLATE_SRC;
            script.async = true;
            script.dataset.translateScript = 'true';
            script.onload = () => resolve(window.translate);
            script.onerror = () => reject(new Error('translate.js failed to load'));
            document.head.appendChild(script);
        });
    };

    const syncTitleShadow = () => {
        const titles = document.querySelectorAll('h1[data-shadow]');
        titles.forEach(title => {
            if (title.dataset.shadowObserved === '1') {
                title.setAttribute('data-shadow', title.textContent.trim());
                return;
            }

            const observer = new MutationObserver(() => {
                const currentText = title.textContent.trim();
                const shadowText = title.getAttribute('data-shadow');
                if (currentText !== shadowText) {
                    title.setAttribute('data-shadow', currentText);
                }
            });

            observer.observe(title, {
                childList: true,
                characterData: true,
                subtree: true
            });

            title.dataset.shadowObserved = '1';
            title.setAttribute('data-shadow', title.textContent.trim());
        });
    };

    const syncSelectorSize = () => {
        const host = getHost();
        if (!host) return;

        const navActions = host.closest('.nav-actions') || document.querySelector('.nav-actions');
        const referenceBtn = navActions ? navActions.querySelector('.nav-btn:not(.language-selector)') : null;
        if (!referenceBtn) {
            host.style.removeProperty('min-width');
            host.style.removeProperty('min-height');
            host.style.removeProperty('height');
            return;
        }

        const rect = referenceBtn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const width = `${Math.ceil(rect.width)}px`;
            const height = `${Math.ceil(rect.height)}px`;
            host.style.setProperty('min-width', width, 'important');
            host.style.setProperty('min-height', height, 'important');
            host.style.setProperty('height', height, 'important');
        }
    };

    const init = () => {
        if (!getHost()) return;

        syncTitleShadow();
        syncSelectorSize();
        loadTranslateScript()
            .then(translateApi => {
                if (!configureTranslate(translateApi)) {
                    throw new Error('translate.js not ready');
                }
                translateApi.execute();
                setTimeout(syncSelectorSize, 50);
                setTimeout(() => {
                    const retryTranslate = window.translate;
                    if (isTranslateLibrary(retryTranslate)) {
                        retryTranslate.execute();
                    }
                }, 500);
                setTimeout(syncTitleShadow, 1000);
            })
            .catch(error => {
                console.warn('[WeylSequence] Translation bootstrap failed:', error);
            });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('resize', () => {
        syncSelectorSize();
    });

    window.addEventListener('load', () => {
        syncSelectorSize();
    }, { once: true });
})();
