(() => {
    const themeToggle = document.getElementById('themeToggle');
    const themeToggleBtn = document.querySelector('.theme-toggle__btn');
    const body = document.body;
    const html = document.documentElement;
    const THEME_KEY = 'tooltopia-theme';

    // 从 localStorage 读取保存的主题偏好并同步切换器状态
    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        const hasInitClass = html.classList.contains('day-init');

        // 临时禁用动画以避免页面加载时的视觉延迟
        if (themeToggleBtn) {
            themeToggleBtn.classList.add('no-transition');
        }

        // 如果 HTML 有 day-init 类（由 head 中的脚本添加），则转移到 body
        if (hasInitClass || savedTheme === 'day') {
            // 移除 html 上的临时类
            html.classList.remove('day-init');
            // 添加到 body
            body.classList.add('day-mode');
            themeToggle.checked = true;
        } else {
            body.classList.remove('day-mode');
            themeToggle.checked = false;
        }

        // 延迟恢复动画（确保状态已应用）
        if (themeToggleBtn) {
            setTimeout(() => {
                themeToggleBtn.classList.remove('no-transition');
            }, 50);
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

    // 页面加载时同步切换器状态
    loadThemePreference();

    // 监听切换器变化
    themeToggle.addEventListener('change', toggleTheme);
})();
