(() => {
    const themeToggle = document.getElementById('themeToggle');
    const themeToggleBtn = document.querySelector('.theme-toggle__btn');
    const body = document.body;
    const html = document.documentElement;
    const THEME_KEY = 'tooltopia-theme';

    function readStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (error) {
            return null;
        }
    }

    function saveThemePreference(isDayMode) {
        try {
            localStorage.setItem(THEME_KEY, isDayMode ? 'day' : 'night');
        } catch (error) {
            // Ignore storage write failures and keep the current UI state.
        }
    }

    function loadThemePreference() {
        const savedTheme = readStoredTheme();
        const hasInitClass = html.classList.contains('day-init');

        if (themeToggleBtn) {
            themeToggleBtn.classList.add('no-transition');
        }

        if (hasInitClass || savedTheme === 'day') {
            html.classList.remove('day-init');
            body.classList.add('day-mode');
            if (themeToggle) {
                themeToggle.checked = true;
            }
        } else {
            body.classList.remove('day-mode');
            if (themeToggle) {
                themeToggle.checked = false;
            }
        }

        if (themeToggleBtn) {
            setTimeout(() => {
                themeToggleBtn.classList.remove('no-transition');
            }, 50);
        }
    }

    function toggleTheme() {
        if (!themeToggle) {
            return;
        }

        const isDayMode = themeToggle.checked;
        body.classList.toggle('day-mode', isDayMode);
        saveThemePreference(isDayMode);
    }

    loadThemePreference();

    if (themeToggle) {
        themeToggle.addEventListener('change', toggleTheme);
    }
})();
