(() => {
    const SELECTORS = [
        '#translate',
        '.translate_selectLanguage_tag',
        '[id="translate"]',
        'div[id="translate"]'
    ];

    const hasTranslate = () => typeof window.translate !== 'undefined';

    const configureTranslate = () => {
        translate.service.use('client.edge');
        translate.language.setDefaultTo('chinese_simplified');
        translate.language.setLocal('chinese_simplified');
        translate.listener.start();
        translate.selectLanguageTag.show = true;
        translate.setAutoDiscriminateLocalLanguage();

        if (!translate.ignore) translate.ignore = {};
        if (!Array.isArray(translate.ignore.class)) {
            translate.ignore.class = [];
        }
        if (!translate.ignore.class.includes('no-translate')) {
            translate.ignore.class.push('no-translate');
        }
    };

    const forceLanguageSelectorStyle = () => {
        SELECTORS.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                element.style.setProperty('position', 'fixed', 'important');
                element.style.setProperty('top', '20px', 'important');
                element.style.setProperty('right', '20px', 'important');
                element.style.setProperty('z-index', '9999', 'important');
                element.style.setProperty('background', 'rgba(255, 255, 255, 0.15)', 'important');
                element.style.setProperty('color', 'white', 'important');
                element.style.setProperty('padding', '0', 'important');
                element.style.setProperty('border-radius', '20px', 'important');
                element.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.3)', 'important');
                element.style.setProperty('backdrop-filter', 'blur(10px)', 'important');
                element.style.setProperty('cursor', 'pointer', 'important');
                element.style.setProperty('font-size', '0.9rem', 'important');
                element.style.setProperty('font-family', "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", 'important');
                element.style.setProperty('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.15)', 'important');
                element.style.setProperty('transition', 'all 0.3s ease', 'important');
                element.style.setProperty('display', 'inline-block', 'important');
                element.style.setProperty('margin', '0', 'important');
                element.style.setProperty('min-width', '120px', 'important');
                element.style.setProperty('height', '36px', 'important');
                element.style.setProperty('overflow', 'visible', 'important');

                const selectEl = element.querySelector('select');
                if (selectEl) {
                    selectEl.style.setProperty('background', 'transparent', 'important');
                    selectEl.style.setProperty('border', 'none', 'important');
                    selectEl.style.setProperty('color', 'white', 'important');
                    selectEl.style.setProperty('font-size', '0.9rem', 'important');
                    selectEl.style.setProperty('cursor', 'pointer', 'important');
                    selectEl.style.setProperty('outline', 'none', 'important');
                    selectEl.style.setProperty('width', '100%', 'important');
                    selectEl.style.setProperty('height', '100%', 'important');
                    selectEl.style.setProperty('padding', '8px 16px', 'important');
                    selectEl.style.setProperty('margin', '0', 'important');
                    selectEl.style.setProperty('position', 'absolute', 'important');
                    selectEl.style.setProperty('top', '0', 'important');
                    selectEl.style.setProperty('left', '0', 'important');
                    selectEl.style.setProperty('opacity', '1', 'important');
                    selectEl.style.setProperty('appearance', 'none', 'important');
                    selectEl.style.setProperty('-webkit-appearance', 'none', 'important');
                    selectEl.style.setProperty('-moz-appearance', 'none', 'important');

                    selectEl.querySelectorAll('option').forEach(option => {
                        option.style.setProperty('background', 'white', 'important');
                        option.style.setProperty('color', '#333', 'important');
                    });
                }
            });
        });
    };

    const observeMutations = () => {
        const observer = new MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.type === 'childList')) {
                setTimeout(forceLanguageSelectorStyle, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };

    const bootstrapTranslate = () => {
        if (!hasTranslate()) return;
        configureTranslate();
        translate.execute();
        forceLanguageSelectorStyle();

        setTimeout(() => {
            translate.execute();
            forceLanguageSelectorStyle();
        }, 500);

        [1000, 2000].forEach(delay => {
            setTimeout(forceLanguageSelectorStyle, delay);
        });

        setInterval(forceLanguageSelectorStyle, 3000);
        observeMutations();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapTranslate);
    } else {
        bootstrapTranslate();
    }
})();
