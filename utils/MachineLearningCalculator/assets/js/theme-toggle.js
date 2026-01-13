(() => {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    const body = document.body;
    const THEME_KEY = 'tooltopia-theme';

    const applyTheme = (isDayMode) => {
        body.classList.toggle('day-mode', isDayMode);
        themeToggle.checked = isDayMode;
    };

    applyTheme(localStorage.getItem(THEME_KEY) === 'day');

    themeToggle.addEventListener('change', () => {
        const isDayMode = themeToggle.checked;
        applyTheme(isDayMode);
        localStorage.setItem(THEME_KEY, isDayMode ? 'day' : 'night');
    });
})();
