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

    let forceLanguageSelectorStyle = () => {
        // 检测当前是否为日间模式
        const isDayMode = document.body.classList.contains('day-mode');

        // 定义样式配置 - 完全复刻 .return-home 的配色
        const styles = {
            // 背景：日间为 60% 透明白，夜间为 3% 透明白
            bg: isDayMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.03)',
            
            // 文字：日间为深灰蓝 (#4a5568)，夜间为浅灰白 (#e6e6e6)
            text: isDayMode ? '#4a5568' : '#e6e6e6',
            
            // 边框：日间为 10% 透明黑，夜间为 8% 透明白
            border: isDayMode ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.08)',
            
            // 阴影：为了匹配扁平风格，稍微减淡阴影
            shadow: isDayMode ? '0 2px 8px rgba(0, 0, 0, 0.05)' : '0 4px 12px rgba(0, 0, 0, 0.2)',
            
            // 下拉菜单选项颜色
            optionBg: isDayMode ? '#ffffff' : '#1e1e1e',
            optionText: isDayMode ? '#2d3748' : '#e6e6e6'
        };

        SELECTORS.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                // 应用动态颜色
                element.style.setProperty('background', styles.bg, 'important');
                element.style.setProperty('color', styles.text, 'important');
                element.style.setProperty('border', styles.border, 'important');
                element.style.setProperty('box-shadow', styles.shadow, 'important');

                // 保持原有的布局结构
                element.style.setProperty('position', 'fixed', 'important');
                element.style.setProperty('top', '20px', 'important');
                element.style.setProperty('right', '20px', 'important');
                element.style.setProperty('z-index', '9999', 'important');
                element.style.setProperty('padding', '0', 'important');
                element.style.setProperty('border-radius', '8px', 'important'); // 调整圆角以匹配按钮风格
                element.style.setProperty('backdrop-filter', 'blur(20px) saturate(1.2)', 'important'); // 增强毛玻璃
                element.style.setProperty('cursor', 'pointer', 'important');
                element.style.setProperty('font-size', '0.95rem', 'important');
                element.style.setProperty('font-family', "'Microsoft YaHei', -apple-system, sans-serif", 'important');
                element.style.setProperty('transition', 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 'important');
                element.style.setProperty('display', 'inline-flex', 'important');
                element.style.setProperty('align-items', 'center', 'important');
                element.style.setProperty('margin', '0', 'important');
                element.style.setProperty('min-width', '110px', 'important');
                element.style.setProperty('height', '38px', 'important'); // 稍微增加高度以匹配按钮
                element.style.setProperty('overflow', 'hidden', 'important'); // 确保圆角裁剪

                const selectEl = element.querySelector('select');
                if (selectEl) {
                    selectEl.style.setProperty('color', styles.text, 'important');
                    selectEl.style.setProperty('background', 'transparent', 'important');
                    selectEl.style.setProperty('border', 'none', 'important');
                    selectEl.style.setProperty('font-size', '0.9rem', 'important');
                    selectEl.style.setProperty('cursor', 'pointer', 'important');
                    selectEl.style.setProperty('outline', 'none', 'important');
                    selectEl.style.setProperty('width', '100%', 'important');
                    selectEl.style.setProperty('height', '100%', 'important');
                    selectEl.style.setProperty('padding', '0 12px', 'important');
                    selectEl.style.setProperty('margin', '0', 'important');
                    selectEl.style.setProperty('position', 'absolute', 'important');
                    selectEl.style.setProperty('top', '0', 'important');
                    selectEl.style.setProperty('left', '0', 'important');
                    selectEl.style.setProperty('opacity', '1', 'important');
                    selectEl.style.setProperty('appearance', 'none', 'important');
                    selectEl.style.setProperty('-webkit-appearance', 'none', 'important');
                    selectEl.style.setProperty('-moz-appearance', 'none', 'important');

                    // 修复下拉箭头位置（可选优化）
                    // 注意：原生 select 的箭头很难自定义，这里保持透明背景让它自然显示

                    selectEl.querySelectorAll('option').forEach(option => {
                        option.style.setProperty('background', styles.optionBg, 'important');
                        option.style.setProperty('color', styles.optionText, 'important');
                    });
                }
            });
        });
    };

    forceLanguageSelectorStyle = () => {
        const navActions = document.querySelector('.nav-actions');
        const themeToggleContainer = navActions ? navActions.querySelector('.theme-toggle-container') : null;
        const placeInNav = Boolean(navActions && themeToggleContainer);
        const referenceBtn = navActions ? navActions.querySelector('.nav-btn:not(.language-selector)') : null;
        const referenceRect = referenceBtn ? referenceBtn.getBoundingClientRect() : null;
        const referenceSize = referenceRect && referenceRect.width > 0 && referenceRect.height > 0
            ? { width: Math.ceil(referenceRect.width), height: Math.ceil(referenceRect.height) }
            : null;
        const referenceStyles = referenceBtn ? window.getComputedStyle(referenceBtn) : null;

        const elements = Array.from(document.querySelectorAll(SELECTORS.join(',')));
        const roots = elements.filter(element => !elements.some(parent => parent !== element && parent.contains(element)));

        roots.forEach(element => {
            element.classList.add('nav-btn', 'language-selector');

            if (placeInNav && element.parentElement !== navActions) {
                navActions.insertBefore(element, themeToggleContainer);
            }

            if (placeInNav) {
                element.style.setProperty('position', 'relative', 'important');
                element.style.setProperty('top', 'auto', 'important');
                element.style.setProperty('right', 'auto', 'important');
                element.style.setProperty('left', 'auto', 'important');
                element.style.setProperty('bottom', 'auto', 'important');
                element.style.setProperty('z-index', '1', 'important');
            } else {
                element.style.setProperty('position', 'fixed', 'important');
                element.style.setProperty('top', '20px', 'important');
                element.style.setProperty('right', '20px', 'important');
                element.style.setProperty('z-index', '9999', 'important');
            }

            const navOverrideProps = [
                'display',
                'align-items',
                'justify-content',
                'background',
                'border',
                'box-shadow',
                'backdrop-filter',
                'border-radius',
                'font-size',
                'font-family',
                'padding',
                'width'
            ];

            if (placeInNav) {
                navOverrideProps.forEach(prop => element.style.removeProperty(prop));
            }

            if (placeInNav && referenceSize) {
                element.style.setProperty('min-width', `${referenceSize.width}px`, 'important');
                element.style.setProperty('min-height', `${referenceSize.height}px`, 'important');
                element.style.setProperty('height', `${referenceSize.height}px`, 'important');
            } else {
                element.style.removeProperty('min-width');
                element.style.removeProperty('min-height');
                element.style.removeProperty('height');
            }

            if (placeInNav && referenceStyles) {
                element.style.setProperty('background-color', referenceStyles.backgroundColor, 'important');
                element.style.setProperty('border-color', referenceStyles.borderTopColor, 'important');
                element.style.setProperty('border-width', referenceStyles.borderTopWidth, 'important');
                element.style.setProperty('border-style', referenceStyles.borderTopStyle, 'important');
                element.style.setProperty('box-shadow', referenceStyles.boxShadow, 'important');
                element.style.setProperty('color', referenceStyles.color, 'important');
                element.style.setProperty('border-radius', referenceStyles.borderRadius, 'important');
                element.style.setProperty('font-weight', referenceStyles.fontWeight, 'important');
                element.style.setProperty('overflow', 'visible', 'important');
            } else {
                [
                    'background-color',
                    'border-color',
                    'border-width',
                    'border-style',
                    'box-shadow',
                    'color',
                    'border-radius',
                    'font-weight',
                    'overflow'
                ].forEach(prop => element.style.removeProperty(prop));
            }

            element.style.setProperty('margin', '0', 'important');

            const selectEl = element.querySelector('select');
            if (selectEl) {
                selectEl.style.setProperty('color', 'inherit', 'important');
                selectEl.style.setProperty('background', 'transparent', 'important');
                selectEl.style.setProperty('border', 'none', 'important');
                selectEl.style.setProperty('font-size', '0.875rem', 'important');
                selectEl.style.setProperty('text-align', 'center', 'important');
                selectEl.style.setProperty('text-align-last', 'center', 'important');
                selectEl.style.setProperty('cursor', 'pointer', 'important');
                selectEl.style.setProperty('outline', 'none', 'important');
                selectEl.style.setProperty('width', '100%', 'important');
                selectEl.style.setProperty('height', '100%', 'important');
                selectEl.style.setProperty('padding', '0 12px', 'important');
                selectEl.style.setProperty('margin', '0', 'important');
                selectEl.style.setProperty('position', 'absolute', 'important');
                selectEl.style.setProperty('top', '0', 'important');
                selectEl.style.setProperty('left', '0', 'important');
                selectEl.style.setProperty('opacity', '1', 'important');
                selectEl.style.setProperty('appearance', 'none', 'important');
                selectEl.style.setProperty('-webkit-appearance', 'none', 'important');
                selectEl.style.setProperty('-moz-appearance', 'none', 'important');
            }
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

        // 监听主题切换按钮
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('change', () => {
                setTimeout(forceLanguageSelectorStyle, 50);
            });
        }

        setTimeout(() => {
            translate.execute();
            forceLanguageSelectorStyle();
        }, 500);

        [1000, 2000].forEach(delay => {
            setTimeout(forceLanguageSelectorStyle, delay);
        });

        // 保持定时检查以防止样式被覆盖
        setInterval(forceLanguageSelectorStyle, 2000);
        observeMutations();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapTranslate);
    } else {
        bootstrapTranslate();
    }
})();
