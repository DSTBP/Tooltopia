/*
 * @Description: NCM 转 MP3/FLAC/WAV/M4A/OGG/WMA... 核心逻辑 (包含 LRC 歌词匹配与合并)
 * @Updated: 增加 LRC 自动/手动匹配及元数据注入功能
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
const MIME_MAP = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  m4a: "audio/mp4",
  ape: "audio/ape",
  wma: "audio/x-ms-wma"
};
const resolveMime = (format) => MIME_MAP[format] || "application/octet-stream";

const normalizeFormat = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const bytesMatch = (bytes, offset, pattern) => {
  if (!bytes || bytes.length < offset + pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
};

// Best-effort format sniffing for rare cases where NCM metadata is missing or malformed.
// This helps keep original extension/mime correct (especially for WMA/M4A).
const sniffAudioFormat = (bytes) => {
  // FLAC: "fLaC"
  if (bytesMatch(bytes, 0, [0x66, 0x4C, 0x61, 0x43])) return "flac";

  // APE: "MAC "
  if (bytesMatch(bytes, 0, [0x4D, 0x41, 0x43, 0x20])) return "ape";

  // ASF/WMA Header Object GUID: 75B22630-668E-11CF-A6D9-00AA0062CE6C
  // Bytes on disk (little-endian fields): 30 26 B2 75 8E 66 CF 11 A6 D9 00 AA 00 62 CE 6C
  if (
    bytesMatch(bytes, 0, [
      0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11,
      0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C
    ])
  ) return "wma";

  // OGG: "OggS"
  if (bytesMatch(bytes, 0, [0x4F, 0x67, 0x67, 0x53])) return "ogg";

  // WAV: "RIFF....WAVE"
  if (bytesMatch(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(bytes, 8, [0x57, 0x41, 0x56, 0x45])) return "wav";

  // MP4/M4A: "....ftyp"
  if (bytesMatch(bytes, 4, [0x66, 0x74, 0x79, 0x70])) return "m4a";

  // MP3: "ID3" tag or frame sync (0xFFE?)
  if (bytesMatch(bytes, 0, [0x49, 0x44, 0x33])) return "mp3";
  if (bytes && bytes.length > 2 && bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return "mp3";

  return "";
};

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
      const metaFormat = normalizeFormat(musicMeta.format);
      const sniffedFormat = sniffAudioFormat(audioData);

      // Prefer metadata if it looks reasonable; otherwise fall back to sniffing.
      let finalFormat = metaFormat;
      if (!finalFormat || !MIME_MAP[finalFormat]) {
        finalFormat = sniffedFormat || ((audioData[0] === 0x66) ? "flac" : "mp3");
      }
      musicMeta.format = finalFormat;

      const blob = new Blob([audioData], { type: resolveMime(finalFormat) });
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
        this.ffmpegLoaded = false;
        this.taskIdCounter = 0;
        this.convertedFiles = [];
        this.activeTaskKeys = new Set();
        this.taskIdToKey = {};

        // 歌词存储逻辑
        this.lrcStore = new Map(); // 存储上传的歌词内容: 文件名 -> 内容
        this.taskLrcMap = new Map(); // 任务ID -> 关联的歌词内容
        this.taskTargetFormat = new Map(); // 任务ID -> 目标格式
        this.taskLrcMerged = new Map(); // 任务ID -> 是否已合并歌词

        this.transcodeQueue = [];
        this.isProcessing = false;

        this.initWorker();
        this.bindEvents();

        // 暴露实例给全局，以便 HTML 中的 onclick 事件调用
        window.ncmConverter = this;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    sanitizeFileName(name) {
        const fallback = 'audio';
        if (!name) return fallback;
        const cleaned = String(name)
            .replace(/[/\\]/g, ' & ')
            .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    }

    normalizeText(value, fallback = '') {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || fallback;
    }

    normalizeKey(value) {
        return this.normalizeText(value, '').toLowerCase();
    }

    formatArtist(artistMeta) {
        if (!Array.isArray(artistMeta)) return '';
        const names = artistMeta
            .map(item => Array.isArray(item) ? item[0] : item)
            .filter(name => typeof name === 'string' && name.trim());
        return names.join('/');
    }

    getMimeType(ext) {
        switch (ext) {
            case 'mp3':
                return 'audio/mpeg';
            case 'flac':
                return 'audio/flac';
            case 'wav':
                return 'audio/wav';
            case 'ogg':
                return 'audio/ogg';
            case 'm4a':
                return 'audio/mp4';
            case 'aac':
                return 'audio/aac';
            case 'ape':
                return 'audio/ape';
            case 'wma':
                return 'audio/x-ms-wma';
            default:
                return 'application/octet-stream';
        }
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

    loadScript(src, isReady) {
        return new Promise((resolve, reject) => {
            try {
                if (typeof isReady === 'function' && isReady()) {
                    resolve();
                    return;
                }

                // If a previous attempt failed, the script tag can remain in DOM. Remove it to allow retry.
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) existing.remove();

                const script = document.createElement('script');
                script.src = src;
                script.async = true;

                script.onload = () => {
                    if (typeof isReady === 'function' && !isReady()) {
                        script.remove();
                        reject(new Error(`脚本已加载但未暴露预期对象: ${src}`));
                        return;
                    }
                    resolve();
                };

                script.onerror = () => {
                    script.remove();
                    reject(new Error(`加载脚本失败: ${src}`));
                };

                document.head.appendChild(script);
            } catch (e) {
                reject(e);
            }
        });
    }

    async loadScriptAny(urls, isReady) {
        let lastError;
        for (const url of urls) {
            try {
                await this.loadScript(url, isReady);
                if (typeof isReady !== 'function' || isReady()) return url;
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError || new Error("加载脚本失败");
    }

    describeError(error) {
        if (!error) return '未知错误';
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message || error.name || '未知错误';
        if (typeof error === 'object') {
            if (typeof error.message === 'string' && error.message) return error.message;
            if (typeof error.type === 'string' && error.type) return error.type;
            try { return JSON.stringify(error); } catch (_) { /* ignore */ }
        }
        return String(error);
    }

    async initFFmpeg() {
        // Reuse the loaded instance to avoid repeated downloads and noisy "Program terminated" logs.
        if (this.ffmpeg && this.ffmpegLoaded) return;

        if (this.ffmpeg) {
            try { this.ffmpeg.exit(); } catch(e) { console.warn(e); }
            this.ffmpeg = null;
            this.ffmpegLoaded = false;
        }

        const isFFmpegGlobalReady = () => (
            window.FFmpeg &&
            typeof window.FFmpeg.createFFmpeg === 'function'
        );

        try {
            if (!isFFmpegGlobalReady()) {
                console.log("Loading FFmpeg 0.11.x script...");
                await this.loadScriptAny([
                    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
                    'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js'
                ], isFFmpegGlobalReady);
            }

            if (!isFFmpegGlobalReady()) {
                throw new Error('FFmpeg 全局对象不可用（脚本可能被拦截或加载失败）');
            }

            const { createFFmpeg } = window.FFmpeg;

            const coreCandidates = [
                'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
                'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js'
            ];

            let lastError;
            for (const corePath of coreCandidates) {
                try {
                    this.ffmpeg = createFFmpeg({
                        log: true,
                        mainName: 'main',
                        corePath,
                        logger: ({ message }) => console.log("[FFmpeg]", message)
                    });
                    await this.ffmpeg.load();
                    this.ffmpegLoaded = true;
                    lastError = null;
                    break;
                } catch (e) {
                    console.warn("FFmpeg core load failed:", corePath, e);
                    lastError = e;
                    if (this.ffmpeg) {
                        try { this.ffmpeg.exit(); } catch(err) { console.warn(err); }
                        this.ffmpeg = null;
                    }
                    this.ffmpegLoaded = false;
                }
            }

            if (lastError) throw lastError;
        } catch (e) {
            console.error("FFmpeg Init Error", e);
            throw new Error("FFmpeg 组件加载失败: " + this.describeError(e));
        }
    }

    safeFSUnlink(path) {
        if (!this.ffmpeg || !path) return;
        try { this.ffmpeg.FS('unlink', path); } catch (_) { /* ignore */ }
    }

    destroyFFmpeg() {
        if (!this.ffmpeg) return;
        try { this.ffmpeg.exit(); } catch (e) { console.warn(e); }
        this.ffmpeg = null;
        this.ffmpegLoaded = false;
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
            } else if (e.target.classList.contains('lrc-tag') && e.target.classList.contains('unmatched')) {
                // 处理点击手动匹配歌词
                e.stopPropagation();
                const id = parseInt(e.target.closest('.music-item').id.replace('task-', ''));
                this.bindManualMatch(id);
            } else {
                if (e.target.closest('.music-player')) return;
                if (e.target.closest('.download-btn')) return;
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

    async handleFiles(fileList) {
        const allFiles = Array.from(fileList);
        const ncmFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.ncm'));
        const lrcFiles = allFiles.filter(f => f.name.toLowerCase().endsWith('.lrc'));

        // 1. 预处理上传的歌词文件
        for (const file of lrcFiles) {
            const text = await file.text();
            const baseName = this.normalizeKey(file.name.replace(/\.lrc$/i, ''));
            this.lrcStore.set(baseName, text);
        }

        // 2. 如果只上传了歌词，尝试重新匹配现有任务
        if (!ncmFiles.length && lrcFiles.length > 0) {
            this.reMatchExistingTasks();
            this.fileInput.value = '';
            return;
        }

        const currentTargetFormat = this.formatSelect.value;
        const payload = [];
        
        ncmFiles.forEach(file => {
            const key = `${file.name}_${currentTargetFormat}`;
            if (this.activeTaskKeys.has(key)) return;
            
            const id = this.taskIdCounter++;
            this.activeTaskKeys.add(key);
            this.taskIdToKey[id] = key;
            this.taskTargetFormat.set(id, currentTargetFormat);
            this.taskLrcMerged.delete(id);

            // 自动匹配歌词 (根据 NCM 文件名)
            const baseName = this.normalizeKey(file.name.replace(/\.ncm$/i, ''));
            if (this.lrcStore.has(baseName)) {
                this.taskLrcMap.set(id, this.lrcStore.get(baseName));
            }

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

        const lrcStatus = this.taskLrcMap.has(id) 
            ? '<span class="lrc-tag matched">歌词: 已匹配</span>' 
            : '<span class="lrc-tag unmatched">歌词: 未匹配 (点击手动上传)</span>';
        const safeFileName = this.escapeHtml(fileName);

        div.innerHTML = `
            <div class="album-cover" style="display:flex;align-items:center;justify-content:center;color:#666">⏳</div>
            <div class="music-info">
                <div class="music-title">${safeFileName}</div>
                <div class="music-artist">等待解密...</div>
                <div class="lrc-status-container">${lrcStatus}</div>
            </div>
            <div class="music-actions">
                <div class="delete-btn">×</div>
            </div>`;
        this.outputList.insertBefore(div, this.outputList.firstChild);
        this.updateStatus();
    }

    bindManualMatch(id) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.lrc';
        input.onchange = async (e) => {
            if (e.target.files.length > 0) {
                const text = await e.target.files[0].text();
                this.taskLrcMap.set(id, text);
                const card = document.getElementById(`task-${id}`);
                const tag = card?.querySelector('.lrc-tag');
                if (tag) {
                    tag.className = 'lrc-tag matched';
                    tag.textContent = '歌词: 手动关联';
                    this.taskLrcMerged.delete(id);
                }
            }
        };
        input.click();
    }

    reMatchExistingTasks() {
        this.taskIdToKey && Object.keys(this.taskIdToKey).forEach(idKey => {
            const id = parseInt(idKey);
            const card = document.getElementById(`task-${id}`);
            if (card && !this.taskLrcMap.has(id)) {
                const title = card.querySelector('.music-title').textContent;
                const baseName = this.normalizeKey(title.replace(/\.ncm$/i, ''));
                if (this.lrcStore.has(baseName)) {
                    this.taskLrcMap.set(id, this.lrcStore.get(baseName));
                    const tag = card.querySelector('.lrc-tag');
                    if (tag) {
                        tag.className = 'lrc-tag matched';
                        tag.textContent = '歌词: 自动匹配';
                        this.taskLrcMerged.delete(id);
                    }
                }
            }
        });
    }

    async handleDecryptionSuccess(id, data) {
        if (!this.taskIdToKey[id]) {
            if (data?.url) URL.revokeObjectURL(data.url);
            return;
        }

        const rawTarget = this.taskTargetFormat.get(id) || this.formatSelect.value;
        const target = this.normalizeText(rawTarget, '').toLowerCase();
        // Legacy: older UI used `aac` but actually output `.m4a`.
        const normalizedTarget = (target === 'aac') ? 'm4a' : target;
        const original = this.normalizeText(data.meta.format, 'mp3').toLowerCase();
        data.meta.format = original;
        data.meta.originalFormat = original; 
        
        if (normalizedTarget === original) {
            this.renderSuccessCard(id, data.url, data.meta, original, data.fileName);
            return;
        }

        this.transcodeQueue.push({ id, data, target: normalizedTarget, original });
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.transcodeQueue.length > 0) {
            const task = this.transcodeQueue.shift();
            if (!this.taskIdToKey[task.id]) {
                if (task?.data?.url) URL.revokeObjectURL(task.data.url);
                continue;
            }
            try {
                await this.transcodeAudio(task);
                await new Promise(r => setTimeout(r, 200)); 
            } catch (error) {
                console.error("Transcode Error:", error);
                this.handleError(task.id, `转换失败: ${error.message || '未知错误'}`);
                if (task?.data?.url) URL.revokeObjectURL(task.data.url);
                // If FFmpeg ends up in a bad state after a failure, reset it for the next task.
                this.destroyFFmpeg();
            }
        }
        this.isProcessing = false;
        this.updateStatus();
    }

    async transcodeAudio({ id, data, target, original }) {
        if (!this.taskIdToKey[id]) {
            if (data?.url) URL.revokeObjectURL(data.url);
            return;
        }

        await this.initFFmpeg();

        const card = document.getElementById(`task-${id}`);
        if (card) {
            card.querySelector('.music-artist').textContent = `转换中 (${original}->${target})...`;
        }

        const response = await fetch(data.url);
        const buf = new Uint8Array(await response.arrayBuffer());

        const inName = `in_${id}.${original}`;
        const outExt = (target === 'alac') ? 'm4a' : target;
        const outName = `out_${id}.${outExt}`;

        this.ffmpeg.FS('writeFile', inName, buf);

        const args = ['-i', inName];
        
        // 注入歌词元数据
        const lrcText = this.taskLrcMap.get(id);
        if (lrcText) {
            args.push('-metadata', `lyrics=${lrcText}`);
        }

        if (target === 'mp3') {
            args.push('-c:a', 'libmp3lame', '-q:a', '2');
        } else if (target === 'm4a') {
            args.push('-c:a', 'aac', '-b:a', '192k');
        } else if (target === 'wav') {
            args.push('-c:a', 'pcm_s16le');
        } else if (target === 'wma') {
            // `.wma` is typically ASF container.
            args.push('-c:a', 'wmav2', '-b:a', '192k', '-f', 'asf');
        } else if (target === 'alac') {
            args.push('-c:a', 'alac');
        } else if (target === 'ogg') {
            args.push('-c:a', 'libvorbis');
        }
        
        args.push(outName);

        try {
            await this.ffmpeg.run(...args);
        } catch (e) {
            if (e.message === 'Program terminated with exit(0)' || (e.name === 'ExitStatus' && e.status === 0)) {
                console.log("FFmpeg success (exit 0).");
            } else {
                throw e;
            }
        } finally {
            // Remove large input file ASAP to avoid MEMFS growth across tasks.
            this.safeFSUnlink(inName);
        }

        let result;
        try {
            result = this.ffmpeg.FS('readFile', outName);
        } catch (e) {
            const upper = String(target || '').toUpperCase();
            throw new Error(
                `转换未生成输出文件 (${upper})。可能原因：当前 FFmpeg 核心不支持该输出封装/编码器，请改用 MP3/FLAC/WAV/AAC/OGG，或更换支持 ${upper} 的 FFmpeg core。`
            );
        }
        this.safeFSUnlink(outName);

        if (lrcText) {
            this.taskLrcMerged.set(id, true);
        } else {
            this.taskLrcMerged.delete(id);
        }

        const newUrl = URL.createObjectURL(new Blob([result.buffer], { type: this.getMimeType(outExt) }));
        URL.revokeObjectURL(data.url);

        this.renderSuccessCard(id, newUrl, data.meta, outExt, data.fileName);
    }

    renderSuccessCard(id, url, meta, ext, fileName) {
        const card = document.getElementById(`task-${id}`);
        if (!card) {
            URL.revokeObjectURL(url);
            return;
        }

        const title = this.normalizeText(meta.musicName, fileName.replace(/\.ncm$/i, ''));
        const artist = this.normalizeText(this.formatArtist(meta.artist), '未知艺术家');
        const dName = this.sanitizeFileName(`${artist} - ${title}.${ext}`);
        const coverSrc = typeof meta.albumPic === 'string' && meta.albumPic.trim()
            ? meta.albumPic.trim()
            : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+';
        
        const hasLrc = this.taskLrcMap.has(id);
        const mergedLrc = this.taskLrcMerged.get(id);
        const lrcStatus = hasLrc
            ? (mergedLrc ? '<span class="lrc-tag matched">歌词: 已合并</span>' : '<span class="lrc-tag matched">歌词: 已匹配</span>')
            : '<span class="lrc-tag unmatched">歌词: 未关联</span>';

        const safeTitle = this.escapeHtml(title);
        const safeArtist = this.escapeHtml(artist);
        const safeCoverSrc = this.escapeHtml(coverSrc);
        const safeDownloadName = this.escapeHtml(dName);

        const extLower = String(ext || '').toLowerCase();
        const canPreview = !['wma'].includes(extLower);
        const previewHtml = canPreview
            ? `<audio controls src="${url}" class="music-player"></audio>`
            : `<div class="preview-unavailable">浏览器不支持预览</div>`;

        this.convertedFiles.push({ id, url, name: dName, meta });

        card.innerHTML = `
            <img src="${safeCoverSrc}" class="album-cover" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+'">
            <div class="music-info">
                <div class="music-title">${safeTitle}</div>
                <div class="music-artist">${safeArtist} [${ext.toUpperCase()}]</div>
                <div class="lrc-status-container">${lrcStatus}</div>
            </div>
            <div class="music-actions">
                ${previewHtml}
                <a class="download-btn" href="${url}" download="${safeDownloadName}">下载</a>
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
            const artistEl = card.querySelector('.music-artist');
            if (artistEl) {
                artistEl.innerHTML = '';
                const span = document.createElement('span');
                span.style.color = '#ff6b6b';
                span.textContent = msg;
                artistEl.appendChild(span);
            }
        }
        if (this.taskIdToKey[id]) this.activeTaskKeys.delete(this.taskIdToKey[id]);
        delete this.taskIdToKey[id];
        this.taskTargetFormat.delete(id);
        this.taskLrcMerged.delete(id);
        this.updateStatus();
    }

    deleteTask(id) {
        const card = document.getElementById(`task-${id}`);
        card?.remove();
        
        const file = this.convertedFiles.find(f => f.id === id);
        if (file) URL.revokeObjectURL(file.url);

        this.convertedFiles = this.convertedFiles.filter(f => f.id !== id);
        this.taskLrcMap.delete(id);
        if (this.taskIdToKey[id]) this.activeTaskKeys.delete(this.taskIdToKey[id]);
        delete this.taskIdToKey[id];
        this.taskTargetFormat.delete(id);
        this.taskLrcMerged.delete(id);
        this.transcodeQueue = this.transcodeQueue.filter(task => task.id !== id);
        
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
        this.taskLrcMap.clear();
        this.taskTargetFormat.clear();
        this.taskLrcMerged.clear();
        this.taskIdToKey = {};
        this.transcodeQueue = [];
        this.outputList.innerHTML = '<div class="empty-placeholder">暂无转换记录</div>';
        this.updateDownloadBtn();
        this.updateStatus();
    }

    async downloadAll() {
        const fileCount = this.convertedFiles.length;
        if (fileCount === 0) return;

        // 只有一首歌时，直接下载
        if (fileCount === 1) {
            const f = this.convertedFiles[0];
            const a = document.createElement('a');
            a.href = f.url;
            a.download = this.sanitizeFileName(f.name);
            a.click();
            return;
        }

        // 多首歌时，打包为 ZIP 下载
        this.downloadAllBtn.textContent = '正在打包 ZIP...';
        this.downloadAllBtn.disabled = true;

        try {
            if (typeof JSZip === 'undefined') {
                throw new Error("JSZip 库未加载，请刷新页面重试");
            }

            const zip = new JSZip();

            // 遍历所有已转换的文件，通过 fetch 获取 blob 数据并加入 zip
            for (const f of this.convertedFiles) {
                const response = await fetch(f.url);
                const blob = await response.blob();
                
                // 新增：过滤掉文件名中的路径分隔符（/ 和 \），替换为 ' & '
                const safeFileName = this.sanitizeFileName(f.name);
                
                // 使用安全的文件名写入压缩包
                zip.file(safeFileName, blob);
            }

            // 异步生成 zip 文件
            const zipContent = await zip.generateAsync({ type: 'blob' });
            
            // 创建下载链接并触发下载
            const zipUrl = URL.createObjectURL(zipContent);
            const a = document.createElement('a');
            a.href = zipUrl;
            
            // 使用当前日期时间作为文件名，例如：NCM_Music_20240520.zip
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            a.download = `NCM_Music_${dateStr}.zip`;
            a.click();

            // 延迟释放内存
            setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);

        } catch (error) {
            console.error("打包下载失败:", error);
            alert("打包下载失败: " + error.message);
        } finally {
            // 恢复按钮状态
            this.updateDownloadBtn();
        }
    }

    showMetadata(id) {
        const file = this.convertedFiles.find(f => f.id === id);
        if (!file || !file.meta) return;
        
        const { meta } = file;
        const cover = typeof meta.albumPic === 'string' && meta.albumPic.trim()
            ? meta.albumPic.trim()
            : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NiIgaGVpZ2h0PSI1NiIgdmlld0JveD0iMCAwIDU2IDU2Ij48cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiM2NjYiPvCfjbc8L3RleHQ+PC9zdmc+';
        
        document.getElementById('modalCover').src = cover;
        
        const safeMusicName = this.escapeHtml(this.normalizeText(meta.musicName, '未知'));
        const safeArtist = this.escapeHtml(this.normalizeText(this.formatArtist(meta.artist), '未知'));
        const safeAlbum = this.escapeHtml(this.normalizeText(meta.album, '未知'));
        const safeOriginal = this.escapeHtml(this.normalizeText(meta.originalFormat, 'N/A'));

        const infoHtml = `
            <div class="info-row"><span class="info-label">歌名</span><span class="info-value">${safeMusicName}</span></div>
            <div class="info-row"><span class="info-label">歌手</span><span class="info-value">${safeArtist}</span></div>
            <div class="info-row"><span class="info-label">专辑</span><span class="info-value">${safeAlbum}</span></div>
            <div class="info-row"><span class="info-label">原始格式</span><span class="info-value">${safeOriginal}</span></div>
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
