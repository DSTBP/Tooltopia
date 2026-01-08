// 同步标题内容到 data-shadow 属性（用于翻译后保持阴影效果）
(() => {
    function syncTitleShadow() {
        const titles = document.querySelectorAll('h1[data-shadow]');
        titles.forEach(title => {
            const observer = new MutationObserver(() => {
                const currentText = title.textContent.trim();
                const shadowText = title.getAttribute('data-shadow');
                if (currentText !== shadowText) {
                    title.setAttribute('data-shadow', currentText);
                }
            });

            observer.observe(title, {
                childList: true,
                characterData: true,
                subtree: true
            });

            // 初始同步
            title.setAttribute('data-shadow', title.textContent.trim());
        });
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncTitleShadow);
    } else {
        syncTitleShadow();
    }

    // 延迟再次同步，确保翻译库加载后也能同步
    setTimeout(syncTitleShadow, 1000);
})();
