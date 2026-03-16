(() => {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const body = document.body;
    const THEME_KEY = 'tooltopia-theme';
    const themeMeta = document.querySelector('meta[name="theme-color"]');

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
            // Ignore storage failures and keep runtime theme state.
        }
    }

    function applyTheme(isDayMode) {
        body.classList.toggle('day-mode', isDayMode);
        themeToggle.checked = isDayMode;
        if (themeMeta) {
            themeMeta.setAttribute('content', isDayMode ? '#f0f4f8' : '#0c111a');
        }
    }

    applyTheme(readThemePreference() === 'day');

    themeToggle.addEventListener('change', () => {
        const isDayMode = themeToggle.checked;
        applyTheme(isDayMode);
        writeThemePreference(isDayMode ? 'day' : 'night');
    });
})();
