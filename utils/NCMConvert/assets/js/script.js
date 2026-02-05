/*
 * @Description: NCM 转 MP3/FLAC/WAV... 核心逻辑 (Vanilla JS + FFmpeg.wasm)
 * @Date: 2026-02-04
 * @Modified: Added deduplication logic
 */

// Worker 源码保持不变
const WORKER_CODE = `
importScripts(
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/core.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/cipher-core.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/aes.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/mode-ecb.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/enc-base64.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/enc-utf8.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/lib-typedarrays.min.js"
);

const CORE_KEY = CryptoJS.enc.Hex.parse("687a4852416d736f356b496e62617857");
const META_KEY = CryptoJS.enc.Hex.parse("2331346C6A6B5F215C5D2630553C2728");

const audio_mime_type = {
  mp3: "audio/mpeg",
  flac: "audio/flac"
};

const defaultAlbumPic = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

self.onmessage = e => {
  for (const data of e.data) {
    try {
      const reader = new FileReaderSync();
      let filebuffer = reader.readAsArrayBuffer(data.file);
      const dataview = new DataView(filebuffer);

      if (dataview.getUint32(0, true) !== 0x4e455443 || dataview.getUint32(4, true) !== 0x4d414446) {
        self.postMessage({ id: data.id, type: "error", message: "文件格式错误 (非 NCM)" });
        continue;
      }

      let offset = 10;
      const keyLen = dataview.getUint32(offset, true);
      offset += 4;
      const keyCipher = new Uint8Array(filebuffer, offset, keyLen).map(u => u ^ 0x64);
      offset += keyLen;

      const keyPlain = CryptoJS.AES.decrypt(
        { ciphertext: CryptoJS.lib.WordArray.create(keyCipher) },
        CORE_KEY,
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
      );

      const keyResult = new Uint8Array(keyPlain.sigBytes);
      const words = keyPlain.words;
      for (let i = 0; i < keyPlain.sigBytes; i++) {
        keyResult[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      }
      const keyData = keyResult.slice(17);

      const box = new Uint8Array(Array(256).keys());
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (box[i] + j + keyData[i % keyData.length]) & 0xff;
        [box[i], box[j]] = [box[j], box[i]];
      }
      const keyBox = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
         let si = box[(i + 1) & 0xff];
         let sj = box[((i + 1) + si) & 0xff];
         keyBox[i] = box[(si + sj) & 0xff];
      }

      const metaLen = dataview.getUint32(offset, true);
      offset += 4;
      let musicMeta = { album: "未知专辑", artist: [["未知艺术家"]], musicName: "未知歌曲", format: undefined, albumPic: defaultAlbumPic };
      
      if (metaLen > 0) {
        const metaCipher = new Uint8Array(filebuffer, offset, metaLen).map(d => d ^ 0x63);
        offset += metaLen;
        const metaBase64 = CryptoJS.lib.WordArray.create(metaCipher.slice(22)).toString(CryptoJS.enc.Utf8);
        const metaPlain = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(metaBase64) },
            META_KEY,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        try {
            const jsonStr = metaPlain.toString(CryptoJS.enc.Utf8).slice(6);
            const parsed = JSON.parse(jsonStr);
            musicMeta = { ...musicMeta, ...parsed };
            if (musicMeta.albumPic) musicMeta.albumPic = musicMeta.albumPic.replace("http:", "https:");
        } catch(e) { console.warn("Meta parse error", e); }
      }

      offset += dataview.getUint32(offset + 5, true) + 13;
      const audioData = new Uint8Array(filebuffer, offset);
      for (let cur = 0; cur < audioData.length; ++cur) {
        audioData[cur] ^= keyBox[cur & 0xff];
      }

      if (!musicMeta.format) {
        if (audioData[0] === 0x66 && audioData[1] === 0x4c && audioData[2] === 0x61 && audioData[3] === 0x43) {
            musicMeta.format = "flac";
        } else {
            musicMeta.format = "mp3";
        }
      }

      const blob = new Blob([audioData], { type: audio_mime_type[musicMeta.format] });
      const url = URL.createObjectURL(blob);

      self.postMessage({
        id: data.id,
        type: "success",
        payload: { meta: musicMeta, url: url, fileName: data.file.name }
      });

    } catch (err) {
      self.postMessage({ id: data.id, type: "error", message: err.message });
    }
  }
};
`;

class NCMConverter {
    constructor() {
        this.fileInput = document.getElementById('fileInput');
        this.fileUploadArea = document.getElementById('fileUploadArea');
        this.outputList = document.getElementById('outputList');
        this.statusCount = document.getElementById('statusCount');
        this.statusState = document.getElementById('statusState');
        this.clearBtn = document.getElementById('clearBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        this.formatSelect = document.getElementById('formatSelect');
        
        // Modal Elements
        this.modalOverlay = document.getElementById('metadataModal');
        this.modalCloseBtn = document.querySelector('.modal-close-btn');
        this.modalCover = document.getElementById('modalCover');
        this.modalInfoList = document.getElementById('modalInfoList');
        
        this.worker = null;
        this.ffmpeg = null;
        this.taskIdCounter = 0;
        
        // 数据结构
        this.convertedFiles = []; // 存储 { id, url, name }
        this.taskSettings = {};   // 存储任务配置 { id: { targetFormat } }
        this.metadataCache = {};  // 存储元数据 { id: metaObject }

        // === 修改点 1: 初始化去重所需的存储结构 ===
        // activeTaskKeys 用于快速判断是否存在 (格式: "文件名_目标格式")
        this.activeTaskKeys = new Set(); 
        // taskIdToKey 用于删除任务时反查 Key
        this.taskIdToKey = {}; 

        this.initWorker();
        this.initFFmpeg();
        this.bindEvents();
    }

    initWorker() {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));

        this.worker.onmessage = (e) => {
            const { id, type, payload, message } = e.data;
            if (type === 'success') {
                this.handleDecryptionSuccess(id, payload);
            } else {
                this.handleError(id, message);
            }
        };

        this.worker.onerror = (e) => {
            console.error("Worker Error:", e);
            this.showNotification("Worker 初始化失败，请检查网络", "error");
        };
    }

    async initFFmpeg() {
        if (typeof FFmpeg === 'undefined') return;
        try {
            const { createFFmpeg } = FFmpeg;
            this.ffmpeg = createFFmpeg({ 
                log: false,
                // Use the single-threaded core to avoid SharedArrayBuffer errors
                corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
                // CRITICAL FIX: Tell the wrapper to use 'main' instead of 'proxy_main'
                mainName: 'main'
            });
        } catch (e) {
            console.error("FFmpeg init error:", e);
        }
    }

    bindEvents() {
        this.fileUploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        // 拖拽
        this.fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.fileUploadArea.classList.add('drag-over');
        });
        this.fileUploadArea.addEventListener('dragleave', () => {
            this.fileUploadArea.classList.remove('drag-over');
        });
        this.fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.fileUploadArea.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.downloadAllBtn.addEventListener('click', () => this.downloadAll());

        // 列表项点击事件委托
        this.outputList.addEventListener('click', (e) => {
            const item = e.target.closest('.music-item');
            if (!item) return;

            const id = parseInt(item.id.replace('task-', ''));

            if (e.target.closest('.delete-btn')) {
                e.stopPropagation();
                this.deleteTask(id);
                return;
            }

            if (e.target.closest('audio') || e.target.closest('a')) {
                return;
            }

            if (this.metadataCache[id]) {
                this.showMetadata(id);
            }
        });

        // Modal 关闭逻辑
        this.modalCloseBtn.addEventListener('click', () => this.closeModal());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.closeModal();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalOverlay.classList.contains('show')) {
                this.closeModal();
            }
        });
    }

    handleFiles(fileList) {
        const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.ncm'));
        
        if (files.length === 0) {
            this.showNotification('请选择 .ncm 格式的文件', 'error');
            return;
        }

        const placeholder = this.outputList.querySelector('.empty-placeholder');
        if (placeholder) placeholder.remove();

        const currentTargetFormat = this.formatSelect.value;
        const workerPayload = [];
        let addedCount = 0;

        files.forEach(file => {
            // === 修改点 2: 上传前进行去重检查 ===
            // 生成唯一 Key：文件名 + 目标格式
            const uniqueKey = `${file.name}_${currentTargetFormat}`;

            // 如果该任务已在列表中（无论是正在处理还是已完成），则跳过
            if (this.activeTaskKeys.has(uniqueKey)) {
                this.showNotification(`已存在: ${file.name} (${currentTargetFormat.toUpperCase()})`, 'error');
                return; // 跳过当前循环
            }

            // 注册任务
            const id = this.taskIdCounter++;
            this.activeTaskKeys.add(uniqueKey);
            this.taskIdToKey[id] = uniqueKey;

            this.taskSettings[id] = { targetFormat: currentTargetFormat };
            this.createCard(id, file.name);
            workerPayload.push({ id, file });
            addedCount++;
        });

        if (workerPayload.length > 0) {
            this.worker.postMessage(workerPayload);
            this.updateStatus(0, '正在处理...');
        }
        
        // 重置 input 防止重复选择相同文件不触发 change 事件
        this.fileInput.value = '';
        this.updateStatus();
    }

    createCard(id, fileName) {
        const div = document.createElement('div');
        div.className = 'music-item';
        div.id = `task-${id}`;
        div.innerHTML = `
            <div class="album-cover" style="background: rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:24px;">⏳</div>
            <div class="music-info">
                <div class="music-title">${fileName}</div>
                <div class="music-artist">正在解密...</div>
            </div>
            <div class="music-actions">
                <div class="delete-btn" title="删除">×</div>
            </div>
        `;
        this.outputList.insertBefore(div, this.outputList.firstChild);
        this.updateStatus();
    }

    async handleDecryptionSuccess(id, data) {
        const settings = this.taskSettings[id];
        const targetFormat = settings ? settings.targetFormat : 'mp3';
        const originalFormat = data.meta.format || 'mp3';
        
        if (this.taskSettings[id]) delete this.taskSettings[id];

        if (targetFormat === originalFormat) {
            this.renderSuccessCard(id, data.url, data.meta, originalFormat, data.fileName);
            return;
        }

        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.querySelector('.music-artist').textContent = `正在转换格式 (${originalFormat} -> ${targetFormat})...`;
        }

        try {
            await this.transcodeAudio(id, data.url, data.meta, originalFormat, targetFormat, data.fileName);
        } catch (error) {
            console.error("Transcode error", error);
            this.handleError(id, `转换失败: ${error.message}`);
        }
    }

    async transcodeAudio(id, blobUrl, meta, inputFormat, targetFormat, originalFileName) {
        if (!this.ffmpeg) throw new Error("组件加载失败");
        if (!this.ffmpeg.isLoaded()) {
            const card = document.getElementById(`task-${id}`);
            if(card) card.querySelector('.music-artist').textContent = "加载转换组件...";
            await this.ffmpeg.load();
        }

        const response = await fetch(blobUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const inputName = `input_${id}.${inputFormat}`;
        let outputExt = targetFormat;
        if (targetFormat === 'aac' || targetFormat === 'alac') outputExt = 'm4a';
        const outputName = `output_${id}.${outputExt}`;

        this.ffmpeg.FS('writeFile', inputName, uint8Array);

        const args = ['-i', inputName];
        if (targetFormat === 'aac') args.push('-c:a', 'aac', '-b:a', '256k');
        else if (targetFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2');
        else if (targetFormat === 'wma') args.push('-c:a', 'wmav2');
        else if (targetFormat === 'alac') args.push('-c:a', 'alac');

        args.push('-map_metadata', '0');
        args.push(outputName);

        await this.ffmpeg.run(...args);

        const data = this.ffmpeg.FS('readFile', outputName);
        
        const mimeMap = {
            mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav',
            ogg: 'audio/ogg', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', ape: 'audio/ape'
        };
        const newBlob = new Blob([data.buffer], { type: mimeMap[outputExt] || 'application/octet-stream' });
        const newUrl = URL.createObjectURL(newBlob);

        this.ffmpeg.FS('unlink', inputName);
        this.ffmpeg.FS('unlink', outputName);
        URL.revokeObjectURL(blobUrl);

        this.renderSuccessCard(id, newUrl, meta, outputExt, originalFileName);
    }

    renderSuccessCard(id, url, meta, ext, fileName) {
        const card = document.getElementById(`task-${id}`);
        if (!card) return;

        const artistName = meta.artist ? meta.artist.map(a => a[0]).join(' / ') : '未知艺术家';
        const songName = meta.musicName || fileName.replace('.ncm', '');
        const downloadName = `${artistName} - ${songName}.${ext}`;

        this.convertedFiles.push({ id, url, name: downloadName });
        this.metadataCache[id] = { ...meta, fileName: downloadName, ext: ext };

        this.updateDownloadBtn();

        card.innerHTML = `
            <img src="${meta.albumPic}" class="album-cover" alt="Cover" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+'">
            <div class="music-info">
                <div class="music-title" title="${songName}">${songName}</div>
                <div class="music-artist" title="${artistName}">${artistName} <span style="font-size:0.8em; opacity:0.7; border:1px solid #fff; border-radius:3px; padding:0 3px;">${ext.toUpperCase()}</span></div>
            </div>
            <div class="music-actions">
                <audio controls src="${url}" class="music-player" style="height:30px;"></audio>
                <div class="delete-btn" title="删除">×</div>
            </div>
        `;

        this.showNotification(`成功: ${songName}`, 'success');
        this.updateStatus();
    }

    deleteTask(id) {
        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'translateX(20px)';
            setTimeout(() => card.remove(), 200);
        }

        const fileIndex = this.convertedFiles.findIndex(f => f.id === id);
        if (fileIndex !== -1) {
            URL.revokeObjectURL(this.convertedFiles[fileIndex].url);
            this.convertedFiles.splice(fileIndex, 1);
        }

        // === 修改点 3: 删除任务时同步清理去重记录 ===
        if (this.taskIdToKey[id]) {
            const key = this.taskIdToKey[id];
            this.activeTaskKeys.delete(key);
            delete this.taskIdToKey[id];
        }

        if (this.metadataCache[id]) delete this.metadataCache[id];
        if (this.taskSettings[id]) delete this.taskSettings[id];

        setTimeout(() => {
            this.updateDownloadBtn();
            this.updateStatus();
            if (this.outputList.children.length === 0) {
                this.clearAll();
            }
        }, 200);
    }

    showMetadata(id) {
        const meta = this.metadataCache[id];
        if (!meta) return;

        this.modalCover.src = meta.albumPic;
        this.modalCover.onerror = function() { this.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+'};

        const fields = [
            { label: '歌曲名', value: meta.musicName || '未知' },
            { label: '艺术家', value: meta.artist ? meta.artist.map(a => a[0]).join(' / ') : '未知' },
            { label: '专辑', value: meta.album || '未知' },
            { label: '输出格式', value: meta.ext.toUpperCase() },
            { label: '原始文件名', value: meta.fileName }
        ];

        this.modalInfoList.innerHTML = fields.map(f => `
            <div class="info-row">
                <span class="info-label">${f.label}</span>
                <span class="info-value">${f.value}</span>
            </div>
        `).join('');

        this.modalOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            this.modalOverlay.classList.add('show');
        });
    }

    closeModal() {
        this.modalOverlay.classList.remove('show');
        setTimeout(() => {
            this.modalOverlay.classList.add('hidden');
        }, 300);
    }

    handleError(id, msg) {
        // === 修改点 4: 出错时也移除去重 Key，允许用户重试 ===
        if (this.taskIdToKey[id]) {
            const key = this.taskIdToKey[id];
            this.activeTaskKeys.delete(key);
            delete this.taskIdToKey[id];
        }

        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.style.borderColor = '#FF6B6B';
            card.innerHTML = `
                <div class="album-cover" style="background: rgba(255,107,107,0.2); display:flex; align-items:center; justify-content:center; font-size:20px;">❌</div>
                <div class="music-info">
                    <div class="music-title">处理失败</div>
                    <div class="music-artist" style="color:#FF6B6B">${msg}</div>
                </div>
                <div class="music-actions">
                     <div class="delete-btn" title="删除">×</div>
                </div>
            `;
        }
        this.updateStatus();
    }

    updateDownloadBtn() {
        const count = this.convertedFiles.length;
        this.downloadAllBtn.disabled = count === 0;
        this.downloadAllBtn.textContent = count > 0 ? `下载全部 (${count})` : '下载全部';
    }

    updateStatus(addedCount = 0, state = null) {
        const total = this.outputList.querySelectorAll('.music-item').length;
        this.statusCount.textContent = `${total} 首`;
        this.statusState.textContent = state || (this.convertedFiles.length > 0 ? '处理完成' : '等待任务');
    }

    clearAll() {
        this.outputList.innerHTML = '<div class="empty-placeholder">暂无转换记录</div>';
        
        this.convertedFiles.forEach(f => URL.revokeObjectURL(f.url));
        this.convertedFiles = [];
        this.metadataCache = {};
        
        // === 修改点 5: 清空所有去重记录 ===
        this.activeTaskKeys.clear();
        this.taskIdToKey = {};

        this.updateDownloadBtn();
        this.statusCount.textContent = '0 首';
        this.statusState.textContent = '等待任务';
    }

    downloadAll() {
        if (this.convertedFiles.length === 0) return;
        
        let delay = 0;
        this.convertedFiles.forEach(file => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = file.url;
                a.download = file.name;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, delay);
            delay += 500;
        });
        
        this.showNotification(`已开始下载 ${this.convertedFiles.length} 个文件`, 'success');
    }

    showNotification(msg, type) {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = msg;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NCMConverter();
});