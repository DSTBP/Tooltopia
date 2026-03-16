(() => {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const body = document.body;
    const THEME_KEY = 'tooltopia-theme';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const toggleButton = document.querySelector('.theme-toggle__btn');

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
            // Ignore storage failures and keep the in-memory theme state.
        }
    }

    const applyTheme = (isDayMode) => {
        body.classList.toggle('day-mode', isDayMode);
        themeToggle.checked = isDayMode;
        if (themeMeta) {
            themeMeta.setAttribute('content', isDayMode ? '#f4f7fb' : '#667eea');
        }
    };

    if (toggleButton) {
        toggleButton.classList.add('no-transition');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toggleButton.classList.remove('no-transition');
            });
        });
    }

    applyTheme(readThemePreference() === 'day');

    themeToggle.addEventListener('change', () => {
        const isDayMode = themeToggle.checked;
        applyTheme(isDayMode);
        writeThemePreference(isDayMode ? 'day' : 'night');
    });
})();
