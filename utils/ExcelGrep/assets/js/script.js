// 全局变量
let tableData = []; // 表格数据（包含表头）
let headers = []; // 表头
let rows = []; // 数据行
let searchResults = []; // 搜索结果
let conditionCounter = 0; // 条件计数器

// 页面加载完成检查依赖
window.addEventListener('load', function() {
    checkDependencies();
    initEventListeners();
});

// 检查依赖库
function checkDependencies() {
    const issues = [];

    if (typeof XLSX === 'undefined') {
        issues.push('Excel处理库未加载');
    }

    if (typeof Papa === 'undefined') {
        issues.push('CSV处理库未加载');
    }

    if (issues.length > 0) {
        console.warn('依赖库加载问题:', issues.join(', '));
        alert('警告：部分功能库未加载，Excel和CSV文件可能无法正常使用');
    }

    return issues.length === 0;
}

// 初始化事件监听器
function initEventListeners() {
    // 文件选择
    document.getElementById('fileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = `已选择: ${file.name}`;
        }
    });

    // 载入表格按钮
    document.getElementById('loadTableBtn').addEventListener('click', loadTable);

    // 继续按钮
    document.getElementById('continueBtn').addEventListener('click', function() {
        showStep3();
        addSearchCondition(); // 自动添加第一个搜索条件
    });

    // 添加条件按钮
    document.getElementById('addConditionBtn').addEventListener('click', addSearchCondition);

    // 搜索按钮
    document.getElementById('searchBtn').addEventListener('click', performSearch);

    // 导出按钮
    document.getElementById('exportExcelBtn').addEventListener('click', () => exportResults('excel'));
    document.getElementById('exportCsvBtn').addEventListener('click', () => exportResults('csv'));
}

// 载入表格
async function loadTable() {
    const fileInput = document.getElementById('fileInput');
    const textInput = document.getElementById('textInput');
    const btn = document.getElementById('loadTableBtn');

    const hasFile = fileInput.files.length > 0;
    const hasText = textInput.value.trim().length > 0;

    if (!hasFile && !hasText) {
        alert('请选择文件或粘贴表格数据！');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '正在加载...';

        if (hasFile) {
            const file = fileInput.files[0];
            await loadFromFile(file);
        } else {
            loadFromText(textInput.value);
        }

        if (tableData.length === 0) {
            throw new Error('未能解析到有效的表格数据');
        }

        // 提取表头和数据行
        headers = tableData[0];
        rows = tableData.slice(1);

        if (rows.length === 0) {
            throw new Error('表格中没有数据行');
        }

        // 过滤掉空列（列名为空或只有空白字符的列）
        filterEmptyColumns();

        showStep2();

    } catch (error) {
        console.error('加载错误:', error);
        alert('加载失败: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '载入表格';
    }
}

// 从文件加载
async function loadFromFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        await loadExcelFile(file);
    } else if (fileName.endsWith('.csv')) {
        await loadCsvFile(file);
    } else {
        throw new Error('不支持的文件格式！请选择 Excel 或 CSV 文件。');
    }
}

// 加载 Excel 文件
function loadExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // 读取第一个工作表
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // 转换为 JSON 数组（保留表头）
                tableData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                // 过滤空行
                tableData = tableData.filter(row => row.some(cell => cell !== ''));

                console.log('Excel加载成功，共', tableData.length, '行');
                resolve();
            } catch (error) {
                reject(new Error('Excel文件解析失败: ' + error.message));
            }
        };

        reader.onerror = () => reject(new Error('读取Excel文件失败'));
        reader.readAsArrayBuffer(file);
    });
}

// 加载 CSV 文件
function loadCsvFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            complete: function(results) {
                tableData = results.data.filter(row => row.some(cell => cell.trim() !== ''));
                console.log('CSV加载成功，共', tableData.length, '行');
                resolve();
            },
            error: function(error) {
                reject(new Error('CSV文件解析失败: ' + error.message));
            }
        });
    });
}

// 从文本加载（支持 Markdown、Tab分隔、CSV格式）
function loadFromText(text) {
    const lines = text.trim().split('\n');

    // 检测是否为 Markdown 表格
    if (text.includes('|')) {
        loadFromMarkdown(text);
    }
    // 检测是否为 Tab 分隔
    else if (text.includes('\t')) {
        tableData = lines.map(line => line.split('\t').map(cell => cell.trim()));
    }
    // 默认为 CSV（逗号分隔）
    else {
        Papa.parse(text, {
            complete: function(results) {
                tableData = results.data.filter(row => row.some(cell => cell.trim() !== ''));
            }
        });
    }
}

// 从 Markdown 表格加载
function loadFromMarkdown(text) {
    const lines = text.trim().split('\n');
    tableData = [];

    for (let line of lines) {
        // 跳过分隔行（如 |---|---|）
        if (line.includes('---')) continue;

        // 移除首尾的 | 并分割
        line = line.trim();
        if (line.startsWith('|')) line = line.substring(1);
        if (line.endsWith('|')) line = line.substring(0, line.length - 1);

        const cells = line.split('|').map(cell => cell.trim());
        if (cells.length > 0) {
            tableData.push(cells);
        }
    }
}

// 过滤空列（移除列名为空的列）
function filterEmptyColumns() {
    // 找出所有非空列的索引
    const validColumnIndices = [];
    headers.forEach((header, index) => {
        if (header && header.trim() !== '') {
            validColumnIndices.push(index);
        }
    });

    // 如果所有列都有效，不需要过滤
    if (validColumnIndices.length === headers.length) {
        return;
    }

    // 过滤表头
    const filteredHeaders = validColumnIndices.map(index => headers[index]);

    // 过滤每一行的数据
    const filteredRows = rows.map(row => {
        return validColumnIndices.map(index => row[index] || '');
    });

    // 更新全局变量
    headers = filteredHeaders;
    rows = filteredRows;
    tableData = [headers, ...rows];

    console.log(`已过滤空列，剩余 ${headers.length} 列`);
}

// 显示步骤2 - 表格预览
function showStep2() {
    const previewDiv = document.getElementById('tablePreview');

    // 创建表格HTML
    let html = `
        <div class="table-info">
            <p>表格信息：共 <strong>${headers.length}</strong> 列，<strong>${rows.length}</strong> 行数据</p>
            <p>列名：${headers.map((h, i) => `<span class="column-tag">${h}</span>`).join(' ')}</p>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.slice(0, 5).map(row => `
                        <tr>${row.map(cell => `<td>${cell || ''}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${rows.length > 5 ? `<p class="preview-note">仅显示前 5 行数据，共 ${rows.length} 行</p>` : ''}
    `;

    previewDiv.innerHTML = html;
    document.getElementById('step2').style.display = 'block';
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
}

// 显示步骤3 - 搜索配置
function showStep3() {
    document.getElementById('step3').style.display = 'block';
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
}

// 添加搜索条件
function addSearchCondition() {
    const conditionsDiv = document.getElementById('searchConditions');
    const conditionId = conditionCounter++;

    const conditionHtml = `
        <div class="condition-item" data-id="${conditionId}">
            <div class="condition-row">
                <select class="column-select">
                    <option value="">选择列...</option>
                    ${headers.map((h, i) => `<option value="${i}">${h}</option>`).join('')}
                </select>
                <input type="text" class="keyword-input" placeholder="输入关键词...">
                <button class="btn-remove" onclick="removeCondition(${conditionId})">✕</button>
            </div>
        </div>
    `;

    conditionsDiv.insertAdjacentHTML('beforeend', conditionHtml);
}

// 删除搜索条件
function removeCondition(conditionId) {
    const conditionItem = document.querySelector(`.condition-item[data-id="${conditionId}"]`);
    if (conditionItem) {
        conditionItem.remove();
    }
}

// 执行搜索
function performSearch() {
    const conditionItems = document.querySelectorAll('.condition-item');

    if (conditionItems.length === 0) {
        alert('请至少添加一个搜索条件！');
        return;
    }

    // 收集搜索条件
    const conditions = [];
    for (let item of conditionItems) {
        const columnIndex = item.querySelector('.column-select').value;
        const keyword = item.querySelector('.keyword-input').value.trim();

        if (columnIndex === '' || keyword === '') {
            continue;
        }

        conditions.push({
            columnIndex: parseInt(columnIndex),
            columnName: headers[columnIndex],
            keyword: keyword
        });
    }

    if (conditions.length === 0) {
        alert('请完整填写至少一个搜索条件（列名和关键词）！');
        return;
    }

    // 获取匹配逻辑
    const logic = document.querySelector('input[name="logic"]:checked').value;

    // 执行搜索
    searchResults = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let matches = conditions.map(cond => {
            const cellValue = String(row[cond.columnIndex] || '');
            return cellValue.includes(cond.keyword);
        });

        // 根据逻辑判断是否匹配
        let isMatch = false;
        if (logic === 'and') {
            isMatch = matches.every(m => m);
        } else {
            isMatch = matches.some(m => m);
        }

        if (isMatch) {
            searchResults.push({
                index: i,
                row: row,
                matches: conditions.map((cond, idx) => ({
                    columnName: cond.columnName,
                    keyword: cond.keyword,
                    matched: matches[idx]
                }))
            });
        }
    }

    // 显示结果
    displayResults(conditions, logic);
}

// 显示搜索结果
function displayResults(conditions, logic) {
    const resultsDiv = document.getElementById('searchResults');
    const exportArea = document.querySelector('.export-area');

    if (searchResults.length === 0) {
        resultsDiv.innerHTML = `
            <div class="result-header error">
                未找到匹配的数据
            </div>
        `;
        exportArea.style.display = 'none';
        document.getElementById('step4').style.display = 'block';
        document.getElementById('step4').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    // 生成搜索条件说明
    const conditionsText = conditions.map(c => `"${c.columnName}" 包含 "${c.keyword}"`).join(logic === 'and' ? ' 且 ' : ' 或 ');

    // 只显示前5行数据
    const displayResults = searchResults.slice(0, 5);
    const hasMore = searchResults.length > 5;

    let html = `
        <div class="result-header success">
            找到 <strong>${searchResults.length}</strong> 条匹配数据${hasMore ? `，仅显示前 <strong>5</strong> 条` : ''}
            <div class="search-summary">搜索条件：${conditionsText}</div>
        </div>
        <div class="table-wrapper">
            <table class="data-table result-table">
                <thead>
                    <tr>
                        <th>#</th>
                        ${headers.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${displayResults.map(result => `
                        <tr>
                            <td>${result.index + 1}</td>
                            ${result.row.map((cell, idx) => {
                                let cellHtml = String(cell || '');
                                // 高亮匹配的关键词
                                for (let cond of conditions) {
                                    if (cond.columnIndex === idx) {
                                        cellHtml = highlightText(cellHtml, cond.keyword);
                                    }
                                }
                                return `<td>${cellHtml}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${hasMore ? `<p class="preview-note">仅显示前 5 条数据，导出时将包含全部 ${searchResults.length} 条数据</p>` : ''}
    `;

    resultsDiv.innerHTML = html;
    exportArea.style.display = 'block';
    document.getElementById('step4').style.display = 'block';
    document.getElementById('step4').scrollIntoView({ behavior: 'smooth' });
}

// 高亮文本
function highlightText(text, keyword) {
    if (!keyword) return text;
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// 转义正则表达式
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 导出结果
function exportResults(format) {
    if (searchResults.length === 0) {
        alert('没有可导出的数据！');
        return;
    }

    // 构建导出数据（包含表头）
    const exportData = [headers];
    searchResults.forEach(result => {
        exportData.push(result.row);
    });

    if (format === 'excel') {
        exportToExcel(exportData);
    } else {
        exportToCsv(exportData);
    }
}

// 导出为 Excel
function exportToExcel(data) {
    try {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '搜索结果');

        // 生成文件名
        const fileName = `表格搜索结果_${getTimestamp()}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        alert(`成功导出 ${searchResults.length} 条数据到 ${fileName}`);
    } catch (error) {
        alert('导出Excel失败: ' + error.message);
    }
}

// 导出为 CSV
function exportToCsv(data) {
    try {
        const csv = Papa.unparse(data);
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const fileName = `表格搜索结果_${getTimestamp()}.csv`;

        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();

        alert(`成功导出 ${searchResults.length} 条数据到 ${fileName}`);
    } catch (error) {
        alert('导出CSV失败: ' + error.message);
    }
}

// 获取时间戳
function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// 补零
function pad(num) {
    return num < 10 ? '0' + num : num;
}
