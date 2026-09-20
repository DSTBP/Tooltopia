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
    let eiData = [];
    let sciData = [];
    let ssciData = [];
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
        deadlines: 'ccfddl.deadlines.cache.v3',
        acceptanceRates: 'ccfddl.acceptance.cache.v1',
        pageSize: 'ccfddl.page-size.v1'
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
        eiLoadPromise: null,
        sciLoadPromise: null,
        ssciLoadPromise: null,
        jcrLoadPromise: null,
        deadlinesLoaded: false,
        ccfLoaded: false,
        eiLoaded: false,
        sciLoaded: false,
        ssciLoaded: false,
        jcrLoaded: false,
        acceptanceLoaded: false,
        warningMessage: ''
    };
    let activeDropdown = null;
    let activeDropdownToggle = null;
    let scheduledRenderFrame = null;
    let scheduledRenderTimer = null;
    let scheduledTranslationTimer = null;

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

    function scheduleDynamicTranslation() {
        if (scheduledTranslationTimer) clearTimeout(scheduledTranslationTimer);
        scheduledTranslationTimer = setTimeout(() => {
            scheduledTranslationTimer = null;
            if (window.translate && typeof window.translate.execute === 'function') {
                try {
                    window.translate.execute(document.getElementById('root') || document.body);
                } catch (error) {
                    console.warn('[CCFDDL] Dynamic translation failed:', error);
                }
            }
        }, 250);
    }

    function setContainerMessage(message, isError = false) {
        if (!conferencesContainer) return;
        const className = isError ? 'empty-text error-text' : 'empty-text';
        const retryButton = isError
            ? `<button type="button" class="retry-btn" data-retry-mode="${escapeHTML(currentMode)}">重试加载</button>`
            : '';
        conferencesContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center;">
                <p class="${className}" style="${isError ? 'color:#f87171;' : ''}">${escapeHTML(message)}</p>
                ${retryButton}
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
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

    function parseOptionalNumber(value) {
        const text = String(value ?? '').trim();
        if (!text || text === '-' || text === '.' || /^n\/?a$/i.test(text)) return null;
        const parsed = Number(text.replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getFactorBand(value) {
        if (!Number.isFinite(value)) return '未知';
        if (value >= 20) return '>=20';
        if (value >= 10) return '10-20';
        if (value >= 5) return '5-10';
        if (value >= 1) return '1-5';
        return '<1';
    }

    function compareNullableNumbers(a, b, asc = true) {
        const aValid = Number.isFinite(a);
        const bValid = Number.isFinite(b);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        return asc ? a - b : b - a;
    }

    function compareNullableText(a, b, asc = true) {
        const aText = String(a ?? '').trim();
        const bText = String(b ?? '').trim();
        const aMissing = !aText || aText === '-';
        const bMissing = !bText || bText === '-';
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const comparison = compareText(aText, bText);
        return asc ? comparison : -comparison;
    }

    function compareQuartiles(a, b, asc = true) {
        const ranks = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
        const aRank = ranks[String(a ?? '').trim()] || null;
        const bRank = ranks[String(b ?? '').trim()] || null;
        if (aRank === null && bRank === null) return 0;
        if (aRank === null) return 1;
        if (bRank === null) return -1;
        const comparison = aRank - bRank;
        return asc ? comparison : -comparison;
    }

    function compareRankFractions(a, b, asc = true) {
        const toNumber = value => {
            const match = String(value ?? '').match(/^\s*(\d+)/);
            return match ? Number.parseInt(match[1], 10) : null;
        };
        return compareNullableNumbers(toNumber(a), toNumber(b), asc);
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

    function cleanCsvValue(value) {
        return String(value ?? '').replace(/\r\n?/g, '\n').trim();
    }

    function csvCell(row, headerIndex, name) {
        const index = headerIndex.get(name);
        return index === undefined ? '' : cleanCsvValue(row[index]);
    }

    function parseCsvText(text, requiredHeaders, mapRow) {
        const records = [];
        let headers = null;
        let headerIndex = null;
        let row = [];
        let field = '';
        let quoted = false;
        let sourceIndex = 0;
        let physicalLine = 1;

        const commitRow = () => {
            const currentRow = row;
            row = [];

            if (!headers) {
                headers = currentRow.map((value, index) => {
                    const cleaned = cleanCsvValue(value);
                    return index === 0 ? cleaned.replace(/^\uFEFF/, '') : cleaned;
                });
                headerIndex = new Map(headers.map((name, index) => [name, index]));
                const missingHeaders = requiredHeaders.filter(name => !headerIndex.has(name));
                if (missingHeaders.length > 0) {
                    throw new Error(`CSV 缺少必要字段：${missingHeaders.join('、')}`);
                }
                return;
            }

            if (currentRow.every(value => cleanCsvValue(value) === '')) return;
            if (currentRow.length !== headers.length) {
                throw new Error(`CSV 第 ${physicalLine} 行字段数量异常（${currentRow.length}/${headers.length}）`);
            }

            const mapped = mapRow(currentRow, headerIndex, sourceIndex);
            sourceIndex += 1;
            if (mapped) records.push(mapped);
        };

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];

            if (quoted) {
                if (char === '"') {
                    if (text[index + 1] === '"') {
                        field += '"';
                        index += 1;
                    } else {
                        quoted = false;
                    }
                } else {
                    field += char;
                    if (char === '\n') physicalLine += 1;
                }
                continue;
            }

            if (char === '"' && field.length === 0) {
                quoted = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                field = '';
                commitRow();
                physicalLine += 1;
            } else if (char !== '\r') {
                field += char;
            }
        }

        if (quoted) throw new Error('CSV 存在未闭合的引号字段');
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            commitRow();
        }
        if (!headers) throw new Error('CSV 文件为空');
        return records;
    }

    async function loadCsvDataset(filePath, options = {}) {
        const {
            encoding = 'utf-8',
            requiredHeaders = [],
            mapRow,
            forceRefresh = false
        } = options;

        const response = await fetch(filePath, {
            cache: forceRefresh ? 'no-store' : 'force-cache'
        });
        if (!response.ok) {
            throw new Error(`数据文件加载失败（HTTP ${response.status}）`);
        }

        const buffer = await response.arrayBuffer();
        let text;
        try {
            text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
        } catch (error) {
            throw new Error(`数据文件解码失败（${encoding}）`);
        }

        return parseCsvText(text, requiredHeaders, mapRow);
    }

    const eiSectionLabels = {
        SERIALS: '连续出版物',
        'NON-SERIALS': '非连续出版物',
        DISCONTINUED: '停止收录'
    };

    function normalizeEIRow(row, headerIndex, sourceIndex) {
        const title = csvCell(row, headerIndex, 'source_title');
        if (!title) return null;

        const alternateTitles = [
            csvCell(row, headerIndex, 'chinese_title'),
            csvCell(row, headerIndex, 'transliterated_title'),
            csvCell(row, headerIndex, 'english_translated_title')
        ].filter((value, index, values) => value && value !== title && values.indexOf(value) === index);
        const subjects = Array.from({ length: 8 }, (_, index) => csvCell(row, headerIndex, `subject_${index + 1}`))
            .filter(Boolean);
        const section = csvCell(row, headerIndex, 'source_list_section') || 'UNKNOWN';
        const coverageParts = [
            ['年份', csvCell(row, headerIndex, 'final_coverage_year')],
            ['卷', csvCell(row, headerIndex, 'final_coverage_volume')],
            ['期', csvCell(row, headerIndex, 'final_coverage_issue')],
            ['页码', csvCell(row, headerIndex, 'final_coverage_pagination')]
        ].filter(([, value]) => value).map(([label, value]) => `${label} ${value}`);
        const item = {
            title,
            alternateTitle: alternateTitles.join(' / '),
            type: csvCell(row, headerIndex, 'source_type') || '未标注',
            section,
            sectionLabel: eiSectionLabels[section] || section,
            subjects,
            subjectsText: subjects.join(' | '),
            publisher: csvCell(row, headerIndex, 'publisher'),
            country: csvCell(row, headerIndex, 'country_region'),
            language: csvCell(row, headerIndex, 'language'),
            issn: csvCell(row, headerIndex, 'ISSN'),
            eissn: csvCell(row, headerIndex, 'EISSN'),
            isbn13: csvCell(row, headerIndex, 'ISBN13'),
            indexingStatus: csvCell(row, headerIndex, 'ei_2026_indexing_status'),
            openAccess: csvCell(row, headerIndex, 'open_access'),
            coverage: coverageParts.join(' · '),
            sourceIndex
        };
        item.searchText = normalizeSearchText(
            item.title,
            item.alternateTitle,
            item.type,
            item.section,
            item.sectionLabel,
            item.subjectsText,
            item.publisher,
            item.country,
            item.language,
            item.issn,
            item.eissn,
            item.isbn13,
            item.indexingStatus,
            item.openAccess,
            item.coverage
        );
        return item;
    }

    function normalizeWosRow(row, headerIndex, sourceIndex) {
        const title = csvCell(row, headerIndex, 'Journal title');
        if (!title) return null;
        const categories = csvCell(row, headerIndex, 'Web of Science Categories')
            .split(/\s*\|\s*/)
            .map(value => value.trim())
            .filter(Boolean);
        const item = {
            title,
            issn: csvCell(row, headerIndex, 'ISSN'),
            eissn: csvCell(row, headerIndex, 'eISSN'),
            publisher: csvCell(row, headerIndex, 'Publisher name'),
            address: csvCell(row, headerIndex, 'Publisher address'),
            language: csvCell(row, headerIndex, 'Languages'),
            categories,
            categoriesText: categories.join(' | '),
            sourceIndex
        };
        item.searchText = normalizeSearchText(
            item.title,
            item.issn,
            item.eissn,
            item.publisher,
            item.address,
            item.language,
            item.categoriesText
        );
        return item;
    }

    function normalizeJCRRow(row, headerIndex, sourceIndex) {
        const title = csvCell(row, headerIndex, '期刊名称');
        if (!title) return null;
        const jif = parseOptionalNumber(csvCell(row, headerIndex, '影响因子JIF'));
        const item = {
            rank: parseOptionalNumber(csvCell(row, headerIndex, '总排名(按JIF)')),
            title,
            abbr: csvCell(row, headerIndex, '期刊缩写'),
            issn: csvCell(row, headerIndex, 'ISSN'),
            eissn: csvCell(row, headerIndex, 'eISSN'),
            publisher: csvCell(row, headerIndex, '出版商'),
            category: csvCell(row, headerIndex, '学科类别') || '未分类',
            jif,
            jifBand: getFactorBand(jif),
            jifQuartile: csvCell(row, headerIndex, 'JIF分区') || '-',
            jifPercentile: parseOptionalNumber(csvCell(row, headerIndex, 'JIF百分位')),
            jifRank: csvCell(row, headerIndex, 'JIF排名'),
            jci: parseOptionalNumber(csvCell(row, headerIndex, 'JCI')),
            jciQuartile: csvCell(row, headerIndex, 'JCI分区') || '-',
            jciPercentile: parseOptionalNumber(csvCell(row, headerIndex, 'JCI百分位')),
            jciRank: csvCell(row, headerIndex, 'JCI排名'),
            fiveYearJif: parseOptionalNumber(csvCell(row, headerIndex, '5年影响因子')),
            totalCitations: parseOptionalNumber(csvCell(row, headerIndex, '总被引频次')),
            subjectDetails: csvCell(row, headerIndex, '各学科分区详情'),
            dataYear: csvCell(row, headerIndex, '数据年份'),
            sourceIndex
        };
        item.searchText = normalizeSearchText(
            item.title,
            item.abbr,
            item.issn,
            item.eissn,
            item.publisher,
            item.category,
            item.jifQuartile,
            item.jifRank,
            item.jciQuartile,
            item.jciRank,
            item.jif,
            item.jifPercentile,
            item.jci,
            item.jciPercentile,
            item.fiveYearJif,
            item.totalCitations,
            item.subjectDetails,
            item.dataYear
        );
        return item;
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

    async function ensureEIDataLoaded(forceRefresh = false) {
        if (runtimeState.eiLoaded && !forceRefresh) return eiData;
        if (runtimeState.eiLoadPromise) return runtimeState.eiLoadPromise;

        const previousData = eiData;
        runtimeState.eiLoadPromise = loadCsvDataset('assets/data/EI_202607.csv', {
            forceRefresh,
            requiredHeaders: [
                'source_list_section', 'source_title', 'source_type', 'ISSN', 'EISSN', 'ISBN13',
                'publisher', 'country_region', 'language', 'subject_1', 'ei_2026_indexing_status'
            ],
            mapRow: normalizeEIRow
        }).then(data => {
            eiData = data;
            runtimeState.eiLoaded = true;
            return eiData;
        }).catch(error => {
            if (previousData.length > 0) {
                eiData = previousData;
                runtimeState.eiLoaded = true;
                setWarningMessage('EI 数据刷新失败，已显示已加载版本');
                return eiData;
            }
            throw error;
        }).finally(() => {
            runtimeState.eiLoadPromise = null;
        });

        return runtimeState.eiLoadPromise;
    }

    async function ensureSCIDataLoaded(forceRefresh = false) {
        if (runtimeState.sciLoaded && !forceRefresh) return sciData;
        if (runtimeState.sciLoadPromise) return runtimeState.sciLoadPromise;

        const previousData = sciData;
        runtimeState.sciLoadPromise = loadCsvDataset('assets/data/SCI-20260817.csv', {
            forceRefresh,
            requiredHeaders: ['Journal title', 'ISSN', 'eISSN', 'Publisher name', 'Publisher address', 'Languages', 'Web of Science Categories'],
            mapRow: normalizeWosRow
        }).then(data => {
            sciData = data;
            runtimeState.sciLoaded = true;
            return sciData;
        }).catch(error => {
            if (previousData.length > 0) {
                sciData = previousData;
                runtimeState.sciLoaded = true;
                setWarningMessage('SCI 数据刷新失败，已显示已加载版本');
                return sciData;
            }
            throw error;
        }).finally(() => {
            runtimeState.sciLoadPromise = null;
        });

        return runtimeState.sciLoadPromise;
    }

    async function ensureSSCIDataLoaded(forceRefresh = false) {
        if (runtimeState.ssciLoaded && !forceRefresh) return ssciData;
        if (runtimeState.ssciLoadPromise) return runtimeState.ssciLoadPromise;

        const previousData = ssciData;
        runtimeState.ssciLoadPromise = loadCsvDataset('assets/data/SSCI-20260817.csv', {
            forceRefresh,
            requiredHeaders: ['Journal title', 'ISSN', 'eISSN', 'Publisher name', 'Publisher address', 'Languages', 'Web of Science Categories'],
            mapRow: normalizeWosRow
        }).then(data => {
            ssciData = data;
            runtimeState.ssciLoaded = true;
            return ssciData;
        }).catch(error => {
            if (previousData.length > 0) {
                ssciData = previousData;
                runtimeState.ssciLoaded = true;
                setWarningMessage('SSCI 数据刷新失败，已显示已加载版本');
                return ssciData;
            }
            throw error;
        }).finally(() => {
            runtimeState.ssciLoadPromise = null;
        });

        return runtimeState.ssciLoadPromise;
    }

    async function ensureJCRDataLoaded(forceRefresh = false) {
        if (runtimeState.jcrLoaded && !forceRefresh) return jcrData;
        if (runtimeState.jcrLoadPromise) return runtimeState.jcrLoadPromise;

        const previousData = jcrData;
        runtimeState.jcrLoadPromise = loadCsvDataset('assets/data/2026-JCR.csv', {
            encoding: 'gb18030',
            forceRefresh,
            requiredHeaders: [
                '总排名(按JIF)', '期刊名称', '期刊缩写', 'ISSN', 'eISSN', '出版商', '学科类别',
                '影响因子JIF', 'JIF分区', 'JIF百分位', 'JIF排名', 'JCI', 'JCI分区',
                'JCI百分位', 'JCI排名', '5年影响因子', '总被引频次', '各学科分区详情', '数据年份'
            ],
            mapRow: normalizeJCRRow
        }).then(data => {
            jcrData = data;
            runtimeState.jcrLoaded = true;
            return jcrData;
        }).catch(error => {
            if (previousData.length > 0) {
                jcrData = previousData;
                runtimeState.jcrLoaded = true;
                setWarningMessage('JCR 数据刷新失败，已显示已加载版本');
                return jcrData;
            }
            throw error;
        }).finally(() => {
            runtimeState.jcrLoadPromise = null;
        });

        return runtimeState.jcrLoadPromise;
    }

    let eiSortConfig = {
        key: 'title',
        asc: true
    };

    let sciSortConfig = {
        key: 'title',
        asc: true
    };

    let ssciSortConfig = {
        key: 'title',
        asc: true
    };

    let jcrSortConfig = {
        key: 'rank',
        asc: true
    };
    const JCR_NUMERIC_SORT_KEYS = new Set([
        'rank', 'jif', 'jifPercentile', 'jci', 'jciPercentile', 'fiveYearJif', 'totalCitations'
    ]);

    let ccfSortConfig = {
        key: 'grade', // 默认按 CCF 级别排序
        asc: true     // 默认升序 (A在前，C在后)
    };

    let deadlineSortConfig = {
        key: 'deadline', // 默认按截止时间排序
        asc: true
    };

    // 当前视图模式
    let currentMode = 'deadlines';

    // 分页状态控制
    let currentPage = 1;
    const PAGE_SIZE_OPTIONS = [25, 50, 100];
    const storedPageSize = Number.parseInt(safeStorage.get(STORAGE_KEYS.pageSize), 10);
    let itemsPerPage = PAGE_SIZE_OPTIONS.includes(storedPageSize) ? storedPageSize : 25;

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
    const tabEIList = document.getElementById('tab-ei-list');
    const tabSCIList = document.getElementById('tab-sci-list');
    const tabSSCIList = document.getElementById('tab-ssci-list');
    const tabJcrList = document.getElementById('tab-jcr-list');
    const topTabs = [tabDeadlines, tabCcfList, tabEIList, tabSCIList, tabSSCIList, tabJcrList].filter(Boolean);
    const filterCol4 = document.getElementById('filter-col-4');
    const labelFilter1 = document.getElementById('label-filter-1');
    const labelFilter2 = document.getElementById('label-filter-2');
    const labelFilter3 = document.getElementById('label-filter-3');
    const timezoneWrapper = document.querySelector('.timezone-wrapper');
    const ccfListNotice = document.getElementById('ccf-list-notice');
    const eiListNotice = document.getElementById('ei-list-notice');
    const sciListNotice = document.getElementById('sci-list-notice');
    const ssciListNotice = document.getElementById('ssci-list-notice');
    const jcrListNotice = document.getElementById('jcr-list-notice');
    const dataNotices = [ccfListNotice, eiListNotice, sciListNotice, ssciListNotice, jcrListNotice];
    const modeViewConfig = {
        deadlines: {
            tab: tabDeadlines,
            labels: ['领域', 'CCF 级别', '年份'],
            searchPlaceholder: '检索会议简称或全称...',
            showDeadlineFilter: true,
            showTimezone: true,
            activeNotice: null,
            initFilters: () => initDeadlineFilters()
        },
        ccf_list: {
            tab: tabCcfList,
            labels: ['领域', 'CCF 级别', '类型'],
            searchPlaceholder: '检索名称、简称或出版社...',
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: ccfListNotice,
            initFilters: () => initCCFListFilters()
        },
        ei_list: {
            tab: tabEIList,
            labels: ['学科', '名单类别', '来源类型'],
            searchPlaceholder: '检索名称、ISSN、ISBN 或出版社...',
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: eiListNotice,
            initFilters: () => initEIFilters()
        },
        sci_list: {
            tab: tabSCIList,
            labels: ['学科类别', '语言', '出版商'],
            searchPlaceholder: '检索期刊、ISSN、出版商或学科...',
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: sciListNotice,
            initFilters: () => initWosFilters(sciData)
        },
        ssci_list: {
            tab: tabSSCIList,
            labels: ['学科类别', '语言', '出版商'],
            searchPlaceholder: '检索期刊、ISSN、出版商或学科...',
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: ssciListNotice,
            initFilters: () => initWosFilters(ssciData)
        },
        jcr_list: {
            tab: tabJcrList,
            labels: ['学科类别', 'JIF 分区', 'JIF 区间'],
            searchPlaceholder: '检索期刊、ISSN、出版商或学科...',
            showDeadlineFilter: false,
            showTimezone: false,
            activeNotice: jcrListNotice,
            initFilters: () => initJCRFilters()
        }
    };
    
    [
        [tabDeadlines, 'deadlines'],
        [tabCcfList, 'ccf_list'],
        [tabEIList, 'ei_list'],
        [tabSCIList, 'sci_list'],
        [tabSSCIList, 'ssci_list'],
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

        if (mode === 'ei_list') {
            if (!runtimeState.eiLoaded || forceRefresh) {
                setContainerMessage('正在加载 EI 数据...');
            }
            return ensureEIDataLoaded(forceRefresh);
        }

        if (mode === 'sci_list') {
            if (!runtimeState.sciLoaded || forceRefresh) {
                setContainerMessage('正在加载 SCI 数据...');
            }
            return ensureSCIDataLoaded(forceRefresh);
        }

        if (mode === 'ssci_list') {
            if (!runtimeState.ssciLoaded || forceRefresh) {
                setContainerMessage('正在加载 SSCI 数据...');
            }
            return ensureSSCIDataLoaded(forceRefresh);
        }

        if (mode === 'jcr_list') {
            if (!runtimeState.jcrLoaded || forceRefresh) {
                setContainerMessage('正在加载 JCR 数据...');
            }
            return ensureJCRDataLoaded(forceRefresh);
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
        topTabs.forEach(tab => tab.setAttribute('aria-current', tab === config.tab ? 'page' : 'false'));
        if (searchInput && config.searchPlaceholder) searchInput.placeholder = config.searchPlaceholder;
        if (labelFilter1) labelFilter1.textContent = config.labels[0];
        if (labelFilter2) labelFilter2.textContent = config.labels[1];
        if (labelFilter3) labelFilter3.textContent = config.labels[2];
        if (filterCol4) filterCol4.style.display = config.showDeadlineFilter ? 'block' : 'none';
        if (timezoneWrapper) timezoneWrapper.style.display = config.showTimezone ? 'block' : 'none';
        dataNotices.forEach(notice => {
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
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await fetch(url, {
                        cache: forceRefresh ? 'no-store' : 'default',
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`${sub}:${response.status}`);
                    }

                    const text = await response.text();
                    return parseICS(text, sub);
                } finally {
                    clearTimeout(timeoutId);
                }
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

    function initEIFilters() {
        const subjects = new Set();
        const sections = new Set();
        const types = new Set();

        eiData.forEach(item => {
                item.subjects.forEach(subject => subjects.add(subject));
                if (item.section) sections.add(item.section);
                if (item.type) types.add(item.type);
        });

        const sectionOrder = { SERIALS: 1, 'NON-SERIALS': 2, DISCONTINUED: 3, UNKNOWN: 4 };
        createMultiSelect('category-filter', Array.from(subjects).sort(compareText).map(subject => ({value: subject, label: subject})), '所有学科');
        createMultiSelect(
            'level-filter',
            Array.from(sections)
                .sort((a, b) => (sectionOrder[a] || 99) - (sectionOrder[b] || 99))
                .map(section => ({value: section, label: eiSectionLabels[section] || section})),
            '所有名单类别'
        );
        createMultiSelect('year-filter', Array.from(types).sort(compareText).map(type => ({value: type, label: type})), '所有来源类型');
    }

    function initWosFilters(data) {
        const categories = new Set();
        const languages = new Set();
        const publishers = new Set();

        data.forEach(item => {
            item.categories.forEach(category => categories.add(category));
            if (item.language) languages.add(item.language);
            if (item.publisher) publishers.add(item.publisher);
        });

        createMultiSelect('category-filter', Array.from(categories).sort(compareText).map(category => ({value: category, label: category})), '所有学科类别');
        createMultiSelect('level-filter', Array.from(languages).sort(compareText).map(language => ({value: language, label: language})), '所有语言');
        createMultiSelect('year-filter', Array.from(publishers).sort(compareText).map(publisher => ({value: publisher, label: publisher})), '所有出版商');
    }

    function initJCRFilters() {
        const categorySet = new Set();
        const quartileSet = new Set();
        const factorBands = new Set();

        jcrData.forEach(item => {
            if (item.category) categorySet.add(item.category);
            if (item.jifQuartile) quartileSet.add(item.jifQuartile);
            if (item.jifBand) factorBands.add(item.jifBand);
        });

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
            Array.from(categorySet)
                .filter(Boolean)
                .sort(compareText)
                .map(category => ({value: category, label: category})),
            '所有学科类别'
        );
        const quartileOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, 'N/A': 5, '-': 6 };
        createMultiSelect(
            'level-filter',
            Array.from(quartileSet)
                .filter(Boolean)
                .sort((a, b) => (quartileOrder[a] || 99) - (quartileOrder[b] || 99))
                .map(quartile => ({value: quartile, label: quartile === '-' ? '无分区' : quartile})),
            '所有 JIF 分区'
        );
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

    function getTimelineDeadlineMs(item, fallbackTimezone) {
        if (Number.isFinite(item.deadlineMs)) return item.deadlineMs;
        return getAbsoluteMs(item.deadline, item.timezone || fallbackTimezone);
    }

    function formatDeadlineLabel(comment) {
        const raw = String(comment || '截稿').trim() || '截稿';
        return raw
            .replace(/^摘要截止(?:日期)?/, '摘要截稿')
            .replace(/^摘要截稿日期/, '摘要截稿')
            .replace(/^Abstract\s+(?:Submission\s+)?Deadline/i, '摘要截稿')
            .replace(/^(?:截稿日期|全文截稿|正文截稿日期|论文截稿|Paper\s+(?:Submission\s+)?Deadline|Submission\s+Deadline)/i, '正文截稿');
    }

    function getTimelineDeadlineEntries(latestConf, fallbackStatus) {
        const fallbackTimezone = latestConf.timezone || 'UTC';
        const timeline = Array.isArray(latestConf.timeline) && latestConf.timeline.length > 0
            ? latestConf.timeline
            : [{
                deadlineMs: fallbackStatus.ms,
                timezone: fallbackTimezone,
                comment: fallbackStatus.comment || '截稿'
            }];

        return timeline.map(item => {
            const timezone = item.timezone || fallbackTimezone;
            const ms = getTimelineDeadlineMs(item, timezone);
            return {
                label: formatDeadlineLabel(item.comment || fallbackStatus.comment),
                formatted: formatToSelectedTz(ms, selectedTimezone, timezone)
            };
        });
    }

    function buildTimelineDeadlineHTML(entries) {
        return entries.map(item => `
            <div class="deadline-main">
                ${escapeDisplayText(item.formatted, 'TBD')}<br>
                <span class="deadline-badge">${escapeDisplayText(item.label)}</span>
            </div>
        `).join('');
    }

    function buildTimelineDeadlineTitle(entries) {
        return escapeHTML(entries.map(item => `${item.label}: ${item.formatted}`).join('\n'));
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

            const deadlineEntries = getTimelineDeadlineEntries(latestConf, timeStatus);
            const deadlineHTML = buildTimelineDeadlineHTML(deadlineEntries);
            const deadlineTitle = buildTimelineDeadlineTitle(deadlineEntries);

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
                    <td class="deadline-cell" title="${deadlineTitle}">
                        ${deadlineHTML}
                    </td>
                    <td class="countdown-timer-container" data-ts="${timeStatus.ms || ''}">
                        <span class="countdown-text">
                            <span class="countdown-running">
                                <span>剩余:</span>
                                <span class="no-translate" data-countdown-part="days">0</span><span>天</span>
                                <span class="no-translate" data-countdown-part="hours">0</span><span>时</span>
                                <span class="no-translate" data-countdown-part="minutes">0</span><span>分</span>
                                <span class="no-translate" data-countdown-part="seconds">0</span><span>秒</span>
                            </span>
                            <span class="countdown-status countdown-tbd" hidden>状态: 时间未定 (TBD)</span>
                            <span class="countdown-status countdown-finished" hidden>状态: 已截止</span>
                        </span>
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

    function displayValue(value, fallback = '-') {
        const text = String(value ?? '').trim();
        return text && text !== '.' ? text : fallback;
    }

    function formatMetric(value, maximumFractionDigits = 2) {
        if (!Number.isFinite(value)) return '-';
        return value.toLocaleString('zh-CN', {
            minimumFractionDigits: 0,
            maximumFractionDigits
        });
    }

    // ==========================================
    // 界面渲染 - EI 数据
    // ==========================================
    function createEITableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 EI 数据</p>';
        }

        const rowsHTML = dataList.map(item => `
            <tr>
                <td class="title-col col-name no-translate" title="${escapeDisplayText(item.title)}">${escapeDisplayText(item.title)}</td>
                <td class="title-col no-translate" title="${escapeDisplayText(item.alternateTitle)}">${escapeDisplayText(displayValue(item.alternateTitle))}</td>
                <td>${escapeDisplayText(displayValue(item.type))}</td>
                <td>${escapeDisplayText(displayValue(item.sectionLabel))}</td>
                <td>${escapeDisplayText(displayValue(item.subjectsText))}</td>
                <td>${escapeDisplayText(displayValue(item.publisher))}</td>
                <td>${escapeDisplayText(displayValue(item.country))}</td>
                <td>${escapeDisplayText(displayValue(item.language))}</td>
                <td class="no-translate">${escapeDisplayText(displayValue(item.issn))}</td>
                <td class="no-translate">${escapeDisplayText(displayValue(item.eissn))}</td>
                <td class="no-translate">${escapeDisplayText(displayValue(item.isbn13))}</td>
                <td>${escapeDisplayText(displayValue(item.indexingStatus))}</td>
                <td>${escapeDisplayText(displayValue(item.openAccess))}</td>
                <td>${escapeDisplayText(displayValue(item.coverage))}</td>
            </tr>
        `).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead><tr>
                        ${buildSortableHeader(eiSortConfig, 'title', '名称', 'clamp(150px, 22vw, 280px)', 'col-name')}
                        ${buildSortableHeader(eiSortConfig, 'alternateTitle', '中文/译名', 'clamp(120px, 18vw, 220px)')}
                        ${buildSortableHeader(eiSortConfig, 'type', '类型')}
                        ${buildSortableHeader(eiSortConfig, 'section', '名单类别')}
                        ${buildSortableHeader(eiSortConfig, 'subjectsText', '学科', '220px')}
                        ${buildSortableHeader(eiSortConfig, 'publisher', '出版商', '180px')}
                        ${buildSortableHeader(eiSortConfig, 'country', '国家/地区')}
                        ${buildSortableHeader(eiSortConfig, 'language', '语言')}
                        ${buildSortableHeader(eiSortConfig, 'issn', 'ISSN')}
                        ${buildSortableHeader(eiSortConfig, 'eissn', 'eISSN')}
                        ${buildSortableHeader(eiSortConfig, 'isbn13', 'ISBN-13')}
                        ${buildSortableHeader(eiSortConfig, 'indexingStatus', '2026 收录状态', '150px')}
                        ${buildSortableHeader(eiSortConfig, 'openAccess', 'OA')}
                        ${buildSortableHeader(eiSortConfig, 'coverage', '最终收录范围', '160px')}
                    </tr></thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        `;
    }

    function createWosTableHTML(dataList, sortConfig, datasetName) {
        if (!dataList || dataList.length === 0) {
            return `<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 ${escapeHTML(datasetName)} 数据</p>`;
        }

        const rowsHTML = dataList.map(item => `
            <tr>
                <td class="title-col col-name no-translate" title="${escapeDisplayText(item.title)}">${escapeDisplayText(item.title)}</td>
                <td>${escapeDisplayText(displayValue(item.categoriesText))}</td>
                <td>${escapeDisplayText(displayValue(item.publisher))}</td>
                <td>${escapeDisplayText(displayValue(item.address))}</td>
                <td>${escapeDisplayText(displayValue(item.language))}</td>
                <td class="no-translate">${escapeDisplayText(displayValue(item.issn))}</td>
                <td class="no-translate">${escapeDisplayText(displayValue(item.eissn))}</td>
            </tr>
        `).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead><tr>
                        ${buildSortableHeader(sortConfig, 'title', '期刊名称', 'clamp(150px, 22vw, 280px)', 'col-name')}
                        ${buildSortableHeader(sortConfig, 'categoriesText', '学科类别', '240px')}
                        ${buildSortableHeader(sortConfig, 'publisher', '出版商', '180px')}
                        ${buildSortableHeader(sortConfig, 'address', '出版商地址', '240px')}
                        ${buildSortableHeader(sortConfig, 'language', '语言')}
                        ${buildSortableHeader(sortConfig, 'issn', 'ISSN')}
                        ${buildSortableHeader(sortConfig, 'eissn', 'eISSN')}
                    </tr></thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        `;
    }

    function createSCITableHTML(dataList) {
        return createWosTableHTML(dataList, sciSortConfig, 'SCI');
    }

    function createSSCITableHTML(dataList) {
        return createWosTableHTML(dataList, ssciSortConfig, 'SSCI');
    }

    // ==========================================
    // 界面渲染 - JCR 数据
    // ==========================================
    function createJCRTableHTML(dataList) {
        if (!dataList || dataList.length === 0) {
            return '<p class="empty-text" style="grid-column: 1/-1; text-align: center;">未找到符合条件的 JCR 数据</p>';
        }

        const rowsHTML = dataList.map(item => {
            const quartileClass = item.jifQuartile === 'Q1' ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';
            const jciQuartileClass = item.jciQuartile === 'Q1' ? 'quartile-tag quartile-q1' : 'quartile-tag quartile-normal';
            return `
                <tr>
                    <td class="sjr-score">${escapeDisplayText(formatMetric(item.rank, 0))}</td>
                    <td class="title-col col-name no-translate" title="${escapeDisplayText(item.title)}">${escapeDisplayText(item.title)}</td>
                    <td class="title-col col-abbr no-translate" title="${escapeDisplayText(item.abbr)}">${escapeDisplayText(displayValue(item.abbr))}</td>
                    <td>${escapeDisplayText(displayValue(item.category))}</td>
                    <td class="sjr-score">${escapeDisplayText(formatMetric(item.jif, 3))}</td>
                    <td><span class="${quartileClass}">${escapeDisplayText(displayValue(item.jifQuartile))}</span></td>
                    <td>${escapeDisplayText(formatMetric(item.jifPercentile, 2))}</td>
                    <td class="no-translate">${escapeDisplayText(displayValue(item.jifRank))}</td>
                    <td class="sjr-score">${escapeDisplayText(formatMetric(item.jci, 3))}</td>
                    <td><span class="${jciQuartileClass}">${escapeDisplayText(displayValue(item.jciQuartile))}</span></td>
                    <td>${escapeDisplayText(formatMetric(item.jciPercentile, 2))}</td>
                    <td class="no-translate">${escapeDisplayText(displayValue(item.jciRank))}</td>
                    <td>${escapeDisplayText(formatMetric(item.fiveYearJif, 3))}</td>
                    <td>${escapeDisplayText(formatMetric(item.totalCitations, 0))}</td>
                    <td class="no-translate">${escapeDisplayText(displayValue(item.issn))}</td>
                    <td class="no-translate">${escapeDisplayText(displayValue(item.eissn))}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sjr-table-wrapper">
                <table class="sjr-table">
                    <thead><tr>
                        ${buildSortableHeader(jcrSortConfig, 'rank', '总排名')}
                        ${buildSortableHeader(jcrSortConfig, 'title', '期刊名称', 'clamp(150px, 22vw, 280px)', 'col-name')}
                        ${buildSortableHeader(jcrSortConfig, 'abbr', '简称', 'clamp(100px, 14vw, 160px)', 'col-abbr')}
                        ${buildSortableHeader(jcrSortConfig, 'category', '学科类别', '180px')}
                        ${buildSortableHeader(jcrSortConfig, 'jif', 'JIF')}
                        ${buildSortableHeader(jcrSortConfig, 'jifQuartile', 'JIF 分区')}
                        ${buildSortableHeader(jcrSortConfig, 'jifPercentile', 'JIF 百分位')}
                        ${buildSortableHeader(jcrSortConfig, 'jifRank', 'JIF 排名')}
                        ${buildSortableHeader(jcrSortConfig, 'jci', 'JCI')}
                        ${buildSortableHeader(jcrSortConfig, 'jciQuartile', 'JCI 分区')}
                        ${buildSortableHeader(jcrSortConfig, 'jciPercentile', 'JCI 百分位')}
                        ${buildSortableHeader(jcrSortConfig, 'jciRank', 'JCI 排名')}
                        ${buildSortableHeader(jcrSortConfig, 'fiveYearJif', '5 年影响因子')}
                        ${buildSortableHeader(jcrSortConfig, 'totalCitations', '总被引频次')}
                        ${buildSortableHeader(jcrSortConfig, 'issn', 'ISSN')}
                        ${buildSortableHeader(jcrSortConfig, 'eissn', 'eISSN')}
                    </tr></thead>
                    <tbody>${rowsHTML}</tbody>
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

        // --- 分支 3：EI 数据逻辑 ---
        } else if (currentMode === 'ei_list') {
            if (!eiData || eiData.length === 0) return;

            filteredData = eiData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
                if (!matchSearch) return false;

                if (!catFilters.includes('all') && !item.subjects.some(subject => catFilters.includes(subject))) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.section)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.type)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                let comparison = 0;
                if (eiSortConfig.key === 'section') {
                    const sectionOrder = { SERIALS: 1, 'NON-SERIALS': 2, DISCONTINUED: 3, UNKNOWN: 4 };
                    comparison = (sectionOrder[a.section] || 99) - (sectionOrder[b.section] || 99);
                    if (!eiSortConfig.asc) comparison = -comparison;
                } else {
                    comparison = compareNullableText(a[eiSortConfig.key], b[eiSortConfig.key], eiSortConfig.asc);
                }
                return comparison || a.sourceIndex - b.sourceIndex;
            });

        // --- 分支 4：SCI / SSCI 数据逻辑 ---
        } else if (currentMode === 'sci_list' || currentMode === 'ssci_list') {
            const sourceData = currentMode === 'sci_list' ? sciData : ssciData;
            const sortConfig = currentMode === 'sci_list' ? sciSortConfig : ssciSortConfig;
            if (!sourceData || sourceData.length === 0) return;

            filteredData = sourceData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
                if (!matchSearch) return false;

                if (!catFilters.includes('all') && !item.categories.some(category => catFilters.includes(category))) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.language)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.publisher)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                const comparison = compareNullableText(a[sortConfig.key], b[sortConfig.key], sortConfig.asc);
                return comparison || a.sourceIndex - b.sourceIndex;
            });

        // --- 分支 5：JCR 数据逻辑 ---
        } else if (currentMode === 'jcr_list') {
            if (!jcrData || jcrData.length === 0) return;

            filteredData = jcrData.filter(item => {
                const matchSearch = !searchQuery || (item.searchText || '').includes(searchQuery);
                if (!matchSearch) return false;

                if (!catFilters.includes('all') && !catFilters.includes(item.category)) return false;
                if (!levelFilters.includes('all') && !levelFilters.includes(item.jifQuartile)) return false;
                if (!col3Filters.includes('all') && !col3Filters.includes(item.jifBand)) return false;
                return true;
            });

            filteredData.sort((a, b) => {
                const key = jcrSortConfig.key;
                let comparison;
                if (JCR_NUMERIC_SORT_KEYS.has(key)) {
                    comparison = compareNullableNumbers(a[key], b[key], jcrSortConfig.asc);
                } else if (key === 'jifQuartile' || key === 'jciQuartile') {
                    comparison = compareQuartiles(a[key], b[key], jcrSortConfig.asc);
                } else if (key === 'jifRank' || key === 'jciRank') {
                    comparison = compareRankFractions(a[key], b[key], jcrSortConfig.asc);
                } else {
                    comparison = compareNullableText(a[key], b[key], jcrSortConfig.asc);
                }
                return comparison || a.sourceIndex - b.sourceIndex;
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
                ei_list: createEITableHTML,
                sci_list: createSCITableHTML,
                ssci_list: createSSCITableHTML,
                jcr_list: createJCRTableHTML
            };
            const renderTable = tableRenderers[currentMode];
            if (renderTable) conferencesContainer.innerHTML = renderTable(paginatedData);
        }

        renderPagination(totalPages);
        scheduleDynamicTranslation();
        
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
            const running = el.querySelector('.countdown-running');
            const tbdStatus = el.querySelector('.countdown-tbd');
            const finishedStatus = el.querySelector('.countdown-finished');
            const setVisibility = state => {
                if (running) running.hidden = state !== 'running';
                if (tbdStatus) tbdStatus.hidden = state !== 'tbd';
                if (finishedStatus) finishedStatus.hidden = state !== 'finished';
            };
            el.classList.remove('timer-normal', 'timer-warning', 'timer-urgent', 'timer-finished', 'timer-tbd');

            if (!tsAttr || tsAttr === 'null') {
                setVisibility('tbd');
                el.classList.add('timer-tbd');
                return;
            }

            const diff = parseInt(tsAttr, 10) - now;
            if (diff <= 0) {
                setVisibility('finished');
                el.classList.add('timer-finished');
            } else {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diff / (1000 * 60)) % 60);
                const s = Math.floor((diff / 1000) % 60);
                setVisibility('running');
                const values = { days: d, hours: h, minutes: m, seconds: s };
                Object.entries(values).forEach(([part, value]) => {
                    const node = el.querySelector(`[data-countdown-part="${part}"]`);
                    if (node && node.textContent !== String(value)) node.textContent = String(value);
                });
                
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

    const pageSizeButtons = Array.from(document.querySelectorAll('.page-size-btn'));
    const syncPageSizeButtons = () => {
        pageSizeButtons.forEach(button => {
            const isActive = Number.parseInt(button.dataset.pageSize, 10) === itemsPerPage;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };
    pageSizeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const nextSize = Number.parseInt(button.dataset.pageSize, 10);
            if (!PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === itemsPerPage) return;
            itemsPerPage = nextSize;
            safeStorage.set(STORAGE_KEYS.pageSize, String(nextSize));
            currentPage = 1;
            syncPageSizeButtons();
            updateView();
        });
    });
    syncPageSizeButtons();

    // 初始化默认模式
    setMode('deadlines');

    const updateDataBtn = document.getElementById('update-data-btn');
    if (updateDataBtn) {
        updateDataBtn.addEventListener('click', async () => {
            const icon = updateDataBtn.querySelector('.refresh-icon');
            if (icon) icon.classList.add('spin-anim');
            updateDataBtn.disabled = true;
            
            try {
                await setMode(currentMode, true);
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
        ei_list: {
            config: eiSortConfig,
            defaultAscKeys: ['title', 'alternateTitle', 'type', 'section', 'subjectsText', 'publisher', 'country', 'language', 'issn', 'eissn', 'isbn13', 'indexingStatus', 'openAccess', 'coverage']
        },
        sci_list: {
            config: sciSortConfig,
            defaultAscKeys: ['title', 'categoriesText', 'publisher', 'address', 'language', 'issn', 'eissn']
        },
        ssci_list: {
            config: ssciSortConfig,
            defaultAscKeys: ['title', 'categoriesText', 'publisher', 'address', 'language', 'issn', 'eissn']
        },
        jcr_list: {
            config: jcrSortConfig,
            defaultAscKeys: ['rank', 'title', 'abbr', 'category', 'jifQuartile', 'jifRank', 'jciQuartile', 'jciRank', 'issn', 'eissn']
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
            const retryButton = e.target.closest('.retry-btn');
            if (retryButton) {
                const retryMode = retryButton.dataset.retryMode || currentMode;
                setMode(retryMode, true);
                return;
            }

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

            currentPage = 1;
            scheduleUpdateView();
        });
    }
});
