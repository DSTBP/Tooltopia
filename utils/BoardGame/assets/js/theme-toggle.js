(() => {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const html = document.documentElement;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const THEME_KEY = 'tooltopia-theme';
    const THEME_COLORS = {
        day: '#f0f4f8',
        night: '#667eea'
    };

    function readStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (error) {
            return null;
        }
    }

    function saveThemePreference(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (error) {
        }
    }

    function updateThemeColor(theme) {
        if (themeMeta) {
            themeMeta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.night);
        }
    }

    function applyTheme(theme) {
        const isDayMode = theme === 'day';
        body.classList.toggle('day-mode', isDayMode);
        updateThemeColor(isDayMode ? 'day' : 'night');
        if (html.classList.contains('day-init')) {
            html.classList.remove('day-init');
        }

        if (themeToggle) {
            themeToggle.classList.toggle('is-day', isDayMode);
            themeToggle.setAttribute('aria-pressed', String(isDayMode));
        }
    }

    function loadThemePreference() {
        const savedTheme = readStoredTheme();
        applyTheme(savedTheme === 'day' ? 'day' : 'night');
    }

    function toggleTheme() {
        if (!themeToggle) {
            return;
        }

        const theme = themeToggle.classList.contains('is-day') ? 'night' : 'day';
        applyTheme(theme);
        saveThemePreference(theme);
    }

    loadThemePreference();

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
})();
