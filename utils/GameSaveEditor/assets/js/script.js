const PHASMO_GAME_LABEL = '恐鬼症（Phasmophobia）';
const PHASMO_KEY = 't36gref9u84y7f43g';

const fileInput = document.getElementById('fileInput');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileName = document.getElementById('fileName');
const gameSelect = document.getElementById('gameSelect');
const keyInput = document.getElementById('keyInput');
const decryptBtn = document.getElementById('decryptBtn');
const encryptBtn = document.getElementById('encryptBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusMessage = document.getElementById('statusMessage');

let currentFile = null;
let resultBuffer = null;
let resultName = '';
let decryptedData = null; // 存储解密后的JSON数据
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
        try {
            const decoder = new TextDecoder('utf-8');
            const jsonText = decoder.decode(plainBuffer);
            const jsonData = JSON.parse(jsonText);

            decryptedData = jsonData;

            // 加载配置文件并显示表格
            await loadConfigAndDisplayTable();

            setStatus('解密成功，存档数据已解析并显示在下方。', 'success');
        } catch (jsonError) {
            console.error('JSON解析失败:', jsonError);
            setStatus('解密成功，但无法将数据解析为JSON格式。可能不是JSON存档文件。您仍可以下载解密结果。', 'error');
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
        statusMessage.appendChild(tableContainer);
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
        const currentValue = decryptedData[field.FieldName] !== undefined
            ? decryptedData[field.FieldName]
            : field.CurrentValue;

        html += `
            <tr>
                <td><span class="field-category">${field.Categorization}</span></td>
                <td><span class="field-name">${field.FieldName}</span></td>
                <td><span class="field-description">${field.Description}</span></td>
                <td><strong>${currentValue}</strong></td>
                <td>
                    <input
                        type="text"
                        class="field-input"
                        data-field="${field.FieldName}"
                        value="${currentValue}"
                        placeholder="输入新值"
                    >
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

            updatedData[fieldName] = parsedValue;
        }
    });

    setBusy(true);
    setStatus('正在保存并加密，请稍候...');

    try {
        // 将更新后的数据转换为JSON字符串
        const jsonText = JSON.stringify(updatedData);
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

