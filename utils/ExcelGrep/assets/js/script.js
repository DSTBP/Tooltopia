const SUPPORTED_FILE_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const DEFAULT_ENCODING_CANDIDATES = ['utf-8', 'gbk', 'gb2312', 'big5', 'shift-jis', 'windows-1252'];
const DEFAULT_PREVIEW_ROW_COUNT = 5;

const AppState = {
    tableData: [],
    headers: [],
    rows: [],
    searchResults: [],
    conditionCounter: 0,
    selectedFile: null
};

const UI = {};

window.addEventListener('load', initApp);

function initApp() {
    cacheDom();
    checkDependencies();
    initEventListeners();
}

function cacheDom() {
    Object.assign(UI, {
        fileInput: document.getElementById('fileInput'),
        fileUploadArea: document.getElementById('fileUploadArea'),
        fileName: document.getElementById('fileName'),
        textInput: document.getElementById('textInput'),
        encodingSelect: document.getElementById('encodingSelect'),
        loadTableBtn: document.getElementById('loadTableBtn'),
        continueBtn: document.getElementById('continueBtn'),
        addConditionBtn: document.getElementById('addConditionBtn'),
        searchBtn: document.getElementById('searchBtn'),
        exportExcelBtn: document.getElementById('exportExcelBtn'),
        exportCsvBtn: document.getElementById('exportCsvBtn'),
        tablePreview: document.getElementById('tablePreview'),
        searchConditions: document.getElementById('searchConditions'),
        searchResults: document.getElementById('searchResults'),
        exportArea: document.querySelector('.export-area'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        step4: document.getElementById('step4')
    });
}

function checkDependencies() {
    const issues = [];

    if (typeof XLSX === 'undefined') {
        issues.push('Excel processing library is unavailable');
    }

    if (typeof Papa === 'undefined') {
        issues.push('CSV processing library is unavailable');
    }

    if (issues.length > 0) {
        console.warn('Dependency load issue:', issues.join(', '));
        alert('警告：部分功能依赖库未加载，Excel 或 CSV 文件可能无法正常使用。');
    }
}

function initEventListeners() {
    UI.fileUploadArea.addEventListener('click', () => UI.fileInput.click());

    UI.fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
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

        const file = event.dataTransfer?.files?.[0];
        if (!file) {
            return;
        }

        if (!isSupportedFile(file.name)) {
            alert('请选择 Excel（.xlsx、.xls）或 CSV 文件。');
            return;
        }

        setSelectedFile(file);
    });

    UI.loadTableBtn.addEventListener('click', loadTable);
    UI.continueBtn.addEventListener('click', showStep3);
    UI.addConditionBtn.addEventListener('click', addSearchCondition);
    UI.searchBtn.addEventListener('click', performSearch);
    UI.exportExcelBtn.addEventListener('click', () => exportResults('excel'));
    UI.exportCsvBtn.addEventListener('click', () => exportResults('csv'));
}

function isSupportedFile(fileName) {
    const lowerName = fileName.toLowerCase();
    return SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function setSelectedFile(file) {
    AppState.selectedFile = file;
    UI.fileName.textContent = `已选择: ${file.name}`;

    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        UI.fileInput.files = dataTransfer.files;
    } catch (error) {
        // Some browsers restrict programmatic FileList assignment.
    }
}

function getSelectedFile() {
    return AppState.selectedFile || UI.fileInput.files[0] || null;
}

function resetSearchState() {
    AppState.searchResults = [];
    AppState.conditionCounter = 0;
    UI.searchConditions.innerHTML = '';
    UI.searchResults.innerHTML = '';
    UI.exportArea.style.display = 'none';
    UI.step3.style.display = 'none';
    UI.step4.style.display = 'none';
}

async function loadTable() {
    const file = getSelectedFile();
    const text = UI.textInput.value.trim();
    const hasFile = Boolean(file);
    const hasText = text.length > 0;

    if (!hasFile && !hasText) {
        alert('请选择文件或粘贴表格数据！');
        return;
    }

    UI.loadTableBtn.disabled = true;
    UI.loadTableBtn.textContent = '正在加载...';

    try {
        AppState.tableData = hasFile ? await loadFromFile(file) : loadFromText(text);

        if (AppState.tableData.length === 0) {
            throw new Error('未能解析到有效的表格数据');
        }

        AppState.headers = AppState.tableData[0];
        AppState.rows = AppState.tableData.slice(1);

        if (AppState.rows.length === 0) {
            throw new Error('表格中没有数据行');
        }

        filterEmptyColumns();
        resetSearchState();
        showStep2();
    } catch (error) {
        console.error('Load table failed:', error);
        alert(`加载失败: ${error.message}`);
    } finally {
        UI.loadTableBtn.disabled = false;
        UI.loadTableBtn.textContent = '载入表格';
    }
}

async function loadFromFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return loadExcelFile(file);
    }

    if (fileName.endsWith('.csv')) {
        return loadCsvFile(file);
    }

    throw new Error('不支持的文件格式，请选择 Excel 或 CSV 文件。');
}

function getCellText(cell) {
    return cell == null ? '' : String(cell);
}

function normalizeTableData(data) {
    return data
        .filter((row) => Array.isArray(row))
        .map((row) => row.map((cell) => getCellText(cell)))
        .filter((row) => row.some((cell) => cell.trim() !== ''));
}

function normalizeRowLength(row, targetLength) {
    const normalized = row.slice(0, targetLength);
    while (normalized.length < targetLength) {
        normalized.push('');
    }
    return normalized;
}

function loadExcelFile(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('Excel 处理依赖未加载'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                resolve(normalizeTableData(data));
            } catch (error) {
                reject(new Error(`Excel 文件解析失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('读取 Excel 文件失败'));
        reader.readAsArrayBuffer(file);
    });
}

function detectEncodingQuality(text) {
    if (!text) {
        return { badChars: Number.MAX_SAFE_INTEGER, readableRatio: 0 };
    }

    const replacementChars = (text.match(/\ufffd/g) || []).length;
    const garbledChars = (text.match(/[ÃÂ�]/g) || []).length;
    const readableChars = (text.match(/[a-zA-Z0-9\u4e00-\u9fa5]/g) || []).length;

    return {
        badChars: replacementChars + garbledChars,
        readableRatio: readableChars / text.length
    };
}

function normalizeEncodingName(encoding) {
    const lower = encoding.toLowerCase();
    return lower === 'gb2312' ? 'gbk' : lower;
}

function tryDecode(arrayBuffer, encoding) {
    try {
        const decoder = new TextDecoder(normalizeEncodingName(encoding), { fatal: false });
        const text = decoder.decode(arrayBuffer);
        return { encoding, text, quality: detectEncodingQuality(text) };
    } catch (error) {
        return null;
    }
}

function detectEncoding(arrayBuffer) {
    if (typeof jschardet === 'undefined') {
        return null;
    }

    try {
        const detected = jschardet.detect(new Uint8Array(arrayBuffer));
        if (!detected?.encoding || detected.confidence <= 0.7) {
            return null;
        }
        return normalizeEncodingName(detected.encoding);
    } catch (error) {
        console.warn('Encoding detection failed:', error);
        return null;
    }
}

function pickBestDecodeResult(results) {
    return results.reduce((best, current) => {
        if (!best) {
            return current;
        }

        if (current.quality.badChars !== best.quality.badChars) {
            return current.quality.badChars < best.quality.badChars ? current : best;
        }

        return current.quality.readableRatio > best.quality.readableRatio ? current : best;
    }, null);
}

function parseCsvText(text) {
    if (typeof Papa === 'undefined') {
        throw new Error('CSV 处理依赖未加载');
    }

    const result = Papa.parse(text, {
        skipEmptyLines: true
    });

    if (result.errors?.length) {
        throw new Error(result.errors[0].message || 'CSV 解析失败');
    }

    return normalizeTableData(result.data);
}

function loadCsvFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                const selectedEncoding = UI.encodingSelect?.value || 'auto';
                let decodedText = '';

                if (selectedEncoding !== 'auto') {
                    const manualResult = tryDecode(arrayBuffer, selectedEncoding);
                    if (!manualResult) {
                        throw new Error(`无法使用 ${selectedEncoding} 编码解析文件`);
                    }
                    decodedText = manualResult.text;
                } else {
                    const detectedEncoding = detectEncoding(arrayBuffer);
                    const encodingCandidates = detectedEncoding
                        ? [detectedEncoding, ...DEFAULT_ENCODING_CANDIDATES.filter((item) => item !== detectedEncoding)]
                        : [...DEFAULT_ENCODING_CANDIDATES];
                    const decodeResults = encodingCandidates.map((encoding) => tryDecode(arrayBuffer, encoding)).filter(Boolean);

                    if (decodeResults.length === 0) {
                        throw new Error('无法检测文件编码');
                    }

                    decodedText = pickBestDecodeResult(decodeResults).text;
                }

                resolve(parseCsvText(decodedText));
            } catch (error) {
                reject(new Error(`CSV 文件读取失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('读取 CSV 文件失败'));
        reader.readAsArrayBuffer(file);
    });
}

function detectTextTableFormat(text) {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length >= 2 && looksLikeMarkdownTable(lines)) {
        return 'markdown';
    }

    if (lines.some((line) => line.includes('\t'))) {
        return 'tsv';
    }

    return 'csv';
}

function looksLikeMarkdownTable(lines) {
    const separatorPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
    return lines.length >= 2 && lines[0].includes('|') && separatorPattern.test(lines[1]);
}

function splitMarkdownLine(line) {
    let normalized = line.trim();
    if (normalized.startsWith('|')) {
        normalized = normalized.slice(1);
    }
    if (normalized.endsWith('|')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized.split('|').map((cell) => cell.trim());
}

function loadFromText(text) {
    const format = detectTextTableFormat(text);

    if (format === 'markdown') {
        return loadFromMarkdown(text);
    }

    if (format === 'tsv') {
        return normalizeTableData(text.split('\n').map((line) => line.split('\t')));
    }

    return parseCsvText(text);
}

function loadFromMarkdown(text) {
    const separatorPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
    const rows = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !separatorPattern.test(line))
        .map(splitMarkdownLine);

    return normalizeTableData(rows);
}

function filterEmptyColumns() {
    const validColumnIndices = AppState.headers.reduce((indices, header, index) => {
        if (header && header.trim() !== '') {
            indices.push(index);
        }
        return indices;
    }, []);

    if (validColumnIndices.length === AppState.headers.length) {
        AppState.rows = AppState.rows.map((row) => normalizeRowLength(row, AppState.headers.length));
        AppState.tableData = [AppState.headers, ...AppState.rows];
        return;
    }

    AppState.headers = validColumnIndices.map((index) => AppState.headers[index]);
    AppState.rows = AppState.rows.map((row) => validColumnIndices.map((index) => row[index] ?? ''));
    AppState.tableData = [AppState.headers, ...AppState.rows];
}

function showStep2() {
    UI.tablePreview.innerHTML = `
        <div class="table-info">
            <p>表格信息：共 <strong>${AppState.headers.length}</strong> 列，<strong>${AppState.rows.length}</strong> 行数据</p>
            <p>列名：${AppState.headers.map((header) => `<span class="column-tag">${escapeHtml(header)}</span>`).join(' ')}</p>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>${AppState.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${AppState.rows.slice(0, DEFAULT_PREVIEW_ROW_COUNT).map((row) => `
                        <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${AppState.rows.length > DEFAULT_PREVIEW_ROW_COUNT ? `<p class="preview-note">仅显示前 ${DEFAULT_PREVIEW_ROW_COUNT} 行数据，共 ${AppState.rows.length} 行</p>` : ''}
    `;

    UI.step2.style.display = 'block';
    UI.step2.scrollIntoView({ behavior: 'smooth' });
}

function showStep3() {
    UI.searchConditions.innerHTML = '';
    AppState.conditionCounter = 0;
    addSearchCondition();
    UI.step3.style.display = 'block';
    UI.step3.scrollIntoView({ behavior: 'smooth' });
}

function addSearchCondition() {
    const conditionId = AppState.conditionCounter++;
    UI.searchConditions.insertAdjacentHTML('beforeend', `
        <div class="condition-item" data-id="${conditionId}">
            <div class="condition-row">
                <select class="column-select">
                    <option value="">选择列...</option>
                    ${AppState.headers.map((header, index) => `<option value="${index}">${escapeHtml(header)}</option>`).join('')}
                </select>
                <input type="text" class="keyword-input" placeholder="输入关键字...">
                <button class="btn-remove" type="button" onclick="removeCondition(${conditionId})">✕</button>
            </div>
        </div>
    `);
}

function removeCondition(conditionId) {
    const conditionItem = document.querySelector(`.condition-item[data-id="${conditionId}"]`);
    if (conditionItem) {
        conditionItem.remove();
    }
}

function collectSearchConditions() {
    return Array.from(document.querySelectorAll('.condition-item'))
        .map((item) => {
            const columnIndex = item.querySelector('.column-select').value;
            const keyword = item.querySelector('.keyword-input').value.trim();

            if (columnIndex === '' || keyword === '') {
                return null;
            }

            return {
                columnIndex: Number(columnIndex),
                columnName: AppState.headers[columnIndex],
                keyword
            };
        })
        .filter(Boolean);
}

function performSearch() {
    const conditions = collectSearchConditions();
    if (conditions.length === 0) {
        alert('请至少填写一个完整的搜索条件！');
        return;
    }

    const logic = document.querySelector('input[name="logic"]:checked')?.value || 'and';
    AppState.searchResults = AppState.rows.reduce((results, row, rowIndex) => {
        const isMatch = logic === 'and'
            ? conditions.every((condition) => getCellText(row[condition.columnIndex]).includes(condition.keyword))
            : conditions.some((condition) => getCellText(row[condition.columnIndex]).includes(condition.keyword));

        if (isMatch) {
            results.push({
                index: rowIndex,
                row
            });
        }

        return results;
    }, []);

    displayResults(conditions, logic);
}

function buildHighlightMap(conditions) {
    return conditions.reduce((map, condition) => {
        if (!map.has(condition.columnIndex)) {
            map.set(condition.columnIndex, []);
        }
        map.get(condition.columnIndex).push(condition.keyword);
        return map;
    }, new Map());
}

function displayResults(conditions, logic) {
    if (AppState.searchResults.length === 0) {
        UI.searchResults.innerHTML = `
            <div class="result-header error">
                未找到匹配的数据
            </div>
        `;
        UI.exportArea.style.display = 'none';
        UI.step4.style.display = 'block';
        UI.step4.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const previewResults = AppState.searchResults.slice(0, DEFAULT_PREVIEW_ROW_COUNT);
    const conditionsText = conditions
        .map((condition) => `"${escapeHtml(condition.columnName)}" 包含 "${escapeHtml(condition.keyword)}"`)
        .join(logic === 'and' ? ' 且 ' : ' 或 ');
    const highlightMap = buildHighlightMap(conditions);

    UI.searchResults.innerHTML = `
        <div class="result-header success">
            找到 <strong>${AppState.searchResults.length}</strong> 条匹配数据${AppState.searchResults.length > DEFAULT_PREVIEW_ROW_COUNT ? `（仅显示前 ${DEFAULT_PREVIEW_ROW_COUNT} 条）` : ''}
            <div class="search-summary">搜索条件：${conditionsText}</div>
        </div>
        <div class="table-wrapper">
            <table class="data-table result-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${AppState.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${previewResults.map((result) => `
                        <tr>
                            <td>${result.index + 1}</td>
                            ${result.row.map((cell, columnIndex) => `<td>${highlightCellText(getCellText(cell), highlightMap.get(columnIndex) || [])}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${AppState.searchResults.length > DEFAULT_PREVIEW_ROW_COUNT ? `<p class="preview-note">仅显示前 ${DEFAULT_PREVIEW_ROW_COUNT} 条数据，导出时将包含全部 ${AppState.searchResults.length} 条数据</p>` : ''}
    `;

    UI.exportArea.style.display = 'block';
    UI.step4.style.display = 'block';
    UI.step4.scrollIntoView({ behavior: 'smooth' });
}

function highlightCellText(text, keywords) {
    if (keywords.length === 0) {
        return escapeHtml(text);
    }

    const uniqueKeywords = [...new Set(keywords)].sort((left, right) => right.length - left.length);
    const regex = new RegExp(uniqueKeywords.map(escapeRegExp).join('|'), 'g');
    let lastIndex = 0;
    let result = '';

    text.replace(regex, (match, offset) => {
        result += escapeHtml(text.slice(lastIndex, offset));
        result += `<span class="highlight">${escapeHtml(match)}</span>`;
        lastIndex = offset + match.length;
        return match;
    });

    result += escapeHtml(text.slice(lastIndex));
    return result;
}

function exportResults(format) {
    if (AppState.searchResults.length === 0) {
        alert('没有可导出的数据！');
        return;
    }

    const exportData = [AppState.headers, ...AppState.searchResults.map((result) => result.row)];

    if (format === 'excel') {
        exportToExcel(exportData);
    } else {
        exportToCsv(exportData);
    }
}

function exportToExcel(data) {
    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('Excel 处理依赖未加载');
        }

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '搜索结果');

        const fileName = `表格搜索结果_${getTimestamp()}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        alert(`成功导出 ${AppState.searchResults.length} 条数据到 ${fileName}`);
    } catch (error) {
        alert(`导出 Excel 失败: ${error.message}`);
    }
}

function exportToCsv(data) {
    try {
        if (typeof Papa === 'undefined') {
            throw new Error('CSV 处理依赖未加载');
        }

        const csv = Papa.unparse(data);
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = `表格搜索结果_${getTimestamp()}.csv`;

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);

        alert(`成功导出 ${AppState.searchResults.length} 条数据到 ${fileName}`);
    } catch (error) {
        alert(`导出 CSV 失败: ${error.message}`);
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function pad(number) {
    return number < 10 ? `0${number}` : String(number);
}

window.removeCondition = removeCondition;
