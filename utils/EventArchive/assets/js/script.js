document.addEventListener('DOMContentLoaded', () => {
    // 容器与控件节点
    const popularContainer = document.getElementById('popular-container');
    const newContainer = document.getElementById('new-container');
    const allContainer = document.getElementById('all-container');
    const searchInput = document.getElementById('search-input');
    const tagFiltersContainer = document.getElementById('tag-filters');
    const totalCountSpan = document.getElementById('total-count');
    const randomBtns = document.querySelectorAll('.random-btn');

    // 状态管理
    let currentTab = 'popular';
    let selectedTags = new Set(); // 改为 Set 集合，支持多选
    let searchQuery = '';

    // 新增：判断档案日期是否在最近一个月内
    function isRecentOneMonth(dateString) {
        if (!dateString || dateString === "未知") return false;
        
        // 兼容处理：将 YYYY-MM-DD 转换为可被所有浏览器安全解析的格式
        const gameDate = new Date(dateString.replace(/-/g, '/')); 
        if (isNaN(gameDate.getTime())) return false;
        
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1); // 往前推一个月
        
        // 游戏日期大于等于一个月前的日期，且不超过今天
        return gameDate >= oneMonthAgo && gameDate <= today;
    }

    // 初始化：自动提取与注入标签
    if (typeof gamesData !== 'undefined') {
        const allTags = new Set();
        gamesData.forEach(game => {
            // 动态注入“有攻略”标签：如果含有 guideLink 且当前没有“有攻略”标签
            if (game.guideLink && (!game.tags || !game.tags.includes('有攻略'))) {
                if (!game.tags) game.tags = [];
                game.tags.push('有攻略');
            }
            
            // 收集所有去重标签
            if (game.tags) game.tags.forEach(tag => allTags.add(tag));
        });
        
        // 渲染除了“全部标签”外的所有分类标签
        allTags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'tag-filter';
            btn.setAttribute('data-tag', tag);
            btn.textContent = tag;
            if (tagFiltersContainer) tagFiltersContainer.appendChild(btn);
        });
    }

    // 拼装卡片模板函数 (保持原样)
    function createCardHTML(game) {
        const tagsHTML = (game.tags || []).map(tag => {
            const isHorror = tag === "微恐" || tag.includes("恐");
            const tagClass = isHorror ? "tag-horror" : "tag-normal";
            return `<span class="card-tag ${tagClass}">${tag}</span>`;
        }).join('');

        const isNewArchive = isRecentOneMonth(game.date);
        const newBadge = isNewArchive ? `
            <div class="new-badge-wrapper"><div class="new-badge-text">NEW</div></div>` : '';

        const coverHTML = game.cover ? 
            `<img alt="${game.title}" loading="lazy" decoding="async" class="card-cover-img" src="${game.cover}">` : 
            `<div class="card-cover-fallback"><div class="fallback-title">${game.title}</div></div>`;

        const guideHTML = game.guideLink ? `
            <a href="${game.guideLink}" target="_blank" rel="noreferrer" class="guide-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="guide-icon"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>
                <span>攻略</span>
            </a>` : '';

        const mobileIcon = (game.platform && game.platform.includes('Mobile')) ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="device-icon"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></svg>` : '';

        return `
            <div class="archive-card group">
                ${newBadge}
                <div class="card-bg-wrapper">
                    ${coverHTML}
                    <div class="card-gradient-overlay"></div>
                </div>
                <div class="card-content">
                    <div class="card-tags-wrapper">${tagsHTML}</div>
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

    // 核心渲染逻辑：双重过滤 (搜索 + 标签)
    function updateView() {
        if (typeof gamesData === 'undefined') return;

        const filteredData = gamesData.filter(g => {
            // 增加容错：用 (g.title || '') 确保即使数据是 null 也能正常转换字符串而不报错崩溃
            const matchSearch = (g.title || '').toLowerCase().includes(searchQuery) || 
                                (g.author || '').toLowerCase().includes(searchQuery) ||
                                (g.description || '').toLowerCase().includes(searchQuery);
                                
            const matchTag = selectedTags.size === 0 || 
                             Array.from(selectedTags).every(tag => g.tags && g.tags.includes(tag));
                             
            return matchSearch && matchTag;
        });

        const popGames = filteredData.filter(g => g.isPopular);
        const newGames = filteredData.filter(g => isRecentOneMonth(g.date));
        
        if (popularContainer) {
            popularContainer.innerHTML = popGames.length ? popGames.map(createCardHTML).join('') : '<p class="empty-text">该分类/检索下暂无热门档案</p>';
        }
        if (newContainer) {
            newContainer.innerHTML = newGames.length ? newGames.map(createCardHTML).join('') : '<p class="empty-text">该分类/检索下暂无最新收录</p>';
        }
        if (allContainer) {
            allContainer.innerHTML = filteredData.length ? filteredData.map(createCardHTML).join('') : '<p class="empty-text">未找到符合条件的档案</p>';
        }
        if (totalCountSpan) {
            totalCountSpan.textContent = `已检索到 ${filteredData.length} 份特殊档案`;
        }
    }

    // 交互 1：标签点击事件
   if (tagFiltersContainer) {
        tagFiltersContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-filter')) {
                const clickedTag = e.target.getAttribute('data-tag');
                const allTagBtn = document.querySelector('.tag-filter[data-tag="all"]');

                if (clickedTag === 'all') {
                    // 场景A：点击“全部”，清空选择池并重置 UI
                    selectedTags.clear();
                    document.querySelectorAll('.tag-filter').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                } else {
                    // 场景B：点击普通标签，执行反转(Toggle)
                    if (selectedTags.has(clickedTag)) {
                        selectedTags.delete(clickedTag);
                        e.target.classList.remove('active');
                    } else {
                        selectedTags.add(clickedTag);
                        e.target.classList.add('active');
                    }

                    // 联动判定：如果全取消了，就自动激活“全部”；否则取消“全部”的高亮
                    if (selectedTags.size === 0) {
                        if (allTagBtn) allTagBtn.classList.add('active');
                    } else {
                        if (allTagBtn) allTagBtn.classList.remove('active');
                    }
                }
                
                // 数据发生改变，触发重新渲染
                updateView();
            }
        });
    }

    // 交互 2：板块导航切换
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // 切换内容展示
            const targetId = tab.getAttribute('data-target') + '-section';
            document.querySelectorAll('.tab-content').forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');
            
            currentTab = tab.getAttribute('data-target');
        });
    });

    // 交互 3：搜索栏输入事件
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            
            // 体验优化：发生搜索行为时，如果不在"全部档案库"，自动跳转至"全部"标签以防止结果折叠在其他选项卡
            if(searchQuery !== "" && currentTab !== 'all') {
                const allTab = document.querySelector('.nav-tab[data-target="all"]');
                if (allTab) allTab.click();
            }
            updateView();
        });
    }

    // 交互 4：随机抽取按钮
    randomBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof gamesData === 'undefined' || gamesData.length === 0) return;
            const randomGame = gamesData[Math.floor(Math.random() * gamesData.length)];
            window.open(randomGame.playLink, '_blank');
        });
    });

    // 页面挂载时初始化渲染
    updateView();
});