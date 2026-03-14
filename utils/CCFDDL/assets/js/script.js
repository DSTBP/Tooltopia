document.addEventListener('DOMContentLoaded', () => {
    const conferencesContainer = document.getElementById('conferences-container');
    const searchInput = document.getElementById('search-input');
    const totalCountSpan = document.getElementById('total-count');
    const timezoneSelector = document.getElementById('timezone-selector');
    const paginationContainer = document.getElementById('pagination-container');
    const filtersContainer = document.getElementById('ccf-filters');

    let searchQuery = '';
    let selectedTimezone = 'local';
    
    // 全局数据变量
    let confData = [];
    let ccfData = [];
    let sjrData = [];
    let jcrData = [];
    let accRatesMap = new Map();

    const collator = new Intl.Collator('zh-CN', {
        numeric: true,
        sensitivity: 'base'
    });
    const domainCodeMap = {
        '计算机体系结构/并行与分布计算/存储系统': 'DS',
        '计算机网络': 'NW',
        '网络与信息安全': 'SC',
        '软件工程/系统软件/程序设计语言': 'SE',
        '数据库/数据挖掘/内容检索': 'DB',
        '计算机科学理论': 'CT',
        '计算机图形学与多媒体': 'CG',
        '人工智能': 'AI',
        '人机交互与普适计算': 'HI',
        '交叉/综合/新兴': 'MX'
    };
    const STORAGE_KEYS = {
        deadlines: 'ccfddl.deadlines.cache.v2',
        acceptanceRates: 'ccfddl.acceptance.cache.v1'
    };
    const CACHE_TTL_MS = {
        deadlines: 30 * 60 * 1000,
        acceptanceRates: 12 * 60 * 60 * 1000
    };
    const runtimeState = {
        activeModeToken: 0,
        deadlineLoadPromise: null,
        acceptanceLoadPromise: null,
        ccfLoadPromise: null,
        sjrLoadPromise: null,
        jcrLoadPromise: null,
        deadlinesLoaded: false,
        ccfLoaded: false,
        sjrLoaded: false,
        jcrLoaded: false,
        acceptanceLoaded: false,
        warningMessage: ''
    };
    let activeDropdown = null;
    let activeDropdownToggle = null;
    let scheduledRenderFrame = null;
    let scheduledRenderTimer = null;

    const safeStorage = {
        get(key) {
            try {
                return localStorage.getItem(key);
            } catch (_) {
                return null;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch (_) {
                // Ignore quota and privacy mode failures.
            }
        }
    };

    function readCachedData(key, ttlMs) {
        const raw = safeStorage.get(key);
        if (!raw) return null;

        try {
            const payload = JSON.parse(raw);
            if (!payload || typeof payload.timestamp !== 'number') return null;
            if ((Date.now() - payload.timestamp) > ttlMs) return null;
            return payload.data ?? null;
        } catch (_) {
            return null;
        }
    }

    function writeCachedData(key, data) {
        safeStorage.set(key, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url) {
        const trimmed = String(url ?? '').trim();
        if (!trimmed) return '#';

        try {
            const parsed = new URL(trimmed, window.location.href);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '#';
            return parsed.href;
        } catch (_) {
            return '#';
        }
    }

    function normalizeSearchText(...parts) {
        return parts
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function scheduleUpdateView(delayMs = 0) {
        if (scheduledRenderTimer) {
            clearTimeout(scheduledRenderTimer);
            scheduledRenderTimer = null;
        }

        const run = () => {
            if (scheduledRenderFrame) cancelAnimationFrame(scheduledRenderFrame);
            scheduledRenderFrame = requestAnimationFrame(() => {
                scheduledRenderFrame = null;
                updateView();
            });
        };

        if (delayMs > 0) {
            scheduledRenderTimer = setTimeout(run, delayMs);
            return;
        }

        run();
    }

    function setContainerMessage(message, isError = false) {
        if (!conferencesContainer) return;
        const className = isError ? 'empty-text error-text' : 'empty-text';
        conferencesContainer.innerHTML = `<p class="${className}" style="grid-column: 1/-1; text-align: center;${isError ? ' color:#f87171;' : ''}">${escapeHTML(message)}</p>`;
    }

    function setWarningMessage(message = '') {
        runtimeState.warningMessage = message;
    }

    function closeActiveDropdown() {
        if (activeDropdown) activeDropdown.classList.remove('show');
        if (activeDropdownToggle) activeDropdownToggle.setAttribute('aria-expanded', 'false');
        activeDropdown = null;
        activeDropdownToggle = null;
    }

    function isConferenceType(type) {
        return /会议|conference/i.test(String(type ?? ''));
    }

    function compareText(a, b) {
        return collator.compare(String(a ?? ''), String(b ?? ''));
    }

    function parseNum(val, isFloat = false) {
        if (val === undefined || val === null || val === '' || val === '-' || val === '.') return 0;
        const normalized = String(val).replace(/,/g, isFloat ? '.' : '');
        const parsed = isFloat ? parseFloat(normalized) : parseInt(normalized, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function getFactorBand(value) {
        if (!value || Number.isNaN(value)) return '未知';
        if (value >= 20) return '>=20';
        if (value >= 10) return '10-20';
        if (value >= 5) return '5-10';
        if (value >= 1) return '1-5';
        return '<1';
    }

    function normalizeTimezoneLabel(rawLabel) {
        const cleaned = String(rawLabel ?? '').replace(/^"+|"+$/g, '').trim();
        if (!cleaned) return '';
        if (/^aoe$/i.test(cleaned)) return 'AoE';
        if (/^z$/i.test(cleaned)) return 'UTC+0';

        const match = cleaned.match(/UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
        if (!match) {
            return /^utc$/i.test(cleaned) ? 'UTC+0' : cleaned;
        }

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2] || '0', 10);
        const sign = hours >= 0 ? '+' : '-';
        const absHours = Math.abs(hours);
        if (minutes === 0) return `UTC${sign}${absHours}`;
        return `UTC${sign}${String(absHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    function parseTimezoneOffsetMinutes(tzString) {
        const normalized = normalizeTimezoneLabel(tzString);
        if (!normalized) return 0;
        if (normalized.toUpperCase() === 'AOE') return -12 * 60;
        if (/^UTC\+0$/i.test(normalized) || /^UTC$/i.test(normalized)) return 0;

        const match = normalized.match(/UTC([+-]\d{1,2})(?::?(\d{2}))?/i);
        if (!match) return 0;

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2] || '0', 10);
        return (hours * 60) + (hours >= 0 ? minutes : -minutes);
    }

    function parseICSDateTime(value, params = {}) {
        if (!value) {
            return { ms: null, timezone: '' };
        }

        const tzLabel = normalizeTimezoneLabel(params.TZID || (String(value).endsWith('Z') ? 'UTC+0' : ''));
        const trimmed = String(value).trim();
        const utcMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (utcMatch) {
            return {
                ms: Date.UTC(
                    parseInt(utcMatch[1], 10),
                    parseInt(utcMatch[2], 10) - 1,
                    parseInt(utcMatch[3], 10),
                    parseInt(utcMatch[4], 10),
                    parseInt(utcMatch[5], 10),
                    parseInt(utcMatch[6], 10)
                ),
                timezone: tzLabel || 'UTC+0'
            };
        }

        const localMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
        if (localMatch) {
            const offsetMinutes = parseTimezoneOffsetMinutes(tzLabel);
            const utcMs = Date.UTC(
                parseInt(localMatch[1], 10),
                parseInt(localMatch[2], 10) - 1,
                parseInt(localMatch[3], 10),
                parseInt(localMatch[4], 10),
                parseInt(localMatch[5], 10),
                parseInt(localMatch[6], 10)
            ) - (offsetMinutes * 60 * 1000);
            return {
                ms: utcMs,
                timezone: tzLabel || 'UTC+0'
            };
        }

        return { ms: null, timezone: tzLabel };
    }

    function formatMsForTimezone(ms, timezone) {
        if (!Number.isFinite(ms)) return 'TBD';

        const offsetMinutes = parseTimezoneOffsetMinutes(timezone);
        const tzDate = new Date(ms + (offsetMinutes * 60 * 1000));
        const pad = (n) => String(n).padStart(2, '0');
        const label = normalizeTimezoneLabel(timezone) || 'UTC+0';
        return `${tzDate.getUTCFullYear()}-${pad(tzDate.getUTCMonth() + 1)}-${pad(tzDate.getUTCDate())} ${pad(tzDate.getUTCHours())}:${pad(tzDate.getUTCMinutes())}:${pad(tzDate.getUTCSeconds())} (${label})`;
    }

    function normalizeTimeline(timeline, fallbackTimezone) {
        const seen = new Set();

        return (timeline || [])
            .map(item => {
                const timezone = normalizeTimezoneLabel(item.timezone || fallbackTimezone || 'AoE') || 'AoE';
                const deadlineMs = Number.isFinite(item.deadlineMs)
                    ? item.deadlineMs
                    : getAbsoluteMs(item.deadline, timezone);
                const deadline = item.deadline || (Number.isFinite(deadlineMs) ? formatMsForTimezone(deadlineMs, timezone).replace(/\s+\(.+?\)$/, '') : 'TBD');
                const comment = String(item.comment || '截稿').trim() || '截稿';
                return {
                    deadline,
                    deadlineMs: Number.isFinite(deadlineMs) ? deadlineMs : null,
                    comment,
                    timezone
                };
            })
            .filter(item => {
                const dedupeKey = `${item.comment}|${item.deadlineMs ?? item.deadline}|${item.timezone}`;
                if (seen.has(dedupeKey)) return false;
                seen.add(dedupeKey);
                return true;
            })
            .sort((a, b) => {
                if (a.deadlineMs === null && b.deadlineMs === null) return compareText(a.comment, b.comment);
                if (a.deadlineMs === null) return 1;
                if (b.deadlineMs === null) return -1;
                return a.deadlineMs - b.deadlineMs;
            });
    }

    function finalizeConferenceEntry(entry) {
        const confs = (entry.confs || []).map(conf => {
            const timezone = normalizeTimezoneLabel(conf.timezone || 'AoE') || 'AoE';
            return {
                ...conf,
                link: sanitizeUrl(conf.link),
                timezone,
                timeline: normalizeTimeline(conf.timeline, timezone)
            };
        });

        return {
            ...entry,
            title: String(entry.title || '').trim(),
            description: String(entry.description || '').trim(),
            sub: String(entry.sub || '').trim(),
            rank: {
                ccf: entry.rank && entry.rank.ccf ? String(entry.rank.ccf).trim() : 'N'
            },
            confs,
            searchText: normalizeSearchText(entry.title, entry.description)
        };
    }

    function normalizeCCFData(rawData) {
        return (rawData || []).map(item => {
            const type = String(item.type || '').trim();
            const domain = String(item.domain || '').trim();
            return {
                ...item,
                type,
                domain,
                url: sanitizeUrl(item.url),
                domainCode: domainCodeMap[domain] || domain || 'MIX',
                searchText: normalizeSearchText(item.abbr, item.fullname, item.publisher)
            };
        });
    }

    function normalizeSJRData(rawData) {
        return (rawData || []).map(row => ({
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
            areas: row[16] || row[15] || '',
            searchText: normalizeSearchText(row[0], row[3], row[14], row[15], row[16])
        }));
    }

    function normalizeJCRData(rawData) {
        return (rawData || []).map(row => {
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
                zky: zky === '.' ? '-' : zky,
                searchText: normalizeSearchText(row[3], row[4], row[5], row[6], zky, jcr)
            };
        });
    }

    async function loadJavaScriptDataset(filePath, exportName) {
        if (window.location.protocol === 'file:') {
            return loadJavaScriptDatasetFromScriptTag(filePath, exportName);
        }

        const response = await fetch(filePath, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`Failed to load ${filePath}: ${response.status}`);
        }

        const code = await response.text();
        return new Function(`${code}\nreturn typeof ${exportName} !== 'undefined' ? ${exportName} : null;`)();
    }

    function loadJavaScriptDatasetFromScriptTag(filePath, exportName) {
        const loaderKey = `__ccfddl_dataset_${exportName}`;
        const helperKey = `__ccfddl_helper_${exportName}`;

        if (Object.prototype.hasOwnProperty.call(window, loaderKey) && window[loaderKey] !== undefined) {
            return Promise.resolve(window[loaderKey]);
        }

        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[data-dataset-script="${exportName}"]`);
            const finalize = () => {
                const helperScript = document.createElement('script');
                helperScript.dataset.datasetHelper = exportName;
                helperScript.text = `
                    window.${helperKey} = (function () {
                        try {
                            return typeof ${exportName} !== 'undefined' ? ${exportName} : null;
                        } catch (error) {
                            return null;
                        }
                    })();
                `;
                document.head.appendChild(helperScript);

                const datasetValue = window[helperKey];
                delete window[helperKey];
                helperScript.remove();

                if (datasetValue === null || datasetValue === undefined) {
                    reject(new Error(`Failed to resolve dataset ${exportName} from script tag`));
                    return;
                }

                window[loaderKey] = datasetValue;
                resolve(datasetValue);
            };

            if (existingScript) {
                finalize();
                return;
            }

            const script = document.createElement('script');
            script.src = filePath;
            script.async = true;
            script.dataset.datasetScript = exportName;
            script.onload = finalize;
            script.onerror = () => reject(new Error(`Failed to load ${filePath} via script tag`));
            document.head.appendChild(script);
        });
    }

    function parseAcceptanceRatesYAML(yamlText) {
        const nextMap = new Map();
        const blocks = yamlText.split(/(?:^|\n)-\s*title:\s*/);

        blocks.forEach(block => {
            if (!block.trim()) return;

            const lines = block.split('\n');
            const title = lines[0].trim().replace(/^['"]|['"]$/g, '');
            let maxYear = -1;
            let bestStr = '';

            const yearRegex = /^\s*-\s*year:\s*(\d+)/gm;
            let match = yearRegex.exec(block);
            while (match) {
                const year = parseInt(match[1], 10);
                const blockStart = match.index + match[0].length;
                const nextMatch = yearRegex.exec(block);
                const segment = block.slice(blockStart, nextMatch ? nextMatch.index : block.length);
                const strMatch = segment.match(/^\s*(?:str|srt):\s*(.+)$/m);
                if (strMatch && year >= maxYear) {
                    maxYear = year;
                    bestStr = strMatch[1].trim().replace(/^['"]|['"]$/g, '');
                }
                match = nextMatch;
            }

            if (title && bestStr) {
                nextMap.set(title.toLowerCase(), bestStr);
            }
        });

        return nextMap;
    }

    async function fetchAcceptanceRates(forceRefresh = false) {
        if (runtimeState.acceptanceLoadPromise && !forceRefresh) {
            return runtimeState.acceptanceLoadPromise;
        }

        const cachedMapData = !forceRefresh
            ? readCachedData(STORAGE_KEYS.acceptanceRates, CACHE_TTL_MS.acceptanceRates)
            : null;

        if (cachedMapData && !runtimeState.acceptanceLoaded) {
            accRatesMap = new Map(cachedMapData);
            runtimeState.acceptanceLoaded = true;
        }

        runtimeState.acceptanceLoadPromise = (async () => {
            const response = await fetch('https://raw.githubusercontent.com/ccfddl/ccfddl.github.io/page/conference/allacc.yml', {
                cache: forceRefresh ? 'no-store' : 'default'
            });
            if (!response.ok) {
                throw new Error(`Failed to load acceptance rates: ${response.status}`);
            }

            const yamlText = await response.text();
            accRatesMap = parseAcceptanceRatesYAML(yamlText);
            runtimeState.acceptanceLoaded = true;
            writeCachedData(STORAGE_KEYS.acceptanceRates, Array.from(accRatesMap.entries()));

            if (currentMode === 'ccf_list') scheduleUpdateView();
            return accRatesMap;
        })().catch(error => {
            if (!runtimeState.acceptanceLoaded) {
                console.error('收录率数据拉取失败:', error);
            }
            if (runtimeState.acceptanceLoaded) return accRatesMap;
            throw error;
        }).finally(() => {
            runtimeState.acceptanceLoadPromise = null;
        });

        return runtimeState.acceptanceLoadPromise;
    }

    async function ensureCCFDataLoaded() {
        if (runtimeState.ccfLoaded) return ccfData;
        if (runtimeState.ccfLoadPromise) return runtimeState.ccfLoadPromise;

        runtimeState.ccfLoadPromise = loadJavaScriptDataset('assets/js/ccfdata.js', 'ccfData')
            .then(rawData => {
                ccfData = normalizeCCFData(rawData);
                runtimeState.ccfLoaded = true;
                return ccfData;
            })
            .finally(() => {
                runtimeState.ccfLoadPromise = null;
            });

        return runtimeState.ccfLoadPromise;
    }

    async function ensureSJRDataLoaded() {
        if (runtimeState.sjrLoaded) return sjrData;
        if (runtimeState.sjrLoadPromise) return runtimeState.sjrLoadPromise;

        runtimeState.sjrLoadPromise = loadJavaScriptDataset('assets/js/scimago.js', 'SCImago')
            .then(rawData => {
                sjrData = normalizeSJRData(rawData && rawData.data ? rawData.data : []);
                runtimeState.sjrLoaded = true;
                return sjrData;
            })
            .finally(() => {
                runtimeState.sjrLoadPromise = null;
            });

        return runtimeState.sjrLoadPromise;
    }

    async function ensureJCRDataLoaded() {
        if (runtimeState.jcrLoaded) return jcrData;
        if (runtimeState.jcrLoadPromise) return runtimeState.jcrLoadPromise;

        runtimeState.jcrLoadPromise = loadJavaScriptDataset('assets/js/if.js', 'factor')
            .then(rawData => {
                jcrData = normalizeJCRData(rawData && rawData.data ? rawData.data : []);
                runtimeState.jcrLoaded = true;
                return jcrData;
            })
            .finally(() => {
                runtimeState.jcrLoadPromise = null;
            });

        return runtimeState.jcrLoadPromise;
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

    if (timezoneSelector) {
        timezoneSelector.value = 'local';
        timezoneSelector.addEventListener('change', (e) => {
            selectedTimezone = e.target.value;
            if (currentMode === 'deadlines') scheduleUpdateView();
        });
    }

    // ==========================================
    // 顶端 Tab 切换逻辑
    // ==========================================
    const tabDeadlines = document.getElementById('tab-deadlines');
    const tabCcfList = document.getElementById('tab-ccf-list');
    const tabSjrList = document.getElementById('tab-sjr-list'); 
    const tabJcrList = document.getElementById('tab-jcr-list');
    const topTabs = [tabDeadlines, tabCcfList, tabSjrList, tabJcrList].filter(Boolean);
    const filterCol4 = document.getElementById('filter-col-4');
    const labelFilter1 = document.getElementById('label-filter-1');
    const labelFilter2 = document.getElementById('label-filter-2');
    const labelFilter3 = document.getElementById('label-filter-3');
    const timezoneWrapper = document.querySelector('.timezone-wrapper');
    const ccfListNotice = document.getElementById('ccf-list-notice');
    const sjrListNotice = document.getElementById('sjr-list-notice');
    const jcrListNotice = document.getElementById('jcr-list-notice');
    const modeViewConfig = {
        deadlines: {
            tab: tabDeadlines,
            labels: ['领域', 'CCF 级别', '年份'],
            showDeadlineFilter: true,
            showTimezone: true,
            activeNotice: null,
            initFilters: () => initDeadlineFilters()
        },
        ccf_list: {
            tab: tabCcfList,
            labels: ['领域', 'CCF 级别', '类型'],
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: ccfListNotice,
            initFilters: () => initCCFListFilters()
        },
        sjr_list: {
            tab: tabSjrList,
            labels: ['领域', 'SJR 分区', '类型'],
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: sjrListNotice,
            initFilters: () => initSJRFilters()
        },
        jcr_list: {
            tab: tabJcrList,
            labels: ['中科院分区', 'JCR 分区', '影响因子区间'],
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: jcrListNotice,
            initFilters: () => initJCRFilters()
        }
    };
    
    [
        [tabDeadlines, 'deadlines'],
        [tabCcfList, 'ccf_list'],
        [tabSjrList, 'sjr_list'],
        [tabJcrList, 'jcr_list']
    ].forEach(([tab, mode]) => {
        if (!tab) return;
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            setMode(mode);
        });
    });

    function createMultiSelect(selectId, options, placeholder) {
        const originalSelect = document.getElementById(selectId);
        if (!originalSelect) return;

        originalSelect.style.display = 'none';
        originalSelect.multiple = true;
        originalSelect.setAttribute('aria-hidden', 'true');
        
        const existing = originalSelect.nextElementSibling;
        if (existing && existing.classList.contains('custom-multi-select')) {
            if (activeDropdown && existing.contains(activeDropdown)) closeActiveDropdown();
            existing.remove();
        }

        const container = document.createElement('div');
        container.className = 'custom-multi-select';
        
        const displayBtn = document.createElement('div');
        displayBtn.className = 'select-box form-select';
        displayBtn.setAttribute('role', 'button');
        displayBtn.setAttribute('tabindex', '0');
        displayBtn.setAttribute('aria-haspopup', 'listbox');
        displayBtn.setAttribute('aria-expanded', 'false');
        displayBtn.innerHTML = `<span>${escapeHTML(placeholder)}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`;
        
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown-list';
        dropdown.setAttribute('role', 'listbox');
        
        let html = `<label class="dropdown-item"><input type="checkbox" value="all" checked> <span class="truncate">所有选项</span></label>`;
        options.forEach(opt => {
            html += `<label class="dropdown-item"><input type="checkbox" value="${escapeHTML(opt.value)}"> <span class="truncate">${escapeHTML(opt.label)}</span></label>`;
        });
        dropdown.innerHTML = html;
        
        container.appendChild(displayBtn);
        container.appendChild(dropdown);
        originalSelect.parentNode.insertBefore(container, originalSelect.nextSibling);

        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');
        const setExpanded = (expanded) => {
            dropdown.classList.toggle('show', expanded);
            displayBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            if (expanded) {
                activeDropdown = dropdown;
                activeDropdownToggle = displayBtn;
            } else if (activeDropdown === dropdown) {
                activeDropdown = null;
                activeDropdownToggle = null;
            }
        };

        displayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const shouldOpen = !dropdown.classList.contains('show');
            if (shouldOpen) closeActiveDropdown();
            setExpanded(shouldOpen);
        });

        displayBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                displayBtn.click();
            } else if (e.key === 'Escape') {
                setExpanded(false);
            }
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation());
        dropdown.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                setExpanded(false);
                displayBtn.focus();
            }
        });

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
                scheduleUpdateView();
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
        closeActiveDropdown();
    });


    async function ensureDataForMode(mode, forceRefresh = false) {
        if (mode === 'deadlines') {
            return fetchConferencesData(forceRefresh);
        }

        if (mode === 'ccf_list') {
            if (!runtimeState.ccfLoaded) {
                setContainerMessage('正在加载 CCF 推荐数据...');
            }

            const [ccfResult, rateResult] = await Promise.allSettled([
                ensureCCFDataLoaded(),
                fetchAcceptanceRates(forceRefresh)
            ]);

            if (ccfResult.status !== 'fulfilled') {
                throw new Error('CCF 推荐数据加载失败');
            }

            if (rateResult.status !== 'fulfilled') {
                setWarningMessage('收录率更新失败，已显示基础列表');
            }

            return ccfData;
        }

        if (mode === 'sjr_list') {
            if (!runtimeState.sjrLoaded) {
                setContainerMessage('正在加载 SJR 数据...');
            }
            return ensureSJRDataLoaded();
        }

        if (mode === 'jcr_list') {
            if (!runtimeState.jcrLoaded) {
                setContainerMessage('正在加载 JCR 数据...');
            }
            return ensureJCRDataLoaded();
        }

        return [];
    }

    async function setMode(mode, forceRefresh = false) {
        const modeToken = ++runtimeState.activeModeToken;
        const config = modeViewConfig[mode];
        if (!config) return;
        currentMode = mode;
        currentPage = 1;
        if (mode !== 'deadlines') setWarningMessage('');
        if (totalCountSpan) totalCountSpan.textContent = '正在加载数据...';
        closeActiveDropdown();
        topTabs.forEach(tab => tab.classList.remove('active'));

        if (config.tab) config.tab.classList.add('active');
        if (labelFilter1) labelFilter1.textContent = config.labels[0];
        if (labelFilter2) labelFilter2.textContent = config.labels[1];
        if (labelFilter3) labelFilter3.textContent = config.labels[2];
        if (filterCol4) filterCol4.style.display = config.showDeadlineFilter ? 'block' : 'none';
        if (timezoneWrapper) timezoneWrapper.style.display = config.showTimezone ? 'block' : 'none';
        [ccfListNotice, sjrListNotice, jcrListNotice].forEach(notice => {
            if (notice) notice.style.display = notice === config.activeNotice ? 'flex' : 'none';
        });

        try {
            await ensureDataForMode(mode, forceRefresh);
            if (modeToken !== runtimeState.activeModeToken || currentMode !== mode) return;
            config.initFilters();
            updateView();
        } catch (error) {
            if (modeToken !== runtimeState.activeModeToken || currentMode !== mode) return;
            if (totalCountSpan) totalCountSpan.textContent = '数据加载失败';
            setContainerMessage(error.message || '数据加载失败，请稍后重试', true);
        }
    }

    // ==========================================
    // 在线数据获取与 ICS 解析逻辑 (Deadlines)
    // ==========================================
    function unescapeICSValue(str) {
        return String(str || '')
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';')
            .replace(/\\\\/g, '\\');
    }

    function pickFirstMatch(text, patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) return match[1].trim();
        }
        return '';
    }

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
            const keyParts = keyStr.split(';');
            const key = keyParts.shift();
            const params = {};

            keyParts.forEach(part => {
                const [paramKey, ...rest] = part.split('=');
                if (!paramKey || rest.length === 0) return;
                params[paramKey.toUpperCase()] = rest.join('=').replace(/^"+|"+$/g, '');
            });

            if (key === 'BEGIN' && value === 'VEVENT') {
                currentEvent = {};
            } else if (key === 'END' && value === 'VEVENT') {
                if (currentEvent) events.push(currentEvent);
                currentEvent = null;
            } else if (currentEvent) {
                currentEvent[key] = value;
                if (Object.keys(params).length > 0) {
                    currentEvent[`${key}__params`] = params;
                }
            }
        }

        const parsedConfs = [];

        events.forEach(ev => {
            const summary = unescapeICSValue(ev.SUMMARY || '');
            const rawDesc = unescapeICSValue(ev.DESCRIPTION || '');
            const normalizedDesc = rawDesc.replace(/\r\n?/g, '\n');
            const dtStartInfo = parseICSDateTime(ev.DTSTART, ev.DTSTART__params || {});
            
            const titleMatch = summary.match(/^(.+?)\s+(\d{4})/);
            const title = titleMatch ? titleMatch[0].trim() : summary.split(' ')[0];
            const year = titleMatch
                ? parseInt(titleMatch[2], 10)
                : (Number.isFinite(dtStartInfo.ms) ? new Date(dtStartInfo.ms).getUTCFullYear() : new Date().getFullYear());
            const commentMatch = summary.match(/\d{4}\s+(.*)$/);
            const comment = commentMatch ? commentMatch[1].trim() : '截稿';

            const descLines = normalizedDesc.split('\n').filter(line => line.trim());
            const fullName = descLines[0] ? descLines[0].trim() : title;
            const dateText = pickFirstMatch(normalizedDesc, [
                /(?:🗓️|📅)?\s*会议时间:\s*(.+?)(?:\n|$)/i,
                /Conference\s+Date(?:s)?\s*:\s*(.+?)(?:\n|$)/i
            ]) || 'TBA';
            const placeText = pickFirstMatch(normalizedDesc, [
                /(?:📍)?\s*会议地点:\s*(.+?)(?:\n|$)/i,
                /(?:Location|Venue)\s*:\s*(.+?)(?:\n|$)/i
            ]) || unescapeICSValue(ev.LOCATION || '') || 'TBA';
            const timezoneText = pickFirstMatch(normalizedDesc, [
                /(?:⏰)?\s*原始截止时间\s*\((.+?)\)\s*:/i,
                /(?:Original\s+)?Deadline\s*\((.+?)\)\s*:/i
            ]) || dtStartInfo.timezone || 'AoE';
            const deadlineText = pickFirstMatch(normalizedDesc, [
                /(?:⏰)?\s*原始截止时间.+?:\s*(.+?)(?:\n|$)/i,
                /(?:Original\s+)?Deadline.+?:\s*(.+?)(?:\n|$)/i
            ]) || (Number.isFinite(dtStartInfo.ms)
                ? formatMsForTimezone(dtStartInfo.ms, timezoneText).replace(/\s+\(.+?\)$/, '')
                : 'TBD');
            const subMatch = normalizedDesc.match(/分类:.*?\((.+?)\)/);
            const ccfMatch = normalizedDesc.match(/\bCCF\s+([A-C])\b/i);

            parsedConfs.push({
                title: title,
                description: fullName,
                sub: subMatch ? subMatch[1].trim() : defaultSub,
                rank: { ccf: ccfMatch ? ccfMatch[1].trim() : 'N' },
                confs: [{
                    year: year,
                    link: ev.URL ? unescapeICSValue(ev.URL) : '#',
                    timezone: timezoneText,
                    date: dateText,
                    place: placeText,
                    timeline: [{
                        deadline: deadlineText,
                        deadlineMs: Number.isFinite(dtStartInfo.ms) ? dtStartInfo.ms : null,
                        timezone: timezoneText,
                        comment: comment
                    }]
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
                const existing = mergedMap.get(key);
                existing.confs[0].timeline.push(...item.confs[0].timeline);
                if (!existing.description && item.description) existing.description = item.description;
                if ((!existing.rank || existing.rank.ccf === 'N') && item.rank && item.rank.ccf) existing.rank = item.rank;
                if (!existing.sub && item.sub) existing.sub = item.sub;
            } else {
                mergedMap.set(key, item);
            }
        });
        return Array.from(mergedMap.values()).map(finalizeConferenceEntry);
    }

    async function fetchConferencesData(forceRefresh = false) {
        if (runtimeState.deadlineLoadPromise && !forceRefresh) {
            return runtimeState.deadlineLoadPromise;
        }

        const cachedData = !forceRefresh
            ? readCachedData(STORAGE_KEYS.deadlines, CACHE_TTL_MS.deadlines)
            : null;
        const hydratedCache = Array.isArray(cachedData)
            ? cachedData.map(finalizeConferenceEntry)
            : [];

        if (!runtimeState.deadlinesLoaded && hydratedCache.length > 0) {
            confData = hydratedCache;
            runtimeState.deadlinesLoaded = true;
            if (currentMode === 'deadlines') {
                initDeadlineFilters();
                scheduleUpdateView();
            }
        }

        if (!runtimeState.deadlinesLoaded) {
            setContainerMessage('正在从 CCFDDL 拉取最新数据，请稍候...');
        }

        runtimeState.deadlineLoadPromise = (async () => {
            const subs = Object.keys(subMap);
            const results = await Promise.allSettled(subs.map(async (sub) => {
                const url = `https://ccfddl.com/conference/deadlines_zh_${sub}.ics`;
                const response = await fetch(url, {
                    cache: forceRefresh ? 'no-store' : 'default'
                });

                if (!response.ok) {
                    throw new Error(`${sub}:${response.status}`);
                }

                const text = await response.text();
                return parseICS(text, sub);
            }));

            let rawData = [];
            const failedSubs = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.length > 0) {
                    rawData = rawData.concat(result.value);
                    return;
                }

                if (result.status === 'rejected') {
                    failedSubs.push(subs[index]);
                } else if (result.status === 'fulfilled' && result.value.length === 0) {
                    failedSubs.push(subs[index]);
                }
            });

            if (rawData.length === 0) {
                if (hydratedCache.length > 0) {
                    confData = hydratedCache;
                    runtimeState.deadlinesLoaded = true;
                    setWarningMessage('网络更新失败，已显示缓存数据');
                    if (currentMode === 'deadlines') {
                        initDeadlineFilters();
                        scheduleUpdateView();
                    }
                    return confData;
                }

                throw new Error('数据拉取失败，请检查网络');
            }

            if (failedSubs.length > 0 && hydratedCache.length > 0) {
                const fallbackEntries = hydratedCache.filter(item => failedSubs.includes(item.sub));
                rawData = rawData.concat(fallbackEntries);
            }

            confData = mergeConfData(rawData);
            runtimeState.deadlinesLoaded = true;
            writeCachedData(STORAGE_KEYS.deadlines, confData);
            setWarningMessage(
                failedSubs.length > 0
                    ? `部分分类更新失败 (${failedSubs.length}/${subs.length})`
                    : ''
            );

            if (currentMode === 'deadlines') {
                initDeadlineFilters();
                scheduleUpdateView();
            }

            return confData;
        })().catch(error => {
            setWarningMessage('');
            if (confData.length > 0) {
                if (currentMode === 'deadlines') scheduleUpdateView();
                return confData;
            }

            if (currentMode === 'deadlines') {
                setContainerMessage(error.message || '数据拉取失败，请检查网络', true);
            }
            throw error;
        }).finally(() => {
            runtimeState.deadlineLoadPromise = null;
        });

        return runtimeState.deadlineLoadPromise;
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

        createMultiSelect('category-filter', Array.from(categories).sort(compareText).map(sub => ({value: sub, label: subMap[sub] || sub})), '所有领域');
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

        createMultiSelect('category-filter', Array.from(categories).sort(compareText).map(sub => ({value: sub, label: sub})), '所有领域');
        createMultiSelect('level-filter', Array.from(levels).sort().map(lvl => ({value: lvl, label: `CCF-${lvl}`})), '所有级别');
        createMultiSelect('year-filter', Array.from(types).sort(compareText).map(t => ({value: t, label: t})), '所有类型');
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

        createMultiSelect('category-filter', Array.from(areas).filter(a => a).sort(compareText).map(a => ({value: a, label: a})), '所有领域');
        createMultiSelect('level-filter', Array.from(quartiles).sort().map(q => ({value: q, label: q === '-' ? '无分区' : q})), '所有分区');
        createMultiSelect('year-filter', Array.from(types).sort(compareText).map(t => ({value: t, label: t})), '所有类型');
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
                .sort(compareText)
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
    
    // ==========================================
    // 核心时间计算工具
    // ==========================================
    function getAbsoluteMs(deadlineStr, tzStr) {
        if (!deadlineStr || deadlineStr.toUpperCase() === 'TBD') return null;
        const match = String(deadlineStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return null;

        const offsetMinutes = parseTimezoneOffsetMinutes(tzStr);
        return Date.UTC(
            parseInt(match[1], 10),
            parseInt(match[2], 10) - 1,
            parseInt(match[3], 10),
            parseInt(match[4], 10),
            parseInt(match[5], 10),
            parseInt(match[6] || '0', 10)
        ) - (offsetMinutes * 60 * 1000);
    }

    function formatToSelectedTz(ms, targetTz, originalTz) {
        if (!Number.isFinite(ms)) return 'TBD';
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');

        if (targetTz === 'local') {
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
        
        let offsetMinutes = 0;
        let tzLabel = '';
        if (targetTz === 'original') {
            tzLabel = normalizeTimezoneLabel(originalTz) || 'UTC+0';
            offsetMinutes = parseTimezoneOffsetMinutes(tzLabel);
        } else if (targetTz === 'AoE') {
            tzLabel = 'AoE';
            offsetMinutes = -12 * 60;
        } else {
            tzLabel = `UTC${parseInt(targetTz, 10) >= 0 ? '+' + parseInt(targetTz, 10) : parseInt(targetTz, 10)}`;
            offsetMinutes = parseInt(targetTz, 10) * 60;
        }

        const tzDate = new Date(ms + offsetMinutes * 60 * 1000);
        return `${tzDate.getUTCFullYear()}-${pad(tzDate.getUTCMonth()+1)}-${pad(tzDate.getUTCDate())} ${pad(tzDate.getUTCHours())}:${pad(tzDate.getUTCMinutes())}:${pad(tzDate.getUTCSeconds())} (${tzLabel})`;
    }

    function getConfStatus(conf) {
        if (!conf.confs || conf.confs.length === 0) return { ms: null, isUrgent: false, comment: '', state: 'tbd' };
        const latestConf = conf.confs[0];
        const timeline = latestConf.timeline || [];
        
        let targetMs = null;
        let activeComment = '';
        let minDiff = Infinity;
        const now = Date.now();

        for (const tl of timeline) {
            const ms = Number.isFinite(tl.deadlineMs) ? tl.deadlineMs : getAbsoluteMs(tl.deadline, tl.timezone || latestConf.timezone);
            if (!ms) continue;
            const diff = ms - now;
            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                targetMs = ms;
                activeComment = tl.comment || '截稿';
            }
        }

        if (targetMs !== null) {
            return {
                ms: targetMs,
                isUrgent: minDiff <= 30 * 24 * 60 * 60 * 1000,
                comment: activeComment,
                state: minDiff <= 30 * 24 * 60 * 60 * 1000 ? 'upcoming' : 'open'
            };
        }

        const knownDeadlines = timeline
            .map(tl => ({
                ms: Number.isFinite(tl.deadlineMs) ? tl.deadlineMs : getAbsoluteMs(tl.deadline, tl.timezone || latestConf.timezone),
                comment: tl.comment || '截稿'
            }))
            .filter(item => Number.isFinite(item.ms))
            .sort((a, b) => a.ms - b.ms);

        if (knownDeadlines.length > 0) {
            const last = knownDeadlines[knownDeadlines.length - 1];
            return {
                ms: last.ms,
                isUrgent: false,
                comment: last.comment,
                state: 'passed'
            };
        }

        return {
            ms: null,
            isUrgent: false,
            comment: activeComment || '截稿',
            state: 'tbd'
        };
    }

    // ==========================================
    // 界面渲染 - CCF Deadlines
    // ==========================================
    function escapeDisplayText(value, fallback = '-') {
        const text = String(value ?? '').trim();
        return escapeHTML(text || fallback);
    }

    function buildLinkHTML(url, label, className = 'table-link', extraAttrs = '') {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl || safeUrl === '#') return '-';
        const href = escapeHTML(safeUrl);
        if (className === 'play-btn') {
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${className}"${extraAttrs}><span>${escapeHTML(label)}</span><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></a>`;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${className}"${extraAttrs}>${escapeHTML(label)}</a>`;
    }

    function getAcceptanceRateText(item) {
        if (!isConferenceType(item.type)) return '不适用';
        return accRatesMap.get(String(item.abbr || '').toLowerCase()) || '暂无数据';
    }

    function buildSortableHeader(sortConfig, key, label, minW = '', extraClass = '') {
        let icon = '↕';
        let iconClass = 'sort-icon';
        if (sortConfig.key === key) {
            icon = sortConfig.asc ? '▲' : '▼';
            iconClass += ' active';
        }
        const widthStyle = minW ? `min-width: ${minW};` : '';
        const thClass = extraClass ? `sortable-th ${extraClass}` : 'sortable-th';
        return `<th class="${thClass}" data-sort="${key}" style="${widthStyle}">${label} <span class="${iconClass}">${icon}</span></th>`;
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
            const formattedDeadline = escapeDisplayText(formatToSelectedTz(timeStatus.ms, selectedTimezone, originalTz), 'TBD');
            const deadlineBadge = timeStatus.comment ? `<span class="deadline-badge">${escapeDisplayText(timeStatus.comment)}</span>` : '';

            const place = escapeDisplayText(latestConf.place, 'TBA');
            const confName = escapeDisplayText(conf.description, 'TBA');
            const confDate = escapeDisplayText(latestConf.date, '-');
            const confLink = latestConf.link || '#';
            const safeTitle = escapeDisplayText(conf.title, 'TBA');

            const rowClass = timeStatus.isUrgent ? 'deadline-row deadline-urgent' : 'deadline-row';
            const linkHTML = buildLinkHTML(confLink, '官网', 'table-link');
            const titleHTML = confLink && confLink !== '#'
                ? buildLinkHTML(confLink, conf.title, 'author-link')
                : safeTitle;

            return `
                <tr class="${rowClass}">
                    <td class="title-col col-abbr" title="${safeTitle}">
                        ${titleHTML}
                    </td>
                    <td style="white-space: normal; min-width: 150px; max-width: 180px; line-height: 1.4;">${confName}</td>
                    <td><span class="${ccfClass}">CCF-${ccfRank}</span></td>
                    <td class="deadline-cell" title="${formattedDeadline}">
                        <div class="deadline-main">${formattedDeadline}</div>
                        ${deadlineBadge}
                    </td>
                    <td class="countdown-timer-container" data-ts="${timeStatus.ms || ''}">
                        <span class="countdown-text">计算中..</span>
                    </td>
                    <td class="col-conf-date" style="white-space: normal;">${confDate}</td>
                    <td class="col-place" style="white-space: normal;">${place}</td>
                    <td><span class="card-tag tag-normal" title="${escapeDisplayText(categoryFullName)}">${escapeDisplayText(categoryAbbr, 'MIX')}</span></td>
                    <td>${linkHTML}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sjr-table-wrapper deadline-table-wrapper">
                <table class="sjr-table deadline-table">
                    <thead>
                        <tr>
                            ${buildSortableHeader(deadlineSortConfig, 'title', '简称', 'clamp(82px, 10vw, 118px)', 'col-abbr')}
                            ${buildSortableHeader(deadlineSortConfig, 'fullname', '全称', '160px')}
                            ${buildSortableHeader(deadlineSortConfig, 'grade', '级别')}
                            ${buildSortableHeader(deadlineSortConfig, 'deadline', '截止时间', '200px')}
                            ${buildSortableHeader(deadlineSortConfig, 'countdown', '倒计时')}
                            ${buildSortableHeader(deadlineSortConfig, 'confDate', '会议时间', 'clamp(102px, 13vw, 140px)', 'col-conf-date')}
                            ${buildSortableHeader(deadlineSortConfig, 'place', '地点', 'clamp(102px, 13vw, 140px)', 'col-place')}
                            ${buildSortableHeader(deadlineSortConfig, 'domain', '领域')}
                            ${buildSortableHeader(deadlineSortConfig, 'link', '官网')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;
    }

    function createCCFTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 CCF 推荐数据</p>';
        }

        let rowsHTML = dataList.map(item => {
            const isQ1 = item.grade === 'A';
            const ccfClass = isQ1 ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';
            const categoryAbbr = item.domainCode || item.domain || 'MIX';
            const accRateStr = getAcceptanceRateText(item);
            const ccfLink = item.url || '#';
            const linkHTML = buildLinkHTML(ccfLink, '官网', 'table-link');
            const titleLinkHTML = ccfLink && ccfLink !== '#'
                ? buildLinkHTML(ccfLink, item.abbr, 'author-link', ' style="text-decoration: none; color: inherit;"')
                : escapeDisplayText(item.abbr);

            return `
                <tr>
                    <td class="title-col col-abbr" title="${escapeDisplayText(item.abbr)}">
                        ${titleLinkHTML}
                    </td>
                    <td style="white-space: normal; min-width: 150px; max-width: 180px; line-height: 1.4;">${escapeDisplayText(item.fullname)}</td>
                    <td><span class="${ccfClass}">CCF-${item.grade}</span></td>
                    <td><span class="card-tag tag-normal">${escapeDisplayText(categoryAbbr, 'MIX')}</span></td>
                    <td>${escapeDisplayText(item.type)}</td>
                    <td style="white-space: normal; min-width: 150px;">${escapeDisplayText(item.publisher)}</td>
                    <td>${escapeDisplayText(accRateStr)}</td>
                    <td>${linkHTML}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${buildSortableHeader(ccfSortConfig, 'abbr', '简称', 'clamp(82px, 10vw, 118px)', 'col-abbr')}
                            ${buildSortableHeader(ccfSortConfig, 'fullname', '全称', '160px')}
                            ${buildSortableHeader(ccfSortConfig, 'grade', '级别')}
                            ${buildSortableHeader(ccfSortConfig, 'domain', '领域')}
                            ${buildSortableHeader(ccfSortConfig, 'type', '类型')}
                            ${buildSortableHeader(ccfSortConfig, 'publisher', '出版社')}
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
            let typeHtml = escapeDisplayText(item.type);
            if (typeHtml.toLowerCase().includes(' and ')) {
                typeHtml = typeHtml.replace(' and ', '<br>and ');
            }

            return `
                <tr>
                    <td class="title-col col-name" title="${escapeDisplayText(item.title)}">${escapeDisplayText(item.title)}</td>
                    <td style="text-transform: capitalize; white-space: normal; min-width: 120px; line-height: 1.4;">${typeHtml}</td>
                    <td><span class="${quartileClass}">${escapeDisplayText(item.quartile, '-')}</span></td>
                    <td class="sjr-score">${escapeDisplayText(item.sjr || '-', '-')}</td>
                    <td>${escapeDisplayText(item.hIndex || '-', '-')}</td>
                    <td>${escapeDisplayText(item.citesDoc2Years || '-', '-')}</td>
                    <td>${escapeDisplayText(item.totalDocsYear || '-', '-')}</td>
                    <td>${escapeDisplayText(item.totalCites3Years || '-', '-')}</td>
                    <td>${escapeDisplayText(item.country || '-', '-')}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${buildSortableHeader(sjrSortConfig, 'title', '名称', 'clamp(110px, 15vw, 170px)', 'col-name')}
                            ${buildSortableHeader(sjrSortConfig, 'type', '类型', '120px')}
                            ${buildSortableHeader(sjrSortConfig, 'quartile', '分区')}
                            ${buildSortableHeader(sjrSortConfig, 'sjr', 'SJR')}
                            ${buildSortableHeader(sjrSortConfig, 'hIndex', 'H-Index')}
                            ${buildSortableHeader(sjrSortConfig, 'citesDoc2Years', '近两年篇均被引')}
                            ${buildSortableHeader(sjrSortConfig, 'totalDocsYear', '文献数')}
                            ${buildSortableHeader(sjrSortConfig, 'totalCites3Years', '近三年被引')}
                            ${buildSortableHeader(sjrSortConfig, 'country', '国家')}
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
                    <td class="title-col col-name" title="${escapeDisplayText(item.journal)}">${escapeDisplayText(clean(item.journal))}</td>
                    <td class="title-col col-abbr" title="${escapeDisplayText(item.abbr)}">${escapeDisplayText(clean(item.abbr))}</td>
                    <td class="sjr-score">${escapeDisplayText(factorText)}</td>
                    <td><span class="${quartileClass}">${escapeDisplayText(clean(item.jcr))}</span></td>
                    <td>${escapeDisplayText(zkyText === '-' ? '无分区' : zkyText)}</td>
                    <td>${escapeDisplayText(clean(item.issn))}</td>
                    <td>${escapeDisplayText(clean(item.eissn))}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead>
                        <tr>
                            ${buildSortableHeader(jcrSortConfig, 'journal', '期刊名称', 'clamp(110px, 15vw, 170px)', 'col-name')}
                            ${buildSortableHeader(jcrSortConfig, 'abbr', '简称', 'clamp(82px, 10vw, 118px)', 'col-abbr')}
                            ${buildSortableHeader(jcrSortConfig, 'factor', '影响因子')}
                            ${buildSortableHeader(jcrSortConfig, 'jcr', 'JCR 分区')}
                            ${buildSortableHeader(jcrSortConfig, 'zky', '中科院分区')}
                            ${buildSortableHeader(jcrSortConfig, 'issn', 'ISSN')}
                            ${buildSortableHeader(jcrSortConfig, 'eissn', 'eISSN')}
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
        const gradeRankMap = { A: 1, B: 2, C: 3, N: 4 };
        const deadlineStateRank = { upcoming: 0, open: 0, passed: 1, tbd: 2 };

        let filteredData = [];

        // --- 分支 1：CCF Deadlines 数据逻辑 ---
        if (currentMode === 'deadlines') {
            if (!confData || confData.length === 0) return;
            
            filteredData = confData.map(conf => {
                return { conf: conf, statusInfo: getConfStatus(conf) };
            }).filter(item => {
                const conf = item.conf;
                const status = item.statusInfo.state;
                
                const matchSearch = !searchQuery || (conf.searchText || '').includes(searchQuery);
                if (!matchSearch) return false;
                
                if (!catFilters.includes('all') && !catFilters.includes(conf.sub)) return false;

                const ccfRank = conf.rank && conf.rank.ccf ? conf.rank.ccf : 'N';
                if (!levelFilters.includes('all') && !levelFilters.includes(ccfRank)) return false;

                const confYear = conf.confs && conf.confs.length > 0 ? String(conf.confs[0].year) : '';
                if (!col3Filters.includes('all') && !col3Filters.includes(confYear)) return false;

                if (!statusFilters.includes('all')) {
                    let statusMatch = false;
                    if (statusFilters.includes('upcoming') && status === 'upcoming') statusMatch = true;
                    if (statusFilters.includes('open') && status === 'open') statusMatch = true;
                    if (statusFilters.includes('passed') && status === 'passed') statusMatch = true;

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
                    const rankA = deadlineStateRank[a.statusInfo.state] ?? 2;
                    const rankB = deadlineStateRank[b.statusInfo.state] ?? 2;
                    if (rankA !== rankB) return rankA - rankB;
                    if (msA === null && msB === null) return compareText(confA.title, confB.title);
                    if (msA === null) return 1;
                    if (msB === null) return -1;
                    const cmp = msA - msB;
                    return deadlineSortConfig.asc ? cmp : -cmp;
                }

                if (key === 'grade') {
                    const rankA = confA.rank && confA.rank.ccf ? confA.rank.ccf : 'N';
                    const rankB = confB.rank && confB.rank.ccf ? confB.rank.ccf : 'N';
                    const cmp = (gradeRankMap[rankA] || 4) - (gradeRankMap[rankB] || 4);
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

                const cmp = compareText(valA, valB);
                return deadlineSortConfig.asc ? cmp : -cmp;
            });

        // --- 分支 2：CCF推荐列表 数据逻辑 ---
        } else if (currentMode === 'ccf_list') {
            if (!ccfData || ccfData.length === 0) return;
            
            filteredData = ccfData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
                if (!matchSearch) return false;
                
                if (!catFilters.includes('all') && !catFilters.includes(item.domain)) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.grade)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.type)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                let valA = a[ccfSortConfig.key];
                let valB = b[ccfSortConfig.key];

                if (ccfSortConfig.key === 'grade') {
                    const cmp = (gradeRankMap[valA] || 4) - (gradeRankMap[valB] || 4);
                    if (cmp === 0) return compareText(a.abbr || '', b.abbr || '');
                    return ccfSortConfig.asc ? cmp : -cmp;
                }

                if (valA === undefined || valA === null) valA = '';
                if (valB === undefined || valB === null) valB = '';

                let cmp = compareText(valA, valB);

                return ccfSortConfig.asc ? cmp : -cmp;
            });

        // --- 分支 3：SJR 排名数据逻辑 ---
        } else if (currentMode === 'sjr_list') {
            if (!sjrData || sjrData.length === 0) return;

            filteredData = sjrData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
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
                    cmp = compareText(valA, valB);
                }

                return sjrSortConfig.asc ? cmp : -cmp;
            });
        
        // --- 分支 4：JCR 影响因子数据逻辑 ---
        } else if (currentMode === 'jcr_list') {
            if (!jcrData || jcrData.length === 0) return;

            filteredData = jcrData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
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
                    cmp = compareText(valA, valB);
                }

                return jcrSortConfig.asc ? cmp : -cmp;
            });
        }

        if (totalCountSpan) {
            const warningSuffix = runtimeState.warningMessage ? ` · ${runtimeState.warningMessage}` : '';
            totalCountSpan.textContent = `已检索到 ${filteredData.length} 个结果${warningSuffix}`;
        }

        // --- 分页逻辑 ---
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

        if (conferencesContainer) {
            const tableRenderers = {
                deadlines: createDeadlineTableHTML,
                ccf_list: createCCFTableHTML,
                sjr_list: createSJRTableHTML,
                jcr_list: createJCRTableHTML
            };
            const renderTable = tableRenderers[currentMode];
            if (renderTable) conferencesContainer.innerHTML = renderTable(paginatedData);
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
                    if (filtersContainer) filtersContainer.scrollIntoView({ behavior: 'smooth' });
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
            scheduleUpdateView(120);
        });
    }

    // 初始化默认模式
    setMode('deadlines');

    const updateDataBtn = document.getElementById('update-data-btn');
    if (updateDataBtn) {
        updateDataBtn.addEventListener('click', async () => {
            const icon = updateDataBtn.querySelector('.refresh-icon');
            if (icon) icon.classList.add('spin-anim');
            updateDataBtn.disabled = true;
            
            try {
                const refreshTasks = [fetchConferencesData(true)];
                if (runtimeState.acceptanceLoaded || currentMode === 'ccf_list') {
                    refreshTasks.push(fetchAcceptanceRates(true));
                }

                await Promise.allSettled(refreshTasks);
                await setMode(currentMode);
            } finally {
                if (icon) icon.classList.remove('spin-anim');
                updateDataBtn.disabled = false;
            }
        });
    }
    // ==========================================
    // 表格表头点击排序事件
    // ==========================================
    const sortBehaviorConfig = {
        sjr_list: {
            config: sjrSortConfig,
            defaultAscKeys: ['title', 'type', 'quartile', 'country']
        },
        jcr_list: {
            config: jcrSortConfig,
            defaultAscKeys: ['journal', 'abbr', 'jcr', 'zky', 'issn', 'eissn']
        },
        deadlines: {
            config: deadlineSortConfig,
            defaultAscKeys: null
        },
        ccf_list: {
            config: ccfSortConfig,
            defaultAscKeys: null
        }
    };

    if (conferencesContainer) {
        conferencesContainer.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable-th');
            if (!th) return;

            const sortKey = th.getAttribute('data-sort');
            const behavior = sortBehaviorConfig[currentMode];
            if (!behavior || !sortKey) return;

            if (behavior.config.key === sortKey) {
                behavior.config.asc = !behavior.config.asc;
            } else {
                behavior.config.key = sortKey;
                behavior.config.asc = behavior.defaultAscKeys
                    ? behavior.defaultAscKeys.includes(sortKey)
                    : true;
            }

            scheduleUpdateView();
        });
    }
});
