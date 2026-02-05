/*
 * @Description: NCM 转 MP3/FLAC... 核心逻辑 (Vanilla JS + FFmpeg.wasm 0.11.x 单线程版)
 * @Updated: 采用“一任务一重建”策略 (One Instance Per Task)，彻底解决连续转换卡死/状态残留问题
 */

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

self.onmessage = e => {
  for (const data of e.data) {
    try {
      const reader = new FileReaderSync();
      let filebuffer = reader.readAsArrayBuffer(data.file);
      const dataview = new DataView(filebuffer);
      if (dataview.getUint32(0, true) !== 0x4e455443) {
        self.postMessage({ id: data.id, type: "error", message: "非NCM格式" });
        continue;
      }
      let offset = 10;
      const keyLen = dataview.getUint32(offset, true); offset += 4;
      const keyCipher = new Uint8Array(filebuffer, offset, keyLen).map(u => u ^ 0x64); offset += keyLen;
      const keyPlain = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.lib.WordArray.create(keyCipher) }, CORE_KEY, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
      const keyResult = new Uint8Array(keyPlain.sigBytes);
      const words = keyPlain.words;
      for (let i = 0; i < keyPlain.sigBytes; i++) keyResult[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      const keyData = keyResult.slice(17);
      const box = new Uint8Array(Array(256).keys());
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (box[i] + j + keyData[i % keyData.length]) & 0xff;
        [box[i], box[j]] = [box[j], box[i]];
      }
      const keyBox = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
         let si = box[(i + 1) & 0xff], sj = box[((i + 1) + si) & 0xff];
         keyBox[i] = box[(si + sj) & 0xff];
      }
      const metaLen = dataview.getUint32(offset, true); offset += 4;
      let musicMeta = { album: "未知专辑", artist: [["未知艺术家"]], musicName: "未知歌曲", format: undefined, albumPic: "" };
      if (metaLen > 0) {
        const metaCipher = new Uint8Array(filebuffer, offset, metaLen).map(d => d ^ 0x63); offset += metaLen;
        const metaBase64 = CryptoJS.lib.WordArray.create(metaCipher.slice(22)).toString(CryptoJS.enc.Utf8);
        const metaPlain = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(metaBase64) }, META_KEY, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
        try {
            const jsonStr = metaPlain.toString(CryptoJS.enc.Utf8).slice(6);
            musicMeta = { ...musicMeta, ...JSON.parse(jsonStr) };
        } catch(e) {}
      }
      offset += dataview.getUint32(offset + 5, true) + 13;
      const audioData = new Uint8Array(filebuffer, offset);
      for (let cur = 0; cur < audioData.length; ++cur) audioData[cur] ^= keyBox[cur & 0xff];
      if (!musicMeta.format) musicMeta.format = (audioData[0] === 0x66) ? "flac" : "mp3";
      const blob = new Blob([audioData], { type: "audio/mpeg" });
      self.postMessage({ id: data.id, type: "success", payload: { meta: musicMeta, url: URL.createObjectURL(blob), fileName: data.file.name } });
    } catch (err) { self.postMessage({ id: data.id, type: "error", message: err.message }); }
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
        this.formatSelect = document.getElementById('formatSelect');
        this.clearBtn = document.getElementById('clearBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');

        // Modal Elements
        this.modal = document.getElementById('metadataModal');
        this.modalCloseBtn = this.modal.querySelector('.modal-close-btn');
        this.modalCover = document.getElementById('modalCover');
        this.modalInfoList = document.getElementById('modalInfoList');

        this.worker = null;
        this.ffmpeg = null;
        this.taskIdCounter = 0;
        this.convertedFiles = [];
        this.activeTaskKeys = new Set();
        this.taskIdToKey = {};

        this.transcodeQueue = [];
        this.isProcessing = false;

        this.initWorker();
        // 注意：我们不再在构造函数里预加载 FFmpeg，改为在任务开始时按需加载
        this.bindEvents();
    }

    initWorker() {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = (e) => {
            const { id, type, payload, message } = e.data;
            if (type === 'success') this.handleDecryptionSuccess(id, payload);
            else this.handleError(id, message);
        };
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`) || (window.FFmpeg && window.FFmpeg.createFFmpeg)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async initFFmpeg() {
        // 如果已经有实例，先销毁
        if (this.ffmpeg) {
            try { this.ffmpeg.exit(); } catch(e) { console.warn(e); }
            this.ffmpeg = null;
        }

        try {
            if (typeof FFmpeg === 'undefined') {
                console.log("Loading FFmpeg 0.11.x script...");
                await this.loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');
            }

            const { createFFmpeg } = FFmpeg;

            // 初始化新实例
            this.ffmpeg = createFFmpeg({
                log: true,
                mainName: 'main', 
                corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
                logger: ({ message }) => console.log("[FFmpeg]", message)
            });

            await this.ffmpeg.load();
        } catch (e) {
            console.error("FFmpeg Init Error", e);
            throw new Error("FFmpeg 组件加载失败: " + e.message);
        }
    }

    bindEvents() {
        this.fileUploadArea.onclick = () => this.fileInput.click();
        
        this.fileUploadArea.ondragover = (e) => {
            e.preventDefault();
            this.fileUploadArea.classList.add('drag-over');
        };
        this.fileUploadArea.ondragleave = () => {
            this.fileUploadArea.classList.remove('drag-over');
        };
        this.fileUploadArea.ondrop = (e) => {
            e.preventDefault();
            this.fileUploadArea.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        };

        this.fileInput.onchange = (e) => this.handleFiles(e.target.files);
        this.clearBtn.onclick = () => this.clearAll();
        this.downloadAllBtn.onclick = () => this.downloadAll();
        
        this.outputList.onclick = (e) => {
            if (e.target.classList.contains('delete-btn')) {
                e.stopPropagation();
                const id = parseInt(e.target.closest('.music-item').id.replace('task-', ''));
                this.deleteTask(id);
            } else {
                const item = e.target.closest('.music-item');
                if (item && !item.classList.contains('error-item')) {
                     const id = parseInt(item.id.replace('task-', ''));
                     this.showMetadata(id);
                }
            }
        };

        this.modalCloseBtn.onclick = () => this.closeModal();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) this.closeModal();
        };
    }

    handleFiles(fileList) {
        const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.ncm'));
        if (!files.length) return;
        const currentTargetFormat = this.formatSelect.value;
        const payload = [];
        files.forEach(file => {
            const key = `${file.name}_${currentTargetFormat}`;
            if (this.activeTaskKeys.has(key)) return;
            const id = this.taskIdCounter++;
            this.activeTaskKeys.add(key);
            this.taskIdToKey[id] = key;
            this.createCard(id, file.name);
            payload.push({ id, file });
        });
        if (payload.length) this.worker.postMessage(payload);
        this.fileInput.value = '';
    }

    createCard(id, fileName) {
        if (this.outputList.querySelector('.empty-placeholder')) this.outputList.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'music-item';
        div.id = `task-${id}`;
        div.innerHTML = `
            <div class="album-cover" style="display:flex;align-items:center;justify-content:center;color:#666">⏳</div>
            <div class="music-info">
                <div class="music-title">${fileName}</div>
                <div class="music-artist">等待解密...</div>
            </div>
            <div class="music-actions">
                <div class="delete-btn">×</div>
            </div>`;
        this.outputList.insertBefore(div, this.outputList.firstChild);
        this.updateStatus();
    }

    async handleDecryptionSuccess(id, data) {
        const target = this.formatSelect.value;
        const original = data.meta.format || 'mp3';
        data.meta.originalFormat = original; 
        
        if (target === original) {
            this.renderSuccessCard(id, data.url, data.meta, original, data.fileName);
            return;
        }

        this.transcodeQueue.push({ id, data, target, original });
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.transcodeQueue.length > 0) {
            const task = this.transcodeQueue.shift();
            try {
                // 执行转换
                await this.transcodeAudio(task);
                
                // 转换后，强制等待一小会，让浏览器 UI 刷新
                await new Promise(r => setTimeout(r, 200)); 
            } catch (error) {
                console.error("Transcode Error:", error);
                this.handleError(task.id, `转换失败: ${error.message || '未知错误'}`);
            } finally {
                // === 核心修改 ===
                // 无论成功还是失败，在处理完一个任务后，彻底销毁 FFmpeg 实例
                // 确保下一个任务在一个全新的环境中运行
                if (this.ffmpeg) {
                    try { 
                        this.ffmpeg.exit(); 
                        console.log("FFmpeg instance destroyed for cleanup.");
                    } catch(e) { console.warn(e); }
                    this.ffmpeg = null;
                }
            }
        }
        this.isProcessing = false;
        this.updateStatus();
    }

    async transcodeAudio({ id, data, target, original }) {
        // 每次都初始化新的 FFmpeg
        await this.initFFmpeg();

        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.querySelector('.music-artist').textContent = `转换中 (${original}->${target})...`;
        }

        const response = await fetch(data.url);
        const buf = new Uint8Array(await response.arrayBuffer());

        const inName = `in_${id}.${original}`;
        const outExt = (target === 'aac' || target === 'alac') ? 'm4a' : target;
        const outName = `out_${id}.${outExt}`;

        this.ffmpeg.FS('writeFile', inName, buf);

        const args = ['-i', inName];
        if (target === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2');
        else if (target === 'aac') args.push('-c:a', 'aac', '-b:a', '192k');
        else if (target === 'wav') args.push('-c:a', 'pcm_s16le');
        else if (target === 'wma') args.push('-c:a', 'wmav2');
        else if (target === 'alac') args.push('-c:a', 'alac');
        else if (target === 'ogg') args.push('-c:a', 'libvorbis');
        
        args.push(outName);

        try {
            await this.ffmpeg.run(...args);
        } catch (e) {
            // 捕获 exit(0)
            if (e.message === 'Program terminated with exit(0)' || (e.name === 'ExitStatus' && e.status === 0)) {
                console.log("FFmpeg success (exit 0).");
            } else {
                throw e;
            }
        }

        // 读取结果
        let result;
        try {
            result = this.ffmpeg.FS('readFile', outName);
        } catch (e) {
            throw new Error("转换未生成输出文件");
        }

        const newUrl = URL.createObjectURL(new Blob([result.buffer], { type: `audio/${target}` }));

        // 此时不需要手动 unlink 了，因为 finally 块会直接销毁整个 FFmpeg 内存
        URL.revokeObjectURL(data.url);

        this.renderSuccessCard(id, newUrl, data.meta, outExt, data.fileName);
    }

    renderSuccessCard(id, url, meta, ext, fileName) {
        const card = document.getElementById(`task-${id}`);
        if (!card) return;
        const title = meta.musicName || fileName.replace('.ncm', '');
        const artist = meta.artist ? meta.artist.map(a => a[0]).join('/') : '未知艺术家';
        const dName = `${artist} - ${title}.${ext}`;
        const coverSrc = meta.albumPic || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+';
        
        this.convertedFiles.push({ id, url, name: dName, meta });

        card.innerHTML = `
            <img src="${coverSrc}" class="album-cover" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+'">
            <div class="music-info">
                <div class="music-title">${title}</div>
                <div class="music-artist">${artist} [${ext.toUpperCase()}]</div>
            </div>
            <div class="music-actions">
                <audio controls src="${url}" class="music-player"></audio>
                <div class="delete-btn">×</div>
            </div>
        `;
        this.updateDownloadBtn();
        this.updateStatus();
    }

    handleError(id, msg) {
        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.classList.add('error-item');
            card.querySelector('.music-artist').innerHTML = `<span style="color:#ff6b6b">${msg}</span>`;
        }
        if (this.taskIdToKey[id]) this.activeTaskKeys.delete(this.taskIdToKey[id]);
    }

    deleteTask(id) {
        const card = document.getElementById(`task-${id}`);
        card?.remove();
        
        const file = this.convertedFiles.find(f => f.id === id);
        if (file) URL.revokeObjectURL(file.url);

        this.convertedFiles = this.convertedFiles.filter(f => f.id !== id);
        if (this.taskIdToKey[id]) this.activeTaskKeys.delete(this.taskIdToKey[id]);
        
        if (this.outputList.children.length === 0) {
            this.outputList.innerHTML = '<div class="empty-placeholder">暂无转换记录</div>';
        }
        
        this.updateDownloadBtn();
        this.updateStatus();
    }

    updateDownloadBtn() {
        this.downloadAllBtn.disabled = !this.convertedFiles.length;
        this.downloadAllBtn.textContent = this.convertedFiles.length > 0 
            ? `下载全部 (${this.convertedFiles.length})` 
            : '下载全部';
    }

    updateStatus() {
        const total = this.outputList.querySelectorAll('.music-item').length;
        this.statusCount.textContent = `${total} 首`;
        this.statusState.textContent = this.isProcessing ? '正在转换...' : '就绪';
    }

    clearAll() {
        this.convertedFiles.forEach(f => URL.revokeObjectURL(f.url));
        this.convertedFiles = [];
        this.activeTaskKeys.clear();
        this.outputList.innerHTML = '<div class="empty-placeholder">暂无转换记录</div>';
        this.updateDownloadBtn();
        this.updateStatus();
    }

    downloadAll() {
        this.convertedFiles.forEach((f, i) => setTimeout(() => {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.name;
            a.click();
        }, i * 500));
    }

    showMetadata(id) {
        const file = this.convertedFiles.find(f => f.id === id);
        if (!file || !file.meta) return;
        
        const { meta } = file;
        const cover = meta.albumPic || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+';
        
        document.getElementById('modalCover').src = cover;
        
        const infoHtml = `
            <div class="info-row"><span class="info-label">歌名</span><span class="info-value">${meta.musicName || '未知'}</span></div>
            <div class="info-row"><span class="info-label">歌手</span><span class="info-value">${meta.artist ? meta.artist.map(a => a[0]).join(' / ') : '未知'}</span></div>
            <div class="info-row"><span class="info-label">专辑</span><span class="info-value">${meta.album || '未知'}</span></div>
            <div class="info-row"><span class="info-label">原始格式</span><span class="info-value">${meta.originalFormat || 'N/A'}</span></div>
        `;
        
        this.modalInfoList.innerHTML = infoHtml;
        this.modal.classList.remove('hidden');
        requestAnimationFrame(() => this.modal.classList.add('show'));
    }

    closeModal() {
        this.modal.classList.remove('show');
        setTimeout(() => this.modal.classList.add('hidden'), 300);
    }
}

document.addEventListener('DOMContentLoaded', () => new NCMConverter());