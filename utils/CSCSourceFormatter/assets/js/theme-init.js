(() => {
    const THEME_KEY = 'tooltopia-theme';
    let savedTheme = null;

    try {
        savedTheme = localStorage.getItem(THEME_KEY);
    } catch (error) {
        savedTheme = null;
    }

    if (savedTheme === 'day') {
        document.documentElement.classList.add('day-init');
    } else {
        document.documentElement.classList.remove('day-init');
    }
})();
