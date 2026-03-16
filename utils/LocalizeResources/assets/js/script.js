class ResourceLocalizer {
    constructor() {
        this.resourceTypes = ['css', 'js', 'img', 'font', 'other'];
        this.htmlFile = null;
        this.htmlContent = '';
        this.resources = this.createEmptyResourceMap();
        this.downloadedResources = new Map();
        this.downloadFilenameMap = new Map();
        this.resourceStrategies = new Map();
        this.fileReadToken = 0;
        this.strategySelectTemplate = this.createStrategySelectTemplate();
        this.resourceConfigs = [
            { selector: 'link[rel="stylesheet"][href], link[rel="preload"][as="style"][href]', attr: 'href', type: 'css' },
            { selector: 'script[src]', attr: 'src', type: 'js' },
            { selector: 'link[rel="preload"][as="script"][href], link[rel="modulepreload"][href]', attr: 'href', type: 'js' },
            { selector: 'img[src]', attr: 'src', type: 'img' },
            { selector: 'link[rel*="icon"][href], link[rel="preload"][as="image"][href]', attr: 'href', type: 'img' },
            { selector: 'link[rel="preload"][as="font"][href]', attr: 'href', type: 'font' },
            { selector: 'link[rel="manifest"][href], link[rel="prefetch"][href]', attr: 'href', type: 'other' },
            { selector: 'source[src], audio[src], video[src], track[src]', attr: 'src', type: 'other' }
        ];

        this.elements = {
            htmlInput: document.getElementById('htmlInput'),
            fileUploadArea: document.getElementById('fileUploadArea'),
            fileName: document.getElementById('fileName'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            batchLocalBtn: document.getElementById('batchLocalBtn'),
            batchFallbackBtn: document.getElementById('batchFallbackBtn'),
            step2: document.getElementById('step2'),
            step3: document.getElementById('step3'),
            cssCount: document.getElementById('cssCount'),
            jsCount: document.getElementById('jsCount'),
            totalCount: document.getElementById('totalCount'),
            resourceList: document.getElementById('resourceList'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            logOutput: document.getElementById('logOutput')
        };

        this.initEventListeners();
    }

    createEmptyResourceMap() {
        return {
            css: [],
            js: [],
            img: [],
            font: [],
            other: []
        };
    }

    createStrategySelectTemplate() {
        const select = this.strategySelectTemplate.cloneNode(true);
        select.dataset.url = url;
        return select;
    }

    initEventListeners() {
        const {
            htmlInput,
            fileUploadArea,
            analyzeBtn,
            downloadBtn,
            batchLocalBtn,
            batchFallbackBtn,
            resourceList
        } = this.elements;

        if (fileUploadArea && htmlInput) {
            fileUploadArea.addEventListener('click', () => {
                htmlInput.click();
            });

            htmlInput.addEventListener('change', (event) => {
                this.handleSelectedFile(event.target.files?.[0] || null);
            });

            fileUploadArea.addEventListener('dragover', (event) => {
                event.preventDefault();
                fileUploadArea.classList.add('drag-over');
            });

            fileUploadArea.addEventListener('dragleave', () => {
                fileUploadArea.classList.remove('drag-over');
            });

            fileUploadArea.addEventListener('drop', (event) => {
                event.preventDefault();
                fileUploadArea.classList.remove('drag-over');
                this.handleSelectedFile(event.dataTransfer?.files?.[0] || null);
            });
        }

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.analyzeResources());
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadResources());
        }

        if (batchLocalBtn) {
            batchLocalBtn.addEventListener('click', () => this.setBatchStrategy('local'));
        }

        if (batchFallbackBtn) {
            batchFallbackBtn.addEventListener('click', () => this.setBatchStrategy('fallback'));
        }

        if (resourceList) {
            resourceList.addEventListener('change', (event) => {
                const select = event.target.closest('.strategy-select');
                if (!select) return;
                const url = select.dataset.url;
                if (url) {
                    this.resourceStrategies.set(url, select.value);
                }
            });
        }
    }

    isExternalResource(url) {
        return /^https?:\/\//i.test(url) || /^\/\//.test(url);
    }

    toFetchableUrl(url, baseUrl = null) {
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (/^\/\//.test(url)) return `https:${url}`;
        if (baseUrl) return new URL(url, baseUrl).href;
        return url;
    }

    getAllResources() {
        return this.resourceTypes.flatMap((type) =>
            this.resources[type].map((url) => ({ url, type }))
        );
    }

    resetAnalysisState() {
        this.resources = this.createEmptyResourceMap();
        this.downloadedResources.clear();
        this.downloadFilenameMap.clear();
        this.resourceStrategies.clear();

        if (this.elements.step2) this.elements.step2.style.display = 'none';
        if (this.elements.step3) this.elements.step3.style.display = 'none';
        if (this.elements.resourceList) this.elements.resourceList.replaceChildren();
        if (this.elements.logOutput) this.elements.logOutput.replaceChildren();
        if (this.elements.progressFill) this.elements.progressFill.style.width = '0%';
        if (this.elements.progressText) this.elements.progressText.textContent = '准备下载...';
        if (this.elements.downloadBtn) this.elements.downloadBtn.disabled = false;

        [this.elements.cssCount, this.elements.jsCount, this.elements.totalCount].forEach((element) => {
            if (element) element.textContent = '0';
        });
    }

    handleSelectedFile(file) {
        if (!file) return;

        const isValid = ['.html', '.htm'].some((ext) => file.name.toLowerCase().endsWith(ext));
        if (!isValid) {
            alert('请选择 HTML (.html, .htm) 文件');
            return;
        }

        this.resetAnalysisState();
        this.htmlFile = file;
        this.htmlContent = '';

        if (this.elements.fileName) {
            this.elements.fileName.textContent = `已选择: ${file.name}`;
        }
        if (this.elements.analyzeBtn) {
            this.elements.analyzeBtn.disabled = true;
        }

        const readToken = ++this.fileReadToken;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (readToken !== this.fileReadToken) return;
            this.htmlContent = String(event.target?.result || '');
            if (this.elements.analyzeBtn) {
                this.elements.analyzeBtn.disabled = this.htmlContent.trim().length === 0;
            }
        };
        reader.onerror = () => {
            if (readToken !== this.fileReadToken) return;
            this.htmlFile = null;
            this.htmlContent = '';
            if (this.elements.fileName) this.elements.fileName.textContent = '';
            if (this.elements.analyzeBtn) this.elements.analyzeBtn.disabled = true;
            this.log('读取 HTML 文件失败，请重试。', 'error');
        };
        reader.readAsText(file);
    }

    setBatchStrategy(strategy) {
        this.resourceTypes.forEach((type) => {
            this.resources[type].forEach((url) => {
                this.resourceStrategies.set(url, strategy);
            });
        });

        this.elements.resourceList?.querySelectorAll('.strategy-select').forEach((select) => {
            select.value = strategy;
        });

        const strategyName = strategy === 'local' ? '纯本地加载' : '优先外源（失败降级本地）';
        this.log(`已将全部资源设置为: ${strategyName}`, 'info');
    }

    analyzeResources() {
        if (!this.htmlFile || !this.htmlContent.trim()) {
            this.log('请先选择并成功读取 HTML 文件。', 'error');
            return;
        }

        this.log('开始分析 HTML 文件...', 'info');
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.htmlContent, 'text/html');
        if (doc.querySelector('parsererror')) {
            this.log('HTML 存在解析错误，已按浏览器容错结果继续分析。', 'warning');
        }

        this.resources = this.createEmptyResourceMap();
        this.downloadedResources.clear();
        this.downloadFilenameMap.clear();

        const resourceSeen = Object.fromEntries(
            this.resourceTypes.map((type) => [type, new Set()])
        );

        const addResource = (url, type) => {
            const normalizedUrl = String(url || '').trim();
            if (!normalizedUrl || !this.isExternalResource(normalizedUrl) || resourceSeen[type].has(normalizedUrl)) {
                return;
            }
            resourceSeen[type].add(normalizedUrl);
            this.resources[type].push(normalizedUrl);
        };

        this.resourceConfigs.forEach(({ selector, attr, type }) => {
            doc.querySelectorAll(selector).forEach((el) => {
                addResource(el.getAttribute(attr), type);
            });
        });

        this.displayAnalysisResults();
        if (this.elements.step2) this.elements.step2.style.display = 'block';
        this.log('分析完成。', 'success');
    }

    displayAnalysisResults() {
        const counts = {
            css: this.resources.css.length,
            js: this.resources.js.length,
            img: this.resources.img.length,
            font: this.resources.font.length,
            other: this.resources.other.length
        };
        const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);

        if (this.elements.cssCount) this.elements.cssCount.textContent = String(counts.css);
        if (this.elements.jsCount) this.elements.jsCount.textContent = String(counts.js);
        if (this.elements.totalCount) this.elements.totalCount.textContent = String(totalCount);

        if (!this.elements.resourceList) return;

        const fragment = document.createDocumentFragment();
        this.resourceTypes.forEach((type) => {
            this.resources[type].forEach((url) => {
                fragment.appendChild(this.createResourceItem(url, type));
            });
        });
        this.elements.resourceList.replaceChildren(fragment);
    }

    createResourceItem(url, type) {
        const item = document.createElement('div');
        item.className = 'resource-item';

        const typeSpan = document.createElement('span');
        typeSpan.className = `resource-type ${type}`;
        typeSpan.textContent = type.toUpperCase();

        const urlSpan = document.createElement('span');
        urlSpan.className = 'resource-url';
        urlSpan.textContent = url;
        urlSpan.title = url;

        const select = document.createElement('select');
        select.className = 'strategy-select';

        const localOption = document.createElement('option');
        localOption.value = 'local';
        localOption.textContent = '纯本地加载';

        const fallbackOption = document.createElement('option');
        fallbackOption.value = 'fallback';
        fallbackOption.textContent = '优先外源 (降级本地)';

        select.append(localOption, fallbackOption);

        if (!this.resourceStrategies.has(url)) {
            this.resourceStrategies.set(url, 'local');
        }
        select.value = this.resourceStrategies.get(url);
        item.append(typeSpan, urlSpan, select);
        return item;
    }

    async downloadResources() {
        if (typeof JSZip === 'undefined') {
            this.log('JSZip 未加载，无法生成 ZIP 文件。', 'error');
            return;
        }
        if (!this.htmlFile || !this.htmlContent.trim()) {
            this.log('请先选择并分析 HTML 文件。', 'error');
            return;
        }

        if (this.elements.step3) this.elements.step3.style.display = 'block';
        if (this.elements.downloadBtn) this.elements.downloadBtn.disabled = true;

        try {
            const allResources = this.getAllResources();
            const total = allResources.length;
            let completed = 0;
            const failedUrls = [];

            const zip = new JSZip();
            const staticFolder = zip.folder('static');
            const folders = {
                css: staticFolder.folder('css'),
                js: staticFolder.folder('js'),
                img: staticFolder.folder('img'),
                font: staticFolder.folder('font'),
                other: staticFolder.folder('other')
            };

            this.updateProgress(0, total);
            this.log(`开始下载 ${total} 个资源...`, 'info');

            for (const { url, type } of allResources) {
                try {
                    this.log(`下载中: ${url}`, 'info');
                    const response = await this.fetchWithRetry(url, 3);
                    const filename = this.getFilenameFromUrl(
                        url,
                        type,
                        response.headers.get('content-type') || ''
                    );
                    const localPath = `./static/${type}/${filename}`;

                    if (type === 'css') {
                        const content = await response.text();
                        const processedContent = await this.processCssContent(content, url, folders.css, new Set([this.toFetchableUrl(url)]));
                        folders.css.file(filename, processedContent);
                    } else if (type === 'js') {
                        folders.js.file(filename, await response.text());
                    } else {
                        folders[type].file(filename, await response.blob());
                    }

                    this.downloadedResources.set(url, localPath);
                    this.log(`下载成功: ${filename}`, 'success');
                } catch (error) {
                    failedUrls.push(url);
                    this.log(`彻底失败: ${url} (${error.message})`, 'error');
                } finally {
                    completed += 1;
                    this.updateProgress(completed, total);
                }
            }

            if (failedUrls.length > 0) {
                this.log(`有 ${failedUrls.length} 个资源下载失败，等待用户确认是否继续打包。`, 'warning');
                await new Promise((resolve) => setTimeout(resolve, 100));
                const userContinue = window.confirm(
                    `有 ${failedUrls.length} 个资源下载失败。\n` +
                    `常见原因包括目标地址不存在、被浏览器扩展拦截，或跨域策略限制。\n\n` +
                    `点击“确定”忽略失败项并继续生成 ZIP。\n` +
                    `点击“取消”终止本次打包。`
                );

                if (!userContinue) {
                    this.log('用户取消了 ZIP 生成。', 'warning');
                    return;
                }

                this.log('用户选择忽略失败项，继续生成 ZIP。', 'info');
            }

            const modifiedHtml = this.generateModifiedHtml();
            zip.file('index.html', modifiedHtml);

            this.log('正在生成 ZIP 文件...', 'info');
            const blob = await zip.generateAsync({ type: 'blob' });
            this.downloadBlob(blob, `${this.getArchiveBaseName()}_localized.zip`);
            this.log('全部完成，ZIP 文件已生成。', 'success');
        } catch (error) {
            this.log(`生成 ZIP 失败: ${error.message}`, 'error');
        } finally {
            if (this.elements.downloadBtn) this.elements.downloadBtn.disabled = false;
        }
    }

    async fetchWithRetry(url, maxRetries = 3) {
        const fetchableUrl = this.toFetchableUrl(url);
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            const startTime = Date.now();
            try {
                const response = await fetch(fetchableUrl, {
                    mode: 'cors',
                    cache: 'no-cache'
                });

                if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                    throw new Error(`HTTP ${response.status}`);
                }
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return response;
            } catch (error) {
                lastError = error;
                const duration = Date.now() - startTime;
                const errorMessage = String(error?.message || '');
                const isNetworkError = error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(errorMessage);
                const isClientError = /^HTTP 4\d\d$/.test(errorMessage) && !/^HTTP (408|429)$/.test(errorMessage);

                if (isNetworkError && duration < 150) {
                    throw new Error('请求疑似被浏览器扩展或跨域策略拦截');
                }
                if (attempt === maxRetries - 1 || isClientError) {
                    throw error;
                }

                this.log(`网络请求失败，准备第 ${attempt + 2} 次重试: ${url}`, 'info');
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }

        throw lastError || new Error('请求失败');
    }

    async processCssContent(cssContent, cssUrl, cssFolder, seenUrls = new Set()) {
        const importRegex = /@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?[^;]*;/g;
        const importMatches = Array.from(cssContent.matchAll(importRegex));

        for (const match of importMatches) {
            const rawImport = match[0];
            const importUrl = String(match[1] || '').trim();
            if (!importUrl || importUrl.startsWith('data:')) continue;

            try {
                const fullUrl = this.toFetchableUrl(importUrl, this.toFetchableUrl(cssUrl));
                if (seenUrls.has(fullUrl)) {
                    continue;
                }

                seenUrls.add(fullUrl);
                const response = await this.fetchWithRetry(fullUrl, 3);
                const importedContent = await response.text();
                const filename = this.getFilenameFromUrl(
                    fullUrl,
                    'css',
                    response.headers.get('content-type') || 'text/css'
                );
                const processedImportedContent = await this.processCssContent(importedContent, fullUrl, cssFolder, seenUrls);
                cssFolder.file(filename, processedImportedContent);
                cssContent = cssContent.replace(rawImport, `@import url('./${filename}');`);
            } catch (error) {
                this.log(`警告: 无法下载 @import 资源: ${importUrl}`, 'warning');
            }
        }

        const assetRegex = /url\((['"]?)([^'")]+)\1\)/g;
        const assetMatches = Array.from(cssContent.matchAll(assetRegex));
        const processedAssetUrls = new Set();

        for (const match of assetMatches) {
            const fullMatch = match[0];
            const assetUrl = String(match[2] || '').trim();
            if (!assetUrl || assetUrl.startsWith('data:') || assetUrl.startsWith('#') || processedAssetUrls.has(assetUrl)) {
                continue;
            }

            processedAssetUrls.add(assetUrl);

            try {
                const fullUrl = this.toFetchableUrl(assetUrl, this.toFetchableUrl(cssUrl));
                const response = await this.fetchWithRetry(fullUrl, 3);
                const filename = this.getFilenameFromUrl(
                    fullUrl,
                    'other',
                    response.headers.get('content-type') || ''
                );
                cssFolder.file(filename, await response.blob());
                cssContent = cssContent.split(fullMatch).join(`url('./${filename}')`);
                this.log(`CSS 内部资源下载成功: ${filename}`, 'success');
            } catch (error) {
                this.log(`警告: 无法下载 CSS 内部资源: ${assetUrl}`, 'warning');
            }
        }

        return cssContent;
    }

    generateModifiedHtml() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.htmlContent, 'text/html');
        this.resourceConfigs.forEach(({ selector, attr, type }) => {
            doc.querySelectorAll(selector).forEach((element) => {
                const rawUrl = String(element.getAttribute(attr) || '').trim();
                if (!rawUrl) return;

                const resolvedType = type || this.getResourceTypeForUrl(rawUrl);
                if (!resolvedType) return;

                const localPath = this.downloadedResources.get(rawUrl);
                const strategy = this.resourceStrategies.get(rawUrl) || 'local';
                if (!localPath) return;

                if (strategy === 'local') {
                    element.setAttribute(attr, localPath);
                    element.removeAttribute('onerror');
                    return;
                }

                element.setAttribute(attr, rawUrl);
                element.setAttribute('onerror', this.getFallbackHandler(element, attr, localPath));
            });
        });

        return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    }

    getResourceTypeForUrl(url) {
        for (const type of this.resourceTypes) {
            if (this.resources[type].includes(url)) {
                return type;
            }
        }
        return null;
    }

    getFallbackHandler(element, attr, localPath) {
        const safeLocalPath = this.escapeJsString(localPath);
        if (element.tagName === 'SCRIPT' && attr === 'src') {
            return `this.onerror=null;var s=document.createElement('script');s.src='${safeLocalPath}';s.defer=this.defer;s.async=this.async;this.replaceWith(s);`;
        }

        if (attr === 'src') {
            return `this.onerror=null;this.src='${safeLocalPath}';`;
        }

        return `this.onerror=null;this.href='${safeLocalPath}';`;
    }

    getFilenameFromUrl(url, type = 'other', contentType = '') {
        const cacheKey = `${type}:${url}`;
        if (this.downloadFilenameMap.has(cacheKey)) {
            return this.downloadFilenameMap.get(cacheKey);
        }

        let filename = '';
        try {
            const urlObj = new URL(this.toFetchableUrl(url));
            const pathname = decodeURIComponent(urlObj.pathname);
            const basename = pathname.split('/').pop() || '';
            filename = basename.split('?')[0].split('#')[0];
        } catch (error) {
            filename = '';
        }

        let name = filename;
        let ext = '';
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < filename.length - 1) {
            name = filename.slice(0, dotIndex);
            ext = filename.slice(dotIndex).toLowerCase();
        }

        if (!ext) {
            ext = this.getExtensionFromContentType(contentType, type);
        }
        if (!ext) {
            ext = this.getDefaultExtension(type);
        }

        const safeName = this.sanitizeFilename(name || type);
        const hashedFilename = `${safeName}_${this.simpleHash(url)}${ext}`;
        this.downloadFilenameMap.set(cacheKey, hashedFilename);
        return hashedFilename;
    }

    getExtensionFromContentType(contentType, type) {
        const normalized = String(contentType || '').toLowerCase();
        if (normalized.includes('text/css')) return '.css';
        if (normalized.includes('javascript') || normalized.includes('ecmascript')) return '.js';
        if (normalized.includes('image/png')) return '.png';
        if (normalized.includes('image/jpeg')) return '.jpg';
        if (normalized.includes('image/svg')) return '.svg';
        if (normalized.includes('image/webp')) return '.webp';
        if (normalized.includes('image/gif')) return '.gif';
        if (normalized.includes('font/woff2')) return '.woff2';
        if (normalized.includes('font/woff')) return '.woff';
        if (normalized.includes('font/ttf') || normalized.includes('application/x-font-ttf')) return '.ttf';
        if (normalized.includes('font/otf')) return '.otf';
        if (normalized.includes('application/json') || normalized.includes('manifest+json')) return '.json';
        if (normalized.includes('audio/')) return '.mp3';
        if (normalized.includes('video/')) return '.mp4';
        return this.getDefaultExtension(type);
    }

    getDefaultExtension(type) {
        switch (type) {
            case 'css':
                return '.css';
            case 'js':
                return '.js';
            case 'img':
                return '.png';
            case 'font':
                return '.woff2';
            case 'other':
            default:
                return '.bin';
        }
    }

    sanitizeFilename(value) {
        return String(value || '')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80) || 'resource';
    }

    getArchiveBaseName() {
        return (this.htmlFile?.name || 'index.html').replace(/\.(html?|HTML?)$/i, '') || 'localized';
    }

    downloadBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i += 1) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(36).slice(0, 8);
    }

    escapeJsString(str) {
        return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    updateProgress(current, total) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 100;
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = `进度: ${current}/${total} (${percentage}%)`;
        }
    }

    log(message, type = 'info') {
        const logOutput = this.elements.logOutput;
        if (!logOutput) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ResourceLocalizer();
});
