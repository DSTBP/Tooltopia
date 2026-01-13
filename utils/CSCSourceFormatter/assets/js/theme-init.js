(() => {
    const THEME_KEY = 'tooltopia-theme';
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === 'day') {
        document.documentElement.classList.add('day-init');
    } else {
        document.documentElement.classList.remove('day-init');
    }
})();
