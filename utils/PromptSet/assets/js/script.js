const PROMPTS_MANIFEST_URL = './assets/prompts/manifest.json';

const collator = new Intl.Collator('zh-CN', {
    numeric: true,
    sensitivity: 'base'
});

const appState = {
    prompts: [],
    filteredPrompts: [],
    categories: [],
    activeCategory: '全部',
    keyword: '',
    sortMode: 'source',
    pageSize: 9,
    currentPage: 1,
    currentPrompt: null,
    lastFocusedElement: null,
    toastTimer: null
};

const UI = {};

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    cacheDom();
    bindEvents();
    loadPrompts();
}

function cacheDom() {
    Object.assign(UI, {
        searchInput: document.getElementById('searchInput'),
        clearSearchButton: document.getElementById('clearSearchBtn'),
        categoryFilters: document.getElementById('categoryFilters'),
        resultSummary: document.getElementById('resultSummary'),
        sortSelect: document.getElementById('sortSelect'),
        pageSizeSelect: document.getElementById('pageSizeSelect'),
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        errorMessage: document.getElementById('errorMessage'),
        retryButton: document.getElementById('retryButton'),
        emptyState: document.getElementById('emptyState'),
        resetFiltersButton: document.getElementById('resetFiltersButton'),
        promptGrid: document.getElementById('promptGrid'),
        pagination: document.getElementById('pagination'),
        modal: document.getElementById('promptModal'),
        modalDialog: document.querySelector('.modal-dialog'),
        modalTitle: document.getElementById('modalTitle'),
        modalCategory: document.getElementById('modalCategory'),
        modalMeta: document.getElementById('modalMeta'),
        modalBody: document.getElementById('modalBody'),
        modalCloseButton: document.getElementById('modalCloseButton'),
        modalCopyButton: document.getElementById('modalCopyButton'),
        toast: document.getElementById('toast')
    });
}

function bindEvents() {
    UI.searchInput.addEventListener('input', () => {
        appState.keyword = UI.searchInput.value.trim();
        appState.currentPage = 1;
        UI.clearSearchButton.hidden = UI.searchInput.value.length === 0;
        applyFiltersAndRender();
    });

    UI.clearSearchButton.addEventListener('click', () => {
        UI.searchInput.value = '';
        appState.keyword = '';
        appState.currentPage = 1;
        UI.clearSearchButton.hidden = true;
        applyFiltersAndRender();
        UI.searchInput.focus();
    });

    UI.categoryFilters.addEventListener('click', event => {
        const button = event.target.closest('[data-category]');
        if (!button || button.disabled) return;

        appState.activeCategory = button.dataset.category;
        appState.currentPage = 1;
        updateCategorySelection();
        applyFiltersAndRender();
    });

    UI.sortSelect.addEventListener('change', () => {
        appState.sortMode = UI.sortSelect.value;
        appState.currentPage = 1;
        applyFiltersAndRender();
    });

    UI.pageSizeSelect.addEventListener('change', () => {
        appState.pageSize = Number.parseInt(UI.pageSizeSelect.value, 10) || 9;
        appState.currentPage = 1;
        applyFiltersAndRender();
    });

    UI.promptGrid.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-prompt-action]');
        if (!actionButton) return;

        const prompt = getPromptById(actionButton.dataset.promptId);
        if (!prompt) return;

        if (actionButton.dataset.promptAction === 'view') {
            openPromptModal(prompt, actionButton);
        } else if (actionButton.dataset.promptAction === 'copy') {
            copyPrompt(prompt);
        }
    });

    UI.pagination.addEventListener('click', event => {
        const pageButton = event.target.closest('[data-page]');
        if (!pageButton || pageButton.disabled) return;

        const requestedPage = Number.parseInt(pageButton.dataset.page, 10);
        if (!Number.isFinite(requestedPage)) return;

        appState.currentPage = requestedPage;
        renderResults();
        scrollToResults();
    });

    UI.retryButton.addEventListener('click', loadPrompts);
    UI.resetFiltersButton.addEventListener('click', resetFilters);
    UI.modalCloseButton.addEventListener('click', closePromptModal);
    UI.modalCopyButton.addEventListener('click', () => {
        if (appState.currentPrompt) copyPrompt(appState.currentPrompt);
    });

    UI.modal.addEventListener('click', event => {
        if (event.target.hasAttribute('data-close-modal')) {
            closePromptModal();
        }
    });

    document.addEventListener('keydown', handleDocumentKeydown);
}

async function loadPrompts() {
    showLoadingState();

    try {
        const { categories, promptSources } = await fetchPromptSources();
        const prompts = parsePromptSources(promptSources);

        if (prompts.length === 0) {
            throw new Error('提示词清单中没有可加载的提示词');
        }

        appState.categories = categories;
        appState.prompts = prompts;
        appState.currentPage = 1;
        UI.promptGrid.dataset.promptCount = String(prompts.length);

        renderCategoryFilters();
        setControlsEnabled(true);
        UI.loadingState.hidden = true;
        UI.errorState.hidden = true;
        UI.promptGrid.hidden = false;
        UI.promptGrid.setAttribute('aria-busy', 'false');
        applyFiltersAndRender();
        refreshTranslation();
    } catch (error) {
        console.error('[PromptSet] Failed to load prompts:', error);
        showErrorState(error);
    }
}

async function fetchPromptSources() {
    const manifestResponse = await fetch(PROMPTS_MANIFEST_URL, { cache: 'no-cache' });
    if (!manifestResponse.ok) {
        throw new Error(`清单 HTTP ${manifestResponse.status}`);
    }

    let manifest;
    try {
        manifest = await manifestResponse.json();
    } catch (error) {
        throw new Error('提示词清单不是有效的 JSON', { cause: error });
    }

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('提示词清单格式无效');
    }

    const categories = Object.keys(manifest);

    if (categories.length === 0) {
        throw new Error('提示词清单中没有可加载的分类');
    }

    const promptEntries = Object.entries(manifest).flatMap(([category, prompts]) => {
        if (!Array.isArray(prompts)) {
            throw new Error(`分类「${category}」的提示词列表格式无效`);
        }

        return prompts.map(prompt => ({
            category,
            ...prompt
        }));
    });

    if (promptEntries.length === 0) {
        throw new Error('提示词清单中没有可加载的文件');
    }

    const manifestUrl = new URL(PROMPTS_MANIFEST_URL, window.location.href);

    const promptSources = await Promise.all(
        promptEntries.map(async ({ category, name, path, tag }) => {
            if (typeof name !== 'string' || name.trim() === '') {
                throw new Error(`分类「${category}」包含无效 name`);
            }

            if (typeof path !== 'string' || path.trim() === '') {
                throw new Error(`提示词「${name}」包含无效 path`);
            }

            if (
                !Array.isArray(tag)
                || tag.some(item => typeof item !== 'string' || item.trim() === '')
            ) {
                throw new Error(`提示词「${name}」包含无效 tag`);
            }

            const promptUrl = new URL(path, manifestUrl);
            const response = await fetch(promptUrl, { cache: 'no-cache' });

            if (!response.ok) {
                throw new Error(`${path} HTTP ${response.status}`);
            }

            return {
                name,
                path,
                tag,
                category,
                markdown: await response.text()
            };
        })
    );

    return {
        categories,
        promptSources
    };
}

function extractPromptBody(markdown) {
    return markdown
        .replace(/\r\n?/g, '\n')
        .replace(/^##[ \t]+[^\n]+(?:\n+|$)/, '')
        .trim();
}

function parsePromptSources(promptSources) {
    return promptSources
        .map((source, sourceIndex) => {
            const body = extractPromptBody(source.markdown);

            return {
                id: String(sourceIndex),
                name: source.name,
                tag: source.tag,
                category: source.category,
                path: source.path,
                body,
                sourceIndex,
                charCount: Array.from(body).length,
                searchText: `${source.name}\n${source.tag.join('\n')}\n${body}`
                    .toLocaleLowerCase('zh-CN')
            };
        })
        .filter(prompt => prompt.body.length > 0);
}

function renderCategoryFilters() {
    const counts = new Map();
    appState.prompts.forEach(prompt => {
        counts.set(prompt.category, (counts.get(prompt.category) || 0) + 1);
    });

    const categories = [
        { name: '全部', count: appState.prompts.length },
        ...appState.categories
            .map(category => ({
                name: category,
                count: counts.get(category) || 0
            }))
            .filter(category => category.count > 0)
    ];

    const fragment = document.createDocumentFragment();
    categories.forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-chip';
        button.dataset.category = category.name;
        button.setAttribute('aria-pressed', String(category.name === appState.activeCategory));

        const name = document.createElement('span');
        name.textContent = category.name;
        const count = document.createElement('span');
        count.className = 'filter-count no-translate';
        count.textContent = formatNumber(category.count);

        button.append(name, count);
        fragment.appendChild(button);
    });

    UI.categoryFilters.replaceChildren(fragment);
    updateCategorySelection();
}

function updateCategorySelection() {
    UI.categoryFilters.querySelectorAll('[data-category]').forEach(button => {
        const isActive = button.dataset.category === appState.activeCategory;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function applyFiltersAndRender() {
    const searchTerms = appState.keyword
        .toLocaleLowerCase('zh-CN')
        .split(/\s+/)
        .filter(Boolean);

    const filtered = appState.prompts.filter(prompt => {
        const matchesCategory = appState.activeCategory === '全部'
            || prompt.category === appState.activeCategory;
        const matchesSearch = searchTerms.every(term => prompt.searchText.includes(term));
        return matchesCategory && matchesSearch;
    });

    appState.filteredPrompts = sortPrompts(filtered, appState.sortMode);

    const totalPages = Math.max(1, Math.ceil(appState.filteredPrompts.length / appState.pageSize));
    appState.currentPage = Math.min(appState.currentPage, totalPages);
    renderResults();
}

function sortPrompts(prompts, mode) {
    const sorted = [...prompts];

    sorted.sort((left, right) => {
        let comparison = 0;

        if (mode === 'title-asc') {
            comparison = collator.compare(left.name, right.name);
        } else if (mode === 'title-desc') {
            comparison = collator.compare(right.name, left.name);
        } else if (mode === 'length-asc') {
            comparison = left.charCount - right.charCount;
        } else if (mode === 'length-desc') {
            comparison = right.charCount - left.charCount;
        } else {
            comparison = left.sourceIndex - right.sourceIndex;
        }

        return comparison || left.sourceIndex - right.sourceIndex;
    });

    return sorted;
}

function renderResults() {
    const total = appState.filteredPrompts.length;
    const totalPages = Math.max(1, Math.ceil(total / appState.pageSize));
    const start = (appState.currentPage - 1) * appState.pageSize;
    const pageItems = appState.filteredPrompts.slice(start, start + appState.pageSize);

    UI.emptyState.hidden = total !== 0;
    UI.promptGrid.hidden = total === 0;
    UI.pagination.hidden = total === 0 || totalPages <= 1;

    if (total === 0) {
        UI.promptGrid.replaceChildren();
        UI.pagination.replaceChildren();
        UI.resultSummary.textContent = '未找到匹配的提示词';
        return;
    }

    const fragment = document.createDocumentFragment();
    pageItems.forEach(prompt => fragment.appendChild(createPromptCard(prompt)));
    UI.promptGrid.replaceChildren(fragment);

    UI.resultSummary.textContent = `共 ${formatNumber(total)} 个提示词 · 第 ${appState.currentPage} / ${totalPages} 页`;
    renderPagination(totalPages);
}

function createPromptCard(prompt) {
    const card = document.createElement('article');
    card.className = 'prompt-card no-translate';
    card.dataset.promptId = prompt.id;

    const header = document.createElement('header');
    header.className = 'card-header';

    const badgeGroup = document.createElement('div');
    badgeGroup.style.display = 'flex';
    badgeGroup.style.alignItems = 'center';
    badgeGroup.style.gap = '0.5rem';
    badgeGroup.style.flexWrap = 'wrap';

    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'category-badge';
    categoryBadge.textContent = prompt.category;

    badgeGroup.append(categoryBadge);

    prompt.tag.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'category-badge';
        tagBadge.textContent = tag;

        badgeGroup.append(tagBadge);
    });

    const number = document.createElement('span');
    number.className = 'prompt-number';
    number.textContent = `#${String(prompt.sourceIndex + 1).padStart(2, '0')}`;

    const title = document.createElement('h3');
    title.textContent = prompt.name;

    const excerpt = document.createElement('p');
    excerpt.className = 'prompt-excerpt';
    excerpt.textContent = createExcerpt(prompt.body);

    const footer = document.createElement('footer');
    footer.className = 'card-footer';

    const meta = document.createElement('span');
    meta.className = 'character-count';
    meta.textContent = `${formatNumber(prompt.charCount)} 字`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(
        createCardAction('查看全文', 'view', prompt.id, false),
        createCardAction('复制提示词', 'copy', prompt.id, true)
    );

    header.append(badgeGroup, number);
    footer.append(meta, actions);
    card.append(header, title, excerpt, footer);
    return card;
}

function createCardAction(label, action, promptId, isPrimary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card-action${isPrimary ? ' card-action-primary' : ''}`;
    button.dataset.promptAction = action;
    button.dataset.promptId = promptId;
    button.textContent = label;
    return button;
}

function createExcerpt(body) {
    return body
        .replace(/^#{1,6}[ \t]+/gm, '')
        .replace(/^>[ \t]?/gm, '')
        .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, '')
        .replace(/\[([^\]]+)]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
        .replace(/[*_~`|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderPagination(totalPages) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createPageButton('上一页', appState.currentPage - 1, {
        disabled: appState.currentPage === 1,
        className: 'page-nav'
    }));

    getVisiblePageNumbers(totalPages, appState.currentPage).forEach(page => {
        if (page === 'ellipsis') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '…';
            ellipsis.setAttribute('aria-hidden', 'true');
            fragment.appendChild(ellipsis);
            return;
        }

        fragment.appendChild(createPageButton(String(page), page, {
            current: page === appState.currentPage,
            ariaLabel: `第 ${page} 页`
        }));
    });

    fragment.appendChild(createPageButton('下一页', appState.currentPage + 1, {
        disabled: appState.currentPage === totalPages,
        className: 'page-nav'
    }));

    UI.pagination.replaceChildren(fragment);
}

function getVisiblePageNumbers(totalPages, currentPage) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) pages.push('ellipsis');
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
}

function createPageButton(label, page, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-button ${options.className || ''}`.trim();
    button.dataset.page = String(page);
    button.textContent = label;
    button.disabled = Boolean(options.disabled);

    if (options.current) {
        button.classList.add('is-current');
        button.setAttribute('aria-current', 'page');
    }
    if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
    return button;
}

function openPromptModal(prompt, trigger) {
    appState.currentPrompt = prompt;
    appState.lastFocusedElement = trigger || document.activeElement;
    UI.modalTitle.textContent = prompt.name;
    UI.modalCategory.textContent =
    `${prompt.category} · ${prompt.tag.join(' · ')}`;
    UI.modalMeta.textContent = `${formatNumber(prompt.charCount)} 字`;
    UI.modalBody.textContent = prompt.body;
    UI.modalBody.scrollTop = 0;
    UI.modal.hidden = false;
    UI.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => UI.modalCloseButton.focus());
}

function closePromptModal() {
    if (UI.modal.hidden) return;

    UI.modal.hidden = true;
    UI.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    appState.currentPrompt = null;

    if (appState.lastFocusedElement?.isConnected) {
        appState.lastFocusedElement.focus();
    }
    appState.lastFocusedElement = null;
}

function handleDocumentKeydown(event) {
    if (UI.modal.hidden) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closePromptModal();
        return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
        UI.modalDialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    ).filter(element => !element.hidden);

    if (focusableElements.length === 0) {
        event.preventDefault();
        UI.modalDialog.focus();
        return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

async function copyPrompt(prompt) {
    try {
        await writeToClipboard(prompt.body);
        showToast(`“${prompt.name}”已复制`);
    } catch (error) {
        console.error('[PromptSet] Failed to copy prompt:', error);
        showToast('复制失败，请在详情中手动选择文本', true);
    }
}

async function writeToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.className = 'clipboard-fallback';
    document.body.appendChild(textArea);
    textArea.select();

    const copied = document.execCommand('copy');
    textArea.remove();
    if (!copied) throw new Error('document.execCommand returned false');
}

function showToast(message, isError = false) {
    window.clearTimeout(appState.toastTimer);
    UI.toast.textContent = message;
    UI.toast.classList.toggle('is-error', isError);
    UI.toast.hidden = false;

    requestAnimationFrame(() => UI.toast.classList.add('is-visible'));
    appState.toastTimer = window.setTimeout(() => {
        UI.toast.classList.remove('is-visible');
        window.setTimeout(() => {
            if (!UI.toast.classList.contains('is-visible')) UI.toast.hidden = true;
        }, 180);
    }, 2400);
}

function resetFilters() {
    appState.keyword = '';
    appState.activeCategory = '全部';
    appState.currentPage = 1;
    UI.searchInput.value = '';
    UI.clearSearchButton.hidden = true;
    updateCategorySelection();
    applyFiltersAndRender();
    UI.searchInput.focus();
}

function getPromptById(promptId) {
    return appState.prompts.find(prompt => prompt.id === String(promptId));
}

function setControlsEnabled(enabled) {
    UI.searchInput.disabled = !enabled;
    UI.sortSelect.disabled = !enabled;
    UI.pageSizeSelect.disabled = !enabled;
}

function showLoadingState() {
    setControlsEnabled(false);
    UI.loadingState.hidden = false;
    UI.errorState.hidden = true;
    UI.emptyState.hidden = true;
    UI.promptGrid.hidden = true;
    UI.promptGrid.setAttribute('aria-busy', 'true');
    UI.pagination.hidden = true;
    UI.resultSummary.textContent = '正在读取提示词…';
}

function showErrorState(error) {
    setControlsEnabled(false);
    UI.loadingState.hidden = true;
    UI.errorState.hidden = false;
    UI.emptyState.hidden = true;
    UI.promptGrid.hidden = true;
    UI.promptGrid.setAttribute('aria-busy', 'false');
    UI.pagination.hidden = true;
    UI.resultSummary.textContent = '提示词加载失败';
    UI.errorMessage.textContent = error?.message
        ? `无法读取提示词文件（${error.message}），请检查路径或通过 HTTP 服务打开页面。`
        : '无法读取提示词文件，请检查路径或通过 HTTP 服务打开页面。';
}

function scrollToResults() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    UI.resultSummary.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center'
    });
}

function refreshTranslation() {
    window.setTimeout(() => {
        if (window.translate && typeof window.translate.execute === 'function') {
            window.translate.execute();
        }
    }, 0);
}

function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
}
