// 全局变量
let sourceText = ''; // 原始文本
let dataItems = []; // 解析后的数据项

// 文件输入监听
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('fileName').textContent = `已选择: ${file.name}`;
    }
});

// 载入文本按钮
document.getElementById('loadTextBtn').addEventListener('click', async function() {
    const fileInput = document.getElementById('fileInput');
    const textInput = document.getElementById('textInput');

    // 检查是否有文件或文本输入
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        await loadFile(file);
    } else if (textInput.value.trim()) {
        sourceText = textInput.value.trim();
        showStep2();
    } else {
        alert('请选择文件或输入文本！');
    }
});

// 加载文件
async function loadFile(file) {
    const fileName = file.name.toLowerCase();

    try {
        if (fileName.endsWith('.txt')) {
            sourceText = await readTextFile(file);
            showStep2();
        } else if (fileName.endsWith('.docx')) {
            sourceText = await readWordFile(file);
            showStep2();
        } else if (fileName.endsWith('.pdf')) {
            sourceText = await readPdfFile(file);
            showStep2();
        } else {
            alert('不支持的文件格式！请选择 TXT、DOCX 或 PDF 文件。');
        }
    } catch (error) {
        console.error('文件读取错误:', error);
        alert('文件读取失败: ' + error.message);
    }
}

// 读取 TXT 文件
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
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
                const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
                resolve(result.value);
            } catch (error) {
                reject(new Error('读取 Word 文件失败'));
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
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        return fullText;
    } catch (error) {
        throw new Error('读取 PDF 文件失败: ' + error.message);
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
    dataItems = sourceText.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);

    // 显示预览
    showDataPreview();

    // 显示步骤3
    document.getElementById('step3').style.display = 'block';
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
}

// 显示数据预览
function showDataPreview() {
    const previewDiv = document.getElementById('dataPreview');
    previewDiv.innerHTML = `
        <div class="preview-info">已解析 ${dataItems.length} 条数据，以下是前5条预览：</div>
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
        alert('请输入要搜索的内容！');
        return;
    }

    performSearch(searchText);
});

// 执行搜索
function performSearch(searchText) {
    const results = [];

    // 在每个数据项中搜索
    dataItems.forEach((item, index) => {
        if (item.includes(searchText)) {
            results.push({
                index: index + 1,
                content: item,
                matchCount: (item.match(new RegExp(escapeRegExp(searchText), 'g')) || []).length
            });
        }
    });

    // 显示结果
    displayResults(results, searchText);
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 显示搜索结果
function displayResults(results, searchText) {
    const resultsDiv = document.getElementById('searchResults');

    if (results.length === 0) {
        resultsDiv.innerHTML = `
            <div class="result-header error">
                未找到匹配的数据
            </div>
        `;
        return;
    }

    resultsDiv.innerHTML = `
        <div class="result-header success">
            找到 ${results.length} 条匹配的数据
        </div>
        ${results.map(result => `
            <div class="result-item">
                <div class="result-item-header">
                    <span>数据 #${result.index}</span>
                    <span>匹配 ${result.matchCount} 次</span>
                </div>
                <div class="result-item-content">
                    ${highlightText(result.content, searchText)}
                </div>
            </div>
        `).join('')}
    `;

    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

// 高亮搜索文本
function highlightText(text, searchText) {
    const escapedSearch = escapeRegExp(searchText);
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
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

// 配置 PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
