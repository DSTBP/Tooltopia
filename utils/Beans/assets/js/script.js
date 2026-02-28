// 全局数据
let colorData = window.COLOR_DATA;
let brandToHexMap = {}; // 按品牌隔离的反向索引: brandName -> { code -> HEX }
let availableBrands = new Set(); // 提取所有可用品牌
let hexToStandardCodes = {}; // 存储 HEX 对应的标准色号名称(供展示用)

window.addEventListener('DOMContentLoaded', async () => {
    await loadColorsData();
    initEventListeners();
});

window.addEventListener('DOMContentLoaded', async () => {
    await loadColorsData();
    initEventListeners();
});

async function loadColorsData() {
    try {
        buildColorIndex();
        populateBrands();
        populateSchemes();
    } catch (error) {
        console.error('加载颜色数据失败:', error);
    }
}

// 建立反向索引：将所有品牌色号映射到对应的 HEX
function buildColorIndex() {
    brandToHexMap = {};
    availableBrands = new Set();
    hexToStandardCodes = {};

    for (const [hex, brands] of Object.entries(colorData.colorMapping)) {
        const upperHex = hex.toUpperCase();
        hexToStandardCodes[upperHex] = brands['MARD'] || upperHex; // 默认展示MARD色号作为标准参考

        // 遍历该颜色的所有品牌别名
        for (const [brandName, code] of Object.entries(brands)) {
            availableBrands.add(brandName); // 收集品牌名称
            
            if (!brandToHexMap[brandName]) {
                brandToHexMap[brandName] = {};
            }
            
            const strCode = String(code).toUpperCase().trim();
            brandToHexMap[brandName][strCode] = upperHex;
            
            // 兼容带有品牌名前缀的写法，例如选择了"漫漫"，输入"漫漫E2"也能识别
            brandToHexMap[brandName][brandName.toUpperCase() + strCode] = upperHex;
        }
    }
}

// 填充品牌选择下拉框
function populateBrands() {
    const targetSelect = document.getElementById('targetBrandSelect');
    const ownedSelect = document.getElementById('ownedBrandSelect');
    
    targetSelect.innerHTML = '';
    ownedSelect.innerHTML = '';
    
    // 优先将 MARD 放在第一位
    if (availableBrands.has('MARD')) {
        targetSelect.appendChild(new Option('MARD', 'MARD'));
        ownedSelect.appendChild(new Option('MARD', 'MARD'));
    }
    
    // 填充其他品牌
    for (const brand of availableBrands) {
        if (brand !== 'MARD') {
            targetSelect.appendChild(new Option(brand, brand));
            ownedSelect.appendChild(new Option(brand, brand));
        }
    }

    // 初始化加载第一个品牌对应的套装
    populateSchemes(ownedSelect.value);
}

// 填充色系下拉框
function populateSchemes(brand) {
    const select = document.getElementById('schemeSelect');
    select.innerHTML = '<option value="">-- 手动输入 --</option>';
    
    // 如果 JSON 中存在该品牌对应的套装数据
    if (colorData.colorSchemes && colorData.colorSchemes[brand]) {
        for (const schemeName of Object.keys(colorData.colorSchemes[brand])) {
            select.appendChild(new Option(schemeName, schemeName));
        }
    }
}

// 事件监听
function initEventListeners() {
    document.getElementById('matchBtn').addEventListener('click', performMatch);
    
    // 当拥有的品牌切换时，重新加载对应的套装列表
    document.getElementById('ownedBrandSelect').addEventListener('change', function(e) {
        populateSchemes(e.target.value);
    });
}

// 解析文本框输入的混合颜色，返回 标准HEX数组 和 原始输入文本数组
function parseInputColors(text, selectedBrand) {
    const tokens = text.split(/[\s,，\n]+/).filter(t => t.trim() !== '');
    const results = [];

    tokens.forEach(token => {
        let t = token.toUpperCase().trim();
        let hex = null;

        // 1. 尝试解析 RGB (如 rgb(255,255,255) 或 255-255-255 )
        const rgbMatch = t.match(/^RGB\((\d+),(\d+),(\d+)\)$/) || t.match(/^(\d+)-(\d+)-(\d+)$/);
        if (rgbMatch) {
            hex = rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]).toUpperCase();
        }

        // 2. 尝试解析 HEX 或 品牌色号
        if (!hex) {
            // 如果是以 # 开头的标准 HEX
            if (t.startsWith('#') && (t.length === 4 || t.length === 7)) {
                hex = expandHex(t);
            } 
            // 否则，在当前选中的品牌字典中查找
            else if (brandToHexMap[selectedBrand] && brandToHexMap[selectedBrand][t]) {
                hex = brandToHexMap[selectedBrand][t];
            }
        }

        results.push({
            originalToken: token,
            hex: hex // 如果找不到对应的 HEX 则为 null
        });
    });

    return results;
}

// 辅助：RGB 转 HEX
function rgbToHex(r, g, b) {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

// 辅助：扩展三位简写HEX (#FFF -> #FFFFFF)
function expandHex(hex) {
    if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex;
}

// 核心匹配逻辑
function performMatch() {
    const targetText = document.getElementById('targetColorsInput').value;
    const ownedText = document.getElementById('ownedColorsInput').value;
    const selectedScheme = document.getElementById('schemeSelect').value;
    
    // 获取用户选择的品牌体系
    const targetBrand = document.getElementById('targetBrandSelect').value;
    const ownedBrand = document.getElementById('ownedBrandSelect').value;

    if (!targetText.trim()) {
        alert("请输入需要替换的原始颜色！");
        return;
    }

    // 1. 获取目标颜色 (传入目标品牌)
    const targetColors = parseInputColors(targetText, targetBrand);

    // 2. 构建拥有的颜色库
    const ownedHexSet = new Set();
    
    // 2.1 从下拉套装中加载 (使用拥有的品牌)
    if (selectedScheme && colorData.colorSchemes[ownedBrand] && colorData.colorSchemes[ownedBrand][selectedScheme]) {
        colorData.colorSchemes[ownedBrand][selectedScheme].forEach(code => {
            // 在对应品牌字典中查找 HEX
            const hex = brandToHexMap[ownedBrand][code.toUpperCase()];
            if (hex) ownedHexSet.add(hex);
        });
    }

    // 2.2 从手动输入框中加载 (使用拥有的品牌)
    const manualOwnedColors = parseInputColors(ownedText, ownedBrand);
    manualOwnedColors.forEach(item => {
        if (item.hex) ownedHexSet.add(item.hex);
    });

    // 3. 开始比对
    const matchResults = targetColors.map(target => {
        if (!target.hex) {
            return { ...target, status: 'unknown' };
        }

        if (ownedHexSet.has(target.hex)) {
            return { ...target, replaceHex: target.hex, status: 'exact', distance: 0 };
        }

        const approximations = colorData.approximateColors[target.hex];
        if (approximations && approximations.length > 0) {
            const availableApproximations = approximations
                .filter(approx => ownedHexSet.has(approx.hex.toUpperCase()))
                .sort((a, b) => a.distance - b.distance);

            if (availableApproximations.length > 0) {
                const bestMatch = availableApproximations[0];
                return { 
                    ...target, 
                    replaceHex: bestMatch.hex.toUpperCase(), 
                    status: 'approximate', 
                    distance: bestMatch.distance 
                };
            }
        }

        return { ...target, status: 'not_found' };
    });

    renderResults(matchResults);
}

// 渲染结果到表格
function renderResults(results) {
    const resultsDiv = document.getElementById('resultsTable');
    document.getElementById('step3').style.display = 'block';

    let html = `
        <table class="data-table result-table">
            <thead>
                <tr>
                    <th>原始输入</th>
                    <th>识别的原始色</th>
                    <th>替换建议</th>
                    <th>匹配状态</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(res => {
        let originalColorHtml = '';
        if (res.hex) {
            const standardCode = hexToStandardCodes[res.hex] || '';
            originalColorHtml = `
                <div class="color-display">
                    <span class="color-swatch" style="background-color: ${res.hex}"></span>
                    <span>${res.hex} ${standardCode ? `(${standardCode})` : ''}</span>
                </div>
            `;
        } else {
            originalColorHtml = `<span class="error-text">未识别的代码</span>`;
        }

        let replaceColorHtml = '-';
        let statusHtml = '';

        if (res.status === 'exact') {
            const standardCode = hexToStandardCodes[res.replaceHex] || '';
            replaceColorHtml = `
                <div class="color-display">
                    <span class="color-swatch" style="background-color: ${res.replaceHex}"></span>
                    <span>${res.replaceHex} ${standardCode ? `(${standardCode})` : ''}</span>
                </div>`;
            statusHtml = `<span class="badge success">精确匹配</span>`;
        } else if (res.status === 'approximate') {
            const standardCode = hexToStandardCodes[res.replaceHex] || '';
            replaceColorHtml = `
                <div class="color-display">
                    <span class="color-swatch" style="background-color: ${res.replaceHex}"></span>
                    <span>${res.replaceHex} ${standardCode ? `(${standardCode})` : ''}</span>
                </div>`;
            statusHtml = `<span class="badge warning">近似替代 (差异度: ${res.distance})</span>`;
        } else if (res.status === 'not_found') {
            statusHtml = `<span class="badge error">库中无替代色</span>`;
        } else {
            statusHtml = `<span class="badge error">格式错误</span>`;
        }

        html += `
            <tr>
                <td><strong>${res.originalToken}</strong></td>
                <td>${originalColorHtml}</td>
                <td>${replaceColorHtml}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
    
    // 滚动到结果区域
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth' });
}