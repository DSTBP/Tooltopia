/**
 * TextGrep - 通用文本处理工具脚本
 * 支持批量文件上传、搜索与智能列表转换
 */

// =========================================
// 1. 全局状态管理
// =========================================
const AppState = {
    sourceText: '',       
    dataItems: [],        
    lastDownloadItems: [],
    currentMode: ''       
};

// =========================================
// 2. 初始化与依赖检查
// =========================================
window.addEventListener('load', function() {
    checkDependencies();
    initUploadArea();
    bindGlobalEvents();
});

function checkDependencies() {
    const issues = [];
    if (typeof mammoth === 'undefined') issues.push('Word 处理库 (mammoth.js) 未加载');
    if (typeof pdfjsLib === 'undefined') issues.push('PDF 处理库 (pdf.js) 未加载');
    if (issues.length > 0) console.warn('依赖缺失:', issues.join(', '));
}

// =========================================
// 3. 视图导航控制
// =========================================
function selectMode(mode) {
    AppState.currentMode = mode;
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('tool-interface').style.display = 'block';
    
    document.getElementById('backToHomeBtn').style.display = 'inline-block';
    const mainBackLink = document.querySelector('.back-link[href*="index.html"]');
    if (mainBackLink) mainBackLink.style.display = 'none';

    updateUITextForMode(mode);
    
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';
}

function updateUITextForMode(mode) {
    const subtitle = document.getElementById('mainSubtitle');
    const step2Title = document.getElementById('step2Title');
    const step3Title = document.getElementById('step3Title');

    if (mode === 'search') {
        subtitle.textContent = '文本搜索模式';
        step2Title.textContent = '步骤 2: 数据分段 (定义"一条数据")';
        step3Title.textContent = '步骤 3: 批量搜索';
        document.getElementById('searchModeUI').style.display = 'block';
        document.getElementById('listModeUI').style.display = 'none';
    } else {
        subtitle.textContent = '文本转列表模式';
        step2Title.textContent = '步骤 2: 分隔符配置 (如何切分文本)';
        step3Title.textContent = '步骤 3: 列表结果';
        document.getElementById('searchModeUI').style.display = 'none';
        document.getElementById('listModeUI').style.display = 'block';
    }
}

function resetApp() {
    AppState.sourceText = '';
    AppState.dataItems = [];
    AppState.lastDownloadItems = [];
    AppState.currentMode = '';

    document.getElementById('fileInput').value = '';
    document.getElementById('textInput').value = '';
    document.getElementById('fileName').textContent = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('listOutput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('dataPreview').innerHTML = '';
    // 重置去重选项为默认选中
    const dedupCheckbox = document.getElementById('removeDuplicates');
    if(dedupCheckbox) dedupCheckbox.checked = true;

    document.getElementById('landing-page').style.display = 'grid';
    document.getElementById('tool-interface').style.display = 'none';
    document.getElementById('backToHomeBtn').style.display = 'none';
    
    const mainBackLink = document.querySelector('.back-link[href*="index.html"]');
    if (mainBackLink) mainBackLink.style.display = 'inline-block';
    
    document.getElementById('mainSubtitle').textContent = '请选择您需要的功能';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================
// 4. 文件上传与加载逻辑 (步骤 1)
// =========================================
function initUploadArea() {
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');

    fileUploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        updateFileFeedback(e.target.files);
    });

    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('drag-over');
    });

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('drag-over');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            const files = e.dataTransfer.files;
            const valid = Array.from(files).some(f => 
                ['.txt', '.doc', '.docx', '.pdf'].some(ext => f.name.toLowerCase().endsWith(ext))
            );

            if (valid) {
                fileInput.files = files; 
                updateFileFeedback(files);
            } else {
                alert('包含不支持的文件格式，请上传 TXT, DOCX 或 PDF');
            }
        }
    });
}

function updateFileFeedback(files) {
    const el = document.getElementById('fileName');
    if (!files || files.length === 0) {
        el.textContent = '';
        return;
    }
    
    if (files.length === 1) {
        el.textContent = `已选择: ${files[0].name}`;
    } else {
        el.textContent = `已选择 ${files.length} 个文件: ${files[0].name} 等...`;
    }
}

async function handleLoadText(btn) {
    const fileInput = document.getElementById('fileInput');
    const textInput = document.getElementById('textInput');
    
    const files = fileInput.files;
    const hasFile = files.length > 0;
    const hasText = textInput.value.trim().length > 0;

    if (!hasFile && !hasText) {
        alert('请先选择文件或输入文本内容！');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '正在读取文件...';
        
        const textParts = [];

        // 1. 批量读取文件
        if (hasFile) {
            const filePromises = Array.from(files).map(async (file) => {
                try {
                    const content = await readFileContent(file);
                    // 文件仍然保留头部标记，防止不同文件内容粘连，且方便追溯
                    return `--- File: ${file.name} ---\n${content}`;
                } catch (err) {
                    console.error(`读取 ${file.name} 失败:`, err);
                    return `--- File: ${file.name} (读取失败: ${err.message}) ---\n`;
                }
            });

            const fileContents = await Promise.all(filePromises);
            textParts.push(...fileContents);
        }

        // 2. 合并输入框文本
        if (hasText) {
            // [修改点]：直接添加用户输入的内容，不再添加 "--- Manual Input ---" 标记
            textParts.push(textInput.value.trim());
        }

        // 用双换行连接所有部分
        AppState.sourceText = textParts.join('\n\n');
        
        // 进入步骤 2
        const step2 = document.getElementById('step2');
        step2.style.display = 'block';
        step2.scrollIntoView({ behavior: 'smooth' });
        
        console.log(`载入成功，总长度 ${AppState.sourceText.length}`);

    } catch (error) {
        console.error('载入失败:', error);
        alert(`载入失败: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '载入文本';
    }
}

async function readFileContent(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt')) return await readTextFile(file);
    if (name.endsWith('.docx')) return await readWordFile(file);
    if (name.endsWith('.pdf')) return await readPdfFile(file);
    throw new Error('不支持的文件类型');
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result || '');
        reader.onerror = () => reject(new Error('无法读取文本文件'));
        reader.readAsText(file, 'UTF-8');
    });
}

function readWordFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                resolve(result.value);
            } catch (err) {
                reject(new Error(`Word 解析失败: ${err.message}`));
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

async function readPdfFile(file) {
    try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        return fullText;
    } catch (err) {
        throw new Error(`PDF 解析失败: ${err.message}`);
    }
}

// =========================================
// 5. 文本解析与去重 (步骤 2)
// =========================================
function handleParseText() {
    const delimiterType = document.querySelector('input[name="delimiter"]:checked').value;
    const shouldDeduplicate = document.getElementById('removeDuplicates').checked;
    
    let separator;
    let useRegex = false;
    let caseSensitive = true;

    if (delimiterType === 'custom') {
        const customVal = document.getElementById('customDelimiter').value;
        if (!customVal) return alert('请输入自定义分隔符');
        separator = customVal;
        useRegex = document.getElementById('delimiterRegex').checked;
        caseSensitive = document.getElementById('delimiterCase').checked;
    } else {
        switch(delimiterType) {
            case 'newline': separator = '\n'; break;
            case 'emptyline': separator = '\n\n'; break;
            case 'comma': separator = ','; break;
            default: separator = '\n';
        }
    }

    try {
        // 1. 分割文本
        const items = splitText(AppState.sourceText, separator, useRegex, caseSensitive);
        
        // 2. 根据选项决定是否去重
        let finalData = [];
        let removedCount = 0;

        if (shouldDeduplicate) {
            const uniqueData = [...new Set(items)];
            finalData = uniqueData;
            removedCount = items.length - uniqueData.length;
        } else {
            finalData = items;
            removedCount = 0;
        }
        
        AppState.dataItems = finalData;
        
        // 3. 显示预览
        renderPreview({
            total: items.length,
            final: finalData.length,
            removed: removedCount,
            deduplicated: shouldDeduplicate
        });

        // 4. 进入步骤 3
        const step3 = document.getElementById('step3');
        step3.style.display = 'block';
        step3.scrollIntoView({ behavior: 'smooth' });

        if (AppState.currentMode === 'list') {
            initListModeView();
        } else {
            initSearchModeView();
        }

    } catch (err) {
        alert(`解析出错: ${err.message}`);
    }
}

function splitText(text, separator, isRegex, isCaseSensitive) {
    let splitPattern;
    if (isRegex) {
        const flags = isCaseSensitive ? '' : 'i';
        try {
            splitPattern = new RegExp(separator, flags);
        } catch (e) {
            throw new Error('无效的正则表达式');
        }
    } else {
        if (!isCaseSensitive && separator.length > 0) {
            splitPattern = new RegExp(escapeRegExp(separator), 'i');
        } else {
            splitPattern = separator;
        }
    }

    return text.split(splitPattern)
        .map(item => item.trim())
        .filter(item => {
            // 过滤掉空项，以及文件分割标记线 (File headers)
            return item.length > 0 && !item.startsWith('--- File:');
        });
}

function renderPreview(stats) {
    const previewDiv = document.getElementById('dataPreview');
    let summary = '';

    if (stats.deduplicated) {
        summary = stats.removed > 0
            ? `解析出 ${stats.total} 条，去重后保留 <strong>${stats.final}</strong> 条 (去除了 ${stats.removed} 条重复项)`
            : `解析出 <strong>${stats.final}</strong> 条数据 (无重复项)`;
    } else {
        summary = `解析出 <strong>${stats.final}</strong> 条数据 (未启用去重，保留所有项)`;
    }

    const previewHtml = AppState.dataItems.slice(0, 5).map((item, idx) => `
        <div class="preview-item">
            <strong>#${idx + 1}:</strong> ${escapeHtml(item.substring(0, 100))}${item.length > 100 ? '...' : ''}
        </div>
    `).join('');

    previewDiv.innerHTML = `
        <div class="preview-info">${summary}。预览前5条：</div>
        <div class="preview-items">${previewHtml}</div>
    `;
}

// =========================================
// 6. 列表模式逻辑 (步骤 3 - List)
// =========================================
function initListModeView() {
    const formatRadios = document.getElementsByName('listFormat');
    formatRadios.forEach(radio => {
        radio.onclick = renderListOutput; 
    });
    renderListOutput();
}

function renderListOutput() {
    const output = document.getElementById('listOutput');
    const stats = document.getElementById('listStats');
    const formatType = document.querySelector('input[name="listFormat"]:checked').value;
    
    if (AppState.dataItems.length === 0) {
        output.value = '';
        stats.textContent = '暂无数据';
        return;
    }

    let resultString = '';

    if (formatType === 'string') {
        resultString = JSON.stringify(AppState.dataItems);
        resultString = resultString.replace(/,"/g, ', "');
    } else {
        const formattedItems = AppState.dataItems.map(item => {
            if (/^-?\d+(\.\d+)?$/.test(item)) return item; 
            if (item.length === 1) return `'${item.replace(/'/g, "\\'")}'`;
            return `"${item.replace(/"/g, '\\"')}"`;
        });
        resultString = `[${formattedItems.join(', ')}]`;
    }

    output.value = resultString;
    stats.textContent = `转换完成！已生成 ${AppState.dataItems.length} 个元素。`;
}

function copyListToClipboard() {
    const output = document.getElementById('listOutput');
    if (!output.value) return;
    output.select();
    document.execCommand('copy'); 
    const btn = document.getElementById('copyListBtn');
    const originalText = btn.innerText;
    btn.innerText = '已复制!';
    setTimeout(() => btn.innerText = originalText, 1500);
}

// =========================================
// 7. 搜索模式逻辑 (步骤 3 - Search)
// =========================================
function initSearchModeView() {
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('downloadSearchResultsBtn').disabled = false;
    displaySearchResults(null);
}

function handleSearch() {
    const input = document.getElementById('searchInput').value.trim();
    if (!input) {
        displaySearchResults(null);
        return;
    }
    const useRegex = document.getElementById('searchRegex').checked;
    const caseSensitive = document.getElementById('searchCase').checked;
    const keywords = input.split('\n').map(k => k.trim()).filter(k => k);
    
    if (keywords.length === 0) {
        displaySearchResults(null);
        return;
    }

    const results = performBatchSearch(keywords, useRegex, caseSensitive);
    displaySearchResults(results);
}

function performBatchSearch(keywords, useRegex, caseSensitive) {
    return keywords.map(keyword => {
        let regexObj;
        let errorMsg = null;
        try {
            if (useRegex) {
                regexObj = new RegExp(keyword, caseSensitive ? 'g' : 'gi');
            } else {
                regexObj = new RegExp(escapeRegExp(keyword), caseSensitive ? 'g' : 'gi');
            }
        } catch (e) {
            errorMsg = '无效的正则表达式';
        }

        if (errorMsg) return { keyword, error: errorMsg };

        const matchedItems = [];
        AppState.dataItems.forEach((content, index) => {
            regexObj.lastIndex = 0; 
            if (regexObj.test(content)) {
                regexObj.lastIndex = 0;
                const matches = content.match(regexObj);
                const count = matches ? matches.length : 0;
                matchedItems.push({ index: index + 1, content: content, matchCount: count });
            }
        });
        return { keyword, matches: matchedItems, regex: regexObj };
    });
}

function displaySearchResults(groupedResults) {
    const container = document.getElementById('searchResults');
    
    if (!groupedResults) {
        const displayLimit = 20;
        const total = AppState.dataItems.length;
        const itemsToShow = AppState.dataItems.slice(0, displayLimit);
        
        container.innerHTML = `
            <div class="result-header success">
                当前显示全部数据（共 ${total} 条，仅预览前 ${itemsToShow.length} 条）
            </div>
            <div class="keyword-group">
                ${itemsToShow.map((item, i) => `
                    <div class="result-item">
                        <div class="result-item-header"><span>#${i + 1}</span></div>
                        <div class="result-item-content">${escapeHtml(item)}</div>
                    </div>
                `).join('')}
                ${total > displayLimit ? `<div style="padding:10px; text-align:center; color:#aaa;">... 剩余 ${total - displayLimit} 条数据请下载查看 ...</div>` : ''}
            </div>
        `;
        AppState.lastDownloadItems = AppState.dataItems;
        return;
    }

    let totalMatches = 0;
    const downloadSet = new Set();
    let htmlContent = '';

    groupedResults.forEach(group => {
        if (group.error) {
            htmlContent += `<div class="keyword-group"><div class="keyword-header error">关键词 "${escapeHtml(group.keyword)}": ${group.error}</div></div>`;
            return;
        }
        const count = group.matches.length;
        totalMatches += count;

        if (count > 0) {
            group.matches.forEach(m => downloadSet.add(m.content));
            htmlContent += `
                <div class="keyword-group">
                    <div class="keyword-header">
                        <span>关键词: "${escapeHtml(group.keyword)}"</span>
                        <span class="keyword-count">找到 ${count} 条</span>
                    </div>
                    ${group.matches.map(m => `
                        <div class="result-item">
                            <div class="result-item-header"><span>#${m.index}</span> <span>匹配 ${m.matchCount} 次</span></div>
                            <div class="result-item-content">${highlightText(m.content, group.regex)}</div>
                        </div>
                    `).join('')}
                </div>`;
        } else {
            htmlContent += `<div class="keyword-group"><div class="keyword-header" style="opacity:0.6;"><span>关键词: "${escapeHtml(group.keyword)}"</span><span class="keyword-count">未找到</span></div></div>`;
        }
    });

    const headerClass = totalMatches > 0 ? 'success' : 'error';
    const headerText = totalMatches > 0 ? `搜索完成：共找到 ${totalMatches} 条相关数据` : `搜索完成：没有找到匹配的数据`;

    container.innerHTML = `<div class="result-header ${headerClass}">${headerText}</div>${htmlContent}`;
    AppState.lastDownloadItems = Array.from(downloadSet);
    document.getElementById('downloadSearchResultsBtn').disabled = AppState.lastDownloadItems.length === 0;
}

function highlightText(text, regex) {
    return text.replace(regex, (match) => `<span class="highlight">${escapeHtml(match)}</span>`);
}

// =========================================
// 8. 辅助工具与事件绑定
// =========================================
function bindGlobalEvents() {
    document.getElementById('backToHomeBtn').addEventListener('click', resetApp);
    document.getElementById('loadTextBtn').addEventListener('click', function() { handleLoadText(this); });
    document.getElementById('parseTextBtn').addEventListener('click', handleParseText);
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('copyListBtn').addEventListener('click', copyListToClipboard);
    
    document.getElementById('downloadListBtn').addEventListener('click', () => {
        const content = document.getElementById('listOutput').value;
        if(!content) return alert('没有内容可下载');
        downloadContent(content, 'list-convert-formatted');
    });
    
    document.getElementById('downloadSearchResultsBtn').addEventListener('click', () => {
        if (!AppState.lastDownloadItems.length) return alert('暂无内容可下载');
        downloadContent(AppState.lastDownloadItems.join('\n'), 'search-results');
    });

    const customInput = document.getElementById('customDelimiter');
    customInput.addEventListener('focus', () => {
        document.getElementById('delimiterCustom').checked = true;
    });
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
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.selectMode = selectMode;

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}