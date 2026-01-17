(() => {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const THEME_KEY = 'tooltopia-theme';

    // 从 localStorage 读取保存的主题偏好
    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'day') {
            body.classList.add('day-mode');
            themeToggle.checked = true;
        } else {
            body.classList.remove('day-mode');
            themeToggle.checked = false;
        }
    }

    // 保存主题偏好到 localStorage
    function saveThemePreference(isDayMode) {
        localStorage.setItem(THEME_KEY, isDayMode ? 'day' : 'night');
    }

    // 切换主题
    function toggleTheme() {
        const isDayMode = themeToggle.checked;

        if (isDayMode) {
            body.classList.add('day-mode');
        } else {
            body.classList.remove('day-mode');
        }

        saveThemePreference(isDayMode);
    }

    // 页面加载时恢复主题
    loadThemePreference();

    // 监听切换器变化
    themeToggle.addEventListener('change', toggleTheme);
})();
