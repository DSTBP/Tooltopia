(() => {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const body = document.body;
    const html = document.documentElement;
    const themeToggleBtn = document.querySelector('.theme-toggle__btn');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const THEME_KEY = 'tooltopia-theme';

    function readThemePreference() {
        try {
            return window.localStorage ? localStorage.getItem(THEME_KEY) : null;
        } catch (error) {
            return null;
        }
    }

    function writeThemePreference(theme) {
        try {
            if (window.localStorage) {
                localStorage.setItem(THEME_KEY, theme);
            }
        } catch (error) {
            // Ignore storage failures and keep the runtime theme state.
        }
    }

    function applyTheme(isDayMode) {
        html.classList.remove('day-init');
        body.classList.toggle('day-mode', isDayMode);
        themeToggle.checked = isDayMode;
        if (themeMeta) {
            themeMeta.setAttribute('content', isDayMode ? '#f0f4f8' : '#667eea');
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.classList.add('no-transition');
    }

    applyTheme(html.classList.contains('day-init') || readThemePreference() === 'day');

    if (themeToggleBtn) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                themeToggleBtn.classList.remove('no-transition');
            });
        });
    }

    themeToggle.addEventListener('change', () => {
        const isDayMode = themeToggle.checked;
        applyTheme(isDayMode);
        writeThemePreference(isDayMode ? 'day' : 'night');
    });
})();
