const PHASMO_GAME_LABEL = '恐鬼症（Phasmophobia）';
const PHASMO_KEY = 't36gref9u84y7f43g';
const YORG_GAME_LABEL = 'yorg.io';
const KITTENS_GAME_LABEL = '猫国建设者（Kittens Game）';

const GAME_PATHS = {
    [PHASMO_GAME_LABEL]: {
        windows: 'C:\\Users\\<用户名>\\AppData\\LocalLow\\Kinetic Games\\Phasmophobia\\SaveFile.txt',
        description: '恐鬼症存档位置'
    },
    [YORG_GAME_LABEL]: {
        windows: 'Steam/steamapps/common/yorg.io/gamesave/data.bin 或游戏内导出为 .bin 文件',
        description: 'yorg.io 存档格式'
    },
    [KITTENS_GAME_LABEL]: { // 新增
        windows: '游戏内选择 选项 -> 导出，将复制的文本保存为 .txt 文件上传',
        description: '猫国建设者存档'
    }
};

const GAME_CONFIG_PATHS = {
    [PHASMO_GAME_LABEL]: './assets/data/phasmophobia.json',
    [YORG_GAME_LABEL]: './assets/data/yorg.json',
    [KITTENS_GAME_LABEL]: './assets/data/kittens.json'
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
let yorgSaveWrapper = null; // yorg 字典格式包装数据
let yorgSaveEntries = null; // yorg 多存档解析数据


function getSelectedGame() {
    return (gameSelect.value || '').trim();
}

function isPhasmoGame(selectedGame) {
    const normalized = (selectedGame || '').toLowerCase();
    return selectedGame === PHASMO_GAME_LABEL || normalized.includes('phasmophobia');
}

function isYorgGame(selectedGame) {
    const normalized = (selectedGame || '').toLowerCase();
    return selectedGame === YORG_GAME_LABEL || normalized === 'yorg.io' || normalized.includes('yorg');
}

function isKittensGame(selectedGame) {
    const normalized = (selectedGame || '').toLowerCase();
    return selectedGame === KITTENS_GAME_LABEL || normalized.includes('kittens');
}

function clearEditTable() {
    const tableContainer = document.getElementById('editTableContainer');
    if (tableContainer) {
        tableContainer.remove();
    }
}


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
    decryptedData = null;
    decryptedJsonText = null;
    configData = null;
    yorgSaveWrapper = null;
    yorgSaveEntries = null;
    clearEditTable();
    clearResult();
    setStatus('');
}

function applyGameKey() {
    const selectedGame = getSelectedGame();
    if (isPhasmoGame(selectedGame)) {
        keyInput.value = PHASMO_KEY;
        keyInput.disabled = false;
        keyInput.placeholder = '输入解密/加密密钥';
    } else if (isYorgGame(selectedGame)) {
        keyInput.value = '';
        keyInput.disabled = true;
        keyInput.placeholder = 'yorg.io 不需要密钥';
    } else if (isKittensGame(selectedGame)) {
        keyInput.value = '';
        keyInput.disabled = true;
        keyInput.placeholder = '猫国建设者不需要密钥';
    } else {
        keyInput.disabled = false;
        keyInput.placeholder = '输入解密/加密密钥';
    }
    clearEditTable();
    updateGamePathHint();
}

function updateGamePathHint() {
    const selectedGame = getSelectedGame();
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

function buildResultName(originalName, suffix, extensionOverride) {
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
    const extension = extensionOverride || (dotIndex > 0 ? originalName.slice(dotIndex) : '.txt');
    return `${base}-${suffix}${extension}`;
}
const LZString = (() => {
    const f = String.fromCharCode;
    const keyStrUriSafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
    const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const baseReverseDic = {};

    function getBaseValue(alphabet, character) {
        if (!baseReverseDic[alphabet]) {
            baseReverseDic[alphabet] = {};
            for (let i = 0; i < alphabet.length; i += 1) {
                baseReverseDic[alphabet][alphabet.charAt(i)] = i;
            }
        }
        return baseReverseDic[alphabet][character];
    }

    function _compress(uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) {
            return '';
        }

        let i;
        let value;
        const dictionary = {};
        const dictionaryToCreate = {};
        let c = '';
        let wc = '';
        let w = '';
        let enlargeIn = 2;
        let dictSize = 3;
        let numBits = 2;
        const data = [];
        let dataVal = 0;
        let dataPosition = 0;

        function writeBit(bit) {
            dataVal = (dataVal << 1) | bit;
            if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0;
                data.push(getCharFromInt(dataVal));
                dataVal = 0;
            } else {
                dataPosition += 1;
            }
        }

        function writeBits(numBitsToWrite, inputValue) {
            let valueToWrite = inputValue;
            for (let j = 0; j < numBitsToWrite; j += 1) {
                writeBit(valueToWrite & 1);
                valueToWrite >>= 1;
            }
        }

        for (i = 0; i < uncompressed.length; i += 1) {
            c = uncompressed.charAt(i);
            if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
                dictionary[c] = dictSize++;
                dictionaryToCreate[c] = true;
            }

            wc = w + c;
            if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
                w = wc;
            } else {
                if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
                    if (w.charCodeAt(0) < 256) {
                        writeBits(numBits, 0);
                        writeBits(8, w.charCodeAt(0));
                    } else {
                        writeBits(numBits, 1);
                        writeBits(16, w.charCodeAt(0));
                    }
                    enlargeIn -= 1;
                    if (enlargeIn === 0) {
                        enlargeIn = Math.pow(2, numBits);
                        numBits += 1;
                    }
                    delete dictionaryToCreate[w];
                } else {
                    writeBits(numBits, dictionary[w]);
                }
                enlargeIn -= 1;
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits += 1;
                }
                dictionary[wc] = dictSize++;
                w = String(c);
            }
        }

        if (w !== '') {
            if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
                if (w.charCodeAt(0) < 256) {
                    writeBits(numBits, 0);
                    writeBits(8, w.charCodeAt(0));
                } else {
                    writeBits(numBits, 1);
                    writeBits(16, w.charCodeAt(0));
                }
                enlargeIn -= 1;
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits += 1;
                }
                delete dictionaryToCreate[w];
            } else {
                writeBits(numBits, dictionary[w]);
            }
            enlargeIn -= 1;
            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits += 1;
            }
        }

        writeBits(numBits, 2);

        while (true) {
            dataVal <<= 1;
            if (dataPosition === bitsPerChar - 1) {
                data.push(getCharFromInt(dataVal));
                break;
            } else {
                dataPosition += 1;
            }
        }

        return data.join('');
    }

    function _decompress(length, resetValue, getNextValue) {
        const dictionary = [];
        let next;
        let enlargeIn = 4;
        let dictSize = 4;
        let numBits = 3;
        let entry = '';
        const result = [];
        let i;
        let w;
        let bits;
        let resb;
        let maxpower;
        let power;
        const data = {
            val: getNextValue(0),
            position: resetValue,
            index: 1
        };

        function readBits(numBitsToRead) {
            let bitsValue = 0;
            let maxpowerValue = Math.pow(2, numBitsToRead);
            let powerValue = 1;
            while (powerValue !== maxpowerValue) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                }
                bitsValue |= (resb > 0 ? 1 : 0) * powerValue;
                powerValue <<= 1;
            }
            return bitsValue;
        }

        for (i = 0; i < 3; i += 1) {
            dictionary[i] = i;
        }

        next = readBits(2);
        switch (next) {
            case 0:
                dictionary[3] = f(readBits(8));
                next = 3;
                break;
            case 1:
                dictionary[3] = f(readBits(16));
                next = 3;
                break;
            case 2:
                return '';
        }

        w = f(dictionary[next]);
        result.push(w);

        while (true) {
            if (data.index > length) {
                return '';
            }

            bits = readBits(numBits);
            switch (next = bits) {
                case 0:
                    dictionary[dictSize++] = f(readBits(8));
                    next = dictSize - 1;
                    enlargeIn -= 1;
                    break;
                case 1:
                    dictionary[dictSize++] = f(readBits(16));
                    next = dictSize - 1;
                    enlargeIn -= 1;
                    break;
                case 2:
                    return result.join('');
            }

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits += 1;
            }

            if (dictionary[next]) {
                entry = dictionary[next];
            } else if (next === dictSize) {
                entry = w + w.charAt(0);
            } else {
                return null;
            }
            result.push(entry);

            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn -= 1;
            w = entry;

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits += 1;
            }
        }
    }

    return {
        compressToEncodedURIComponent(input) {
            if (input == null) {
                return '';
            }
            return _compress(input, 6, (a) => keyStrUriSafe.charAt(a));
        },
        decompressFromEncodedURIComponent(input) {
            if (input == null) {
                return '';
            }
            if (input === '') {
                return null;
            }
            const normalized = input.replace(/ /g, '+');
            return _decompress(normalized.length, 32, (index) =>
                getBaseValue(keyStrUriSafe, normalized.charAt(index))
            );
        },
        compressToBase64(input) {
            if (input == null) return '';
            const res = _compress(input, 6, (a) => keyStrBase64.charAt(a));
            // 补齐等号 padding
            switch (res.length % 4) {
                default:
                case 0: return res;
                case 1: return res + '===';
                case 2: return res + '==';
                case 3: return res + '=';
            }
        },
        decompressFromBase64(input) {
            if (input == null) return '';
            if (input === '') return null;
            return _decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)));
        }
    };
})();

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

function encodeUtf8(text) {
    return utf8Encoder.encode(text);
}

function decodeUtf8(buffer) {
    return utf8Decoder.decode(buffer);
}

function normalizeYorgText(text) {
    return text.replace(/^\uFEFF/, '').replace(/\0/g, '');
}

function fixYorgDecompressedText(text) {
    return text.replace(/^\uFEFF/, '').replace(/\0/g, '{');
}

function getYorgWrapperInfo(rawText) {
    const normalized = normalizeYorgText(rawText).trim();
    if (!normalized) {
        return null;
    }

    try {
        const parsed = JSON.parse(normalized);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const blobKeys = Object.keys(parsed).filter((key) =>
                key.startsWith('savegame_blob_')
            );
            if (blobKeys.length > 0) {
                return { data: parsed, blobKeys };
            }
        }
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
    }

    return null;
}

function parseYorgMetadata(wrapperData) {
    if (!wrapperData || typeof wrapperData.savegame_metadata !== 'string') {
        return { list: null, indexById: new Map() };
    }

    try {
        const parsed = JSON.parse(wrapperData.savegame_metadata);
        if (Array.isArray(parsed)) {
            const indexById = new Map();
            parsed.forEach((item, index) => {
                if (item && typeof item.id === 'string') {
                    indexById.set(item.id, index);
                }
            });
            return { list: parsed, indexById };
        }
    } catch (error) {
        return { list: null, indexById: new Map() };
    }

    return { list: null, indexById: new Map() };
}

function getNestedValue(target, path) {
    if (!target) {
        return undefined;
    }
    return path.split('.').reduce((current, key) => {
        if (!current || typeof current !== 'object' || !(key in current)) {
            return undefined;
        }
        return current[key];
    }, target);
}

function setNestedValue(target, path, value) {
    const keys = path.split('.');
    let current = target;
    keys.slice(0, -1).forEach((key) => {
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    });
    current[keys[keys.length - 1]] = value;
}

function getYorgFieldValue(target, fieldName) {
    if (!target) {
        return undefined;
    }

    if (fieldName === 'PlayerBase level') {
        return target.buildings && target.buildings[0]
            ? target.buildings[0].level
            : undefined;
    }

    if (fieldName === 'All buildings level') {
        if (!Array.isArray(target.buildings) || target.buildings.length === 0) {
            return undefined;
        }
        const levels = target.buildings
            .map((building) => (building ? building.level : undefined))
            .filter((level) => level !== undefined);
        if (levels.length === 0) {
            return undefined;
        }
        const firstLevel = levels[0];
        return levels.every((level) => level === firstLevel) ? firstLevel : null;
    }

    if (fieldName.includes('.')) {
        return getNestedValue(target, fieldName);
    }

    return target[fieldName];
}

function buildYorgFieldInfo(field, target) {
    const value = getYorgFieldValue(target, field.FieldName);
    let displayValue = value;
    let inputValue = value;
    let isComplexType = false;

    if (value === null) {
        displayValue = '混合';
        inputValue = '';
    } else if (value === undefined) {
        displayValue = field.CurrentValue;
        inputValue = field.CurrentValue;
    } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
        inputValue = displayValue;
        isComplexType = true;
    }

    return { displayValue, inputValue, isComplexType };
}

function setYorgFieldValue(target, fieldName, value) {
    if (fieldName === 'PlayerBase level') {
        if (!Array.isArray(target.buildings) || target.buildings.length === 0) {
            throw new Error('未找到 PlayerBase 建筑');
        }
        target.buildings[0].level = value;
        return;
    }

    if (fieldName === 'All buildings level') {
        if (!Array.isArray(target.buildings)) {
            throw new Error('未找到建筑列表');
        }
        target.buildings.forEach((building) => {
            if (building) {
                building.level = value;
            }
        });
        return;
    }

    if (fieldName.includes('.')) {
        setNestedValue(target, fieldName, value);
        return;
    }

    target[fieldName] = value;
}

function buildYorgTableTitle(entry, index) {
    const parts = [`存档 ${index + 1}`];
    if (entry.meta && entry.meta.day !== undefined) {
        parts.push(`Day ${entry.meta.day}`);
    }
    if (entry.meta && entry.meta.gamemode) {
        parts.push(entry.meta.gamemode);
    }
    if (entry.id) {
        parts.push(entry.id);
    }
    return parts.join(' - ');
}

function buildYorgTableHtml(entry, index) {
    const title = buildYorgTableTitle(entry, index);
    let html = `
        <div class="edit-table-header">
            <div class="edit-table-title">${title}</div>
            <div class="edit-table-actions">
                <button class="btn btn-primary save-changes-btn">保存修改并加密</button>
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

    configData.forEach((field) => {
        const info = buildYorgFieldInfo(field, entry.data);
        const displayValue =
            info.displayValue !== undefined && info.displayValue !== null
                ? info.displayValue
                : '';
        const inputValue =
            info.inputValue !== undefined && info.inputValue !== null
                ? info.inputValue
                : '';

        html += `
            <tr>
                <td><span class="field-category">${field.Categorization}</span></td>
                <td><span class="field-name">${field.FieldName}</span></td>
                <td><span class="field-description">${field.Description}</span></td>
                <td><strong>${displayValue}</strong></td>
                <td>
                    ${info.isComplexType ? `
                        <textarea
                            class="field-input field-textarea"
                            data-field="${field.FieldName}"
                            data-save-id="${entry.saveId}"
                            placeholder="输入JSON格式的值"
                            rows="3"
                        >${inputValue}</textarea>
                    ` : `
                        <input
                            type="text"
                            class="field-input"
                            data-field="${field.FieldName}"
                            data-save-id="${entry.saveId}"
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

    return html;
}


function extractYorgCompressedText(rawText) {
    const normalized = normalizeYorgText(rawText).trim();

    if (!normalized) {
        return normalized;
    }

    try {
        const parsed = JSON.parse(normalized);
        if (typeof parsed === 'string') {
            return parsed;
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const blobKey = Object.keys(parsed).find((key) =>
                key.startsWith('savegame_blob_')
            );
            if (!blobKey) {
                throw new Error('未找到 savegame_blob_ 开头的字段');
            }
            const blobValue = parsed[blobKey];
            if (typeof blobValue !== 'string') {
                throw new Error('savegame_blob_ 字段不是字符串');
            }
            return blobValue;
        }
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
    }

    return normalized;
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

    const selectedGame = getSelectedGame();
    if (isYorgGame(selectedGame)) {
        await decryptYorgFile();
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

    const selectedGame = getSelectedGame();
    if (isYorgGame(selectedGame)) {
        await encryptYorgFile();
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

async function decryptKittensFile() {
    setBusy(true);
    setStatus('正在解密，请稍候...');

    try {
        const buffer = await currentFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // 读取外部 txt 内包裹的 Base64 文本
        let rawText = decodeUtf8(bytes).trim();

        // 尝试使用猫国专属的 Base64 解压缩
        const plainText = LZString.decompressFromBase64(rawText);
        if (!plainText) {
            throw new Error('LZ-String 解压失败，可能不是有效的猫国建设者存档');
        }

        const plainBytes = encodeUtf8(plainText);
        // 提供直接下载解密后 JSON 的文件
        setResult(plainBytes.buffer, buildResultName(currentFile.name, 'decrypted', '.json'));

        try {
            const parsed = JSON.parse(plainText);
            decryptedData = parsed;
            decryptedJsonText = plainText;
            setStatus('解密成功，存档数据已解析并显示在下方。', 'success');
            await loadConfigAndDisplayTable();
        } catch (parseError) {
            console.error('解密后 JSON 解析失败:', parseError);
            setStatus('解密成功，但无法解析为 JSON 格式。您仍可以下载纯文本。', 'error');
        }
    } catch (error) {
        console.error('Decrypt failed:', error);
        setStatus(`解密失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

async function decryptYorgFile() {
    setBusy(true);
    setStatus('正在解密，请稍候...');

    try {
        const buffer = await currentFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const rawText = decodeUtf8(bytes);
        yorgSaveWrapper = null;
        yorgSaveEntries = null;
        const wrapperInfo = getYorgWrapperInfo(rawText);

        if (wrapperInfo) {
            const metadataInfo = parseYorgMetadata(wrapperInfo.data);
            yorgSaveWrapper = {
                data: wrapperInfo.data,
                blobKeys: wrapperInfo.blobKeys,
                metadata: metadataInfo.list
            };

            yorgSaveEntries = wrapperInfo.blobKeys.map((blobKey, index) => {
                const compressedText = wrapperInfo.data[blobKey];
                if (typeof compressedText !== 'string') {
                    throw new Error(`存档 ${blobKey} 内容不是字符串`);
                }
                const plainText = LZString.decompressFromEncodedURIComponent(compressedText);
                if (plainText === null) {
                    throw new Error(`存档 ${blobKey} 解压失败`);
                }
                const outputText = fixYorgDecompressedText(plainText);
                let parsedData;
                try {
                    parsedData = JSON.parse(outputText);
                } catch (parseError) {
                    throw new Error(`存档 ${blobKey} JSON 解析失败`);
                }

                const saveId = blobKey.replace(/^savegame_blob_/, '') || `index-${index + 1}`;
                const metaIndex = metadataInfo.indexById.get(saveId);
                const meta =
                    metaIndex !== undefined && metadataInfo.list
                        ? metadataInfo.list[metaIndex]
                        : null;

                return {
                    id: saveId,
                    saveId,
                    blobKey,
                    data: parsedData,
                    metaIndex: metaIndex ?? null,
                    meta
                };
            });

            decryptedData = yorgSaveEntries[0]?.data || null;
            decryptedJsonText = decryptedData ? JSON.stringify(decryptedData) : null;
            if (decryptedData) {
                setResult(
                    encodeUtf8(JSON.stringify(decryptedData)).buffer,
                    buildResultName(currentFile.name, 'decrypted', '.txt')
                );
            }

            setStatus('解密成功，存档数据已解析并显示在下方。', 'success');
            await loadConfigAndDisplayTable();
            return;
        }

        const compressedText = extractYorgCompressedText(rawText);
        const plainText = LZString.decompressFromEncodedURIComponent(compressedText);
        if (plainText === null) {
            throw new Error('LZ-String 解压失败');
        }
        const outputText = fixYorgDecompressedText(plainText);
        const plainBytes = encodeUtf8(outputText);
        setResult(plainBytes.buffer, buildResultName(currentFile.name, 'decrypted', '.txt'));
        try {
            const parsed = JSON.parse(outputText);
            decryptedData = parsed;
            decryptedJsonText = outputText;
            setStatus('解密成功，存档数据已解析并显示在下方。', 'success');
            await loadConfigAndDisplayTable();
        } catch (parseError) {
            console.error('解密后 JSON 解析失败:', parseError);
            setStatus('解密成功，但无法解析为JSON格式。您仍可以下载解密结果。', 'error');
        }
    } catch (error) {
        console.error('Decrypt failed:', error);
        setStatus(`解密失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

async function encryptYorgFile() {
    setBusy(true);
    setStatus('正在加密，请稍候...');

    try {
        const buffer = await currentFile.arrayBuffer();
        const plainText = decodeUtf8(new Uint8Array(buffer));
        const compressedText = LZString.compressToEncodedURIComponent(plainText);
        const compressedBytes = encodeUtf8(compressedText);
        setResult(compressedBytes.buffer, buildResultName(currentFile.name, 'encrypted', '.bin'));
        setStatus('加密成功，可以下载结果。', 'success');
    } catch (error) {
        console.error('Encrypt failed:', error);
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
        const selectedGame = getSelectedGame();
        const configPath = GAME_CONFIG_PATHS[selectedGame];

        if (!configPath) {
            clearEditTable();
            return;
        }

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

    const selectedGame = getSelectedGame();
    const isYorgSelected = isYorgGame(selectedGame);
    const isKittensSelected = isKittensGame(selectedGame);

    if (isYorgSelected && Array.isArray(yorgSaveEntries) && yorgSaveEntries.length > 0) {
        tableContainer.innerHTML = yorgSaveEntries
            .map((entry, index) => buildYorgTableHtml(entry, index))
            .join('');

        const saveButtons = tableContainer.querySelectorAll('.save-changes-btn');
        saveButtons.forEach((button) => {
            button.addEventListener('click', saveChanges);
        });
        return;
    }

    const saveIdAttr = isYorgSelected ? ' data-save-id="single"' : '';

    // 构建表格HTML
    let html = `
        <div class="edit-table-header">
            <div class="edit-table-title">存档数据编辑</div>
            <div class="edit-table-actions">
                <button class="btn btn-primary save-changes-btn">保存修改并加密</button>
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

        if (isYorgSelected) {
            const info = buildYorgFieldInfo(field, decryptedData);
            displayValue = info.displayValue;
            inputValue = info.inputValue;
            isComplexType = info.isComplexType;
        } else if (decryptedData[field.FieldName] !== undefined) {
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
                            data-field="${field.FieldName}"${saveIdAttr}
                            placeholder="输入JSON格式的值"
                            rows="3"
                        >${inputValue}</textarea>
                    ` : `
                        <input
                            type="text"
                            class="field-input"
                            data-field="${field.FieldName}"${saveIdAttr}
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
    const saveButtons = tableContainer.querySelectorAll('.save-changes-btn');
    saveButtons.forEach((button) => {
        button.addEventListener('click', saveChanges);
    });
}

// 保存修改并重新加密
async function saveChanges() {
    if (!decryptedData || !configData) {
        alert('没有可保存的数据。');
        return;
    }

    const selectedGame = getSelectedGame();
    if (isYorgGame(selectedGame)) {
        await saveYorgChanges();
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

async function saveKittensChanges() {
    const inputs = document.querySelectorAll('.field-input');
    setBusy(true);
    setStatus('正在保存并加密，请稍候...');

    try {
        // 利用 JSON 对象回注来规避格式问题
        let jsonText = decryptedJsonText || JSON.stringify(decryptedData);
        const updates = {};

        inputs.forEach(input => {
            const fieldName = input.dataset.field;
            const newValue = input.value.trim();
            if (newValue !== '') {
                let parsedValue = newValue;
                if (input.classList.contains('field-textarea')) {
                    try { parsedValue = JSON.parse(newValue); } catch (e) { parsedValue = newValue; }
                } else if (!isNaN(newValue) && newValue !== '') {
                    parsedValue = Number(newValue);
                } else if (newValue.toLowerCase() === 'true') {
                    parsedValue = true;
                } else if (newValue.toLowerCase() === 'false') {
                    parsedValue = false;
                }
                updates[fieldName] = parsedValue;
            }
        });

        if (Object.keys(updates).length > 0) {
            const jsonObj = JSON.parse(jsonText);
            for (const [fieldName, newValue] of Object.entries(updates)) {
                // 如果在配置文件里的字段配成了深度获取(如 'resources.0.val')，则用嵌套方法覆盖
                if (fieldName.includes('.')) {
                    setNestedValue(jsonObj, fieldName, newValue);
                } else {
                    jsonObj[fieldName] = newValue;
                }
            }
            jsonText = JSON.stringify(jsonObj);
        }

        // 调用 LZ-String Base64 算法重新压缩存档
        const compressedText = LZString.compressToBase64(jsonText);
        const compressedBytes = encodeUtf8(compressedText);

        const originalName = currentFile ? currentFile.name : 'savefile';
        setResult(compressedBytes.buffer, buildResultName(originalName, 'modified', '.txt'));

        // 刷新缓存数据
        decryptedData = JSON.parse(jsonText);
        setStatus('保存成功！修改已加密，可以下载新的存档文件。', 'success');
    } catch (error) {
        console.error('保存失败:', error);
        setStatus(`保存失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

function parseYorgInputValue(input) {
    const newValue = input.value.trim();
    if (newValue === '') {
        return { hasValue: false, value: undefined };
    }

    let parsedValue = newValue;
    if (input.tagName === 'TEXTAREA') {
        try {
            parsedValue = JSON.parse(newValue);
        } catch (error) {
            parsedValue = newValue;
        }
    } else if (!isNaN(newValue)) {
        parsedValue = Number(newValue);
    } else if (newValue.toLowerCase() === 'true') {
        parsedValue = true;
    } else if (newValue.toLowerCase() === 'false') {
        parsedValue = false;
    }

    return { hasValue: true, value: parsedValue };
}

async function saveYorgChanges() {
    const inputs = document.querySelectorAll('.field-input');
    const hasEntries = Array.isArray(yorgSaveEntries) && yorgSaveEntries.length > 0;
    const entryList = hasEntries
        ? yorgSaveEntries.map((entry) => ({
            ...entry,
            data: JSON.parse(JSON.stringify(entry.data)),
            meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : null
        }))
        : [
            {
                saveId: 'single',
                id: 'single',
                blobKey: null,
                data: JSON.parse(JSON.stringify(decryptedData)),
                metaIndex: null,
                meta: null
            }
        ];
    const entryMap = new Map(entryList.map((entry) => [entry.saveId, entry]));

    setBusy(true);
    setStatus('正在保存并加密，请稍候...');

    try {
        inputs.forEach((input) => {
            const fieldName = input.dataset.field;
            const saveId = input.dataset.saveId || 'single';
            const entry = entryMap.get(saveId);

            if (!entry) {
                return;
            }

            const parsed = parseYorgInputValue(input);
            if (!parsed.hasValue) {
                return;
            }

            setYorgFieldValue(entry.data, fieldName, parsed.value);
            if (fieldName === 'gamemode' && entry.meta) {
                entry.meta.gamemode = parsed.value;
            }
        });

        const originalName = currentFile ? currentFile.name : 'savefile';
        if (hasEntries && yorgSaveWrapper && yorgSaveWrapper.data) {
            const wrapperData = JSON.parse(JSON.stringify(yorgSaveWrapper.data));
            entryList.forEach((entry) => {
                if (!entry.blobKey) {
                    return;
                }
                const jsonText = JSON.stringify(entry.data);
                const compressedText = LZString.compressToEncodedURIComponent(jsonText);
                wrapperData[entry.blobKey] = compressedText;
            });

            if (Array.isArray(yorgSaveWrapper.metadata)) {
                const metadataList = yorgSaveWrapper.metadata.map((item) =>
                    item && typeof item === 'object' ? { ...item } : item
                );
                entryList.forEach((entry) => {
                    if (!entry.data || entry.data.gamemode === undefined) {
                        return;
                    }
                    if (entry.metaIndex !== null && metadataList[entry.metaIndex]) {
                        metadataList[entry.metaIndex] = {
                            ...metadataList[entry.metaIndex],
                            gamemode: entry.data.gamemode
                        };
                        return;
                    }
                    const fallbackIndex = metadataList.findIndex(
                        (item) => item && item.id === entry.id
                    );
                    if (fallbackIndex >= 0) {
                        metadataList[fallbackIndex] = {
                            ...metadataList[fallbackIndex],
                            gamemode: entry.data.gamemode
                        };
                    }
                });
                wrapperData.savegame_metadata = JSON.stringify(metadataList);
                yorgSaveWrapper.metadata = metadataList;
            }

            const wrapperText = JSON.stringify(wrapperData);
            const wrapperBytes = encodeUtf8(wrapperText);
            setResult(wrapperBytes.buffer, buildResultName(originalName, 'modified', '.bin'));

            yorgSaveWrapper.data = wrapperData;
            yorgSaveEntries = entryList;
            decryptedData = entryList[0]?.data || null;
            decryptedJsonText = decryptedData ? JSON.stringify(decryptedData) : null;
        } else {
            const entry = entryList[0];
            const jsonText = JSON.stringify(entry.data);
            const compressedText = LZString.compressToEncodedURIComponent(jsonText);
            const compressedBytes = encodeUtf8(compressedText);
            setResult(compressedBytes.buffer, buildResultName(originalName, 'modified', '.bin'));

            decryptedData = entry.data;
            decryptedJsonText = jsonText;
        }

        setStatus('保存成功！修改已加密，可以下载新的存档文件。', 'success');
    } catch (error) {
        console.error('保存失败:', error);
        setStatus(`保存失败：${error.message || '未知错误'}`, 'error');
    } finally {
        setBusy(false);
    }
}

