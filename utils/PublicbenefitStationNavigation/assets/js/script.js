const STATIONS_DATA_URL = './assets/data/stations.json';

const FEATURE_FILTERS = [
    { id: 'all', label: '全部', matches: () => true },
    { id: 'api', label: 'API 中转', matches: text => /api|中转|relay|openai兼容/i.test(text) },
    { id: 'claude', label: 'Claude', matches: text => /claude|opus|sonnet/i.test(text) },
    { id: 'openai-codex', label: 'OpenAI/Codex', matches: text => /openai|gpt|codex/i.test(text) },
    { id: 'free-model', label: '免费模型', matches: text => /免费模型|免费分组|free model|免费api/i.test(text) },
    { id: 'image', label: '生图', matches: text => /生图|图像生成|image generation|midjourney|flux/i.test(text) },
    { id: 'checkin', label: '签到', matches: text => /签到|每日登录/i.test(text) },
    { id: 'limited', label: '限时注册', matches: (text, station) => station.registrationStatus === 'limited' || /限时注册|限注|随缘/i.test(text) }
];

const REGISTRATION_LABELS = {
    open: '开放注册',
    limited: '限时注册',
    closed: '关闭注册',
    unknown: '注册状态未知'
};

const collator = new Intl.Collator(['zh-Hans-CN', 'en'], {
    numeric: true,
    sensitivity: 'base'
});

const appState = {
    stations: [],
    generatedAt: '',
    query: '',
    activeFilter: 'all',
    sort: 'recommended',
    pageSize: 9,
    currentPage: 1,
    activeStationId: null,
    lastFocusedElement: null,
    translateTimer: null
};

const UI = {};

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    bindEvents();
    loadStations();
});

function cacheElements() {
    UI.searchInput = document.getElementById('searchInput');
    UI.clearSearchBtn = document.getElementById('clearSearchBtn');
    UI.categoryFilters = document.getElementById('categoryFilters');
    UI.resultSummary = document.getElementById('resultSummary');
    UI.updateSummary = document.getElementById('updateSummary');
    UI.sortSelect = document.getElementById('sortSelect');
    UI.pageSizeSelect = document.getElementById('pageSizeSelect');
    UI.loadingState = document.getElementById('loadingState');
    UI.errorState = document.getElementById('errorState');
    UI.errorMessage = document.getElementById('errorMessage');
    UI.emptyState = document.getElementById('emptyState');
    UI.retryButton = document.getElementById('retryButton');
    UI.resetFiltersButton = document.getElementById('resetFiltersButton');
    UI.stationGrid = document.getElementById('stationGrid');
    UI.pagination = document.getElementById('pagination');
    UI.modal = document.getElementById('stationModal');
    UI.modalDialog = UI.modal?.querySelector('.modal-dialog');
    UI.modalCategory = document.getElementById('modalCategory');
    UI.modalTitle = document.getElementById('modalTitle');
    UI.modalMeta = document.getElementById('modalMeta');
    UI.modalSummary = document.getElementById('modalSummary');
    UI.modalSections = document.getElementById('modalSections');
    UI.modalVisitButton = document.getElementById('modalVisitButton');
    UI.modalCloseButton = document.getElementById('modalCloseButton');
}

function bindEvents() {
    UI.searchInput.addEventListener('input', () => {
        appState.query = UI.searchInput.value.trim();
        appState.currentPage = 1;
        UI.clearSearchBtn.hidden = appState.query.length === 0;
        render();
    });

    UI.clearSearchBtn.addEventListener('click', () => {
        UI.searchInput.value = '';
        appState.query = '';
        appState.currentPage = 1;
        UI.clearSearchBtn.hidden = true;
        UI.searchInput.focus();
        render();
    });

    UI.categoryFilters.addEventListener('click', event => {
        const button = event.target.closest('button[data-filter]');
        if (!button || button.disabled) return;
        appState.activeFilter = button.dataset.filter;
        appState.currentPage = 1;
        render();
    });

    UI.sortSelect.addEventListener('change', () => {
        appState.sort = UI.sortSelect.value;
        appState.currentPage = 1;
        render();
    });

    UI.pageSizeSelect.addEventListener('change', () => {
        appState.pageSize = Number(UI.pageSizeSelect.value) || 9;
        appState.currentPage = 1;
        render();
    });

    UI.stationGrid.addEventListener('click', event => {
        const button = event.target.closest('button[data-station-id]');
        if (button) openModal(button.dataset.stationId, button);
    });

    UI.pagination.addEventListener('click', event => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        appState.currentPage = Number(button.dataset.page);
        render();
        document.querySelector('.station-library')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });

    UI.retryButton.addEventListener('click', loadStations);
    UI.resetFiltersButton.addEventListener('click', resetFilters);
    UI.modalCloseButton.addEventListener('click', closeModal);
    UI.modal.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', handleModalKeydown);
}

async function loadStations() {
    setLoadingState();
    try {
        const response = await fetch(STATIONS_DATA_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`数据文件 HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.stations)) {
            throw new Error('数据文件结构无效');
        }
        const stations = payload.stations.map(normalizeStation).filter(Boolean);
        if (stations.length === 0) throw new Error('数据文件中没有可展示的公益站');

        appState.stations = stations;
        appState.generatedAt = typeof payload.generatedAt === 'string' ? payload.generatedAt : '';
        appState.currentPage = 1;
        setControlsDisabled(false);
        UI.loadingState.hidden = true;
        UI.stationGrid.setAttribute('aria-busy', 'false');
        render();
    } catch (error) {
        console.error('[PublicBenefitStations] Failed to load stations:', error);
        setErrorState(error);
    }
}

function normalizeStation(raw, sourceIndex) {
    if (!raw || typeof raw !== 'object') return null;
    const id = cleanText(raw.id);
    const name = cleanText(raw.name);
    const domain = cleanText(raw.domain);
    const url = safeHttpUrl(raw.url);
    if (!id || !name || !domain || !url) return null;

    const station = {
        id,
        name,
        domain,
        url,
        summary: cleanText(raw.summary) || '暂无详细介绍，请前往站点查看最新公告。',
        category: cleanText(raw.category) || '公益站',
        tags: cleanList(raw.tags),
        models: cleanList(raw.models),
        benefits: cleanList(raw.benefits),
        requirements: cleanList(raw.requirements),
        notes: cleanList(raw.notes),
        registrationStatus: ['open', 'limited', 'closed'].includes(raw.registrationStatus) ? raw.registrationStatus : 'unknown',
        checkedAt: cleanText(raw.checkedAt),
        healthStatus: raw.healthStatus === 'responding' ? 'responding' : 'available',
        updatedAt: cleanText(raw.updatedAt),
        recommended: Boolean(raw.recommended),
        sourceIndex
    };
    station.searchText = [
        station.name,
        station.domain,
        station.summary,
        station.category,
        ...station.tags,
        ...station.models,
        ...station.benefits,
        ...station.requirements,
        ...station.notes
    ].join('\n').toLocaleLowerCase();
    station.completeness = calculateCompleteness(station);
    return station;
}

function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((result, item) => {
        const text = cleanText(item);
        const key = text.toLocaleLowerCase();
        if (text && !seen.has(key)) {
            seen.add(key);
            result.push(text);
        }
        return result;
    }, []);
}

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
        return '';
    }
}

function calculateCompleteness(station) {
    return (station.summary ? 3 : 0)
        + station.tags.length
        + station.models.length * 2
        + station.benefits.length * 2
        + station.requirements.length
        + station.notes.length
        + (station.updatedAt ? 1 : 0);
}

function render() {
    if (!appState.stations.length) return;
    const searchMatches = getSearchMatches();
    renderFilters(searchMatches);

    const filtered = searchMatches.filter(station => getActiveFilter().matches(station.searchText, station));
    const sorted = sortStations(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / appState.pageSize));
    appState.currentPage = Math.min(appState.currentPage, totalPages);
    const pageStart = (appState.currentPage - 1) * appState.pageSize;
    const currentStations = sorted.slice(pageStart, pageStart + appState.pageSize);

    renderCards(currentStations);
    renderSummary(sorted.length, totalPages);
    renderPagination(totalPages);

    UI.emptyState.hidden = sorted.length > 0;
    UI.stationGrid.hidden = sorted.length === 0;
    UI.pagination.hidden = sorted.length === 0 || totalPages <= 1;
    requestTranslation();
}

function getSearchMatches() {
    const query = appState.query.toLocaleLowerCase();
    if (!query) return [...appState.stations];
    return appState.stations.filter(station => station.searchText.includes(query));
}

function getActiveFilter() {
    return FEATURE_FILTERS.find(filter => filter.id === appState.activeFilter) || FEATURE_FILTERS[0];
}

function renderFilters(searchMatches) {
    const fragment = document.createDocumentFragment();
    FEATURE_FILTERS.forEach(filter => {
        const count = searchMatches.filter(station => filter.matches(station.searchText, station)).length;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-chip${filter.id === appState.activeFilter ? ' is-active' : ''}`;
        button.dataset.filter = filter.id;
        button.setAttribute('aria-pressed', String(filter.id === appState.activeFilter));
        button.disabled = count === 0 && filter.id !== 'all';

        const label = document.createElement('span');
        label.textContent = filter.label;
        const countNode = document.createElement('span');
        countNode.className = 'filter-count no-translate';
        countNode.textContent = String(count);
        button.append(label, countNode);
        fragment.appendChild(button);
    });
    UI.categoryFilters.replaceChildren(fragment);
}

function sortStations(stations) {
    const sorted = [...stations];
    sorted.sort((left, right) => {
        let result = 0;
        switch (appState.sort) {
            case 'name-asc':
                result = collator.compare(left.name, right.name);
                break;
            case 'name-desc':
                result = collator.compare(right.name, left.name);
                break;
            case 'checked-desc':
                result = toTimestamp(right.checkedAt) - toTimestamp(left.checkedAt);
                break;
            case 'complete-desc':
                result = right.completeness - left.completeness;
                break;
            default:
                result = Number(right.recommended) - Number(left.recommended)
                    || right.completeness - left.completeness;
        }
        return result || left.sourceIndex - right.sourceIndex;
    });
    return sorted;
}

function renderCards(stations) {
    const fragment = document.createDocumentFragment();
    stations.forEach(station => fragment.appendChild(createStationCard(station)));
    UI.stationGrid.replaceChildren(fragment);
}

function createStationCard(station) {
    const card = document.createElement('article');
    card.className = 'prompt-card station-card';

    const heading = document.createElement('div');
    heading.className = 'card-heading';
    const category = document.createElement('span');
    category.className = 'category-badge';
    category.textContent = station.category;
    const registration = document.createElement('span');
    registration.className = `registration-badge registration-${station.registrationStatus}`;
    registration.textContent = REGISTRATION_LABELS[station.registrationStatus];
    heading.append(category, registration);

    const title = document.createElement('h3');
    title.className = 'card-title no-translate';
    title.textContent = station.name;

    const statusRow = document.createElement('div');
    statusRow.className = 'station-status-row';
    const domain = document.createElement('span');
    domain.className = 'station-domain no-translate';
    domain.textContent = station.domain;
    const reachable = document.createElement('span');
    reachable.className = `reachable-status${station.healthStatus === 'responding' ? ' is-restricted' : ''}`;
    const reachableDot = document.createElement('span');
    reachableDot.className = 'reachable-dot';
    reachableDot.setAttribute('aria-hidden', 'true');
    reachable.append(reachableDot, document.createTextNode(
        station.healthStatus === 'responding' ? '站点已响应' : '已检测可访问'
    ));
    statusRow.append(domain, reachable);

    const summary = document.createElement('p');
    summary.className = 'card-preview station-summary';
    summary.textContent = station.summary;

    const highlights = document.createElement('ul');
    highlights.className = 'station-highlights';
    station.benefits.slice(0, 2).forEach(benefit => {
        const item = document.createElement('li');
        item.textContent = benefit;
        highlights.appendChild(item);
    });
    highlights.hidden = highlights.childElementCount === 0;

    const chips = document.createElement('div');
    chips.className = 'station-chips';
    const chipValues = [
        ...station.models.map(value => ({ value, noTranslate: true })),
        ...station.tags.map(value => ({ value, noTranslate: false }))
    ];
    const seen = new Set();
    chipValues.forEach(({ value, noTranslate }) => {
        const key = value.toLocaleLowerCase();
        if (seen.has(key) || seen.size >= 6) return;
        seen.add(key);
        const chip = document.createElement('span');
        chip.className = `station-chip${noTranslate ? ' no-translate' : ''}`;
        chip.textContent = value;
        chips.appendChild(chip);
    });
    chips.hidden = chips.childElementCount === 0;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'card-action';
    detailButton.dataset.stationId = station.id;
    detailButton.textContent = '查看详情';
    const visitLink = document.createElement('a');
    visitLink.className = 'card-action card-action-primary';
    visitLink.href = station.url;
    visitLink.target = '_blank';
    visitLink.rel = 'noopener noreferrer nofollow';
    visitLink.textContent = '访问站点 ↗';
    actions.append(detailButton, visitLink);

    card.append(heading, title, statusRow, summary, highlights, chips, actions);
    return card;
}

function renderSummary(total, totalPages) {
    if (total === 0) {
        UI.resultSummary.textContent = '未找到匹配的公益站';
    } else {
        UI.resultSummary.textContent = `共 ${formatNumber(total)} 个公益站 · 第 ${appState.currentPage} / ${totalPages} 页`;
    }
    UI.updateSummary.textContent = appState.generatedAt
        ? `数据更新于 ${formatDateTime(appState.generatedAt)}`
        : '';
}

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        UI.pagination.replaceChildren();
        return;
    }
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createPageButton('上一页', appState.currentPage - 1, appState.currentPage === 1, '上一页'));
    paginationItems(appState.currentPage, totalPages).forEach(item => {
        if (item === 'ellipsis') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '…';
            fragment.appendChild(ellipsis);
        } else {
            const button = createPageButton(String(item), item, false, `第 ${item} 页`);
            if (item === appState.currentPage) {
                button.classList.add('is-current');
                button.setAttribute('aria-current', 'page');
            }
            fragment.appendChild(button);
        }
    });
    fragment.appendChild(createPageButton('下一页', appState.currentPage + 1, appState.currentPage === totalPages, '下一页'));
    UI.pagination.replaceChildren(fragment);
}

function paginationItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const ordered = [...pages].filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
    const result = [];
    ordered.forEach((page, index) => {
        if (index > 0 && page - ordered[index - 1] > 1) result.push('ellipsis');
        result.push(page);
    });
    return result;
}

function createPageButton(text, page, disabled, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-button';
    button.dataset.page = String(page);
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    return button;
}

function openModal(stationId, trigger) {
    const station = appState.stations.find(item => item.id === stationId);
    if (!station) return;
    appState.activeStationId = stationId;
    appState.lastFocusedElement = trigger || document.activeElement;

    UI.modalCategory.textContent = station.category;
    UI.modalTitle.textContent = station.name;
    UI.modalMeta.textContent = `${station.domain} · 核验于 ${formatDateTime(station.checkedAt)}`;
    UI.modalSummary.textContent = station.summary;
    UI.modalVisitButton.href = station.url;
    UI.modalSections.replaceChildren(
        createDetailSection('可用模型', station.models, true),
        createDetailSection('公益权益', station.benefits),
        createDetailSection('使用要求', station.requirements),
        createDetailSection('标签', station.tags),
        createDetailSection('补充说明', station.notes),
        createDetailSection('注册状态', [REGISTRATION_LABELS[station.registrationStatus]])
    );
    [...UI.modalSections.children].forEach(section => {
        if (!section.querySelector('li')) section.remove();
    });

    UI.modal.hidden = false;
    UI.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => UI.modalDialog.focus());
    requestTranslation();
}

function createDetailSection(title, values, noTranslate = false) {
    const section = document.createElement('section');
    section.className = 'station-detail-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('ul');
    cleanList(values).forEach(value => {
        const item = document.createElement('li');
        if (noTranslate) item.classList.add('no-translate');
        item.textContent = value;
        list.appendChild(item);
    });
    section.append(heading, list);
    return section;
}

function closeModal() {
    if (!UI.modal || UI.modal.hidden) return;
    UI.modal.hidden = true;
    UI.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    appState.activeStationId = null;
    const focusTarget = appState.lastFocusedElement;
    appState.lastFocusedElement = null;
    if (focusTarget && document.contains(focusTarget)) focusTarget.focus();
}

function handleModalKeydown(event) {
    if (!UI.modal || UI.modal.hidden) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...UI.modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) {
        event.preventDefault();
        UI.modalDialog.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (document.activeElement === UI.modalDialog || !UI.modal.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function resetFilters() {
    appState.query = '';
    appState.activeFilter = 'all';
    appState.currentPage = 1;
    UI.searchInput.value = '';
    UI.clearSearchBtn.hidden = true;
    render();
    UI.searchInput.focus();
}

function setLoadingState() {
    closeModal();
    appState.stations = [];
    setControlsDisabled(true);
    UI.loadingState.hidden = false;
    UI.errorState.hidden = true;
    UI.emptyState.hidden = true;
    UI.stationGrid.hidden = false;
    UI.stationGrid.replaceChildren();
    UI.stationGrid.setAttribute('aria-busy', 'true');
    UI.pagination.hidden = true;
    UI.resultSummary.textContent = '正在读取公益站数据…';
    UI.updateSummary.textContent = '';
    UI.categoryFilters.replaceChildren();
}

function setErrorState(error) {
    UI.loadingState.hidden = true;
    UI.errorState.hidden = false;
    UI.emptyState.hidden = true;
    UI.stationGrid.hidden = true;
    UI.pagination.hidden = true;
    UI.stationGrid.setAttribute('aria-busy', 'false');
    UI.resultSummary.textContent = '公益站数据加载失败';
    const detail = error instanceof Error ? error.message : '';
    UI.errorMessage.textContent = window.location.protocol === 'file:'
        ? '浏览器不允许从 file:// 页面读取 JSON，请通过本地 HTTP 服务或 GitHub Pages 打开。'
        : `无法读取公益站数据${detail ? `（${detail}）` : ''}，请稍后重试。`;
    requestTranslation();
}

function setControlsDisabled(disabled) {
    UI.searchInput.disabled = disabled;
    UI.sortSelect.disabled = disabled;
    UI.pageSizeSelect.disabled = disabled;
}

function toTimestamp(value) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value) {
    const timestamp = toTimestamp(value);
    if (!timestamp) return '未知时间';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(timestamp);
}

function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
}

function requestTranslation() {
    window.clearTimeout(appState.translateTimer);
    appState.translateTimer = window.setTimeout(() => {
        if (window.translate && typeof window.translate.execute === 'function') {
            window.translate.execute();
        }
    }, 0);
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
