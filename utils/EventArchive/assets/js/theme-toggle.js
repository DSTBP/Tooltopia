(() => {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const THEME_KEY = 'tooltopia-theme';
    const THEME_COLORS = {
        day: '#f0f4f8',
        night: '#1a1a2e'
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
            // Ignore storage write failures and keep the current in-memory state.
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

        if (themeToggle) {
            themeToggle.checked = isDayMode;
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

        const theme = themeToggle.checked ? 'day' : 'night';
        applyTheme(theme);
        saveThemePreference(theme);
    }

    loadThemePreference();

    if (themeToggle) {
        themeToggle.addEventListener('change', toggleTheme);
    }
})();
