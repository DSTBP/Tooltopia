const PHASMO_GAME_LABEL = '恐鬼症（Phasmophobia）';
const PHASMO_KEY = 't36gref9u84y7f43g';

const GAME_PATHS = {
    '恐鬼症（Phasmophobia）': {
        windows: 'C:\\Users\\<用户名>\\AppData\\LocalLow\\Kinetic Games\\Phasmophobia\\SaveFile.txt',
        description: '恐鬼症存档位置'
    }
};

const fileInput = document.getElementById('fileInput');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileName = document.getElementById('fileName');
const gameSelect = document.getElementById('gameSelect');
const keyInput = document.getElementById('keyInput');
const decryptBtn = document.getElementById('decryptBtn');
const encryptBtn = document.getElementById('encryptBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusMessage = document.getElementById('statusMessage');
const gamePathHint = document.getElementById('gamePathHint');

let currentFile = null;
let resultBuffer = null;
let resultName = '';
let decryptedData = null; // 存储解密后的JSON数据
let decryptedJsonText = null; // 存储原始的JSON文本格式
let configData = null; // 存储配置数据

function setStatus(message, type) {
    if (!statusMessage) {
        return;
    }

    if (!message) {
        statusMessage.innerHTML = '';
        return;
    }

    const className = type ? `result-header ${type}` : 'result-header';
    statusMessage.innerHTML = `<div class="${className}">${message}</div>`;
}

function setBusy(isBusy) {
    decryptBtn.disabled = isBusy;
    encryptBtn.disabled = isBusy;
    if (isBusy) {
        downloadBtn.disabled = true;
    } else {
        downloadBtn.disabled = !resultBuffer;
    }
}

function setResult(buffer, name) {
    resultBuffer = buffer;
    resultName = name;
    downloadBtn.disabled = !resultBuffer;
}

function clearResult() {
    setResult(null, '');
}

function updateFile(file) {
    currentFile = file || null;
    if (file) {
        fileName.textContent = `已选择: ${file.name}`;
    } else {
        fileName.textContent = '';
    }
    clearResult();
    setStatus('');
}

function applyGameKey() {
    const selectedGame = (gameSelect.value || '').trim();
    if (selectedGame.toLowerCase().includes('phasmophobia')) {
        keyInput.value = PHASMO_KEY;
    }
    updateGamePathHint();
}

function updateGamePathHint() {
    const selectedGame = (gameSelect.value || '').trim();
    const gameInfo = GAME_PATHS[selectedGame];

    if (gameInfo) {
        gamePathHint.innerHTML = `
            <strong>${gameInfo.description}</strong><br>
            ${gameInfo.windows}
        `;
        gamePathHint.style.display = 'block';
    } else {
        gamePathHint.innerHTML = '';
        gamePathHint.style.display = 'none';
    }
}

function initUploadArea() {
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        updateFile(file);
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

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            updateFile(file);
        }
    });
}

function buildResultName(originalName, suffix) {
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
    return `${base}-${suffix}.txt`;
}

async function deriveKey(password, iv) {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: iv,
            iterations: 100,
            hash: 'SHA-1'
        },
        baseKey,
        {
            name: 'AES-CBC',
            length: 128
        },
        false,
        ['encrypt', 'decrypt']
    );
}

async function decryptFile() {
    if (!currentFile) {
        alert('请先选择存档文件。');
        return;
    }

    const password = keyInput.value.trim();
    if (!password) {
        alert('请先输入密钥。');
        return;
    }

    if (!crypto || !crypto.subtle) {
        setStatus('当前浏览器不支持 Web Crypto，无法进行解密。', 'error');
        return;
    }

    setBusy(true);
    setStatus('正在解密，请稍候...');

    try {
        const buffer = await currentFile.arrayBuffer();
        if (buffer.byteLength <= 16) {
            throw new Error('存档数据长度不足，无法解析 IV。');
        }

        const raw = new Uint8Array(buffer);
        const iv = raw.slice(0, 16);
        const cipher = raw.slice(16);

        const key = await deriveKey(password, iv);
        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv },
            key,
            cipher
        );

        setResult(plainBuffer, buildResultName(currentFile.name, 'decrypted'));

        // 尝试将解密数据解析为JSON
        const decoder = new TextDecoder('utf-8');
        let jsonText = decoder.decode(plainBuffer);

        // 显示原始文本的前500个字符用于调试
        console.log('解密后的原始文本（前500字符）:', jsonText.substring(0, 500));
        console.log('文本总长度:', jsonText.length);

        // 尝试多种方式解析JSON
        let jsonData = null;
        let parseMethod = '';
        let parsedJsonText = null; // 保存解析成功时使用的文本

        // 方法1: 尝试标准JSON解析
        try {
            console.log('尝试方法1: 标准JSON解析...');
            jsonData = JSON.parse(jsonText);
            parseMethod = '标准JSON';
            parsedJsonText = jsonText;
            console.log('✓ 标准JSON解析成功');
        } catch (e1) {
            console.log('✗ 标准JSON解析失败:', e1.message);

            // 方法2: 清理后再解析
            try {
                console.log('尝试方法2: 清理后的JSON解析...');
                let cleanedText = jsonText;

                // 去除BOM
                if (cleanedText.charCodeAt(0) === 0xFEFF) {
                    cleanedText = cleanedText.substring(1);
                }

                // 去除首尾空白
                cleanedText = cleanedText.trim();

                // 去除空字节
                cleanedText = cleanedText.replace(/\0/g, '');

                jsonData = JSON.parse(cleanedText);
                parseMethod = '清理后的JSON';
                parsedJsonText = cleanedText;
                console.log('✓ 清理后JSON解析成功');
            } catch (e2) {
                console.log('✗ 清理后JSON解析失败:', e2.message);

                // 方法3: 尝试修复C#序列化格式的JSON
                try {
                    console.log('尝试方法3: 修复C#序列化格式...');
                    let fixedText = jsonText.trim();

                    // 去除BOM和空字节
                    if (fixedText.charCodeAt(0) === 0xFEFF) {
                        fixedText = fixedText.substring(1);
                    }
                    fixedText = fixedText.replace(/\0/g, '');

                    // 移除末尾多余的逗号 (trailing commas)
                    fixedText = fixedText.replace(/,(\s*[}\]])/g, '$1');

                    // 修复C#字典格式：{11:15,5:1} -> {"11":15,"5":1}
                    // 匹配 "value" : {数字:数字,...} 格式
                    fixedText = fixedText.replace(
                        /"value"\s*:\s*\{([^{}]+)\}/g,
                        (match, content) => {
                            // 检查是否是数字键值对格式
                            if (/^\d+:\d+/.test(content.trim())) {
                                // 将 11:15,5:1 转换为 "11":15,"5":1
                                const fixed = content.replace(/(\d+):/g, '"$1":');
                                return `"value" : {${fixed}}`;
                            }
                            return match;
                        }
                    );

                    jsonData = JSON.parse(fixedText);
                    parseMethod = '修复C#格式后的JSON';
                    parsedJsonText = fixedText;
                    console.log('✓ 修复C#格式后JSON解析成功');
                } catch (e3) {
                    console.log('✗ 修复C#格式后JSON解析失败:', e3.message);

                    // 方法4: 尝试不同的编码
                    try {
                        console.log('尝试方法4: 使用不同编码...');
                        const decoder2 = new TextDecoder('utf-16le');
                        const altText = decoder2.decode(plainBuffer).trim();
                        jsonData = JSON.parse(altText);
                        parseMethod = 'UTF-16编码的JSON';
                        parsedJsonText = altText;
                        console.log('✓ UTF-16编码JSON解析成功');
                    } catch (e4) {
                        console.log('✗ UTF-16编码JSON解析失败:', e4.message);

                        // 所有方法都失败
                        console.error('所有JSON解析方法都失败了');
                        console.error('最后的错误:', e4);

                        let errorMsg = '解密成功，但无法将数据解析为JSON格式。您仍可以下载解密结果。';

                        setStatus(errorMsg, 'error');
                        return;
                    }
                }
            }
        }

        // 如果成功解析
        if (jsonData) {
            decryptedData = jsonData;
            decryptedJsonText = parsedJsonText; // 保存原始的JSON文本格式
            console.log('JSON解析成功！使用方法:', parseMethod);
            console.log('数据结构键值:', Object.keys(jsonData).slice(0, 10));

            // 先设置状态消息
            setStatus(`解密成功，存档数据已解析（使用${parseMethod}）并显示在下方。`, 'success');

            // 然后加载配置文件并显示表格
            await loadConfigAndDisplayTable();
        }
    } catch (error) {
        console.error('解密失败:', error);
        setStatus(`解密失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

async function encryptFile() {
    if (!currentFile) {
        alert('请先选择存档文件。');
        return;
    }

    const password = keyInput.value.trim();
    if (!password) {
        alert('请先输入密钥。');
        return;
    }

    if (!crypto || !crypto.subtle) {
        setStatus('当前浏览器不支持 Web Crypto，无法进行加密。', 'error');
        return;
    }

    setBusy(true);
    setStatus('正在加密，请稍候...');

    try {
        const buffer = await currentFile.arrayBuffer();
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(password, iv);

        const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv },
            key,
            buffer
        );

        const cipherBytes = new Uint8Array(cipherBuffer);
        const combined = new Uint8Array(iv.length + cipherBytes.length);
        combined.set(iv, 0);
        combined.set(cipherBytes, iv.length);

        setResult(combined.buffer, buildResultName(currentFile.name, 'encrypted'));
        setStatus('加密成功，可以下载结果。', 'success');
    } catch (error) {
        console.error('加密失败:', error);
        setStatus(`加密失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

function downloadResult() {
    if (!resultBuffer) {
        alert('暂无可下载的结果。');
        return;
    }

    const blob = new Blob([resultBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resultName || 'savefile.bin';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

window.addEventListener('load', () => {
    initUploadArea();
    gameSelect.value = PHASMO_GAME_LABEL;
    applyGameKey();
});

gameSelect.addEventListener('input', applyGameKey);
gameSelect.addEventListener('change', applyGameKey);

decryptBtn.addEventListener('click', decryptFile);

encryptBtn.addEventListener('click', encryptFile);

downloadBtn.addEventListener('click', downloadResult);

// 加载配置文件并显示表格
async function loadConfigAndDisplayTable() {
    try {
        const selectedGame = (gameSelect.value || '').trim();
        let configPath = '';

        // 根据选择的游戏确定配置文件路径
        if (selectedGame.toLowerCase().includes('phasmophobia')) {
            configPath = './assets/data/phasmophobia.json';
        } else {
            setStatus('未找到对应游戏的配置文件。', 'error');
            return;
        }

        // 加载配置文件
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error('无法加载配置文件');
        }

        configData = await response.json();
        displayEditTable();
    } catch (error) {
        console.error('加载配置文件失败:', error);
        setStatus('加载配置文件失败：' + error.message, 'error');
    }
}

// 显示编辑表格
function displayEditTable() {
    if (!decryptedData || !configData) {
        return;
    }

    // 创建表格容器
    let tableContainer = document.getElementById('editTableContainer');
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.id = 'editTableContainer';
        tableContainer.className = 'edit-table-container';
        // 追加到 statusMessage 元素之后
        statusMessage.insertAdjacentElement('afterend', tableContainer);
    }

    // 构建表格HTML
    let html = `
        <div class="edit-table-header">
            <div class="edit-table-title">存档数据编辑</div>
            <div class="edit-table-actions">
                <button id="saveChangesBtn" class="btn btn-primary">保存修改并加密</button>
            </div>
        </div>
        <table class="edit-table">
            <thead>
                <tr>
                    <th>分类</th>
                    <th>字段名</th>
                    <th>字段含义</th>
                    <th>当前值</th>
                    <th>修改值</th>
                    <th>修改建议</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 遍历配置数据生成表格行
    configData.forEach((field, index) => {
        // 获取当前值，支持嵌套的 {__type, value} 格式
        let currentValue = field.CurrentValue;
        let displayValue = currentValue;
        let inputValue = currentValue;
        let isComplexType = false;

        if (decryptedData[field.FieldName] !== undefined) {
            const fieldData = decryptedData[field.FieldName];

            // 检查是否为嵌套格式 {__type: "...", value: ...}
            if (typeof fieldData === 'object' && fieldData !== null && 'value' in fieldData) {
                currentValue = fieldData.value;

                // 如果value是对象（如Dictionary），转换为JSON字符串显示
                if (typeof currentValue === 'object' && currentValue !== null) {
                    displayValue = JSON.stringify(currentValue);
                    inputValue = displayValue;
                    isComplexType = true;
                } else {
                    displayValue = currentValue;
                    inputValue = currentValue;
                }
            } else {
                currentValue = fieldData;
                displayValue = currentValue;
                inputValue = currentValue;
            }
        }

        html += `
            <tr>
                <td><span class="field-category">${field.Categorization}</span></td>
                <td><span class="field-name">${field.FieldName}</span></td>
                <td><span class="field-description">${field.Description}</span></td>
                <td><strong>${displayValue}</strong></td>
                <td>
                    ${isComplexType ? `
                        <textarea
                            class="field-input field-textarea"
                            data-field="${field.FieldName}"
                            placeholder="输入JSON格式的值"
                            rows="3"
                        >${inputValue}</textarea>
                    ` : `
                        <input
                            type="text"
                            class="field-input"
                            data-field="${field.FieldName}"
                            value="${inputValue}"
                            placeholder="输入新值"
                        >
                    `}
                </td>
                <td><span class="field-suggestion">${field.Suggestion}</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;

    // 绑定保存按钮事件
    const saveBtn = document.getElementById('saveChangesBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveChanges);
    }
}

// 保存修改并重新加密
async function saveChanges() {
    if (!decryptedData || !configData) {
        alert('没有可保存的数据。');
        return;
    }

    const password = keyInput.value.trim();
    if (!password) {
        alert('请先输入密钥。');
        return;
    }

    // 收集所有修改的值
    const inputs = document.querySelectorAll('.field-input');
    const updatedData = { ...decryptedData };

    inputs.forEach(input => {
        const fieldName = input.dataset.field;
        const newValue = input.value.trim();

        if (newValue !== '') {
            // 尝试将值转换为适当的类型
            let parsedValue = newValue;

            // 检查是否为数字
            if (!isNaN(newValue) && newValue !== '') {
                parsedValue = Number(newValue);
            }
            // 检查是否为布尔值
            else if (newValue.toLowerCase() === 'true') {
                parsedValue = true;
            } else if (newValue.toLowerCase() === 'false') {
                parsedValue = false;
            }

            // 检查原数据是否为嵌套格式 {__type, value}
            const originalData = decryptedData[fieldName];
            if (typeof originalData === 'object' && originalData !== null && 'value' in originalData) {
                // 保持原有的结构，只更新 value
                updatedData[fieldName] = {
                    ...originalData,
                    value: parsedValue
                };
            } else {
                // 直接赋值
                updatedData[fieldName] = parsedValue;
            }
        }
    });

    setBusy(true);
    setStatus('正在保存并加密，请稍候...');

    try {
        // 使用原始的JSON文本格式，通过替换的方式更新值
        let jsonText = decryptedJsonText || JSON.stringify(decryptedData);

        // 收集修改的值
        const updates = {};
        inputs.forEach(input => {
            const fieldName = input.dataset.field;
            const newValue = input.value.trim();

            if (newValue !== '') {
                let parsedValue = newValue;

                if (!isNaN(newValue) && newValue !== '') {
                    parsedValue = Number(newValue);
                }
                else if (newValue.toLowerCase() === 'true') {
                    parsedValue = true;
                } else if (newValue.toLowerCase() === 'false') {
                    parsedValue = false;
                }

                updates[fieldName] = parsedValue;
            }
        });

        // 如果有修改，在原始JSON文本中替换值
        if (Object.keys(updates).length > 0) {
            // 通过JSON对象更新后重新序列化，保持原有的格式结构
            const jsonObj = JSON.parse(jsonText);
            for (const [fieldName, newValue] of Object.entries(updates)) {
                const originalData = decryptedData[fieldName];
                if (typeof originalData === 'object' && originalData !== null && 'value' in originalData) {
                    jsonObj[fieldName] = {
                        ...originalData,
                        value: newValue
                    };
                } else {
                    jsonObj[fieldName] = newValue;
                }
            }
            jsonText = JSON.stringify(jsonObj);
        }

        const encoder = new TextEncoder();
        const buffer = encoder.encode(jsonText);

        // 加密数据
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(password, iv);

        const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv },
            key,
            buffer
        );

        const cipherBytes = new Uint8Array(cipherBuffer);
        const combined = new Uint8Array(iv.length + cipherBytes.length);
        combined.set(iv, 0);
        combined.set(cipherBytes, iv.length);

        // 设置结果
        const originalName = currentFile ? currentFile.name : 'savefile';
        setResult(combined.buffer, buildResultName(originalName, 'modified'));

        // 更新内存中的数据
        decryptedData = updatedData;

        setStatus('保存成功！修改已加密，可以下载新的存档文件。', 'success');
    } catch (error) {
        console.error('保存失败:', error);
        setStatus(`保存失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

