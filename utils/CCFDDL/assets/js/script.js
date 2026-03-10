document.addEventListener('DOMContentLoaded', () => {
    const conferencesContainer = document.getElementById('conferences-container');
    const searchInput = document.getElementById('search-input');
    const totalCountSpan = document.getElementById('total-count');
    const timezoneSelector = document.getElementById('timezone-selector');
    const paginationContainer = document.getElementById('pagination-container');

    let searchQuery = '';
    let selectedTimezone = 'original';
    
    // 全局数据变量
    let confData = [];
    
    // 当前视图模式 ('deadlines' 或 'ccf_list')
    let currentMode = 'deadlines';

    // 分页状态控制
    let currentPage = 1;
    const itemsPerPage = 25; 

    const subMap = {
        'DS': '计算机体系结构/并行与分布计算/存储系统',
        'NW': '计算机网络',
        'SC': '网络与信息安全',
        'SE': '软件工程/系统软件/程序设计语言',
        'DB': '数据库/数据挖掘/内容检索',
        'CT': '计算机科学理论',
        'CG': '计算机图形学与多媒体',
        'AI': '人工智能',
        'HI': '人机交互与普适计算',
        'MX': '交叉/综合/新兴'
    };

    if (timezoneSelector) {
        timezoneSelector.value = 'original'; 
        timezoneSelector.addEventListener('change', (e) => {
            selectedTimezone = e.target.value;
            if (currentMode === 'deadlines') updateView();
        });
    }

    // ==========================================
    // 顶端 Tab 切换逻辑
    // ==========================================
    const tabDeadlines = document.getElementById('tab-deadlines');
    const tabCcfList = document.getElementById('tab-ccf-list');
    
    if (tabDeadlines) {
        tabDeadlines.addEventListener('click', (e) => {
            e.preventDefault();
            setMode('deadlines');
        });
    }
    
    if (tabCcfList) {
        tabCcfList.addEventListener('click', (e) => {
            e.preventDefault();
            setMode('ccf_list');
        });
    }

    function setMode(mode) {
        currentMode = mode;
        currentPage = 1;
        document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
        
        const col4 = document.getElementById('filter-col-4');
        const label3 = document.getElementById('label-filter-3');
        const tzWrapper = document.querySelector('.timezone-wrapper');

        if (mode === 'deadlines') {
            document.getElementById('tab-deadlines').classList.add('active');
            label3.textContent = '年份';
            if (col4) col4.style.display = 'block';
            if (tzWrapper) tzWrapper.style.display = 'block';
            
            initDeadlineFilters();
        } else if (mode === 'ccf_list') {
            document.getElementById('tab-ccf-list').classList.add('active');
            // 将年份选项转为类型选项 (期刊/会议)
            label3.textContent = '类型'; 
            // 隐藏状态过滤和时区选择
            if (col4) col4.style.display = 'none';
            if (tzWrapper) tzWrapper.style.display = 'none';
            
            initCCFListFilters();
        }
        
        updateView();
    }


    // ==========================================
    // 在线数据获取与 ICS 解析逻辑 (Deadlines)
    // ==========================================
    function parseICS(icsText, defaultSub) {
        const events = [];
        const lines = icsText.split(/\r?\n/);
        
        let foldedLines = [];
        for (let line of lines) {
            if (line.startsWith(' ') || line.startsWith('\t')) {
                if (foldedLines.length > 0) foldedLines[foldedLines.length - 1] += line.substring(1);
            } else {
                foldedLines.push(line);
            }
        }

        let currentEvent = null;
        for (let line of foldedLines) {
            const match = line.match(/^([^:]+):(.*)$/);
            if (!match) continue;
            let [_, keyStr, value] = match;
            const key = keyStr.split(';')[0];

            if (key === 'BEGIN' && value === 'VEVENT') {
                currentEvent = {};
            } else if (key === 'END' && value === 'VEVENT') {
                if (currentEvent) events.push(currentEvent);
                currentEvent = null;
            } else if (currentEvent) {
                currentEvent[key] = value;
            }
        }

        const parsedConfs = [];
        const unescape = (str) => str ? str.replace(/\\n/g, '\n').replace(/\\,/g, ',') : '';

        events.forEach(ev => {
            const summary = ev.SUMMARY || '';
            const rawDesc = unescape(ev.DESCRIPTION || '');
            
            const titleMatch = summary.match(/^(.+?)\s+(\d{4})/);
            const title = titleMatch ? titleMatch[0].trim() : summary.split(' ')[0];
            const year = titleMatch ? parseInt(titleMatch[2], 10) : new Date().getFullYear();
            const commentMatch = summary.match(/\d{4}\s+(.*)$/);
            const comment = commentMatch ? commentMatch[1].trim() : '截稿';

            const descLines = rawDesc.split('\n');
            const fullName = descLines[0] ? descLines[0].trim() : title;
            
            const dateMatch = rawDesc.match(/🗓️\s*会议时间:\s*(.+?)(?:\n|$)/);
            const placeMatch = rawDesc.match(/📍\s*会议地点:\s*(.+?)(?:\n|$)/);
            const tzMatch = rawDesc.match(/⏰\s*原始截止时间\s*\((.+?)\):/);
            const ddlMatch = rawDesc.match(/⏰\s*原始截止时间.+?:\s*(.+?)(?:\n|$)/);
            const subMatch = rawDesc.match(/分类:.*?\((.+?)\)/);
            const ccfMatch = rawDesc.match(/CCF\s+([A-C])/);

            parsedConfs.push({
                title: title,
                description: fullName,
                sub: subMatch ? subMatch[1].trim() : defaultSub,
                rank: { ccf: ccfMatch ? ccfMatch[1].trim() : 'N' },
                confs: [{
                    year: year,
                    link: ev.URL ? unescape(ev.URL) : '#',
                    timezone: tzMatch ? tzMatch[1].trim() : 'AoE',
                    date: dateMatch ? dateMatch[1].trim() : 'TBA',
                    place: placeMatch ? placeMatch[1].trim() : 'TBA',
                    timeline: [{ deadline: ddlMatch ? ddlMatch[1].trim() : 'TBD', comment: comment }]
                }]
            });
        });

        return parsedConfs;
    }

    function mergeConfData(rawData) {
        const mergedMap = new Map();
        rawData.forEach(item => {
            const key = `${item.title}-${item.confs[0].year}`;
            if (mergedMap.has(key)) {
                mergedMap.get(key).confs[0].timeline.push(...item.confs[0].timeline);
            } else {
                mergedMap.set(key, item);
            }
        });
        return Array.from(mergedMap.values());
    }

    async function fetchConferencesData() {
        if(conferencesContainer) conferencesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">正在从 CCFDDL 拉取最新数据，请稍候...</div>';

        const subs = Object.keys(subMap);
        const fetchPromises = subs.map(sub => {
            const url = `https://ccfddl.com/conference/deadlines_zh_${sub}.ics`;
            return fetch(url).then(res => res.text()).then(text => parseICS(text, sub)).catch(() => []);
        });

        try {
            const results = await Promise.all(fetchPromises);
            let rawData = [];
            results.forEach(res => { rawData = rawData.concat(res); });
            confData = mergeConfData(rawData);
            
            // 默认启动模式为 deadlines
            if (currentMode === 'deadlines') {
                initDeadlineFilters(); 
                updateView();
            }
        } catch (error) {
            if(conferencesContainer) conferencesContainer.innerHTML = `<p class="empty-text" style="color:red;">数据拉取失败，请检查网络</p>`;
        }
    }


    // ==========================================
    // 动态生成下拉筛选器
    // ==========================================
    function initDeadlineFilters() {
        const categorySelect = document.getElementById('category-filter');
        const levelSelect = document.getElementById('level-filter');
        const yearSelect = document.getElementById('year-filter');

        const categories = new Set();
        const levels = new Set();
        const years = new Set();

        confData.forEach(conf => {
            if (conf.sub) categories.add(conf.sub);
            if (conf.rank && conf.rank.ccf) levels.add(conf.rank.ccf);
            if (conf.confs && conf.confs.length > 0 && conf.confs[0].year) years.add(conf.confs[0].year);
        });

        categorySelect.innerHTML = '<option value="all">所有领域</option>';
        Array.from(categories).sort().forEach(sub => {
            const subName = subMap[sub] || sub;
            categorySelect.innerHTML += `<option value="${sub}">${subName}</option>`;
        });

        levelSelect.innerHTML = '<option value="all">所有级别</option>';
        Array.from(levels).sort().forEach(lvl => {
            const label = lvl === 'N' ? '无评级' : `CCF-${lvl}`;
            levelSelect.innerHTML += `<option value="${lvl}">${label}</option>`;
        });

        yearSelect.innerHTML = '<option value="all">所有年份</option>';
        Array.from(years).sort((a, b) => b - a).forEach(year => {
            yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
        });

        bindFilterEvents();
    }
    
    function initCCFListFilters() {
        const categorySelect = document.getElementById('category-filter');
        const levelSelect = document.getElementById('level-filter');
        const typeSelect = document.getElementById('year-filter'); // 复用作为类型下拉框

        const categories = new Set();
        const levels = new Set();
        const types = new Set();

        if (typeof ccfData !== 'undefined') {
            ccfData.forEach(item => {
                if (item.domain) categories.add(item.domain);
                if (item.grade) levels.add(item.grade);
                if (item.type) types.add(item.type);
            });
        }

        categorySelect.innerHTML = '<option value="all">所有领域</option>';
        Array.from(categories).sort().forEach(sub => {
            categorySelect.innerHTML += `<option value="${sub}">${sub}</option>`;
        });

        levelSelect.innerHTML = '<option value="all">所有级别</option>';
        Array.from(levels).sort().forEach(lvl => {
            levelSelect.innerHTML += `<option value="${lvl}">${lvl}类</option>`;
        });

        typeSelect.innerHTML = '<option value="all">所有类型</option>';
        Array.from(types).sort().forEach(t => {
            typeSelect.innerHTML += `<option value="${t}">${t}</option>`;
        });
        
        bindFilterEvents();
    }
    
    function bindFilterEvents() {
        // 防止重复绑定，每次先克隆替换以清空旧事件
        const filterIds = ['category-filter', 'level-filter', 'year-filter', 'deadline-filter'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
            newEl.addEventListener('change', () => {
                currentPage = 1;
                updateView();
            });
        });
    }

    // ==========================================
    // 核心时间计算工具
    // ==========================================
    function parseTimezoneOffset(tzString) {
        if (!tzString) return 0;
        if (tzString.toUpperCase() === 'AOE') return -12;
        if (tzString.toUpperCase() === 'UTC') return 0;
        const match = tzString.match(/UTC([+-]\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
    }

    function getAbsoluteMs(deadlineStr, tzStr) {
        if (!deadlineStr || deadlineStr.toUpperCase() === 'TBD') return null;
        const tStr = deadlineStr.replace(' ', 'T'); 
        const offset = parseTimezoneOffset(tzStr);
        const sign = offset >= 0 ? '+' : '-';
        const padOffset = String(Math.abs(offset)).padStart(2, '0');
        return new Date(`${tStr}${sign}${padOffset}:00`).getTime();
    }

    function formatToSelectedTz(ms, targetTz, originalTz) {
        if (!ms) return 'TBD';
        const d = new Date(ms);
        const pad = n => n < 10 ? '0'+n : n;

        if (targetTz === 'local') {
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
        
        let offset = 0, tzLabel = '';
        if (targetTz === 'original') { offset = parseTimezoneOffset(originalTz); tzLabel = originalTz; } 
        else if (targetTz === 'AoE') { offset = -12; tzLabel = 'AoE'; } 
        else { offset = parseInt(targetTz, 10); tzLabel = `UTC${offset >= 0 ? '+'+offset : offset}`; }

        const tzDate = new Date(ms + offset * 3600 * 1000);
        return `${tzDate.getUTCFullYear()}-${pad(tzDate.getUTCMonth()+1)}-${pad(tzDate.getUTCDate())} ${pad(tzDate.getUTCHours())}:${pad(tzDate.getUTCMinutes())}:${pad(tzDate.getUTCSeconds())} (${tzLabel})`;
    }

    function getConfStatus(conf) {
        if (!conf.confs || conf.confs.length === 0) return { ms: null, isUrgent: false, comment: '' };
        const latestConf = conf.confs[0];
        const timeline = latestConf.timeline || [];
        
        let targetMs = null, activeComment = '', minDiff = Infinity;
        const now = Date.now();

        for (const tl of timeline) {
            const ms = getAbsoluteMs(tl.deadline, latestConf.timezone);
            if (!ms) continue;
            const diff = ms - now;
            if (diff > 0 && diff < minDiff) {
                minDiff = diff; targetMs = ms; activeComment = tl.comment || '截稿';
            }
        }
        if (targetMs === null && timeline.length > 0) {
            const last = timeline[timeline.length - 1];
            targetMs = getAbsoluteMs(last.deadline, latestConf.timezone);
            activeComment = last.comment || '截稿';
        }

        return {
            ms: targetMs,
            isUrgent: minDiff !== Infinity && minDiff <= 30 * 24 * 60 * 60 * 1000,
            comment: activeComment
        };
    }

    // ==========================================
    // 界面渲染 - CCF Deadlines (原逻辑)
    // ==========================================
    function createDeadlineCardHTML(item) {
        const conf = item.conf;
        const timeStatus = item.statusInfo;
        const latestConf = conf.confs && conf.confs.length > 0 ? conf.confs[0] : {};
        const ccfRank = conf.rank && conf.rank.ccf ? conf.rank.ccf : 'N';
        const ccfClass = ccfRank === 'A' ? "tag-horror" : "tag-normal";
        const categoryAbbr = conf.sub || 'MIX';
        const categoryFullName = subMap[conf.sub] || conf.sub || 'MIX';
        
        const tagsHTML = `
            <span class="card-tag ${ccfClass}">CCF-${ccfRank}</span>
            <span class="card-tag tag-normal" title="${categoryFullName}">${categoryAbbr}</span>
        `;
        const newBadge = timeStatus.isUrgent ? `<div class="new-badge-wrapper"><div class="new-badge-text">URGENT</div></div>` : '';
        const originalTz = latestConf.timezone || 'UTC';
        const formattedDeadline = formatToSelectedTz(timeStatus.ms, selectedTimezone, originalTz);

        const coverHTML = `
            <div class="card-cover-fallback">
                <div style="text-align: center;">
                    <div style="font-size: 3rem; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,0.9);">${conf.title}</div>
                </div>
            </div>`;

        const place = latestConf.place || 'TBA';
        const confName = conf.description || 'TBA';
        const ddlPrefix = timeStatus.comment ? timeStatus.comment + ': ' : '截稿: ';

        return `
            <div class="archive-card group">
                ${newBadge}
                <div class="card-tags-absolute">${tagsHTML}</div>
                <div class="card-bg-wrapper">${coverHTML}<div class="card-gradient-overlay"></div></div>
                <div class="card-content">
                    <h3 class="card-title" title="${conf.title}">${conf.title}</h3>
                    <div class="card-divider"></div>
                    <div class="card-meta-grid">
                        <div class="meta-item truncate" title="举办地: ${place}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>${place}</span>
                        </div>
                        <div class="meta-item truncate" title="${ddlPrefix}${formattedDeadline}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            <span>${formattedDeadline}</span>
                        </div>
                        <div class="meta-item truncate" title="全称: ${confName}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            <span>${confName}</span>
                        </div>
                        <div class="meta-item truncate countdown-timer-container" data-ts="${timeStatus.ms || ''}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span class="countdown-text">计算中...</span>
                        </div>
                    </div>
                    <div class="card-footer" style="margin-top: 0.75rem;">
                        <a href="${latestConf.link || '#'}" target="_blank" rel="noreferrer" class="play-btn">
                            <span>访问官网</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 界面渲染 - CCF 推荐列表
    // ==========================================
    function createCCFListCardHTML(item) {
        const ccfClass = item.grade === 'A' ? "tag-horror" : "tag-normal";
        const categoryAbbr = item.domain || 'MIX';
        
        const tagsHTML = `
            <span class="card-tag ${ccfClass}">CCF-${item.grade}</span>
            <span class="card-tag tag-normal">${item.type}</span>
            <span class="card-tag tag-normal" title="${item.domain}">${categoryAbbr.length > 8 ? categoryAbbr.substring(0,8)+'..' : categoryAbbr}</span>
        `;

        const coverHTML = `
            <div class="card-cover-fallback">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,0.9);">${item.abbr}</div>
                </div>
            </div>`;

        return `
            <div class="archive-card group">
                <div class="card-tags-absolute">${tagsHTML}</div>
                <div class="card-bg-wrapper">
                    ${coverHTML}
                    <div class="card-gradient-overlay"></div>
                </div>
                <div class="card-content">
                    <h3 class="card-title" title="${item.abbr}">${item.abbr}</h3>
                    <div class="card-divider"></div>
                    <div class="card-meta-grid">
                        <div class="meta-item truncate text-only" title="全称: ${item.fullname}" style="grid-column: 1/-1;">
                            <span><strong style="color:#4ECDC4;">全称:</strong> ${item.fullname}</span>
                        </div>
                        <div class="meta-item truncate text-only" title="出版社: ${item.publisher}">
                            <span><strong style="color:#4ECDC4;">出版:</strong> ${item.publisher}</span>
                        </div>
                        <div class="meta-item truncate text-only" title="领域: ${item.domain}">
                            <span><strong style="color:#4ECDC4;">领域:</strong> ${item.domain.length > 10 ? item.domain.substring(0,10)+'..' : item.domain}</span>
                        </div>
                    </div>
                    <div class="card-footer" style="margin-top: 0.75rem;">
                        <a href="${item.url}" target="_blank" rel="noreferrer" class="play-btn">
                            <span>访问主页</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 更新视图 (双分支逻辑)
    // ==========================================
    function updateView() {
        const catFilter = document.getElementById('category-filter').value;
        const levelFilter = document.getElementById('level-filter').value;
        const col3Filter = document.getElementById('year-filter').value; // 'year' 或是 'type'
        const statusFilter = document.getElementById('deadline-filter').value;
        const now = Date.now();

        let filteredData = [];

        // --- 分支 1：CCF Deadlines 数据逻辑 ---
        if (currentMode === 'deadlines') {
            if (!confData || confData.length === 0) return;
            
            filteredData = confData.map(conf => {
                return { conf: conf, statusInfo: getConfStatus(conf) };
            }).filter(item => {
                const conf = item.conf;
                const ms = item.statusInfo.ms;
                
                const matchSearch = (conf.title || '').toLowerCase().includes(searchQuery) || (conf.description || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;
                if (catFilter !== 'all' && conf.sub !== catFilter) return false;

                const ccfRank = conf.rank && conf.rank.ccf ? conf.rank.ccf : 'N';
                if (levelFilter !== 'all' && ccfRank !== levelFilter) return false;

                const confYear = conf.confs && conf.confs.length > 0 ? String(conf.confs[0].year) : '';
                if (col3Filter !== 'all' && confYear !== col3Filter) return false;

                if (statusFilter !== 'all') {
                    if (statusFilter === 'upcoming') {
                        if (ms === null || ms <= now || (ms - now) > 60 * 24 * 30 * 60 * 1000) return false;
                    } else if (statusFilter === 'open') {
                        if (ms === null || ms <= now) return false;
                    } else if (statusFilter === 'passed') {
                        if (ms !== null && ms > now) return false;
                    }
                }
                return true;
            });

            // 按距离当前时间排序
            filteredData.sort((a, b) => {
                const timeA = a.statusInfo.ms, timeB = b.statusInfo.ms;
                const isAValid = timeA !== null && timeA > now, isBValid = timeB !== null && timeB > now;
                if (isAValid && isBValid) return timeA - timeB;
                if (isAValid && !isBValid) return -1;
                if (!isAValid && isBValid) return 1;
                if (timeA !== null && timeB !== null) return timeB - timeA;
                return 0;
            });

        // --- 分支 2：CCF推荐列表 数据逻辑 ---
        } else if (currentMode === 'ccf_list') {
            if (typeof ccfData === 'undefined' || ccfData.length === 0) return;
            
            filteredData = ccfData.filter(item => {
                const matchSearch = (item.abbr || '').toLowerCase().includes(searchQuery) || (item.fullname || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;
                if (catFilter !== 'all' && item.domain !== catFilter) return false;
                if (levelFilter !== 'all' && item.grade !== levelFilter) return false;
                // 在推荐列表模式下，col3Filter 充当 type 过滤 (会议/期刊)
                if (col3Filter !== 'all' && item.type !== col3Filter) return false;
                return true;
            });

            // 按 A->B->C 及缩写字母排序
            filteredData.sort((a, b) => {
                if (a.grade === b.grade) return (a.abbr || '').localeCompare(b.abbr || '');
                return (a.grade || '').localeCompare(b.grade || '');
            });
        }

        if (totalCountSpan) {
            totalCountSpan.textContent = `已检索到 ${filteredData.length} 个结果`;
        }

        // --- 分页逻辑 ---
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

        // 渲染列表
        const emptyMsg = '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的数据</p>';
        if (conferencesContainer) {
            if (currentMode === 'deadlines') {
                conferencesContainer.innerHTML = paginatedData.length ? paginatedData.map(createDeadlineCardHTML).join('') : emptyMsg;
            } else {
                conferencesContainer.innerHTML = paginatedData.length ? paginatedData.map(createCCFListCardHTML).join('') : emptyMsg;
            }
        }

        renderPagination(totalPages);
        
        // 只有 Deadline 模式需要触发倒计时
        if (currentMode === 'deadlines') tickCountdowns();
    }

    // ==========================================
    // 渲染分页器控件
    // ==========================================
    function renderPagination(totalPages) {
        if (!paginationContainer) return;
        if (totalPages <= 1) { paginationContainer.innerHTML = ''; return; }

        let html = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="page-dots">...</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-dots">...</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }
        html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;

        paginationContainer.innerHTML = html;
    }

    if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('page-btn') && !e.target.disabled) {
                const newPage = parseInt(e.target.getAttribute('data-page'));
                if (newPage && newPage !== currentPage) {
                    currentPage = newPage;
                    updateView();
                    document.getElementById('ccf-filters').scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }

    // ==========================================
    // 全局倒计时刷新逻辑
    // ==========================================
    function tickCountdowns() {
        if (currentMode !== 'deadlines') return;
        
        const now = Date.now();
        document.querySelectorAll('.countdown-timer-container').forEach(el => {
            const tsAttr = el.getAttribute('data-ts');
            const textSpan = el.querySelector('.countdown-text');
            el.className = 'meta-item truncate countdown-timer-container';

            if (!tsAttr || tsAttr === 'null') {
                if(textSpan) textSpan.textContent = '状态: 时间未定 (TBD)';
                el.classList.add('timer-tbd');
                return;
            }

            const diff = parseInt(tsAttr, 10) - now;
            if (diff <= 0) {
                if(textSpan) textSpan.textContent = '状态: 已截止';
                el.classList.add('timer-finished');
            } else {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diff / (1000 * 60)) % 60);
                const s = Math.floor((diff / 1000) % 60);
                if(textSpan) textSpan.textContent = `剩余: ${d}天 ${h}时 ${m}分 ${s}秒`;
                
                if (d < 3) el.classList.add('timer-urgent');
                else if (d < 10) el.classList.add('timer-warning');
                else el.classList.add('timer-normal');
            }
        });
    }
    setInterval(tickCountdowns, 1000);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            currentPage = 1;
            updateView();
        });
    }

    // ==========================================
    // 布局切换逻辑 (2列 / 3列 / 4列)
    // ==========================================
    const layoutBtns = document.querySelectorAll('.layout-btn');
    let currentLayoutCols = localStorage.getItem('ccfddl-grid-layout') || '2';
    applyGridLayout(currentLayoutCols);

    layoutBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cols = btn.getAttribute('data-cols');
            applyGridLayout(cols);
            localStorage.setItem('ccfddl-grid-layout', cols);
        });
    });

    function applyGridLayout(cols) {
        layoutBtns.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-cols') === cols));
        if (conferencesContainer) {
            conferencesContainer.classList.remove('grid-cols-2', 'grid-cols-3', 'grid-cols-4');
            conferencesContainer.classList.add(`grid-cols-${cols}`);
        }
    }

    // 初始化启动拉取 Deadlines 接口
    fetchConferencesData();
});