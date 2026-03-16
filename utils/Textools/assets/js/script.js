/**
 * TextGrep / Textools
 * Supports file upload, search mode, and text-to-list mode.
 */

const SUPPORTED_FILE_EXTENSIONS = ['.txt', '.docx', '.pdf'];
const FILE_HEADER_PREFIX = '--- File:';
const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const DEFAULT_PREVIEW_COUNT = 5;
const DEFAULT_RESULT_PREVIEW_COUNT = 20;

const AppState = {
    sourceText: '',
    dataItems: [],
    lastDownloadItems: [],
    currentMode: '',
    selectedFiles: []
};

const UI = {};

function initApp() {
    cacheDom();
    configurePdfWorker();
    checkDependencies();
    initUploadArea();
    bindGlobalEvents();
}

function cacheDom() {
    Object.assign(UI, {
        backToHomeBtn: document.getElementById('backToHomeBtn'),
        mainBackLink: document.querySelector('.back-link[href*="index.html"]'),
        mainSubtitle: document.getElementById('mainSubtitle'),
        landingPage: document.getElementById('landing-page'),
        toolInterface: document.getElementById('tool-interface'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        step2Title: document.getElementById('step2Title'),
        step3Title: document.getElementById('step3Title'),
        searchModeUI: document.getElementById('searchModeUI'),
        listModeUI: document.getElementById('listModeUI'),
        fileInput: document.getElementById('fileInput'),
        fileUploadArea: document.getElementById('fileUploadArea'),
        fileName: document.getElementById('fileName'),
        textInput: document.getElementById('textInput'),
        loadTextBtn: document.getElementById('loadTextBtn'),
        removeDuplicates: document.getElementById('removeDuplicates'),
        parseTextBtn: document.getElementById('parseTextBtn'),
        dataPreview: document.getElementById('dataPreview'),
        searchInput: document.getElementById('searchInput'),
        searchRegex: document.getElementById('searchRegex'),
        searchCase: document.getElementById('searchCase'),
        searchBtn: document.getElementById('searchBtn'),
        downloadSearchResultsBtn: document.getElementById('downloadSearchResultsBtn'),
        searchResults: document.getElementById('searchResults'),
        listOutput: document.getElementById('listOutput'),
        listStats: document.getElementById('listStats'),
        copyListBtn: document.getElementById('copyListBtn'),
        downloadListBtn: document.getElementById('downloadListBtn'),
        customDelimiter: document.getElementById('customDelimiter'),
        delimiterCustom: document.getElementById('delimiterCustom'),
        delimiterRegex: document.getElementById('delimiterRegex'),
        delimiterCase: document.getElementById('delimiterCase'),
        listFormatRadios: Array.from(document.getElementsByName('listFormat'))
    });
}

function configurePdfWorker() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    }
}

function checkDependencies() {
    const issues = [];

    if (typeof mammoth === 'undefined') {
        issues.push('Word processing library (mammoth.js) is unavailable');
    }

    if (typeof pdfjsLib === 'undefined') {
        issues.push('PDF processing library (pdf.js) is unavailable');
    }

    if (issues.length > 0) {
        console.warn('Missing dependencies:', issues.join(', '));
    }
}

function selectMode(mode) {
    AppState.currentMode = mode;
    UI.landingPage.style.display = 'none';
    UI.toolInterface.style.display = 'block';
    UI.backToHomeBtn.style.display = 'inline-block';

    if (UI.mainBackLink) {
        UI.mainBackLink.style.display = 'none';
    }

    updateUITextForMode(mode);
    UI.step2.style.display = 'none';
    UI.step3.style.display = 'none';
}

function updateUITextForMode(mode) {
    if (mode === 'search') {
        UI.mainSubtitle.textContent = '文本搜索模式';
        UI.step2Title.textContent = '步骤 2: 数据分段（定义“一条数据”）';
        UI.step3Title.textContent = '步骤 3: 批量搜索';
        UI.searchModeUI.style.display = 'block';
        UI.listModeUI.style.display = 'none';
        return;
    }

    UI.mainSubtitle.textContent = '文本转列表模式';
    UI.step2Title.textContent = '步骤 2: 设置分隔符';
    UI.step3Title.textContent = '步骤 3: 结果处理';
    UI.searchModeUI.style.display = 'none';
    UI.listModeUI.style.display = 'block';
}

function resetApp() {
    AppState.sourceText = '';
    AppState.dataItems = [];
    AppState.lastDownloadItems = [];
    AppState.currentMode = '';
    AppState.selectedFiles = [];

    UI.fileInput.value = '';
    UI.textInput.value = '';
    UI.fileName.textContent = '';
    UI.searchInput.value = '';
    UI.listOutput.value = '';
    UI.searchResults.innerHTML = '';
    UI.dataPreview.innerHTML = '';
    UI.removeDuplicates.checked = true;
    UI.downloadSearchResultsBtn.disabled = true;

    UI.landingPage.style.display = 'grid';
    UI.toolInterface.style.display = 'none';
    UI.backToHomeBtn.style.display = 'none';
    UI.mainSubtitle.textContent = '请选择您需要的功能';

    if (UI.mainBackLink) {
        UI.mainBackLink.style.display = 'inline-block';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initUploadArea() {
    UI.fileUploadArea.addEventListener('click', () => UI.fileInput.click());

    UI.fileInput.addEventListener('change', (event) => {
        AppState.selectedFiles = Array.from(event.target.files || []);
        updateFileFeedback(AppState.selectedFiles);
    });

    UI.fileUploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        UI.fileUploadArea.classList.add('drag-over');
    });

    UI.fileUploadArea.addEventListener('dragleave', () => {
        UI.fileUploadArea.classList.remove('drag-over');
    });

    UI.fileUploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        UI.fileUploadArea.classList.remove('drag-over');

        const droppedFiles = Array.from(event.dataTransfer?.files || []);
        if (droppedFiles.length === 0) {
            return;
        }

        const validFiles = droppedFiles.filter(isSupportedFile);
        if (validFiles.length === 0) {
            alert('包含不支持的文件格式，请上传 TXT、DOCX 或 PDF。');
            return;
        }

        setSelectedFiles(validFiles);
        updateFileFeedback(AppState.selectedFiles);
    });
}

function setSelectedFiles(files) {
    AppState.selectedFiles = Array.from(files);

    try {
        const dataTransfer = new DataTransfer();
        AppState.selectedFiles.forEach((file) => dataTransfer.items.add(file));
        UI.fileInput.files = dataTransfer.files;
        AppState.selectedFiles = Array.from(UI.fileInput.files);
    } catch (error) {
        // Some browsers do not allow assigning FileList programmatically.
    }
}

function updateFileFeedback(files) {
    if (!files || files.length === 0) {
        UI.fileName.textContent = '';
        return;
    }

    if (files.length === 1) {
        UI.fileName.textContent = `已选择: ${files[0].name}`;
        return;
    }

    UI.fileName.textContent = `已选择 ${files.length} 个文件: ${files[0].name} 等...`;
}

function getSelectedFiles() {
    if (AppState.selectedFiles.length > 0) {
        return AppState.selectedFiles;
    }

    return Array.from(UI.fileInput.files || []);
}

async function handleLoadText(button) {
    const selectedFiles = getSelectedFiles();
    const hasFile = selectedFiles.length > 0;
    const manualText = UI.textInput.value.trim();
    const hasText = manualText.length > 0;

    if (!hasFile && !hasText) {
        alert('请先选择文件或输入文本内容！');
        return;
    }

    button.disabled = true;
    button.textContent = '正在读取文件...';

    try {
        const textParts = [];

        if (hasFile) {
            const fileContents = await Promise.all(selectedFiles.map(async (file) => {
                try {
                    const content = await readFileContent(file);
                    return `${FILE_HEADER_PREFIX} ${file.name} ---\n${content}`;
                } catch (error) {
                    console.error(`读取 ${file.name} 失败:`, error);
                    return `${FILE_HEADER_PREFIX} ${file.name} (读取失败: ${error.message}) ---\n`;
                }
            }));

            textParts.push(...fileContents);
        }

        if (hasText) {
            textParts.push(manualText);
        }

        AppState.sourceText = textParts.join('\n\n');
        UI.step2.style.display = 'block';
        UI.step2.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('载入失败:', error);
        alert(`载入失败: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = '载入文本';
    }
}

function isSupportedFile(file) {
    const lowerName = file.name.toLowerCase();
    return SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

async function readFileContent(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.txt')) {
        return readTextFile(file);
    }

    if (fileName.endsWith('.docx')) {
        return readWordFile(file);
    }

    if (fileName.endsWith('.pdf')) {
        return readPdfFile(file);
    }

    if (fileName.endsWith('.doc')) {
        throw new Error('暂不支持 .doc 文件，请先转换为 .docx。');
    }

    throw new Error('不支持的文件类型');
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result || '');
        reader.onerror = () => reject(new Error('无法读取文本文件'));
        reader.readAsText(file, 'UTF-8');
    });
}

function readWordFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            if (typeof mammoth === 'undefined') {
                reject(new Error('Word 处理依赖未加载'));
                return;
            }

            try {
                const result = await mammoth.extractRawText({ arrayBuffer: event.target.result });
                resolve(result.value);
            } catch (error) {
                reject(new Error(`Word 解析失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('无法读取 Word 文件'));
        reader.readAsArrayBuffer(file);
    });
}

async function readPdfFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF 处理依赖未加载');
    }

    try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pagePromises = Array.from({ length: pdf.numPages }, async (_, index) => {
            const page = await pdf.getPage(index + 1);
            const content = await page.getTextContent();
            return content.items.map((item) => item.str).join(' ');
        });

        return (await Promise.all(pagePromises)).join('\n');
    } catch (error) {
        throw new Error(`PDF 解析失败: ${error.message}`);
    }
}

function handleParseText() {
    try {
        const { separator, useRegex, caseSensitive } = getDelimiterConfig();
        const parsedItems = splitText(AppState.sourceText, separator, useRegex, caseSensitive);
        const shouldDeduplicate = UI.removeDuplicates.checked;
        const finalItems = shouldDeduplicate ? [...new Set(parsedItems)] : parsedItems;
        const removedCount = parsedItems.length - finalItems.length;

        AppState.dataItems = finalItems;
        renderPreview({
            total: parsedItems.length,
            final: finalItems.length,
            removed: removedCount,
            deduplicated: shouldDeduplicate
        });

        UI.step3.style.display = 'block';
        UI.step3.scrollIntoView({ behavior: 'smooth' });

        if (AppState.currentMode === 'list') {
            initListModeView();
        } else {
            initSearchModeView();
        }
    } catch (error) {
        alert(`解析出错: ${error.message}`);
    }
}

function getDelimiterConfig() {
    const delimiterType = document.querySelector('input[name="delimiter"]:checked')?.value || 'newline';

    if (delimiterType !== 'custom') {
        return {
            separator: getBuiltinDelimiter(delimiterType),
            useRegex: false,
            caseSensitive: true
        };
    }

    const customValue = UI.customDelimiter.value;
    if (!customValue) {
        throw new Error('请输入自定义分隔符');
    }

    return {
        separator: customValue,
        useRegex: UI.delimiterRegex.checked,
        caseSensitive: UI.delimiterCase.checked
    };
}

function getBuiltinDelimiter(type) {
    switch (type) {
        case 'newline':
            return '\n';
        case 'emptyline':
            return '\n\n';
        case 'comma':
            return ',';
        default:
            return '\n';
    }
}

function splitText(text, separator, isRegex, isCaseSensitive) {
    let splitPattern = separator;

    if (isRegex) {
        try {
            splitPattern = new RegExp(separator, isCaseSensitive ? 'g' : 'gi');
        } catch (error) {
            throw new Error('无效的正则表达式');
        }
    } else if (!isCaseSensitive && separator.length > 0) {
        splitPattern = new RegExp(escapeRegExp(separator), 'gi');
    }

    return text
        .split(splitPattern)
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !item.startsWith(FILE_HEADER_PREFIX));
}

function renderPreview(stats) {
    const summary = stats.deduplicated
        ? stats.removed > 0
            ? `解析出 ${stats.total} 条，去重后保留 <strong>${stats.final}</strong> 条（移除 ${stats.removed} 条重复项）`
            : `解析出 <strong>${stats.final}</strong> 条数据（无重复项）`
        : `解析出 <strong>${stats.final}</strong> 条数据（未启用去重，保留所有项）`;

    const previewItems = AppState.dataItems
        .slice(0, DEFAULT_PREVIEW_COUNT)
        .map((item, index) => `
            <div class="preview-item">
                <strong>#${index + 1}:</strong> ${escapeHtml(item.substring(0, 100))}${item.length > 100 ? '...' : ''}
            </div>
        `)
        .join('');

    UI.dataPreview.innerHTML = `
        <div class="preview-info">${summary}。预览前 ${Math.min(DEFAULT_PREVIEW_COUNT, AppState.dataItems.length)} 条：</div>
        <div class="preview-items">${previewItems}</div>
    `;
}

function initListModeView() {
    renderListOutput();
}

function renderListOutput() {
    const selectedFormat = UI.listFormatRadios.find((radio) => radio.checked)?.value || 'string';

    if (AppState.dataItems.length === 0) {
        UI.listOutput.value = '';
        UI.listStats.textContent = '暂无数据';
        return;
    }

    if (selectedFormat === 'string') {
        UI.listOutput.value = JSON.stringify(AppState.dataItems).replace(/,"/g, ', "');
    } else {
        const formattedItems = AppState.dataItems.map((item) => {
            if (/^-?\d+(\.\d+)?$/.test(item)) {
                return item;
            }
            if (item.length === 1) {
                return `'${item.replace(/'/g, "\\'")}'`;
            }
            return `"${item.replace(/"/g, '\\"')}"`;
        });
        UI.listOutput.value = `[${formattedItems.join(', ')}]`;
    }

    UI.listStats.textContent = `转换完成！已生成 ${AppState.dataItems.length} 个元素。`;
}

async function copyListToClipboard() {
    const content = UI.listOutput.value;
    if (!content) {
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(content);
        } else {
            UI.listOutput.select();
            document.execCommand('copy');
        }

        const originalText = UI.copyListBtn.innerText;
        UI.copyListBtn.innerText = '已复制';
        setTimeout(() => {
            UI.copyListBtn.innerText = originalText;
        }, 1500);
    } catch (error) {
        alert(`复制失败: ${error.message}`);
    }
}

function initSearchModeView() {
    UI.searchResults.innerHTML = '';
    displaySearchResults(null);
}

function handleSearch() {
    const input = UI.searchInput.value.trim();
    if (!input) {
        displaySearchResults(null);
        return;
    }

    const keywords = input
        .split('\n')
        .map((keyword) => keyword.trim())
        .filter(Boolean);

    if (keywords.length === 0) {
        displaySearchResults(null);
        return;
    }

    const results = performBatchSearch(keywords, UI.searchRegex.checked, UI.searchCase.checked);
    displaySearchResults(results);
}

function performBatchSearch(keywords, useRegex, caseSensitive) {
    return keywords.map((keyword) => {
        let regex = null;

        try {
            regex = new RegExp(useRegex ? keyword : escapeRegExp(keyword), caseSensitive ? 'g' : 'gi');
        } catch (error) {
            return { keyword, error: '无效的正则表达式' };
        }

        const matches = [];

        AppState.dataItems.forEach((content, index) => {
            regex.lastIndex = 0;
            if (!regex.test(content)) {
                return;
            }

            regex.lastIndex = 0;
            const matchedEntries = content.match(regex);
            matches.push({
                index: index + 1,
                content,
                matchCount: matchedEntries ? matchedEntries.length : 0
            });
        });

        return { keyword, matches, regex };
    });
}

function displaySearchResults(groupedResults) {
    if (!groupedResults) {
        const previewItems = AppState.dataItems.slice(0, DEFAULT_RESULT_PREVIEW_COUNT);
        UI.searchResults.innerHTML = `
            <div class="result-header success">
                当前显示全部数据（共 ${AppState.dataItems.length} 条，仅预览前 ${previewItems.length} 条）
            </div>
            <div class="keyword-group">
                ${previewItems.map((item, index) => `
                    <div class="result-item">
                        <div class="result-item-header"><span>#${index + 1}</span></div>
                        <div class="result-item-content">${escapeHtml(item)}</div>
                    </div>
                `).join('')}
                ${AppState.dataItems.length > DEFAULT_RESULT_PREVIEW_COUNT
                    ? `<div style="padding:10px; text-align:center; color:#aaa;">... 剩余 ${AppState.dataItems.length - DEFAULT_RESULT_PREVIEW_COUNT} 条数据请下载查看 ...</div>`
                    : ''}
            </div>
        `;
        AppState.lastDownloadItems = [...AppState.dataItems];
        UI.downloadSearchResultsBtn.disabled = AppState.lastDownloadItems.length === 0;
        return;
    }

    let totalMatches = 0;
    const downloadSet = new Set();
    const groupsHtml = groupedResults.map((group) => {
        if (group.error) {
            return `<div class="keyword-group"><div class="keyword-header error">关键字 "${escapeHtml(group.keyword)}": ${group.error}</div></div>`;
        }

        const count = group.matches.length;
        totalMatches += count;

        if (count === 0) {
            return `<div class="keyword-group"><div class="keyword-header" style="opacity:0.6;"><span>关键字 "${escapeHtml(group.keyword)}"</span><span class="keyword-count">未找到</span></div></div>`;
        }

        group.matches.forEach((match) => downloadSet.add(match.content));

        return `
            <div class="keyword-group">
                <div class="keyword-header">
                    <span>关键字 "${escapeHtml(group.keyword)}"</span>
                    <span class="keyword-count">找到 ${count} 条</span>
                </div>
                ${group.matches.map((match) => `
                    <div class="result-item">
                        <div class="result-item-header"><span>#${match.index}</span><span>匹配 ${match.matchCount} 次</span></div>
                        <div class="result-item-content">${highlightText(match.content, group.regex)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    const hasMatches = totalMatches > 0;
    UI.searchResults.innerHTML = `
        <div class="result-header ${hasMatches ? 'success' : 'error'}">
            ${hasMatches ? `搜索完成：共找到 ${totalMatches} 条相关数据` : '搜索完成：没有找到匹配的数据'}
        </div>
        ${groupsHtml}
    `;

    AppState.lastDownloadItems = Array.from(downloadSet);
    UI.downloadSearchResultsBtn.disabled = AppState.lastDownloadItems.length === 0;
}

function highlightText(text, regex) {
    return text.replace(regex, (match) => `<span class="highlight">${escapeHtml(match)}</span>`);
}

function bindGlobalEvents() {
    UI.backToHomeBtn.addEventListener('click', resetApp);
    UI.loadTextBtn.addEventListener('click', function () {
        handleLoadText(this);
    });
    UI.parseTextBtn.addEventListener('click', handleParseText);
    UI.searchBtn.addEventListener('click', handleSearch);
    UI.copyListBtn.addEventListener('click', copyListToClipboard);
    UI.downloadListBtn.addEventListener('click', handleListDownload);
    UI.downloadSearchResultsBtn.addEventListener('click', handleSearchDownload);
    UI.customDelimiter.addEventListener('focus', () => {
        UI.delimiterCustom.checked = true;
    });

    UI.listFormatRadios.forEach((radio) => {
        radio.addEventListener('change', renderListOutput);
    });
}

function handleListDownload() {
    if (!UI.listOutput.value) {
        alert('没有内容可下载');
        return;
    }

    downloadContent(UI.listOutput.value, 'list-convert-formatted');
}

function handleSearchDownload() {
    if (AppState.lastDownloadItems.length === 0) {
        alert('暂无内容可下载');
        return;
    }

    downloadContent(AppState.lastDownloadItems.join('\n'), 'search-results');
}

function downloadContent(content, filenamePrefix) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    link.href = url;
    link.download = `${filenamePrefix}-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
    if (!text) {
        return '';
    }

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.selectMode = selectMode;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
    initApp();
}
