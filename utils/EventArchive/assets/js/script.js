document.addEventListener('DOMContentLoaded', () => {
    // 获取页面容器节点
    const popularContainer = document.getElementById('popular-container');
    const newContainer = document.getElementById('new-container');
    const allContainer = document.getElementById('all-container');
    
    // 获取交互功能节点
    const searchInput = document.getElementById('search-input');
    const randomBtns = document.querySelectorAll('.random-btn');
    const totalCountSpan = document.getElementById('total-count');

    // 核心函数：根据 Game 对象数据渲染卡片 HTML
    function createCardHTML(game) {
        // 1. 处理标签 (微恐标签标红)
        const tagsHTML = game.tags.map(tag => {
            const isHorror = tag === "微恐" || tag.includes("恐");
            const tagClass = isHorror ? "tag-horror" : "tag-normal";
            return `<span class="card-tag ${tagClass}">${tag}</span>`;
        }).join('');

        // 2. 处理 NEW 角标
        const newBadge = game.isNew ? `
            <div class="new-badge-wrapper">
                <div class="new-badge-text">NEW</div>
            </div>` : '';

        // 3. 处理封面 (如无图片，替换为渐变底色和文字)
        const coverHTML = game.cover ? 
            `<img alt="${game.title}" loading="lazy" decoding="async" class="card-cover-img" src="${game.cover}">` : 
            `<div class="card-cover-fallback">
                <div class="fallback-title">${game.title}</div>
             </div>`;

        // 4. 处理攻略按钮
        const guideHTML = game.guideLink ? `
            <a href="${game.guideLink}" target="_blank" rel="noreferrer" class="guide-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="guide-icon"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>
                <span>攻略</span>
            </a>` : '';

        // 5. 渲染平台 Icon
        const mobileIcon = game.platform.includes('Mobile') ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="device-icon"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></svg>` : '';

        // 拼装语义化卡片模板
        return `
            <div class="archive-card group">
                ${newBadge}
                <div class="card-bg-wrapper">
                    ${coverHTML}
                    <div class="card-gradient-overlay"></div>
                </div>
                <div class="card-content">
                    <div class="card-tags-wrapper">
                        ${tagsHTML}
                    </div>
                    <h3 class="card-title" title="${game.title}">${game.title}</h3>
                    <p class="card-desc custom-scrollbar">${game.description.replace(/\n/g, '<br>')}</p>
                    <div class="card-divider"></div>
                    <div class="card-meta-grid">
                        <div class="meta-item truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <a href="${game.authorLink}" target="_blank" rel="noreferrer" class="author-link">${game.author}</a>
                        </div>
                        <div class="meta-item truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>
                            <span>${game.date}</span>
                        </div>
                        <div class="meta-item truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon"><path d="M12 6v6l4 2"></path><circle cx="12" cy="12" r="10"></circle></svg>
                            <span>${game.duration}</span>
                        </div>
                        <div class="meta-item truncate">
                            <div class="platform-icons">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="device-icon"><rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>
                                ${mobileIcon}
                            </div>
                            <span class="truncate">平台: ${game.platform}</span>
                        </div>
                    </div>
                    <div class="card-footer">
                        <a href="${game.playLink}" target="_blank" rel="noreferrer" class="play-btn">
                            <span>启动研究</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="arrow-icon"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                        </a>
                        ${guideHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // 页面初始化渲染
    function renderGames(dataList) {
        const popGames = dataList.filter(g => g.isPopular);
        const newGames = dataList.filter(g => g.isNew);
        
        if (popularContainer) {
            popularContainer.innerHTML = popGames.length ? popGames.map(createCardHTML).join('') : '<p class="empty-text">暂无内容</p>';
        }
        if (newContainer) {
            newContainer.innerHTML = newGames.length ? newGames.map(createCardHTML).join('') : '<p class="empty-text">暂无内容</p>';
        }
        if (allContainer) {
            allContainer.innerHTML = dataList.length ? dataList.map(createCardHTML).join('') : '<p class="empty-text text-center col-span-full">没有找到相关档案</p>';
        }
        if (totalCountSpan) {
            totalCountSpan.textContent = `已检索到 ${dataList.length} 份特殊档案`;
        }
    }

    // 执行首次全量渲染
    if (typeof gamesData !== 'undefined') {
        renderGames(gamesData);
    }

    // 实现：检索（搜索功能）
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filteredGames = gamesData.filter(g => 
                g.title.toLowerCase().includes(query) || 
                g.author.toLowerCase().includes(query) ||
                g.description.toLowerCase().includes(query)
            );
            
            // 搜索时只更新“全部档案库”板块
            if (allContainer) {
                allContainer.innerHTML = filteredGames.map(createCardHTML).join('');
                totalCountSpan.textContent = `已检索到 ${filteredGames.length} 份特殊档案`;
            }
            
            // 隐藏热门和最新板块以便聚焦搜索结果
            const popSection = document.getElementById('popular-section');
            const newSection = document.getElementById('new-section');
            if(query !== "") {
                if(popSection) popSection.style.display = 'none';
                if(newSection) newSection.style.display = 'none';
            } else {
                if(popSection) popSection.style.display = 'block';
                if(newSection) newSection.style.display = 'block';
            }
        });
    }

    // 实现：随机抽取功能
    randomBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof gamesData === 'undefined' || gamesData.length === 0) return;
            const randomGame = gamesData[Math.floor(Math.random() * gamesData.length)];
            window.open(randomGame.playLink, '_blank');
        });
    });
});