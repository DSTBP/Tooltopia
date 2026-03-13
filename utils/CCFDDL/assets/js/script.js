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
    let sjrData = []; // 新增 SJR 数据变量
    let jcrData = []; // 新增 JCR 数据变量

    let accRatesMap = new Map();

    async function fetchAcceptanceRates() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/ccfddl/ccfddl.github.io/page/conference/allacc.yml');
            const yamlText = await response.text();
            
            // 简易 YAML 解析器（针对特定格式进行字符串分割提取）
            const blocks = yamlText.split(/(?:^|\n)-\s*title:\s*/);
            blocks.forEach(block => {
                if (!block.trim()) return;
                
                // 提取会议缩写名 (Title)
                const lines = block.split('\n');
                let title = lines[0].trim().replace(/^['"]|['"]$/g, '');

                // 按 year 块拆分，寻找最新年份的数据
                const yearStrBlocks = block.split(/\s+-\s*year:\s*/).slice(1);
                let maxYear = 0;
                let bestStr = null;
                
                yearStrBlocks.forEach(ysb => {
                    const yearMatch = ysb.match(/^(\d+)/);
                    if (yearMatch) {
                        const year = parseInt(yearMatch[1], 10);
                        // 匹配 str: 后面的内容
                        const strMatch = ysb.match(/str:\s*(.+)/);
                        if (strMatch && year >= maxYear) {
                            maxYear = year;
                            bestStr = strMatch[1].trim().replace(/^['"]|['"]$/g, '');
                        }
                    }
                });

                // 存入 Map，将缩写名转小写以防大小写不一致
                if (title && bestStr) {
                    accRatesMap.set(title.toLowerCase(), bestStr);
                }
            });
            
            // 如果拉取完数据时正处于 ccf_list 模式，自动刷新视图
            if (currentMode === 'ccf_list') updateView();
        } catch (error) {
            console.error("收录率数据拉取失败:", error);
        }
    }
    
    let sjrSortConfig = {
        key: 'sjr', // 默认按 SJR 分数排序
        asc: false  // 默认降序 (大数值在前)
    };
    
    let jcrSortConfig = {
        key: 'factor', // 默认按影响因子排序
        asc: false     // 默认降序 (大数值在前)
    };

    let ccfSortConfig = {
        key: 'grade', // 默认按 CCF 级别排序
        asc: true     // 默认升序 (A在前，C在后)
    };

    let deadlineSortConfig = {
        key: 'deadline', // 默认按截止时间排序
        asc: true
    };

    // 当前视图模式 ('deadlines', 'ccf_list', 'sjr_list' 或 'jcr_list')
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

    // ==========================================
    // 解析 SJR 数据 (SCImago)
    // ==========================================
    if (typeof SCImago !== 'undefined' && SCImago.data) {
        sjrData = SCImago.data.map(row => {
            const parseNum = (val, isFloat = false) => {
                if (!val || val === '-') return 0;
                let strVal = String(val).replace(/,/g, isFloat ? '.' : ''); // 浮点数逗号转点，整数剔除千分位
                return isFloat ? parseFloat(strVal) : parseInt(strVal, 10);
            };

            return {
                title: row[0] || '',
                type: row[1] || '',
                issn: row[2] || '',
                publisher: row[3] || '',
                sjr: parseNum(row[4], true),
                quartile: row[5] || '-',
                hIndex: parseNum(row[6]),
                totalDocsYear: parseNum(row[7]),     
                totalDocs3Years: parseNum(row[8]),   
                totalRefs: parseNum(row[9]),         
                totalCites3Years: parseNum(row[10]), 
                citableDocs3Years: parseNum(row[11]),
                citesDoc2Years: parseNum(row[12], true), 
                refDoc: parseNum(row[13], true),           
                country: row[14] || '',
                region: row[15] || '',
                areas: row[16] || row[15] || '' 
            };
        });
    }

    // ==========================================
    // 解析 JCR 数据 (影响因子)
    // ==========================================
    const getFactorBand = (value) => {
        if (!value || Number.isNaN(value)) return '未知';
        if (value >= 20) return '>=20';
        if (value >= 10) return '10-20';
        if (value >= 5) return '5-10';
        if (value >= 1) return '1-5';
        return '<1';
    };

    if (typeof factor !== 'undefined' && factor.data) {
        jcrData = factor.data.map(row => {
            const num = parseFloat(String(row[1] ?? '').replace(/,/g, ''));
            const factorValue = Number.isFinite(num) ? num : 0;
            const jcr = row[2] || '-';
            const zky = row[7] || '-';
            return {
                nlmId: row[0] || '',
                factor: factorValue,
                factorBand: getFactorBand(factorValue),
                jcr: jcr === '.' ? '-' : jcr,
                journal: row[3] || '',
                abbr: row[4] || '',
                issn: row[5] || '',
                eissn: row[6] || '',
                zky: zky === '.' ? '-' : zky
            };
        });
    }

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
    const tabSjrList = document.getElementById('tab-sjr-list'); 
    const tabJcrList = document.getElementById('tab-jcr-list');
    
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

    if (tabSjrList) {
        tabSjrList.addEventListener('click', (e) => {
            e.preventDefault();
            setMode('sjr_list');
        });
    }

    if (tabJcrList) {
        tabJcrList.addEventListener('click', (e) => {
            e.preventDefault();
            setMode('jcr_list');
        });
    }

    function createMultiSelect(selectId, options, placeholder) {
        const originalSelect = document.getElementById(selectId);
        if (!originalSelect) return;

        originalSelect.style.display = 'none'; 
        originalSelect.multiple = true;
        
        const existing = originalSelect.nextElementSibling;
        if (existing && existing.classList.contains('custom-multi-select')) existing.remove();

        const container = document.createElement('div');
        container.className = 'custom-multi-select';
        
        const displayBtn = document.createElement('div');
        displayBtn.className = 'select-box form-select';
        displayBtn.innerHTML = `<span>${placeholder}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"></path></svg>`;
        
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown-list';
        
        let html = `<label class="dropdown-item"><input type="checkbox" value="all" checked> <span class="truncate">所有选项</span></label>`;
        options.forEach(opt => {
            html += `<label class="dropdown-item"><input type="checkbox" value="${opt.value}"> <span class="truncate">${opt.label}</span></label>`;
        });
        dropdown.innerHTML = html;
        
        container.appendChild(displayBtn);
        container.appendChild(dropdown);
        originalSelect.parentNode.insertBefore(container, originalSelect.nextSibling);

        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');

        displayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dropdown-list').forEach(list => { if (list !== dropdown) list.classList.remove('show'); });
            dropdown.classList.toggle('show');
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation()); 

        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.value === 'all' && e.target.checked) {
                    checkboxes.forEach(c => { if(c !== allCheckbox) c.checked = false; });
                } else if (e.target.checked) {
                    allCheckbox.checked = false;
                }
                
                if (!Array.from(checkboxes).some(c => c.checked)) allCheckbox.checked = true;

                updateSelectText();
                currentPage = 1;
                updateView(); 
            });
        });

        function updateSelectText() {
            const checked = Array.from(checkboxes).filter(c => c.checked);
            const textSpan = displayBtn.querySelector('span');
            if (checked.length === 0 || checked[0].value === 'all') {
                textSpan.textContent = placeholder;
            } else if (checked.length === 1) {
                textSpan.textContent = checked[0].nextElementSibling.textContent;
            } else {
                textSpan.textContent = `已选 ${checked.length} 项`;
            }
            
            originalSelect.replaceChildren();
            checked.forEach(c => {
                const option = document.createElement('option');
                option.value = c.value;
                option.selected = true;
                originalSelect.appendChild(option);
            });
        }
        updateSelectText();
    }

    function getSelectedValues(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return ['all'];
        const values = Array.from(select.options).filter(opt => opt.selected).map(opt => opt.value);
        return values.length > 0 ? values : ['all'];
    }

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-list').forEach(list => list.classList.remove('show'));
    });


    function setMode(mode) {
        currentMode = mode;
        currentPage = 1;
        document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
        
        const col4 = document.getElementById('filter-col-4');
        const label1 = document.getElementById('label-filter-1');
        const label2 = document.getElementById('label-filter-2');
        const label3 = document.getElementById('label-filter-3');
        const tzWrapper = document.querySelector('.timezone-wrapper');
        const ccfNotice = document.getElementById('ccf-list-notice'); 
        const sjrNotice = document.getElementById('sjr-list-notice'); // 获取新增的 SJR 备注元素
        const jcrNotice = document.getElementById('jcr-list-notice');

        if (mode === 'deadlines') {
            const tab = document.getElementById('tab-deadlines');
            if (tab) tab.classList.add('active');
            if (label1) label1.textContent = '领域';
            if (label2) label2.textContent = 'CCF 级别';
            if (label3) label3.textContent = '年份';
            if (col4) col4.style.display = 'block';
            if (tzWrapper) tzWrapper.style.display = 'block';
            if (ccfNotice) ccfNotice.style.display = 'none'; // 隐藏 CCF 备注
            if (sjrNotice) sjrNotice.style.display = 'none'; // 隐藏 SJR 备注
            if (jcrNotice) jcrNotice.style.display = 'none';
            
            initDeadlineFilters();
        } else if (mode === 'ccf_list') {
            const tab = document.getElementById('tab-ccf-list');
            if (tab) tab.classList.add('active');
            if (label1) label1.textContent = '领域';
            if (label2) label2.textContent = 'CCF 级别';
            if (label3) label3.textContent = '类型'; 
            if (col4) col4.style.display = 'none';
            if (tzWrapper) tzWrapper.style.display = 'none';
            if (ccfNotice) ccfNotice.style.display = 'flex'; // 显示 CCF 备注
            if (sjrNotice) sjrNotice.style.display = 'none'; // 隐藏 SJR 备注
            if (jcrNotice) jcrNotice.style.display = 'none';
            
            initCCFListFilters();
        } else if (mode === 'sjr_list') {
            const tab = document.getElementById('tab-sjr-list');
            if (tab) tab.classList.add('active');
            if (label1) label1.textContent = '领域';
            if (label2) label2.textContent = 'SJR 分区';
            if (label3) label3.textContent = '类型'; 
            if (col4) col4.style.display = 'none';
            if (tzWrapper) tzWrapper.style.display = 'none';
            if (ccfNotice) ccfNotice.style.display = 'none'; // 隐藏 CCF 备注
            if (sjrNotice) sjrNotice.style.display = 'flex'; // 显示 SJR 备注
            if (jcrNotice) jcrNotice.style.display = 'none';
            
            initSJRFilters();
        } else if (mode === 'jcr_list') {
            const tab = document.getElementById('tab-jcr-list');
            if (tab) tab.classList.add('active');
            if (label1) label1.textContent = '中科院分区';
            if (label2) label2.textContent = 'JCR 分区';
            if (label3) label3.textContent = '影响因子区间';
            if (col4) col4.style.display = 'none';
            if (tzWrapper) tzWrapper.style.display = 'none';
            if (ccfNotice) ccfNotice.style.display = 'none';
            if (sjrNotice) sjrNotice.style.display = 'none';
            if (jcrNotice) jcrNotice.style.display = 'flex';

            initJCRFilters();
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
            
            if (currentMode === 'deadlines') {
                initDeadlineFilters(); 
            }
            updateView();
        } catch (error) {
            if(conferencesContainer) conferencesContainer.innerHTML = `<p class="empty-text" style="color:red;">数据拉取失败，请检查网络</p>`;
        }
    }

    // ==========================================
    // 动态生成下拉筛选器
    // ==========================================
    function initDeadlineFilters() {
        const categories = new Set();
        const levels = new Set();
        const years = new Set();

        confData.forEach(conf => {
            if (conf.sub) categories.add(conf.sub);
            if (conf.rank && conf.rank.ccf) levels.add(conf.rank.ccf);
            if (conf.confs && conf.confs.length > 0 && conf.confs[0].year) years.add(conf.confs[0].year);
        });

        createMultiSelect('category-filter', Array.from(categories).sort().map(sub => ({value: sub, label: subMap[sub] || sub})), '所有领域');
        createMultiSelect('level-filter', Array.from(levels).sort().map(lvl => ({value: lvl, label: lvl === 'N' ? '无评级' : `CCF-${lvl}`})), '所有级别');
        createMultiSelect('year-filter', Array.from(years).sort((a,b)=>b-a).map(y => ({value: y, label: y})), '所有年份');
        
        createMultiSelect('deadline-filter', [
            {value: 'upcoming', label: '即将截稿 (30天内)'},
            {value: 'open', label: '开放投稿'},
            {value: 'passed', label: '已截稿'}
        ], '所有状态');
    }
    
    function initCCFListFilters() {
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

        createMultiSelect('category-filter', Array.from(categories).sort().map(sub => ({value: sub, label: sub})), '所有领域');
        createMultiSelect('level-filter', Array.from(levels).sort().map(lvl => ({value: lvl, label: `CCF-${lvl}`})), '所有级别');
        createMultiSelect('year-filter', Array.from(types).sort().map(t => ({value: t, label: t})), '所有类型');
    }

    function initSJRFilters() {
        const areas = new Set();
        const quartiles = new Set();
        const types = new Set();

        if (sjrData && sjrData.length > 0) {
            sjrData.forEach(item => {
                if (item.areas) {
                    item.areas.split(';').forEach(a => areas.add(a.trim()));
                }
                if (item.quartile) quartiles.add(item.quartile);
                if (item.type) types.add(item.type);
            });
        }

        createMultiSelect('category-filter', Array.from(areas).filter(a => a).sort().map(a => ({value: a, label: a})), '所有领域');
        createMultiSelect('level-filter', Array.from(quartiles).sort().map(q => ({value: q, label: q === '-' ? '无分区' : q})), '所有分区');
        createMultiSelect('year-filter', Array.from(types).sort().map(t => ({value: t, label: t})), '所有类型');
    }

    function initJCRFilters() {
        const zkySet = new Set();
        const jcrSet = new Set();
        const factorBands = new Set();

        if (jcrData && jcrData.length > 0) {
            jcrData.forEach(item => {
                if (item.zky) zkySet.add(item.zky);
                if (item.jcr) jcrSet.add(item.jcr);
                if (item.factorBand) factorBands.add(item.factorBand);
            });
        }

        const bandOrder = {
            '>=20': 1,
            '10-20': 2,
            '5-10': 3,
            '1-5': 4,
            '<1': 5,
            '未知': 6
        };

        createMultiSelect(
            'category-filter',
            Array.from(zkySet)
                .filter(a => a && a !== '.')
                .sort()
                .map(a => ({value: a, label: a === '-' ? '无分区' : a})),
            '所有中科院分区'
        );
        createMultiSelect('level-filter', Array.from(jcrSet).filter(q => q).sort().map(q => ({value: q, label: q === '-' ? '无分区' : q})), '所有 JCR 分区');
        createMultiSelect(
            'year-filter',
            Array.from(factorBands).sort((a, b) => (bandOrder[a] || 99) - (bandOrder[b] || 99)).map(b => ({value: b, label: b})),
            '所有区间'
        );
    }
    
    function bindFilterEvents() {
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
    // 界面渲染 - CCF Deadlines
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
    // Interface rendering - CCF Deadlines (Table)
    // ==========================================
    function createDeadlineTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 Deadline 数据</p>';
        }

        const rowsHTML = dataList.map(item => {
            const conf = item.conf;
            const timeStatus = item.statusInfo;
            const latestConf = conf.confs && conf.confs.length > 0 ? conf.confs[0] : {};

            const ccfRank = conf.rank && conf.rank.ccf ? conf.rank.ccf : 'N';
            const ccfClass = ccfRank === 'A' ? "quartile-tag quartile-q1" : "quartile-tag quartile-normal";

            const categoryAbbr = conf.sub || 'MIX';
            const categoryFullName = subMap[conf.sub] || conf.sub || 'MIX';

            const originalTz = latestConf.timezone || 'UTC';
            const formattedDeadline = formatToSelectedTz(timeStatus.ms, selectedTimezone, originalTz);
            const deadlineBadge = timeStatus.comment ? `<span class="deadline-badge">${timeStatus.comment}</span>` : '';

            const place = latestConf.place || 'TBA';
            const confName = conf.description || 'TBA';
            const confDate = latestConf.date || '-';
            const confLink = latestConf.link || '#';

            const rowClass = timeStatus.isUrgent ? 'deadline-row deadline-urgent' : 'deadline-row';
            const linkHTML = confLink && confLink !== '#'
                ? `<a href="${confLink}" target="_blank" rel="noreferrer" class="table-link">官网</a>`
                : '-';
            const titleHTML = confLink && confLink !== '#'
                ? `<a href="${confLink}" target="_blank" rel="noreferrer" class="author-link">${conf.title}</a>`
                : `${conf.title}`;

            return `
                <tr class="${rowClass}">
                    <td class="title-col" title="${conf.title}">
                        ${titleHTML}
                    </td>
                    <td style="white-space: normal; min-width: 220px; line-height: 1.4;">${confName}</td>
                    <td><span class="${ccfClass}">CCF-${ccfRank}</span></td>
                    <td class="deadline-cell" title="${formattedDeadline}">
                        <div class="deadline-main">${formattedDeadline}</div>
                        ${deadlineBadge}
                    </td>
                    <td class="countdown-timer-container" data-ts="${timeStatus.ms || ''}">
                        <span class="countdown-text">计算中..</span>
                    </td>
                    <td style="white-space: normal; min-width: 140px;">${confDate}</td>
                    <td style="white-space: normal; min-width: 140px;">${place}</td>
                    <td><span class="card-tag tag-normal" title="${categoryFullName}">${categoryAbbr}</span></td>
                    <td>${linkHTML}</td>
                </tr>
            `;
        }).join('');

        const getDeadlineTh = (key, label, minW = '') => {
            let icon = '⇅';
            let iconClass = 'sort-icon';
            if (deadlineSortConfig.key === key) {
                icon = deadlineSortConfig.asc ? '▲' : '▼';
                iconClass += ' active';
            }
            const widthStyle = minW ? `min-width: ${minW};` : '';
            return `<th class="sortable-th" data-sort="${key}" style="${widthStyle}">${label} <span class="${iconClass}">${icon}</span></th>`;
        };

        return `
            <div class="sjr-table-wrapper deadline-table-wrapper">
                <table class="sjr-table deadline-table">
                    <thead>
                        <tr>
                            ${getDeadlineTh('title', '简称')}
                            ${getDeadlineTh('fullname', '全称', '220px')}
                            ${getDeadlineTh('grade', '级别')}
                            ${getDeadlineTh('deadline', '截止时间', '200px')}
                            ${getDeadlineTh('countdown', '倒计时')}
                            ${getDeadlineTh('confDate', '会议时间', '140px')}
                            ${getDeadlineTh('place', '地点', '140px')}
                            ${getDeadlineTh('domain', '领域')}
                            ${getDeadlineTh('link', '官网')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==========================================
    // 界面渲染 - CCF 推荐列表
    // ==========================================
    function createCCFListCardHTML(item) {
        const ccfClass = item.grade === 'A' ? "tag-horror" : "tag-normal";
        const categoryAbbr = Object.keys(subMap).find(key => subMap[key] === item.domain) || 'MIX';
        
        const tagsHTML = `
            <span class="card-tag ${ccfClass}">CCF-${item.grade}</span>
            <span class="card-tag tag-normal" title="${item.domain}">${categoryAbbr}</span>
        `;

        const coverHTML = `
            <div class="card-cover-fallback">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,0.9);">${item.abbr}</div>
                </div>
            </div>`;

        // 根据会议缩写从小写 Map 中获取最新的收录率
        const abbrLower = (item.abbr || '').toLowerCase();
        const accRateStr = accRatesMap.get(abbrLower) || '暂无数据';

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
                        <div class="meta-item truncate" title="全称: ${item.fullname}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            <span class="truncate">${item.fullname}</span>
                        </div>
                        <div class="meta-item truncate" title="出版社: ${item.publisher}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                            <span class="truncate">${item.publisher}</span>
                        </div>
                        <div class="meta-item truncate" title="类型: ${item.type}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                            <span class="truncate">${item.type}</span>
                        </div>
                        <div class="meta-item truncate" title="最新收录率: ${accRateStr}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <span class="truncate">收率: ${accRateStr}</span>
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
    // 界面渲染 - CCF 推荐列表 (表格模式)
    // ==========================================
    function createCCFTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 CCF 推荐数据</p>';
        }

        let rowsHTML = dataList.map(item => {
            const isQ1 = item.grade === 'A';
            const ccfClass = isQ1 ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';
            const categoryAbbr = Object.keys(subMap).find(key => subMap[key] === item.domain) || item.domain || 'MIX';
            
            const abbrLower = (item.abbr || '').toLowerCase();
            const accRateStr = accRatesMap.get(abbrLower) || '-';
            const ccfLink = item.url || '#';
            const linkHTML = ccfLink && ccfLink !== '#'
                ? `<a href="${ccfLink}" target="_blank" rel="noreferrer" class="table-link">官网</a>`
                : '-';

            return `
                <tr>
                    <td class="title-col" title="${item.abbr}">
                        <a href="${ccfLink}" target="_blank" style="text-decoration: none; color: inherit;" class="author-link">${item.abbr}</a>
                    </td>
                    <td style="white-space: normal; min-width: 200px; line-height: 1.4;">${item.fullname}</td>
                    <td><span class="${ccfClass}">CCF-${item.grade}</span></td>
                    <td><span class="card-tag tag-normal">${categoryAbbr}</span></td>
                    <td>${item.type}</td>
                    <td style="white-space: normal; min-width: 150px;">${item.publisher}</td>
                    <td>${accRateStr}</td>
                    <td>${linkHTML}</td>
                </tr>
            `;
        }).join('');

        const getTh = (key, label, minW = '') => {
            let icon = '↕';
            let iconClass = 'sort-icon';
            if (ccfSortConfig.key === key) {
                icon = ccfSortConfig.asc ? '▲' : '▼';
                iconClass += ' active';
            }
            const widthStyle = minW ? `min-width: ${minW};` : '';
            return `<th class="sortable-th" data-sort="${key}" style="${widthStyle}">${label} <span class="${iconClass}">${icon}</span></th>`;
        };

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${getTh('abbr', '简称')}
                            ${getTh('fullname', '全称', '200px')}
                            ${getTh('grade', '级别')}
                            ${getTh('domain', '领域')}
                            ${getTh('type', '类型')}
                            ${getTh('publisher', '出版社')}
                            <th>最新收录率</th>
                            <th>官网</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==========================================
    // 界面渲染 - SJR 排名列表 (表格模式)
    // ==========================================
    function createSJRTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 SJR 排名数据</p>';
        }

        let rowsHTML = dataList.map(item => {
            const isQ1 = item.quartile === 'Q1';
            const quartileClass = isQ1 ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';

            // 针对 conference and proceedings 进行针对性换行处理
            let typeHtml = item.type || '-';
            if (typeHtml.toLowerCase().includes(' and ')) {
                typeHtml = typeHtml.replace(' and ', '<br>and ');
            }

            return `
                <tr>
                    <td class="title-col" title="${item.title}">${item.title}</td>
                    <td style="text-transform: capitalize; white-space: normal; min-width: 120px; line-height: 1.4;">${typeHtml}</td>
                    <td><span class="${quartileClass}">${item.quartile || '-'}</span></td>
                    <td class="sjr-score">${item.sjr}</td>
                    <td>${item.hIndex || '-'}</td>
                    <td>${item.citesDoc2Years || '-'}</td>
                    <td>${item.totalDocsYear || '-'}</td>
                    <td>${item.totalCites3Years || '-'}</td>
                    <td>${item.country || '-'}</td>
                </tr>
            `;
        }).join('');

        // 生成带状态的表头和箭头小图标
        const getTh = (key, label, minW = '') => {
            let icon = '↕';
            let iconClass = 'sort-icon';
            if (sjrSortConfig.key === key) {
                icon = sjrSortConfig.asc ? '▲' : '▼';
                iconClass += ' active';
            }
            const widthStyle = minW ? `min-width: ${minW};` : '';
            return `<th class="sortable-th" data-sort="${key}" style="${widthStyle}">${label} <span class="${iconClass}">${icon}</span></th>`;
        };

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${getTh('title', '名称')}
                            ${getTh('type', '类型', '120px')}
                            ${getTh('quartile', '分区')}
                            ${getTh('sjr', 'SJR')}
                            ${getTh('hIndex', 'H-Index')}
                            ${getTh('citesDoc2Years', '近两年篇均被引')}
                            ${getTh('totalDocsYear', '文献数')}
                            ${getTh('totalCites3Years', '近三年被引')}
                            ${getTh('country', '国家')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==========================================
    // 界面渲染 - JCR 影响因子列表 (表格模式)
    // ==========================================
    function createJCRTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 JCR 数据</p>';
        }

        const clean = (val) => {
            if (val === undefined || val === null) return '-';
            const str = String(val).trim();
            return str === '' || str === '.' ? '-' : str;
        };

        let rowsHTML = dataList.map(item => {
            const isQ1 = item.jcr === 'Q1';
            const quartileClass = isQ1 ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';
            const factorText = item.factor && item.factor > 0 ? item.factor.toFixed(2) : '-';
            const zkyText = clean(item.zky);

            return `
                <tr>
                    <td class="title-col" title="${item.journal}">${clean(item.journal)}</td>
                    <td class="title-col" title="${item.abbr}">${clean(item.abbr)}</td>
                    <td class="sjr-score">${factorText}</td>
                    <td><span class="${quartileClass}">${clean(item.jcr)}</span></td>
                    <td>${zkyText === '-' ? '无分区' : zkyText}</td>
                    <td>${clean(item.issn)}</td>
                    <td>${clean(item.eissn)}</td>
                </tr>
            `;
        }).join('');

        const getTh = (key, label, minW = '') => {
            let icon = '↕';
            let iconClass = 'sort-icon';
            if (jcrSortConfig.key === key) {
                icon = jcrSortConfig.asc ? '▲' : '▼';
                iconClass += ' active';
            }
            const widthStyle = minW ? `min-width: ${minW};` : '';
            return `<th class="sortable-th" data-sort="${key}" style="${widthStyle}">${label} <span class="${iconClass}">${icon}</span></th>`;
        };

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${getTh('journal', '期刊名称', '200px')}
                            ${getTh('abbr', '简称', '120px')}
                            ${getTh('factor', '影响因子')}
                            ${getTh('jcr', 'JCR 分区')}
                            ${getTh('zky', '中科院分区')}
                            ${getTh('issn', 'ISSN')}
                            ${getTh('eissn', 'eISSN')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ==========================================
    // 更新视图 (三分支逻辑)
    // ==========================================
    function updateView() {
        const catFilters = getSelectedValues('category-filter');
        const levelFilters = getSelectedValues('level-filter');
        const col3Filters = getSelectedValues('year-filter');
        const statusFilters = getSelectedValues('deadline-filter');
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
                
                if (!catFilters.includes('all') && !catFilters.includes(conf.sub)) return false;

                const ccfRank = conf.rank && conf.rank.ccf ? conf.rank.ccf : 'N';
                if (!levelFilters.includes('all') && !levelFilters.includes(ccfRank)) return false;

                const confYear = conf.confs && conf.confs.length > 0 ? String(conf.confs[0].year) : '';
                if (!col3Filters.includes('all') && !col3Filters.includes(confYear)) return false;

                if (!statusFilters.includes('all')) {
                    let isUpcoming = ms !== null && ms > now && (ms - now) <= 30 * 24 * 60 * 60 * 1000;
                    let isOpen = ms !== null && ms > now;
                    let isPassed = ms === null || ms <= now;
                    
                    let statusMatch = false;
                    if (statusFilters.includes('upcoming') && isUpcoming) statusMatch = true;
                    if (statusFilters.includes('open') && isOpen) statusMatch = true;
                    if (statusFilters.includes('passed') && isPassed) statusMatch = true;

                    if (!statusMatch) return false;
                }
                return true;
            });

            filteredData.sort((a, b) => {
                const confA = a.conf, confB = b.conf;
                const latestA = confA.confs && confA.confs.length > 0 ? confA.confs[0] : {};
                const latestB = confB.confs && confB.confs.length > 0 ? confB.confs[0] : {};

                const key = deadlineSortConfig.key;
                let valA = '';
                let valB = '';

                if (key === 'deadline' || key === 'countdown') {
                    const msA = a.statusInfo.ms;
                    const msB = b.statusInfo.ms;
                    const isAValid = msA !== null && msA > now;
                    const isBValid = msB !== null && msB > now;
                    if (isAValid && !isBValid) return -1;
                    if (!isAValid && isBValid) return 1;
                    if (msA === null && msB === null) return 0;
                    if (msA === null) return 1;
                    if (msB === null) return -1;
                    const cmp = msA - msB;
                    return deadlineSortConfig.asc ? cmp : -cmp;
                }

                if (key === 'grade') {
                    const rankA = confA.rank && confA.rank.ccf ? confA.rank.ccf : 'N';
                    const rankB = confB.rank && confB.rank.ccf ? confB.rank.ccf : 'N';
                    const rMap = { 'A': 1, 'B': 2, 'C': 3, 'N': 4 };
                    const cmp = (rMap[rankA] || 4) - (rMap[rankB] || 4);
                    return deadlineSortConfig.asc ? cmp : -cmp;
                }

                if (key === 'title') {
                    valA = confA.title || '';
                    valB = confB.title || '';
                } else if (key === 'fullname') {
                    valA = confA.description || '';
                    valB = confB.description || '';
                } else if (key === 'confDate') {
                    valA = latestA.date || '';
                    valB = latestB.date || '';
                } else if (key === 'place') {
                    valA = latestA.place || '';
                    valB = latestB.place || '';
                } else if (key === 'domain') {
                    valA = confA.sub || '';
                    valB = confB.sub || '';
                } else if (key === 'link') {
                    valA = latestA.link || '';
                    valB = latestB.link || '';
                }

                const cmp = String(valA).localeCompare(String(valB));
                return deadlineSortConfig.asc ? cmp : -cmp;
            });

        // --- 分支 2：CCF推荐列表 数据逻辑 ---
        } else if (currentMode === 'ccf_list') {
            if (typeof ccfData === 'undefined' || ccfData.length === 0) return;
            
            filteredData = ccfData.filter(item => {
                const matchSearch = (item.abbr || '').toLowerCase().includes(searchQuery) || (item.fullname || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;
                
                if (!catFilters.includes('all') && !catFilters.includes(item.domain)) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.grade)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.type)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                let valA = a[ccfSortConfig.key];
                let valB = b[ccfSortConfig.key];

                if (valA === undefined || valA === null) valA = '';
                if (valB === undefined || valB === null) valB = '';

                let cmp = String(valA).localeCompare(String(valB));
                
                // 如果是按照级别(grade)排序且级别相同，则默认按 abbr 字母序做次级排序
                if (cmp === 0 && ccfSortConfig.key === 'grade') {
                    return String(a.abbr || '').localeCompare(String(b.abbr || ''));
                }

                return ccfSortConfig.asc ? cmp : -cmp;
            });

        // --- 分支 3：SJR 排名数据逻辑 ---
        } else if (currentMode === 'sjr_list') {
            if (!sjrData || sjrData.length === 0) return;

            filteredData = sjrData.filter(item => {
                const matchSearch = (item.title || '').toLowerCase().includes(searchQuery) || (item.publisher || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;
                
                if (!catFilters.includes('all')) {
                    const itemAreas = item.areas ? item.areas.split(';').map(a => a.trim()) : [];
                    if (!itemAreas.some(a => catFilters.includes(a))) return false;
                }
                if (!levelFilters.includes('all') && !levelFilters.includes(item.quartile)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.type)) return false;
                
                return true;
            });

            // ==========================================
            // 新增：动态字段排序逻辑
            // ==========================================
            filteredData.sort((a, b) => {
                let valA = a[sjrSortConfig.key];
                let valB = b[sjrSortConfig.key];

                // 特殊处理：分区 (Quartile) 的字母序是反直觉的 (Q1比Q4好)，需要转为数字等级进行比较
                if (sjrSortConfig.key === 'quartile') {
                    const qMap = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4, '-': 5, '': 5 };
                    let numA = qMap[valA] || 5;
                    let numB = qMap[valB] || 5;
                    return sjrSortConfig.asc ? numA - numB : numB - numA; 
                }

                // 常规排序 (数字与字符串区分处理)
                if (valA === undefined || valA === null) valA = '';
                if (valB === undefined || valB === null) valB = '';

                let cmp = 0;
                if (typeof valA === 'number' && typeof valB === 'number') {
                    cmp = valA - valB;
                } else {
                    cmp = String(valA).localeCompare(String(valB));
                }

                return sjrSortConfig.asc ? cmp : -cmp;
            });
        
        // --- 分支 4：JCR 影响因子数据逻辑 ---
        } else if (currentMode === 'jcr_list') {
            if (!jcrData || jcrData.length === 0) return;

            filteredData = jcrData.filter(item => {
                const matchSearch = (item.journal || '').toLowerCase().includes(searchQuery)
                    || (item.abbr || '').toLowerCase().includes(searchQuery)
                    || (item.issn || '').toLowerCase().includes(searchQuery)
                    || (item.eissn || '').toLowerCase().includes(searchQuery);
                if (!matchSearch) return false;

                if (!catFilters.includes('all') && !catFilters.includes(item.zky)) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.jcr)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.factorBand)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                let valA = a[jcrSortConfig.key];
                let valB = b[jcrSortConfig.key];

                if (jcrSortConfig.key === 'jcr') {
                    const qMap = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4, '-': 5, '': 5 };
                    const numA = qMap[valA] || 5;
                    const numB = qMap[valB] || 5;
                    return jcrSortConfig.asc ? numA - numB : numB - numA;
                }

                if (jcrSortConfig.key === 'zky') {
                    const toNum = (v) => {
                        const match = String(v || '').match(/\d+/);
                        return match ? parseInt(match[0], 10) : 99;
                    };
                    const numA = toNum(valA);
                    const numB = toNum(valB);
                    return jcrSortConfig.asc ? numA - numB : numB - numA;
                }

                if (valA === undefined || valA === null) valA = '';
                if (valB === undefined || valB === null) valB = '';

                let cmp = 0;
                if (typeof valA === 'number' && typeof valB === 'number') {
                    cmp = valA - valB;
                } else {
                    cmp = String(valA).localeCompare(String(valB));
                }

                return jcrSortConfig.asc ? cmp : -cmp;
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

        // 渲染列表：如果是在 SJR 列表模式下，则调用新增的 createSJRTableHTML 函数整体渲染，其他模式还是以卡片形式循环拼接
        const emptyMsg = '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的数据</p>';
        if (conferencesContainer) {
            if (currentMode === 'deadlines') {
                conferencesContainer.innerHTML = createDeadlineTableHTML(paginatedData);
            } else if (currentMode === 'ccf_list') {
                conferencesContainer.innerHTML = createCCFTableHTML(paginatedData);
            } else if (currentMode === 'sjr_list') {
                conferencesContainer.innerHTML = createSJRTableHTML(paginatedData);
            } else if (currentMode === 'jcr_list') {
                conferencesContainer.innerHTML = createJCRTableHTML(paginatedData);
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
            el.classList.remove('timer-normal', 'timer-warning', 'timer-urgent', 'timer-finished', 'timer-tbd');

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
    fetchAcceptanceRates(); // 启动时异步拉取收录率

    const updateDataBtn = document.getElementById('update-data-btn');
    if (updateDataBtn) {
        updateDataBtn.addEventListener('click', async () => {
            const icon = updateDataBtn.querySelector('.refresh-icon');
            if (icon) icon.classList.add('spin-anim');
            updateDataBtn.disabled = true; 
            
            // 并发重新拉取两边的数据
            await Promise.all([
                fetchConferencesData(),
                fetchAcceptanceRates()
            ]);
            
            if (icon) icon.classList.remove('spin-anim'); 
            updateDataBtn.disabled = false; 
        });
    }
    // ==========================================
    // 表格表头点击排序事件
    // ==========================================
    if (conferencesContainer) {
        conferencesContainer.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable-th');
            if (th) {
                const sortKey = th.getAttribute('data-sort');
                
                if (currentMode === 'sjr_list') {
                    if (sjrSortConfig.key === sortKey) {
                        sjrSortConfig.asc = !sjrSortConfig.asc;
                    } else {
                        sjrSortConfig.key = sortKey;
                        if (['title', 'type', 'quartile', 'country'].includes(sortKey)) {
                            sjrSortConfig.asc = true;
                        } else {
                            sjrSortConfig.asc = false;
                        }
                    }
                    updateView();
                }
                else if (currentMode === 'jcr_list') {
                    if (jcrSortConfig.key === sortKey) {
                        jcrSortConfig.asc = !jcrSortConfig.asc;
                    } else {
                        jcrSortConfig.key = sortKey;
                        if (['journal', 'abbr', 'jcr', 'zky', 'issn', 'eissn'].includes(sortKey)) {
                            jcrSortConfig.asc = true;
                        } else {
                            jcrSortConfig.asc = false;
                        }
                    }
                    updateView();
                }
                else if (currentMode === 'deadlines') {
                    if (deadlineSortConfig.key === sortKey) {
                        deadlineSortConfig.asc = !deadlineSortConfig.asc;
                    } else {
                        deadlineSortConfig.key = sortKey;
                        deadlineSortConfig.asc = true;
                    }
                    updateView();
                }
                else if (currentMode === 'ccf_list') {
                    if (ccfSortConfig.key === sortKey) {
                        ccfSortConfig.asc = !ccfSortConfig.asc;
                    } else {
                        ccfSortConfig.key = sortKey;
                        ccfSortConfig.asc = true; // CCF 大部分字段默认升序排列体验更好
                    }
                    updateView();
                }
            }
        });
    }
});
