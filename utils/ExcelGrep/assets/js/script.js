const SUPPORTED_FILE_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const DEFAULT_ENCODING_CANDIDATES = ['utf-8', 'gbk', 'gb2312', 'big5', 'shift-jis', 'windows-1252'];
const DEFAULT_PREVIEW_ROW_COUNT = 5;

const AppState = {
    tableData: [],
    headers: [],
    rows: [],
    fileTables: [],
    searchResults: [],
    conditionCounter: 0,
    selectedFiles: []
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
        continueMergedBtn: document.getElementById('continueMergedBtn'),
        addConditionBtn: document.getElementById('addConditionBtn'),
        searchBtn: document.getElementById('searchBtn'),
        exportExcelBtn: document.getElementById('exportExcelBtn'),
        exportCsvBtn: document.getElementById('exportCsvBtn'),
        tablePreview: document.getElementById('tablePreview'),
        mergedTablePreview: document.getElementById('mergedTablePreview'),
        searchConditions: document.getElementById('searchConditions'),
        searchResults: document.getElementById('searchResults'),
        exportArea: document.querySelector('.export-area'),
        step2: document.getElementById('step2'),
        step3Merged: document.getElementById('step3Merged'),
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
        const files = Array.from(event.target.files || []);
        if (files.length > 0) {
            setSelectedFiles(files);
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

        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length === 0) {
            return;
        }

        const unsupportedFiles = files.filter((file) => !isSupportedFile(file.name));
        if (unsupportedFiles.length > 0) {
            alert(`请选择 Excel（.xlsx、.xls）或 CSV 文件。\n不支持的文件: ${unsupportedFiles.map((file) => file.name).join(', ')}`);
            return;
        }

        setSelectedFiles(files);
    });

    UI.loadTableBtn.addEventListener('click', loadTable);
    UI.continueBtn.addEventListener('click', continueToSearchConfig);
    UI.continueMergedBtn.addEventListener('click', showStep3);
    UI.addConditionBtn.addEventListener('click', addSearchCondition);
    UI.searchBtn.addEventListener('click', performSearch);
    UI.exportExcelBtn.addEventListener('click', () => exportResults('excel'));
    UI.exportCsvBtn.addEventListener('click', () => exportResults('csv'));
}

function isSupportedFile(fileName) {
    const lowerName = fileName.toLowerCase();
    return SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function setSelectedFiles(files) {
    const supportedFiles = Array.from(files).filter((file) => isSupportedFile(file.name));
    AppState.selectedFiles = supportedFiles;

    if (supportedFiles.length === 0) {
        UI.fileName.textContent = '';
        return;
    }

    UI.fileName.textContent = supportedFiles.length === 1
        ? `已选择: ${supportedFiles[0].name}`
        : `已选择 ${supportedFiles.length} 个文件: ${supportedFiles.map((file) => file.name).join(', ')}`;

    try {
        const dataTransfer = new DataTransfer();
        supportedFiles.forEach((file) => dataTransfer.items.add(file));
        UI.fileInput.files = dataTransfer.files;
    } catch (error) {
        // Some browsers restrict programmatic FileList assignment.
    }
}

function getSelectedFiles() {
    if (AppState.selectedFiles.length > 0) {
        return AppState.selectedFiles;
    }

    return Array.from(UI.fileInput.files || []).filter((file) => isSupportedFile(file.name));
}

function resetSearchState() {
    AppState.searchResults = [];
    AppState.conditionCounter = 0;
    UI.mergedTablePreview.innerHTML = '';
    UI.searchConditions.innerHTML = '';
    UI.searchResults.innerHTML = '';
    UI.exportArea.style.display = 'none';
    UI.step3Merged.style.display = 'none';
    UI.step3.style.display = 'none';
    UI.step4.style.display = 'none';
}

async function loadTable() {
    const files = getSelectedFiles();
    const text = UI.textInput.value.trim();
    const hasFile = files.length > 0;
    const hasText = text.length > 0;

    if (!hasFile && !hasText) {
        alert('请选择文件或粘贴表格数据！');
        return;
    }

    UI.loadTableBtn.disabled = true;
    UI.loadTableBtn.textContent = '正在加载...';

    try {
        AppState.fileTables = hasFile
            ? await loadFileTables(files)
            : [createTableModel('粘贴数据', loadFromText(text))];

        if (AppState.fileTables.length === 1) {
            setActiveTable(AppState.fileTables[0]);
        } else {
            AppState.tableData = [];
            AppState.headers = [];
            AppState.rows = [];
        }

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

async function loadFileTables(files) {
    return Promise.all(files.map(async (file) => {
        try {
            return createTableModel(file.name, await loadFromFile(file));
        } catch (error) {
            throw new Error(`${file.name}: ${error.message}`);
        }
    }));
}

function createTableModel(sourceName, tableData) {
    if (tableData.length === 0) {
        throw new Error('未能解析到有效的表格数据');
    }

    const table = {
        sourceName,
        headers: tableData[0],
        rows: tableData.slice(1),
        tableData
    };

    if (table.rows.length === 0) {
        throw new Error('表格中没有数据行');
    }

    return filterEmptyColumnsInTable(table);
}

function setActiveTable(table) {
    AppState.headers = table.headers;
    AppState.rows = table.rows;
    AppState.tableData = table.tableData;
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

function filterEmptyColumnsInTable(table) {
    const validColumnIndices = table.headers.reduce((indices, header, index) => {
        if (header && header.trim() !== '') {
            indices.push(index);
        }
        return indices;
    }, []);

    if (validColumnIndices.length === table.headers.length) {
        const rows = table.rows.map((row) => normalizeRowLength(row, table.headers.length));
        return {
            ...table,
            rows,
            tableData: [table.headers, ...rows]
        };
    }

    const headers = validColumnIndices.map((index) => table.headers[index]);
    const rows = table.rows.map((row) => validColumnIndices.map((index) => row[index] ?? ''));
    return {
        ...table,
        headers,
        rows,
        tableData: [headers, ...rows]
    };
}

function filterEmptyColumns() {
    setActiveTable(filterEmptyColumnsInTable({
        sourceName: '当前表格',
        headers: AppState.headers,
        rows: AppState.rows,
        tableData: AppState.tableData
    }));
}

function showStep2() {
    UI.tablePreview.innerHTML = AppState.fileTables.length > 1
        ? renderMultiFilePreview()
        : renderSingleTablePreview(AppState.fileTables[0]);
    UI.continueBtn.textContent = AppState.fileTables.length > 1 ? '生成合并表格预览' : '继续设置搜索条件';

    UI.step2.style.display = 'block';
    UI.step2.scrollIntoView({ behavior: 'smooth' });
}

function renderSingleTablePreview(table) {
    return `
        <div class="table-info">
            <p>表格信息：共 <strong>${table.headers.length}</strong> 列，<strong>${table.rows.length}</strong> 行数据</p>
            <p>列名：${renderColumnTags(table.headers)}</p>
        </div>
        ${renderPreviewTable(table.headers, table.rows)}
    `;
}

function renderMultiFilePreview() {
    const commonHeaders = getCommonMergeHeaders(AppState.fileTables);
    const mergeOptions = commonHeaders
        .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
        .join('');

    return `
        <div class="table-info">
            <p>已加载 <strong>${AppState.fileTables.length}</strong> 个文件，请选择合并基准列后继续</p>
            ${commonHeaders.length > 0
                ? `<p>合并基准列：<select id="mergeKeySelect" class="column-select">${mergeOptions}</select></p>`
                : '<p>未找到所有文件共有的列名，无法自动合并。请确认每个文件都有同名的合并基准列。</p>'}
        </div>
        ${AppState.fileTables.map((table, index) => `
            <div class="table-info">
                <p>文件 ${index + 1}: ${escapeHtml(table.sourceName)}</p>
                <p>表格信息：共 <strong>${table.headers.length}</strong> 列，<strong>${table.rows.length}</strong> 行数据</p>
                <p>列名：${renderColumnTags(table.headers)}</p>
            </div>
            ${renderPreviewTable(table.headers, table.rows)}
        `).join('')}
    `;
}

function renderColumnTags(headers) {
    return headers.map((header) => `<span class="column-tag">${escapeHtml(header)}</span>`).join(' ');
}

function renderPreviewTable(headers, rows) {
    return `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.slice(0, DEFAULT_PREVIEW_ROW_COUNT).map((row) => `
                        <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${rows.length > DEFAULT_PREVIEW_ROW_COUNT ? `<p class="preview-note">仅显示前 ${DEFAULT_PREVIEW_ROW_COUNT} 行数据，共 ${rows.length} 行</p>` : ''}
    `;
}

function continueToSearchConfig() {
    if (AppState.fileTables.length > 1) {
        const mergeKeySelect = document.getElementById('mergeKeySelect');
        const mergeColumnName = mergeKeySelect?.value || '';

        if (!mergeColumnName) {
            alert('请选择合并基准列！');
            return;
        }

        try {
            setActiveTable(mergeTablesByColumn(AppState.fileTables, mergeColumnName));
        } catch (error) {
            alert(`合并失败: ${error.message}`);
            return;
        }

        showMergedTablePreview(mergeColumnName);
        return;
    }

    showStep3();
}

function showMergedTablePreview(mergeColumnName) {
    AppState.searchResults = [];
    AppState.conditionCounter = 0;
    UI.searchConditions.innerHTML = '';
    UI.searchResults.innerHTML = '';
    UI.exportArea.style.display = 'none';
    UI.step3.style.display = 'none';
    UI.step4.style.display = 'none';
    UI.mergedTablePreview.innerHTML = `
        <div class="table-info">
            <p>合并基准列：<strong>${escapeHtml(mergeColumnName)}</strong></p>
            <p>合并表格信息：共 <strong>${AppState.headers.length}</strong> 列，<strong>${AppState.rows.length}</strong> 行数据</p>
            <p>列名：${renderColumnTags(AppState.headers)}</p>
        </div>
        ${renderPreviewTable(AppState.headers, AppState.rows)}
    `;
    UI.step3Merged.style.display = 'block';
    UI.step3Merged.scrollIntoView({ behavior: 'smooth' });
}

function normalizeHeaderName(header) {
    return getCellText(header).trim();
}

function findHeaderIndex(headers, columnName) {
    const normalizedColumnName = normalizeHeaderName(columnName);
    return headers.findIndex((header) => normalizeHeaderName(header) === normalizedColumnName);
}

function getCommonMergeHeaders(tables) {
    if (tables.length === 0) {
        return [];
    }

    const firstTableHeaders = tables[0].headers
        .map(normalizeHeaderName)
        .filter(Boolean);
    const uniqueHeaders = [...new Set(firstTableHeaders)];

    return uniqueHeaders.filter((header) => tables.every((table) => findHeaderIndex(table.headers, header) !== -1));
}

function mergeTablesByColumn(tables, mergeColumnName) {
    const normalizedMergeColumnName = normalizeHeaderName(mergeColumnName);
    const mergedHeaders = [mergeColumnName];
    const headerIndexMap = new Map([[normalizedMergeColumnName, 0]]);
    const tableMappings = tables.map((table) => {
        const keyIndex = findHeaderIndex(table.headers, mergeColumnName);

        if (keyIndex === -1) {
            throw new Error(`${table.sourceName} 中不存在列 "${mergeColumnName}"`);
        }

        const columns = table.headers.reduce((result, header, columnIndex) => {
            if (columnIndex === keyIndex) {
                return result;
            }

            const normalizedHeader = normalizeHeaderName(header);
            if (!normalizedHeader) {
                return result;
            }

            if (!headerIndexMap.has(normalizedHeader)) {
                headerIndexMap.set(normalizedHeader, mergedHeaders.push(normalizedHeader) - 1);
            }

            const mergedIndex = headerIndexMap.get(normalizedHeader);
            result.push({ columnIndex, mergedIndex });
            return result;
        }, []);

        return { table, keyIndex, columns };
    });

    const rowMap = new Map();
    const rowOrder = [];

    tableMappings.forEach(({ table, keyIndex, columns }, tableIndex) => {
        table.rows.forEach((row, rowIndex) => {
            const rawKey = getCellText(row[keyIndex]).trim();
            const mergeKey = rawKey || `__blank_key_${tableIndex}_${rowIndex}`;

            if (!rowMap.has(mergeKey)) {
                const mergedRow = Array(mergedHeaders.length).fill('');
                mergedRow[0] = rawKey;
                rowMap.set(mergeKey, mergedRow);
                rowOrder.push(mergeKey);
            }

            const mergedRow = rowMap.get(mergeKey);
            columns.forEach(({ columnIndex, mergedIndex }) => {
                mergedRow[mergedIndex] = mergeCellValues(mergedRow[mergedIndex], row[columnIndex]);
            });
        });
    });

    const rows = rowOrder.map((mergeKey) => rowMap.get(mergeKey));
    return {
        sourceName: `合并结果（按 ${mergeColumnName}）`,
        headers: mergedHeaders,
        rows,
        tableData: [mergedHeaders, ...rows]
    };
}

function getUniqueHeader(header, existingHeaders) {
    let uniqueHeader = header;
    let counter = 2;

    while (existingHeaders.includes(uniqueHeader)) {
        uniqueHeader = `${header} (${counter})`;
        counter += 1;
    }

    return uniqueHeader;
}

function mergeCellValues(currentValue, nextValue) {
    const currentText = getCellText(currentValue).trim();
    const nextText = getCellText(nextValue).trim();

    if (!nextText) {
        return currentText;
    }

    if (!currentText) {
        return nextText;
    }

    const existingParts = currentText.split(' / ');
    return existingParts.includes(nextText) ? currentText : `${currentText} / ${nextText}`;
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
                <input type="text" class="keyword-input delimiter-input" value="," placeholder="分隔符">
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
            const delimiter = item.querySelector('.delimiter-input')?.value || ',';
            const keywords = splitKeywords(keyword, delimiter);

            if (columnIndex === '' || keywords.length === 0) {
                return null;
            }

            return {
                columnIndex: Number(columnIndex),
                columnName: AppState.headers[columnIndex],
                keyword,
                keywords,
                delimiter
            };
        })
        .filter(Boolean);
}

function splitKeywords(keywordText, delimiter) {
    const normalizedDelimiter = normalizeDelimiter(delimiter);
    const text = keywordText.trim();

    if (!text) {
        return [];
    }

    if (!normalizedDelimiter) {
        return [text];
    }

    return text
        .split(normalizedDelimiter)
        .map((keyword) => keyword.trim())
        .filter(Boolean);
}

function normalizeDelimiter(delimiter) {
    return getCellText(delimiter)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
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
            ? conditions.every((condition) => doesRowMatchCondition(row, condition))
            : conditions.some((condition) => doesRowMatchCondition(row, condition));

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

function doesRowMatchCondition(row, condition) {
    const cellText = getCellText(row[condition.columnIndex]);
    return condition.keywords.some((keyword) => cellText.includes(keyword));
}

function buildHighlightMap(conditions) {
    return conditions.reduce((map, condition) => {
        if (!map.has(condition.columnIndex)) {
            map.set(condition.columnIndex, []);
        }
        map.get(condition.columnIndex).push(...condition.keywords);
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
        .map((condition) => `"${escapeHtml(condition.columnName)}" 包含 ${condition.keywords.map((keyword) => `"${escapeHtml(keyword)}"`).join(' 或 ')}`)
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
