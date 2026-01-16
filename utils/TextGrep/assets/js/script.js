// 全局变量
let sourceText = ''; // 原始文本
let dataItems = []; // 解析后的数据项
let lastDownloadItems = []; // 最近一次可下载的结果

// 检查依赖库是否加载
function checkDependencies() {
    const issues = [];

    if (typeof mammoth === 'undefined') {
        issues.push('Word 文档处理库未加载');
    }

    if (typeof pdfjsLib === 'undefined') {
        issues.push('PDF 处理库未加载');
    }

    if (issues.length > 0) {
        console.warn('依赖库加载问题:', issues.join(', '));
        console.warn('Word 和 PDF 文件可能无法正常使用，但 TXT 文件和直接粘贴文本功能正常');
    }

    return issues.length === 0;
}

// 页面加载完成后检查依赖
window.addEventListener('load', function() {
    checkDependencies();
    initUploadArea();
});

// 初始化上传区域
function initUploadArea() {
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');

    // 点击上传区域触发文件选择
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = `已选择: ${file.name}`;
        }
    });

    // 拖拽上传
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

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const validExtensions = ['.txt', '.docx', '.pdf'];
            const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

            if (isValid) {
                // 将文件设置到 input 元素
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;

                document.getElementById('fileName').textContent = `已选择: ${file.name}`;
            } else {
                alert('请选择 TXT、DOCX 或 PDF 文件');
            }
        }
    });
}

// 载入文本按钮
document.getElementById('loadTextBtn').addEventListener('click', async function() {
    const fileInput = document.getElementById('fileInput');
    const textInput = document.getElementById('textInput');
    const btn = this;

    // 检查是否有文件或文本输入
    const hasFile = fileInput.files.length > 0;
    const hasText = textInput.value.trim().length > 0;

    if (!hasFile && !hasText) {
        alert('请选择文件或输入文本！');
        return;
    }

    let combinedText = '';

    try {
        // 显示加载状态
        btn.disabled = true;
        btn.textContent = '正在加载...';

        // 如果有文件，先加载文件
        if (hasFile) {
            const file = fileInput.files[0];
            const fileText = await loadFileToText(file);
            combinedText += fileText;
        }

        // 如果有文本输入，添加到结果中
        if (hasText) {
            if (combinedText) {
                // 如果已经有文件内容，添加分隔
                combinedText += '\n\n';
            }
            combinedText += textInput.value.trim();
        }

        // 设置源文本
        sourceText = combinedText;

        // 显示合并提示
        if (hasFile && hasText) {
            alert('文件和文本已合并！共 ' + sourceText.length + ' 个字符');
        }

        showStep2();

    } catch (error) {
        console.error('加载错误:', error);
        alert('加载失败: ' + error.message + '\n\n建议：尝试将内容复制粘贴到文本框');
    } finally {
        // 恢复按钮状态
        btn.disabled = false;
        btn.textContent = '载入文本';
    }
});

// 加载文件并返回文本（不直接显示步骤2）
async function loadFileToText(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.txt')) {
        return await readTextFile(file);
    } else if (fileName.endsWith('.docx')) {
        if (typeof mammoth === 'undefined') {
            throw new Error('Word 文档处理库未加载，请检查网络连接');
        }
        return await readWordFile(file);
    } else if (fileName.endsWith('.doc')) {
        throw new Error('不支持旧版.doc格式，请使用.docx格式');
    } else if (fileName.endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF 处理库未加载，请检查网络连接');
        }
        return await readPdfFile(file);
    } else {
        throw new Error('不支持的文件格式！请选择 TXT、DOCX 或 PDF 文件。');
    }
}

// 加载文件（保留原有函数用于向后兼容）
async function loadFile(file) {
    try {
        sourceText = await loadFileToText(file);
        showStep2();
    } catch (error) {
        console.error('文件读取错误:', error);
        throw error;
    }
}

// 读取 TXT 文件
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            if (!text || text.trim().length === 0) {
                reject(new Error('文本文件为空'));
                return;
            }
            console.log('TXT 文件读取成功，文本长度:', text.length);
            resolve(text);
        };
        reader.onerror = (e) => reject(new Error('读取文本文件失败'));
        reader.readAsText(file, 'UTF-8');
    });
}

// 读取 Word 文件
function readWordFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;

                // 检查文件是否为空
                if (arrayBuffer.byteLength === 0) {
                    reject(new Error('Word 文件为空'));
                    return;
                }

                const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});

                // 检查是否成功提取文本
                if (!result || !result.value) {
                    reject(new Error('无法从 Word 文件中提取文本'));
                    return;
                }

                // 检查提取的文本是否为空
                if (result.value.trim().length === 0) {
                    reject(new Error('Word 文件中没有找到文本内容'));
                    return;
                }

                console.log('Word 文件读取成功，文本长度:', result.value.length);
                resolve(result.value);
            } catch (error) {
                console.error('Word 文件解析错误:', error);
                reject(new Error('读取 Word 文件失败：' + error.message));
            }
        };
        reader.onerror = () => reject(new Error('读取 Word 文件失败'));
        reader.readAsArrayBuffer(file);
    });
}

// 读取 PDF 文件
async function readPdfFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();

        // 检查文件是否为空
        if (arrayBuffer.byteLength === 0) {
            throw new Error('PDF 文件为空');
        }

        console.log('开始解析 PDF 文件...');
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

        if (!pdf || pdf.numPages === 0) {
            throw new Error('PDF 文件没有页面');
        }

        console.log('PDF 总页数:', pdf.numPages);
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        // 检查是否提取到文本
        if (fullText.trim().length === 0) {
            throw new Error('PDF 文件中没有找到可提取的文本（可能是扫描版PDF）');
        }

        console.log('PDF 文件读取成功，文本长度:', fullText.length);
        return fullText;
    } catch (error) {
        console.error('PDF 读取错误:', error);
        throw new Error('读取 PDF 文件失败：' + error.message);
    }
}

// 显示步骤2
function showStep2() {
    document.getElementById('step2').style.display = 'block';
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
    alert(`文本载入成功！共 ${sourceText.length} 个字符`);
}

// 解析文本按钮
document.getElementById('parseTextBtn').addEventListener('click', function() {
    const delimiterType = document.querySelector('input[name="delimiter"]:checked').value;
    let delimiter;

    switch(delimiterType) {
        case 'newline':
            delimiter = '\n';
            break;
        case 'emptyline':
            delimiter = '\n\n';
            break;
        case 'line':
            delimiter = '---';
            break;
        case 'custom':
            delimiter = document.getElementById('customDelimiter').value;
            if (!delimiter) {
                alert('请输入自定义分隔符！');
                return;
            }
            break;
    }

    parseText(delimiter);
});

// 解析文本
function parseText(delimiter) {
    // 根据分隔符分割文本
    const parsedItems = sourceText.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);

    const dedupResult = deduplicateData(parsedItems);
    dataItems = dedupResult.items;
    setDownloadData([]);

    // 显示预览
    showDataPreview(dedupResult);

    // 显示步骤3
    document.getElementById('step3').style.display = 'block';
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
}

// 去重数据并保存一些统计信息
function deduplicateData(items) {
    const seen = new Set();
    const uniqueItems = [];

    items.forEach(item => {
        if (!seen.has(item)) {
            seen.add(item);
            uniqueItems.push(item);
        }
    });

    return {
        items: uniqueItems,
        totalSegments: items.length,
        uniqueSegments: uniqueItems.length,
        duplicatesRemoved: items.length - uniqueItems.length
    };
}

// 显示数据预览
function showDataPreview(stats = null) {
    const previewDiv = document.getElementById('dataPreview');
    const info = stats || {
        totalSegments: dataItems.length,
        uniqueSegments: dataItems.length,
        duplicatesRemoved: 0
    };

    const summaryText = info.duplicatesRemoved > 0
        ? `已解析 ${info.totalSegments} 条数据，去重后保留 ${info.uniqueSegments} 条，去除 ${info.duplicatesRemoved} 条重复项`
        : `已解析 ${info.uniqueSegments} 条数据`;

    previewDiv.innerHTML = `
        <div class="preview-info">${summaryText}。以下是前5条预览：</div>
        <div class="preview-items">
            ${dataItems.slice(0, 5).map((item, index) => `
                <div class="preview-item">
                    <strong>数据 ${index + 1}:</strong> ${item.substring(0, 100)}${item.length > 100 ? '...' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// 搜索按钮
document.getElementById('searchBtn').addEventListener('click', function() {
    const searchText = document.getElementById('searchInput').value.trim();

    if (!searchText) {
        displayAllDataItems();
        return;
    }

    performBatchSearch(searchText);
});

// 标准化标点符号（用于模糊匹配）
function normalizePunctuation(text) {
    return text
        // 中文标点转英文标点
        .replace(/，/g, ',')
        .replace(/。/g, '.')
        .replace(/！/g, '!')
        .replace(/？/g, '?')
        .replace(/：/g, ':')
        .replace(/；/g, ';')
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/【/g, '[')
        .replace(/】/g, ']')
        .replace(/「/g, '"')
        .replace(/」/g, '"')
        .replace(/『/g, "'")
        .replace(/』/g, "'")
        .replace(/"/g, '"')
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .replace(/'/g, "'")
        .replace(/—/g, '-')
        .replace(/－/g, '-')
        .replace(/～/g, '~')
        .replace(/《/g, '<')
        .replace(/》/g, '>')
        .replace(/、/g, ',')
        // 全角空格转半角
        .replace(/　/g, ' ')
        // 多个空格转单个空格
        .replace(/\s+/g, ' ');
}

// 执行批量搜索
function performBatchSearch(searchText) {
    // 按行分割搜索关键词
    const keywords = searchText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (keywords.length === 0) {
        displayAllDataItems();
        return;
    }

    // 对每个关键词执行搜索
    const allResults = keywords.map(keyword => {
        const results = [];
        const normalizedKeyword = normalizePunctuation(keyword);

        dataItems.forEach((item, index) => {
            const normalizedItem = normalizePunctuation(item);

            // 使用标准化后的文本进行匹配
            if (normalizedItem.includes(normalizedKeyword)) {
                // 计算匹配次数（使用标准化文本）
                const regex = new RegExp(escapeRegExp(normalizedKeyword), 'gi');
                const matchCount = (normalizedItem.match(regex) || []).length;

                results.push({
                    index: index + 1,
                    content: item, // 保存原始内容
                    matchCount: matchCount
                });
            }
        });

        return {
            keyword: keyword,
            results: results
        };
    });

    // 显示结果
    displayBatchResults(allResults);
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 在字符类内部转义特殊字符
function escapeForCharClass(string) {
    return string.replace(/[\]\\-]/g, '\\$&');
}

// 管理下载按钮状态
function setDownloadData(items) {
    lastDownloadItems = Array.isArray(items) ? items : [];
    const downloadBtn = document.getElementById('downloadResultsBtn');
    if (downloadBtn) {
        downloadBtn.disabled = lastDownloadItems.length === 0;
    }
}

// 显示批量搜索结果
function displayBatchResults(allResults) {
    const resultsDiv = document.getElementById('searchResults');

    // 计算总匹配数
    const totalMatches = allResults.reduce((sum, r) => sum + r.results.length, 0);

    if (totalMatches === 0) {
        setDownloadData([]);
        resultsDiv.innerHTML = `
            <div class="result-header error">
                未找到任何匹配的数据
            </div>
        `;
        return;
    }

    // 生成结果HTML
    let html = `
        <div class="result-header success">
            批量搜索完成：共搜索 ${allResults.length} 个关键词，找到 ${totalMatches} 条匹配数据
        </div>
    `;

    allResults.forEach((keywordResult, kidx) => {
        const { keyword, results } = keywordResult;

        if (results.length > 0) {
            html += `
                <div class="keyword-group">
                    <div class="keyword-header">
                        <span class="keyword-text">关键词 ${kidx + 1}: "${keyword}"</span>
                        <span class="keyword-count">找到 ${results.length} 条</span>
                    </div>
                    ${results.map(result => `
                        <div class="result-item">
                            <div class="result-item-header">
                                <span>数据 #${result.index}</span>
                                <span>匹配 ${result.matchCount} 次</span>
                            </div>
                            <div class="result-item-content">
                                ${highlightText(result.content, keyword)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            html += `
                <div class="keyword-group">
                    <div class="keyword-header not-found">
                        <span class="keyword-text">关键词 ${kidx + 1}: "${keyword}"</span>
                        <span class="keyword-count">未找到匹配</span>
                    </div>
                </div>
            `;
        }
    });

    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });

    const seenIndexes = new Set();
    const flattenedContent = [];
    allResults.forEach(group => {
        group.results.forEach(result => {
            if (!seenIndexes.has(result.index)) {
                seenIndexes.add(result.index);
                flattenedContent.push(result.content);
            }
        });
    });
    setDownloadData(flattenedContent);
}

// 显示所有去重后的内容
function displayAllDataItems() {
    const resultsDiv = document.getElementById('searchResults');

    if (dataItems.length === 0) {
        setDownloadData([]);
        resultsDiv.innerHTML = `
            <div class="result-header error">
                请先解析并去重数据
            </div>
        `;
        return;
    }

    const maxDisplayCount = 5;
    const itemsToShow = dataItems.slice(0, maxDisplayCount);
    const itemsHtml = itemsToShow.map((item, index) => `
        <div class="result-item">
            <div class="result-item-header">
                <span>数据 #${index + 1}</span>
                <span>去重内容</span>
            </div>
            <div class="result-item-content">
                ${item}
            </div>
        </div>
    `).join('');

    resultsDiv.innerHTML = `
        <div class="result-header success">
            开始搜索，去重后共有 ${dataItems.length} 条数据，默认仅展示前 ${itemsToShow.length} 条，可使用“下载结果”获取全部内容
        </div>
        <div class="keyword-group">
            ${itemsHtml}
        </div>
        ${dataItems.length > maxDisplayCount ? `
            <div class="result-header">
                为避免一次性展示过多内容，建议通过下载或输入更精确的搜索条件查看剩余数据。
            </div>
        ` : ''}
    `;

    resultsDiv.scrollIntoView({ behavior: 'smooth' });
    setDownloadData(dataItems.slice());
}

// 高亮搜索文本（支持标点符号模糊匹配）
function highlightText(text, searchText) {
    // 创建标点符号映射表（可以互相匹配的标点符号）
    const punctuationGroups = [
        ["，", ","],
        ["。", "."],
        ["！", "!"],
        ["？", "?"],
        ["：", ":"],
        ["；", ";"],
        ["（", "("],
        ["）", ")"],
        ["【", "["],
        ["】", "]"],
        ['「', '"', '"', '"'],
        ['」', '"', '"', '"'],
        ["『", "'", "'", "'"],
        ["』", "'", "'", "'"],
        ["—", "-", "－"],
        ["～", "~"],
        ["《", "<"],
        ["》", ">"],
        ["、", ","],
        ["　", " "]
    ];

    // 将搜索文本转换为支持标点符号模糊匹配的正则表达式
    let regexPattern = '';
    for (let i = 0; i < searchText.length; i++) {
        const char = searchText[i];
        let matched = false;

        // 检查是否是标点符号
        for (const group of punctuationGroups) {
            if (group.includes(char)) {
                // 创建可以匹配该组所有标点符号的字符类
                const escaped = group.map(p => escapeForCharClass(p)).join('');
                regexPattern += `[${escaped}]`;
                matched = true;
                break;
            }
        }

        // 如果不是标点符号，直接转义添加
        if (!matched) {
            regexPattern += escapeRegExp(char);
        }
    }

    const regex = new RegExp(`(${regexPattern})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// 自定义分隔符单选按钮监听
document.querySelectorAll('input[name="delimiter"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const customInput = document.getElementById('customDelimiter');
        if (this.value === 'custom') {
            customInput.focus();
        }
    });
});

const customDelimiterInput = document.getElementById('customDelimiter');
if (customDelimiterInput) {
    customDelimiterInput.addEventListener('focus', () => {
        const customRadio = document.getElementById('delimiterCustom');
        if (customRadio && !customRadio.checked) {
            customRadio.checked = true;
        }
    });
}

// 下载结果
const downloadBtn = document.getElementById('downloadResultsBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadResults);
}

function downloadResults() {
    if (!lastDownloadItems.length) {
        alert('暂无可下载内容，请先执行搜索。');
        return;
    }

    const formatted = lastDownloadItems.map((item, idx) => {
        const sanitized = item
            .replace(/\r?\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return `${idx + 1}.${sanitized}`;
    });

    const blob = new Blob([formatted.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `textgrep-results-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

// 配置 PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
