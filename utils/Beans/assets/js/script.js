// 全局数据 (直接从引入的 JS 或全局变量读取)
let colorData = window.COLOR_DATA;
let brandToHexMap = {}; 
let hexToBrandCodes = {}; 
let availableBrands = new Set(); 
let hexToStandardCodes = {}; 

// CSV 与图片 相关缓存
let originalCsvData = null; 
let replacedCsvData = null; 
let currentFileName = 'replaced_colors'; 
let uploadedImage = null; // 存储上传的图片对象
let currentOwnedHexSet = new Set();
let brandPaletteCache = new Map();

// 手动微调的状态缓存
let manualSelectedRaw = null;         // 原始 CSV 数据中的代号
let manualSelectedTargetHex = null;   // 用户从色卡选中的新 HEX
let manualSelectedTargetCode = null;  // 用户从色卡选中的新代号

window.currentHighlightRaw = null;
window.currentUnmatchedColors = [];

const TOKEN_SPLIT_REGEX = /[\s,，\n]+/;
const TOKEN_CAPTURE_REGEX = /([\s,，\n]+)/;
const RGB_REGEX = /^RGB\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
const DASH_RGB_REGEX = /^(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})$/;

function normalizeCell(value) {
    return String(value ?? '').trim();
}

function splitTokens(value) {
    const text = normalizeCell(value);
    return text ? text.split(TOKEN_SPLIT_REGEX).filter(t => t.trim() !== '') : [];
}

function splitTokensWithDelimiters(value) {
    return normalizeCell(value).split(TOKEN_CAPTURE_REGEX);
}

function isValidRgbChannel(value) {
    return Number.isFinite(value) && value >= 0 && value <= 255;
}

function parseRgbToken(token) {
    const rgbMatch = token.match(RGB_REGEX) || token.match(DASH_RGB_REGEX);
    if (!rgbMatch) return null;
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if (!isValidRgbChannel(r) || !isValidRgbChannel(g) || !isValidRgbChannel(b)) return null;
    return rgbToHex(r, g, b).toUpperCase();
}

function collectUniqueColorsFromCsv(csvData) {
    const uniqueColors = new Set();
    if (!Array.isArray(csvData)) return uniqueColors;
    csvData.forEach(row => {
        if (!Array.isArray(row)) return;
        row.forEach(cell => {
            const val = normalizeCell(cell);
            if (!val) return;
            if (val.toUpperCase() === 'TRANSPARENT') return;
            splitTokens(val).forEach(token => uniqueColors.add(token));
        });
    });
    return uniqueColors;
}

function getCsvDimensions(csvData) {
    if (!Array.isArray(csvData) || csvData.length === 0) return { rows: 0, cols: 0 };
    let maxCols = 0;
    csvData.forEach(row => {
        if (Array.isArray(row)) {
            maxCols = Math.max(maxCols, row.length);
        }
    });
    return { rows: csvData.length, cols: maxCols };
}

function createStatusLine(text, color, fontSize) {
    const line = document.createElement('span');
    line.textContent = text;
    if (color) line.style.color = color;
    if (fontSize) line.style.fontSize = fontSize;
    return line;
}

function setFileStatus(lines) {
    const fileNameEl = document.getElementById('fileName');
    if (!fileNameEl) return;
    fileNameEl.replaceChildren();
    lines.forEach((line, idx) => {
        if (idx > 0) fileNameEl.appendChild(document.createElement('br'));
        fileNameEl.appendChild(line);
    });
}

function appendFileStatusLine(line) {
    const fileNameEl = document.getElementById('fileName');
    if (!fileNameEl) return;
    if (fileNameEl.childNodes.length > 0) {
        fileNameEl.appendChild(document.createElement('br'));
    }
    fileNameEl.appendChild(line);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', () => {
    if (!colorData) {
        alert('错误：未能读取到全局颜色数据 window.COLOR_DATA，请检查数据文件是否正确引入！');
        return;
    }
    buildColorIndex();
    populateBrands();
    initEventListeners();
});

function buildColorIndex() {
    brandToHexMap = {};
    hexToBrandCodes = {};
    availableBrands = new Set();
    hexToStandardCodes = {};
    brandPaletteCache = new Map();

    for (const [hex, brands] of Object.entries(colorData.colorMapping)) {
        const upperHex = hex.toUpperCase();
        hexToStandardCodes[upperHex] = brands['MARD'] || upperHex;

        for (const [brandName, code] of Object.entries(brands)) {
            availableBrands.add(brandName); 
            if (!brandToHexMap[brandName]) brandToHexMap[brandName] = {};
            if (!hexToBrandCodes[brandName]) hexToBrandCodes[brandName] = {};
            const strCode = String(code).toUpperCase().trim();
            brandToHexMap[brandName][strCode] = upperHex;
            brandToHexMap[brandName][brandName.toUpperCase() + strCode] = upperHex;
            if (!hexToBrandCodes[brandName][upperHex]) {
                hexToBrandCodes[brandName][upperHex] = String(code).trim();
            }
        }
    }
}

function populateBrands() {
    const targetSelect = document.getElementById('targetBrandSelect');
    const ownedSelect = document.getElementById('ownedBrandSelect');
    targetSelect.innerHTML = '';
    ownedSelect.innerHTML = '';
    targetSelect.appendChild(new Option('-- 请选择 --', ''));
    ownedSelect.appendChild(new Option('-- 请选择 --', ''));
    if (availableBrands.has('MARD')) {
        targetSelect.appendChild(new Option('MARD', 'MARD'));
        ownedSelect.appendChild(new Option('MARD', 'MARD'));
    }
    for (const brand of availableBrands) {
        if (brand !== 'MARD') {
            targetSelect.appendChild(new Option(brand, brand));
            ownedSelect.appendChild(new Option(brand, brand));
        }
    }
    populateSchemes(ownedSelect.value);
}

function populateSchemes(brand) {
    const select = document.getElementById('schemeSelect');
    select.innerHTML = '<option value="">-- 手动输入 --</option>';
    if (brand && colorData.colorSchemes && colorData.colorSchemes[brand]) {
        for (const schemeName of Object.keys(colorData.colorSchemes[brand])) {
            select.appendChild(new Option(schemeName, schemeName));
        }
    }
}

function initEventListeners() {
    document.getElementById('matchBtn').addEventListener('click', performMatch);
    document.getElementById('ownedBrandSelect').addEventListener('change', e => populateSchemes(e.target.value));

    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');

    fileUploadArea.addEventListener('click', e => { if (e.target.id !== 'fileInput') fileInput.click(); });
    fileInput.addEventListener('change', e => { if (e.target.files.length > 0) handleFileUpload(e.target.files[0]); });
    fileUploadArea.addEventListener('dragover', e => { e.preventDefault(); fileUploadArea.classList.add('drag-over'); });
    fileUploadArea.addEventListener('dragleave', () => fileUploadArea.classList.remove('drag-over'));
    fileUploadArea.addEventListener('drop', e => {
        e.preventDefault(); fileUploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
    });

    document.getElementById('extractImageBtn').addEventListener('click', extractImageGrid);
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('exportImageBtn').addEventListener('click', exportImage);

    initCanvasZoom(); 

    const canvas = document.getElementById('previewCanvas');
    canvas.addEventListener('click', handleCanvasClickForTweak);
    document.getElementById('applyManualTweakBtn').addEventListener('click', applyManualTweak);

    const toggleUnmatchedCheckbox = document.getElementById('toggleUnmatchedCheckbox');
    if (toggleUnmatchedCheckbox) {
        toggleUnmatchedCheckbox.addEventListener('change', (e) => {
            const list = document.getElementById('unmatchedColorsList');
            list.style.display = e.target.checked ? 'flex' : 'none';
            if (!e.target.checked && window.currentHighlightRaw) {
                window.currentHighlightRaw = null;
                document.querySelectorAll('#unmatchedColorsList .color-picker-swatch').forEach(el => el.classList.remove('selected'));
                drawCanvasPreview(originalCsvData, window.currentMatchMapHex);
            }
        });
    }
}

function handleFileUpload(file) {
    const targetBrand = document.getElementById('targetBrandSelect').value;
    if (!targetBrand) {
        alert('请先选择“当前使用的品牌色系”，然后再上传文件！');
        document.getElementById('fileInput').value = ''; return;
    }

    currentFileName = file.name.replace(/\.[^/.]+$/, ""); 

    if (file.name.toLowerCase().endsWith('.csv')) {
        if (typeof Papa === 'undefined') {
            alert('核心组件 PapaParse 未加载！'); return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            Papa.parse(e.target.result, {
                complete: function(results) {
                    originalCsvData = results.data || [];
                    const colorArray = Array.from(collectUniqueColorsFromCsv(originalCsvData));
                    document.getElementById('targetColorsInput').value = colorArray.join('\n');
                    setFileStatus([
                        createStatusLine(`✅ 已读取 CSV: ${file.name}`, '#4caf50'),
                        createStatusLine(`成功提取 ${colorArray.length} 种颜色`, '#888', '0.85em')
                    ]);
                    document.getElementById('imageExtractPanel').style.display = 'none';
                    document.getElementById('fileInput').value = ''; 
                },
                error: function(err) { alert('解析失败: ' + err.message); document.getElementById('fileInput').value = ''; }
            });
        };
        reader.onerror = () => {
            alert('读取文件失败，请重试。');
            document.getElementById('fileInput').value = '';
        };
        reader.readAsText(file); 
        
    } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedImage = new Image();
            uploadedImage.onload = function() {
                document.getElementById('imageExtractPanel').style.display = 'block';
                setFileStatus([
                    createStatusLine(`✅ 已加载图片: ${file.name}`, '#4caf50'),
                    createStatusLine('请在下方设置网格列数并点击提取', '#ffb74d', '0.85em')
                ]);
                document.getElementById('fileInput').value = ''; 
            };
            uploadedImage.onerror = function() {
                alert('图片读取失败，请更换文件。');
                document.getElementById('fileInput').value = '';
            };
            uploadedImage.src = e.target.result;
        };
        reader.onerror = () => {
            alert('读取图片失败，请重试。');
            document.getElementById('fileInput').value = '';
        };
        reader.readAsDataURL(file);
    } else {
        alert('请上传 CSV 或 图片 格式的文件！');
        document.getElementById('fileInput').value = '';
    }
}

function getPaletteForBrand(brand) {
    const resolvedBrand = brand && hexToBrandCodes[brand] ? brand : (hexToBrandCodes['MARD'] ? 'MARD' : null);
    if (!resolvedBrand) return [];
    if (brandPaletteCache.has(resolvedBrand)) return brandPaletteCache.get(resolvedBrand);
    const brandMap = hexToBrandCodes[resolvedBrand] || {};
    const palette = Object.keys(brandMap).map(hex => {
        const rgb = hexToRgbObj(hex);
        return { hex: hex, r: rgb.r, g: rgb.g, b: rgb.b };
    });
    brandPaletteCache.set(resolvedBrand, palette);
    return palette;
}

function hexToRgbObj(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return { r: num >> 16, g: (num >> 8) & 255, b: num & 255 };
}

function findClosestHex(r, g, b, palette) {
    let minDistance = Infinity;
    let closestHex = null;
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const dr = r - p.r;
        const dg = g - p.g;
        const db = b - p.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist === 0) return p.hex;
        if (dist < minDistance) {
            minDistance = dist;
            closestHex = p.hex;
        }
    }
    return closestHex;
}

function getDominantColor(ctx, startX, startY, cellW, cellH) {
    // 留出 20% 的边距，避开网格线，只取中间 60% 的区域进行统计
    const marginX = Math.floor(cellW * 0.2);
    const marginY = Math.floor(cellH * 0.2);
    const width = Math.floor(cellW * 0.6);
    const height = Math.floor(cellH * 0.6);

    if (width <= 0 || height <= 0) return null;

    // 获取该区块的所有像素数据
    const imgData = ctx.getImageData(startX + marginX, startY + marginY, width, height).data;
    const colorCounts = {};
    let maxCount = 0;
    let dominantRGB = null;

    for (let i = 0; i < imgData.length; i += 4) {
        let r = imgData[i];
        let g = imgData[i+1];
        let b = imgData[i+2];
        let a = imgData[i+3];

        if (a < 128) continue; // 忽略透明像素

        // 颜色量化降噪 (将相近的 JPEG 噪点归为同一种颜色，容差设为10)
        const tolerance = 10;
        const qR = Math.round(r / tolerance) * tolerance;
        const qG = Math.round(g / tolerance) * tolerance;
        const qB = Math.round(b / tolerance) * tolerance;

        const key = `${qR},${qG},${qB}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;

        // 记录出现次数最多的颜色
        if (colorCounts[key] > maxCount) {
            maxCount = colorCounts[key];
            // 保留该像素原始的 RGB 值
            dominantRGB = { r, g, b };
        }
    }
    return dominantRGB;
}

// ==========================================
// 核心：从图片中提取网格，并强制转换到目标品牌色库中
// ==========================================
function extractImageGrid() {
    if (!uploadedImage) return;
    
    const cols = parseInt(document.getElementById('imageGridCols').value);
    if (isNaN(cols) || cols <= 0) {
        alert('请输入有效的列数！');
        return;
    }
    
    const targetBrand = document.getElementById('targetBrandSelect').value;
    if (!targetBrand) {
        alert('请在上方选择“当前使用的品牌色系”，提取颜色将自动吸附至该品牌色库。');
        return;
    }

    const palette = getPaletteForBrand(targetBrand);

    if (palette.length === 0) {
        alert('该品牌色库数据为空，无法进行智能色差吸附！');
        return;
    }

    const ignoreWhite = document.getElementById('ignoreWhiteBg').checked;

    const canvas = document.createElement('canvas');
    canvas.width = uploadedImage.width;
    canvas.height = uploadedImage.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(uploadedImage, 0, 0);
    
    // 按比例计算行数 
    const rows = Math.max(1, Math.round(cols * (canvas.height / canvas.width)));
    
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    
    originalCsvData = [];
    const uniqueColors = new Set();
    
    for (let j = 0; j < rows; j++) {
        let rowData = [];
        for (let i = 0; i < cols; i++) {
            const startX = i * cellW;
            const startY = j * cellH;
            
            // 使用全新的主色提取算法，代替单点采样
            const dominantColor = getDominantColor(ctx, startX, startY, cellW, cellH);

            if (!dominantColor) {
                rowData.push('TRANSPARENT');
            } else {
                const { r, g, b } = dominantColor;
                // 纯白背景过滤
                if (ignoreWhite && r > 240 && g > 240 && b > 240) {
                    rowData.push('TRANSPARENT');
                } else {
                    const closestHex = findClosestHex(r, g, b, palette);
                    rowData.push(closestHex);
                    uniqueColors.add(closestHex);
                }
            }
        }
        originalCsvData.push(rowData);
    }
    
    const colorArray = Array.from(uniqueColors);
    document.getElementById('targetColorsInput').value = colorArray.join('\n');
    appendFileStatusLine(createStatusLine(`已成功提取并映射至 ${targetBrand} 色库，共提取到 ${colorArray.length} 种颜色`, '#4caf50', '0.85em'));
    document.getElementById('imageExtractPanel').style.display = 'none';
}
function exportCsv() {
    if (!replacedCsvData) return;
    if (typeof Papa === 'undefined') {
        alert('导出失败：未加载到 PapaParse。');
        return;
    }
    const csv = Papa.unparse(replacedCsvData);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = currentFileName + '_替换后.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function parseInputColors(text, selectedBrand) {
    if (!text) return [];
    const tokens = text.split(TOKEN_SPLIT_REGEX).filter(t => t.trim() !== '');
    const results = [];
    tokens.forEach(token => {
        let t = token.toUpperCase().trim();
        let hex = null;
        const rgbHex = parseRgbToken(t);
        if (rgbHex) hex = rgbHex;
        if (!hex) {
            if (t.startsWith('#') && (t.length === 4 || t.length === 7)) hex = expandHex(t).toUpperCase();
            else if (brandToHexMap[selectedBrand] && brandToHexMap[selectedBrand][t]) hex = brandToHexMap[selectedBrand][t];
        }
        results.push({ originalToken: token, hex: hex });
    });
    return results;
}

function rgbToHex(r, g, b) { return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).padStart(6, '0').toUpperCase(); }
function expandHex(hex) { return hex.length === 4 ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex; }

function performMatch() {
    let targetText = document.getElementById('targetColorsInput').value;
    const ownedText = document.getElementById('ownedColorsInput').value;
    const selectedScheme = document.getElementById('schemeSelect').value;
    const targetBrand = document.getElementById('targetBrandSelect').value;
    const ownedBrand = document.getElementById('ownedBrandSelect').value;

    if (!targetBrand || !ownedBrand) { alert("请选择品牌色系！"); return; }

    // 防御性逻辑：如果输入框为空但 originalCsvData 存在，自动重新生成文本
    if (!targetText.trim() && originalCsvData) {
        const unique = collectUniqueColorsFromCsv(originalCsvData);
        targetText = Array.from(unique).join('\n');
        document.getElementById('targetColorsInput').value = targetText;
    }

    if (!targetText.trim()) { alert("请输入需要替换的颜色！"); return; }

    const targetColors = parseInputColors(targetText, targetBrand);
    if (targetColors.length === 0) {
        alert("未识别到有效颜色，请检查输入格式。");
        return;
    }
    const ownedHexSet = new Set();
    
    if (selectedScheme && colorData.colorSchemes[ownedBrand] && colorData.colorSchemes[ownedBrand][selectedScheme]) {
        colorData.colorSchemes[ownedBrand][selectedScheme].forEach(code => {
            const hex = brandToHexMap[ownedBrand][String(code).toUpperCase()];
            if (hex) ownedHexSet.add(hex);
        });
    }

    parseInputColors(ownedText, ownedBrand).forEach(item => { if (item.hex) ownedHexSet.add(item.hex); });
    currentOwnedHexSet = ownedHexSet;

    const matchResults = targetColors.map(target => {
        if (!target.hex) return { ...target, status: 'unknown' };
        if (ownedHexSet.has(target.hex)) return { ...target, replaceHex: target.hex, status: 'exact' };
        const approximations = colorData.approximateColors[target.hex];
        if (approximations && approximations.length > 0) {
            for (let i = 0; i < approximations.length; i++) {
                const approxHex = approximations[i].toUpperCase();
                if (ownedHexSet.has(approxHex)) return { ...target, replaceHex: approxHex, status: 'approximate' };
            }
        }
        return { ...target, status: 'not_found' };
    });

    renderResults(matchResults);

    if (originalCsvData) {
        const matchMapExport = {}; 
        const matchMapHex = {};    

        matchResults.forEach(res => {
            if (res.status === 'exact' || res.status === 'approximate') {
                const origToken = res.originalToken.toUpperCase();
                matchMapHex[origToken] = res.replaceHex;
                let exportStr = res.replaceHex;
                if (!origToken.startsWith('#') && !origToken.startsWith('RGB')) {
                    if (hexToBrandCodes[ownedBrand] && hexToBrandCodes[ownedBrand][res.replaceHex]) exportStr = hexToBrandCodes[ownedBrand][res.replaceHex];
                    else if (hexToBrandCodes['MARD'] && hexToBrandCodes['MARD'][res.replaceHex]) exportStr = hexToBrandCodes['MARD'][res.replaceHex];
                }
                matchMapExport[origToken] = exportStr;
            }
        });

        const grid = getCsvDimensions(originalCsvData);
        if (!grid.rows || !grid.cols) {
            document.getElementById('previewTweakLayout').style.display = 'none';
            return;
        }

        replacedCsvData = originalCsvData.map(row => {
            if (!Array.isArray(row)) return [];
            return row.map(cell => {
                const val = normalizeCell(cell);
                if (!val || val.toUpperCase() === 'TRANSPARENT') return cell;
                const upperVal = val.toUpperCase();
                if (matchMapExport[upperVal]) return matchMapExport[upperVal];
                const tokens = splitTokensWithDelimiters(val); 
                let hasReplaced = false;
                const newTokens = tokens.map(t => {
                    if (matchMapExport[t.toUpperCase()]) { hasReplaced = true; return matchMapExport[t.toUpperCase()]; }
                    return t;
                });
                return hasReplaced ? newTokens.join('') : cell;
            });
        });

        document.getElementById('previewTitle').textContent = `替换后图纸预览（${grid.cols}×${grid.rows}）：`;
        document.getElementById('previewTweakLayout').style.display = 'flex';

        window.currentMatchMapHex = matchMapHex;
        window.currentMatchMapExport = matchMapExport; 
        
        window.currentUnmatchedColors = [];
        matchResults.forEach(res => {
            if (res.status === 'not_found' || res.status === 'unknown') {
                window.currentUnmatchedColors.push({
                    token: res.originalToken.toUpperCase(),
                    hex: res.hex || '#555555'
                });
            }
        });
        window.currentUnmatchedColors = Array.from(new Map(window.currentUnmatchedColors.map(item => [item.token, item])).values());
        populateUnmatchedColorsList();

        drawCanvasPreview(originalCsvData, matchMapHex);
        resetCanvasZoom();
        initColorPickerGrid(ownedBrand);
        resetManualTweakSelection();
    } else {
        document.getElementById('previewTweakLayout').style.display = 'none';
    }
}

function populateUnmatchedColorsList() {
    const listContainer = document.getElementById('unmatchedColorsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (!window.currentUnmatchedColors || window.currentUnmatchedColors.length === 0) {
        listContainer.innerHTML = '<span style="color: #888; font-size: 0.9rem;">太棒了！所有颜色均已匹配。</span>';
        return;
    }
    window.currentUnmatchedColors.forEach(item => {
        const swatch = document.createElement('div');
        swatch.className = 'color-picker-swatch';
        swatch.style.backgroundColor = item.hex;
        swatch.title = `未匹配代号: ${item.token}`;
        const span = document.createElement('span');
        span.className = 'unmatched-color-text';
        span.textContent = item.token.length > 4 ? item.token.substring(0, 3) + '..' : item.token;
        swatch.appendChild(span);
        swatch.style.display = 'flex';
        swatch.style.alignItems = 'center';
        swatch.style.justifyContent = 'center';
        swatch.addEventListener('click', () => {
            if (window.currentHighlightRaw === item.token) {
                window.currentHighlightRaw = null;
                swatch.classList.remove('selected');
            } else {
                window.currentHighlightRaw = item.token;
                document.querySelectorAll('#unmatchedColorsList .color-picker-swatch').forEach(el => el.classList.remove('selected'));
                swatch.classList.add('selected');
            }
            drawCanvasPreview(originalCsvData, window.currentMatchMapHex);
        });
        listContainer.appendChild(swatch);
    });
}

function renderResults(results) {
    const resultsDiv = document.getElementById('resultsTable');
    document.getElementById('step3').style.display = 'block';
    let html = `<table class="data-table result-table"><thead><tr><th>原始输入</th><th>识别的原始色</th><th>替换建议</th><th>匹配状态</th></tr></thead><tbody>`;
    results.forEach(res => {
        const safeOriginalToken = escapeHtml(res.originalToken);
        const safeHex = res.hex ? escapeHtml(res.hex) : '';
        const safeStandardCode = res.hex && hexToStandardCodes[res.hex] ? escapeHtml(hexToStandardCodes[res.hex]) : '';
        let originalColorHtml = res.hex ? `<div class="color-display"><span class="color-swatch" style="background-color: ${safeHex}"></span><span>${safeHex} ${safeStandardCode ? `(${safeStandardCode})` : ''}</span></div>` : `<span class="error-text">未识别的代码</span>`;
        let replaceColorHtml = '-';
        let statusHtml = '';
        if (res.status === 'exact' || res.status === 'approximate') {
            const safeReplaceHex = escapeHtml(res.replaceHex);
            const standardCode = hexToStandardCodes[res.replaceHex] || '';
            const safeReplaceCode = standardCode ? escapeHtml(standardCode) : '';
            replaceColorHtml = `<div class="color-display"><span class="color-swatch" style="background-color: ${safeReplaceHex}"></span><span>${safeReplaceHex} ${safeReplaceCode ? `(${safeReplaceCode})` : ''}</span></div>`;
            statusHtml = res.status === 'exact' ? `<span class="badge success">精确匹配</span>` : `<span class="badge warning">近似替代</span>`;
        } else if (res.status === 'not_found') {
            statusHtml = `<span class="badge error">库中无替代色</span>`;
        } else {
            statusHtml = `<span class="badge error">格式错误</span>`;
        }
        html += `<tr><td><strong>${safeOriginalToken}</strong></td><td>${originalColorHtml}</td><td>${replaceColorHtml}</td><td>${statusHtml}</td></tr>`;
    });
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
}

let currentZoomScale = 1;
function initCanvasZoom() {
    const container = document.getElementById('previewContainer');
    const canvas = document.getElementById('previewCanvas');
    if (!container || !canvas) return;
    container.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault(); 
            const zoomAmount = e.deltaY > 0 ? -0.1 : 0.1;
            currentZoomScale = Math.max(0.2, Math.min(currentZoomScale + zoomAmount, 5));
            canvas.style.width = (canvas.width * currentZoomScale) + 'px';
        }
    }, { passive: false });
}

function resetCanvasZoom() {
    currentZoomScale = 1;
    const canvas = document.getElementById('previewCanvas');
    if(canvas) canvas.style.width = canvas.width + 'px';
}

function drawCanvasPreview(csvData, matchMapHex) {
    const canvas = document.getElementById('previewCanvas');
    if (!canvas || !csvData || csvData.length === 0 || !matchMapHex) return;
    const grid = getCsvDimensions(csvData);
    if (!grid.rows || !grid.cols) return;
    const ctx = canvas.getContext('2d');
    const M = grid.rows;
    const N = grid.cols;
    const cellSize = 12; 
    canvas.width = N * cellSize;
    canvas.height = M * cellSize;
    const isDayMode = document.body.classList.contains('day-mode');
    const externalBackgroundColor = '#FDFBFF'; 
    const gridLineColor = isDayMode ? '#DDDDDD' : '#4B5563'; 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const highlightRaw = window.currentHighlightRaw;
    for (let j = 0; j < M; j++) {
        const rowData = Array.isArray(csvData[j]) ? csvData[j] : [];
        for (let i = 0; i < N; i++) {
            const cellVal = normalizeCell(rowData[i]).toUpperCase();
            const drawX = i * cellSize;
            const drawY = j * cellSize;
            let isHighlighted = false;
            let isDimmed = false;
            if (highlightRaw) {
                const tokens = splitTokensWithDelimiters(cellVal);
                if (cellVal === highlightRaw || tokens.includes(highlightRaw)) isHighlighted = true;
                else isDimmed = true;
            }
            if (!cellVal || cellVal === 'TRANSPARENT') {
                ctx.fillStyle = externalBackgroundColor;
            } else {
                let hexColor = matchMapHex[cellVal];
                if (!hexColor) {
                    for (let t of splitTokensWithDelimiters(cellVal)) if (matchMapHex[t]) { hexColor = matchMapHex[t]; break; }
                }
                if (!hexColor && (cellVal.startsWith('#') || cellVal.startsWith('RGB'))) hexColor = cellVal;
                ctx.fillStyle = hexColor || '#EF4444'; 
            }
            ctx.globalAlpha = (isDimmed && cellVal && cellVal !== 'TRANSPARENT') ? 0.15 : 1.0;
            ctx.fillRect(drawX, drawY, cellSize, cellSize);
            if (isHighlighted) {
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(drawX + 1, drawY + 1, cellSize - 2, cellSize - 2);
            } else {
                ctx.strokeStyle = gridLineColor;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(drawX + 0.5, drawY + 0.5, cellSize, cellSize);
            }
        }
    }
    ctx.globalAlpha = 1.0; 
}

function getContrastColor(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if(!result) return '#000000';
    const luma = (0.2126 * parseInt(result[1], 16) + 0.7152 * parseInt(result[2], 16) + 0.0722 * parseInt(result[3], 16)) / 255;
    return luma > 0.5 ? '#000000' : '#FFFFFF';
}

function exportImage() {
    if (!originalCsvData || !window.currentMatchMapHex) return;
    const logoImg = new Image();
    logoImg.src = './favicon.png';
    const processExport = () => {
        const grid = getCsvDimensions(originalCsvData);
        if (!grid.rows || !grid.cols) return;
        const M = grid.rows;
        const N = grid.cols;
        const downloadCellSize = 30; 
        const axisSize = 25;         
        const extraMargin = 20;      
        const ownedBrand = document.getElementById('ownedBrandSelect').value;
        const colorStats = {};
        let totalBeads = 0;
        for (let j = 0; j < M; j++) {
            const rowData = Array.isArray(originalCsvData[j]) ? originalCsvData[j] : [];
            for (let i = 0; i < N; i++) {
                let raw = normalizeCell(rowData[i]).toUpperCase();
                if (!raw || raw === 'TRANSPARENT') continue;
                let hex = window.currentMatchMapHex[raw] || ((raw.startsWith('#') || raw.startsWith('RGB')) ? raw : null);
                if (!hex) continue; 
                let displayKey = hexToBrandCodes[ownedBrand]?.[hex] || hexToBrandCodes['MARD']?.[hex] || "";
                if (!displayKey) {
                    for (let brand of availableBrands) if (hexToBrandCodes[brand]?.[hex]) { displayKey = hexToBrandCodes[brand][hex]; break; }
                }
                if (!colorStats[hex]) colorStats[hex] = { count: 0, color: hex, displayKey: displayKey };
                colorStats[hex].count++;
                totalBeads++;
            }
        }
        const colorKeys = Object.keys(colorStats).sort((a,b) => (colorStats[a].displayKey || '').localeCompare(colorStats[b].displayKey || ''));
        const gridW = N * downloadCellSize + axisSize * 2, gridH = M * downloadCellSize + axisSize * 2;
        const titleBarH = Math.floor(80 * Math.max(1.0, Math.min(2.0, gridW / 1000)));
        const statGap = 8, minStatW = 100, statCols = Math.max(1, Math.floor(gridW / (minStatW + statGap)));
        const statW = Math.floor((gridW - (statCols - 1) * statGap) / statCols), statH = 35;
        const statRows = Math.ceil(colorKeys.length / statCols);
        const dW = gridW + extraMargin * 2, dH = titleBarH + gridH + extraMargin * 2 + (statRows * (statH + statGap) + 40) + 35;
        const canvas = document.createElement('canvas'); canvas.width = dW; canvas.height = dH;
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, dW, dH);
        ctx.fillStyle = '#2A2A2A'; ctx.fillRect(0, 0, dW, titleBarH);
        if (logoImg.complete && logoImg.naturalWidth !== 0) ctx.drawImage(logoImg, (titleBarH*0.8 - titleBarH*0.6)/2+10, (titleBarH - titleBarH*0.6)/2, titleBarH*0.6, titleBarH*0.6);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `600 ${Math.max(20, Math.floor(Math.max(28, Math.floor(28 * (gridW/1000))) * 0.8))}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('Beans', titleBarH*0.8 + titleBarH*0.3, titleBarH*0.4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.font = `400 ${Math.max(12, Math.floor(Math.max(28, Math.floor(28 * (gridW/1000))) * 0.45))}px sans-serif`;
        ctx.fillText('拼豆图纸颜色替换生成工具', titleBarH*0.8 + titleBarH*0.3, titleBarH*0.65);
        const gAX = extraMargin, gAY = titleBarH + extraMargin;
        ctx.fillStyle = '#F8F9FA'; ctx.fillRect(gAX, gAY, gridW, axisSize); ctx.fillRect(gAX, gAY+gridH-axisSize, gridW, axisSize); ctx.fillRect(gAX, gAY, axisSize, gridH); ctx.fillRect(gAX+gridW-axisSize, gAY, axisSize, gridH);
        ctx.fillStyle = '#495057'; ctx.font = `bold ${Math.max(10, Math.floor(axisSize * 0.45))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < N; i++) { let cx = gAX + axisSize + i * downloadCellSize + downloadCellSize/2; ctx.fillText(i+1, cx, gAY+axisSize/2); ctx.fillText(i+1, cx, gAY+gridH-axisSize/2); }
        for (let j = 0; j < M; j++) { let cy = gAY + axisSize + j * downloadCellSize + downloadCellSize/2; ctx.fillText(j+1, gAX+axisSize/2, cy); ctx.fillText(j+1, gAX+gridW-axisSize/2, cy); }
        const iSX = gAX + axisSize, iSY = gAY + axisSize;
        ctx.font = `bold ${Math.max(9, Math.floor(downloadCellSize * 0.35))}px sans-serif`;
        for (let j = 0; j < M; j++) {
            const rowData = Array.isArray(originalCsvData[j]) ? originalCsvData[j] : [];
            for (let i = 0; i < N; i++) {
                let r = normalizeCell(rowData[i]).toUpperCase();
                const dX = iSX + i * downloadCellSize, dY = iSY + j * downloadCellSize;
                if (!r || r === 'TRANSPARENT') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(dX, dY, downloadCellSize, downloadCellSize); }
                else {
                    let hex = window.currentMatchMapHex[r] || r;
                    ctx.fillStyle = hex; ctx.fillRect(dX, dY, downloadCellSize, downloadCellSize);
                    let dk = colorStats[hex]?.displayKey || "";
                    if (dk) { ctx.fillStyle = getContrastColor(hex); ctx.fillText(dk, dX + downloadCellSize/2, dY + downloadCellSize/2); }
                }
                ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.5; ctx.strokeRect(dX, dY, downloadCellSize, downloadCellSize);
            }
        }
        const sY = gAY + gridH + extraMargin + 10;
        colorKeys.forEach((key, idx) => {
            const rI = Math.floor(idx / statCols), cI = idx % statCols, iX = extraMargin + (cI * (statW + statGap)), rowY = sY + (rI * (statH + statGap));
            const cD = colorStats[key]; ctx.fillStyle = cD.color; ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
            if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(iX, rowY, statW, statH, 4); ctx.fill(); ctx.stroke(); }
            else { ctx.fillRect(iX, rowY, statW, statH); ctx.strokeRect(iX, rowY, statW, statH); }
            ctx.fillStyle = getContrastColor(cD.color); ctx.font = `bold 14px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${cD.displayKey || '-'} (${cD.count})`, iX + statW / 2, rowY + statH / 2);
        });
        ctx.fillStyle = '#333333'; ctx.font = `bold 16px sans-serif`; ctx.textAlign = 'right'; ctx.fillText(`总计: ${totalBeads} 颗`, dW - extraMargin, sY + statRows * (statH+statGap) + 20);
        const link = document.createElement('a'); link.download = currentFileName + '_替换后图纸.png'; link.href = canvas.toDataURL('image/png'); link.click();
    };
    logoImg.complete ? processExport() : (logoImg.onload = processExport, logoImg.onerror = processExport);
}

function initColorPickerGrid(brand) {
    const grid = document.getElementById('colorPickerGrid');
    grid.innerHTML = '';
    const brandCodeMap = hexToBrandCodes[brand] || hexToBrandCodes['MARD'] || {};
    const filtered = Object.entries(brandCodeMap).filter(([hex]) => currentOwnedHexSet.has(hex)).sort((a, b) => a[1].localeCompare(b[1]));
    if (filtered.length === 0) { grid.innerHTML = '<span style="color: #888;">您的颜色库中暂无可用的品牌颜色</span>'; return; }
    filtered.forEach(([hex, code]) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-picker-swatch'; swatch.style.backgroundColor = hex; swatch.title = `${code} (${hex})`; 
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-picker-swatch').forEach(el => el.classList.remove('selected'));
            swatch.classList.add('selected'); manualSelectedTargetHex = hex; manualSelectedTargetCode = code; checkTweakButtonState();
        });
        grid.appendChild(swatch);
    });
}

function handleCanvasClickForTweak(e) {
    if (!originalCsvData || !window.currentMatchMapHex) return;
    const canvas = document.getElementById('previewCanvas'), rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
    const cellSize = 12, col = Math.floor(x / cellSize), row = Math.floor(y / cellSize);
    const grid = getCsvDimensions(originalCsvData);
    if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) {
        const rowData = Array.isArray(originalCsvData[row]) ? originalCsvData[row] : [];
        const raw = normalizeCell(rowData[col]).toUpperCase();
        if (raw && raw !== 'TRANSPARENT') {
            manualSelectedRaw = raw;
            const currentHex = window.currentMatchMapHex[raw] || raw;
            const currentExport = window.currentMatchMapExport[raw] || raw;
            const db = document.getElementById('selectedOriginalDisplay');
            db.style.backgroundColor = currentHex; db.style.borderStyle = 'solid'; db.style.color = getContrastColor(currentHex); db.textContent = currentExport;
            document.getElementById('selectedOriginalCode').textContent = `原输入: ${raw}`;
            checkTweakButtonState();
        }
    }
}

function checkTweakButtonState() {
    const btn = document.getElementById('applyManualTweakBtn');
    if (manualSelectedRaw && manualSelectedTargetHex) { btn.disabled = false; btn.textContent = "确认替换选区颜色"; }
    else { btn.disabled = true; }
}

function applyManualTweak() {
    if (!manualSelectedRaw || !manualSelectedTargetHex || !window.currentMatchMapExport || !window.currentMatchMapHex) return;
    window.currentMatchMapHex[manualSelectedRaw] = manualSelectedTargetHex;
    window.currentMatchMapExport[manualSelectedRaw] = manualSelectedTargetCode;
    window.currentUnmatchedColors = window.currentUnmatchedColors.filter(item => item.token !== manualSelectedRaw);
    if (window.currentHighlightRaw === manualSelectedRaw) window.currentHighlightRaw = null;
    populateUnmatchedColorsList();
    drawCanvasPreview(originalCsvData, window.currentMatchMapHex);
    const db = document.getElementById('selectedOriginalDisplay');
    db.style.backgroundColor = manualSelectedTargetHex; db.style.color = getContrastColor(manualSelectedTargetHex); db.textContent = manualSelectedTargetCode;
    const btn = document.getElementById('applyManualTweakBtn'); btn.textContent = "替换成功！可继续选择";
    setTimeout(() => { if(btn.textContent === "替换成功！可继续选择") btn.textContent = "确认替换选区颜色"; }, 2000);
}

function resetManualTweakSelection() {
    manualSelectedRaw = null; manualSelectedTargetHex = null; manualSelectedTargetCode = null;
    const db = document.getElementById('selectedOriginalDisplay');
    db.style.backgroundColor = 'transparent'; db.style.borderStyle = 'dashed'; db.style.color = '#888';
    document.getElementById('selectedOriginalCode').textContent = '原始代号: -'; checkTweakButtonState();
}
