class ResourceLocalizer {
    constructor() {
        this.htmlFile = null;
        this.htmlContent = '';
        this.resources = {
            css: [],
            js: []
        };
        this.downloadedResources = new Map();

        this.initEventListeners();
    }

    initEventListeners() {
        const fileInput = document.getElementById('htmlInput');
        const fileUploadArea = document.getElementById('fileUploadArea');

        // 点击上传区域触发文件选择
        fileUploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // 文件选择事件
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeResources());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadResources());

        // 拖拽上传功能
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
                const validExtensions = ['.html', '.htm'];
                const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

                if (isValid) {
                    // 将文件设置到 input 元素
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;

                    // 触发 change 事件
                    const event = new Event('change', { bubbles: true });
                    fileInput.dispatchEvent(event);
                } else {
                    alert('请选择 HTML (.html, .htm) 文件');
                }
            }
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.htmlFile = file;
        document.getElementById('fileName').textContent = `已选择: ${file.name}`;
        document.getElementById('analyzeBtn').disabled = false;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.htmlContent = e.target.result;
        };
        reader.readAsText(file);
    }

    analyzeResources() {
        this.log('开始分析 HTML 文件...', 'info');

        const parser = new DOMParser();
        const doc = parser.parseFromString(this.htmlContent, 'text/html');

        // 提取 CSS 链接
        const cssLinks = doc.querySelectorAll('link[rel="stylesheet"]');
        this.resources.css = Array.from(cssLinks)
            .map(link => link.getAttribute('href'))
            .filter(href => href && (href.startsWith('http://') || href.startsWith('https://')));

        // 提取 JS 脚本
        const jsScripts = doc.querySelectorAll('script[src]');
        this.resources.js = Array.from(jsScripts)
            .map(script => script.getAttribute('src'))
            .filter(src => src && (src.startsWith('http://') || src.startsWith('https://')));

        this.displayAnalysisResults();
        document.getElementById('step2').style.display = 'block';
        this.log('分析完成！', 'success');
    }

    displayAnalysisResults() {
        const cssCount = this.resources.css.length;
        const jsCount = this.resources.js.length;
        const totalCount = cssCount + jsCount;

        document.getElementById('cssCount').textContent = cssCount;
        document.getElementById('jsCount').textContent = jsCount;
        document.getElementById('totalCount').textContent = totalCount;

        const resourceList = document.getElementById('resourceList');
        resourceList.innerHTML = '';

        // 显示 CSS 资源
        this.resources.css.forEach(url => {
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.innerHTML = `
                <span class="resource-type css">CSS</span>
                <span>${url}</span>
            `;
            resourceList.appendChild(item);
        });

        // 显示 JS 资源
        this.resources.js.forEach(url => {
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.innerHTML = `
                <span class="resource-type js">JS</span>
                <span>${url}</span>
            `;
            resourceList.appendChild(item);
        });
    }

    async downloadResources() {
        document.getElementById('step3').style.display = 'block';
        document.getElementById('downloadBtn').disabled = true;

        const allResources = [...this.resources.css, ...this.resources.js];
        const total = allResources.length;
        let completed = 0;

        this.log(`开始下载 ${total} 个资源...`, 'info');

        const zip = new JSZip();
        const staticFolder = zip.folder('static');
        const cssFolder = staticFolder.folder('css');
        const jsFolder = staticFolder.folder('js');

        // 下载所有资源
        for (const url of allResources) {
            try {
                this.log(`下载中: ${url}`, 'info');

                const response = await fetch(url, {
                    mode: 'cors',
                    cache: 'no-cache'
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const content = await response.text();
                const filename = this.getFilenameFromUrl(url);

                if (this.resources.css.includes(url)) {
                    // 处理 CSS 文件中的资源引用
                    const processedContent = await this.processCssContent(content, url, cssFolder);
                    cssFolder.file(filename, processedContent);
                    this.downloadedResources.set(url, `./static/css/${filename}`);
                } else {
                    jsFolder.file(filename, content);
                    this.downloadedResources.set(url, `./static/js/${filename}`);
                }

                completed++;
                this.updateProgress(completed, total);
                this.log(`✓ 下载成功: ${filename}`, 'success');
            } catch (error) {
                this.log(`✗ 下载失败: ${url} (${error.message})`, 'error');
                completed++;
                this.updateProgress(completed, total);
            }
        }

        // 生成修改后的 HTML
        const modifiedHtml = this.generateModifiedHtml();
        zip.file('index.html', modifiedHtml);

        // 生成 ZIP 文件
        this.log('正在生成 ZIP 文件...', 'info');
        const blob = await zip.generateAsync({ type: 'blob' });

        // 下载 ZIP 文件
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${this.htmlFile.name.replace('.html', '')}_localized.zip`;
        downloadLink.click();

        this.log('✓ 全部完成！ZIP 文件已生成', 'success');
        document.getElementById('downloadBtn').disabled = false;
    }

    async processCssContent(cssContent, cssUrl, cssFolder) {
        // 处理 CSS 中的 @import
        const importRegex = /@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?[^;]*;/g;
        let match;
        const imports = [];

        while ((match = importRegex.exec(cssContent)) !== null) {
            imports.push(match[1]);
        }

        for (const importUrl of imports) {
            try {
                const fullUrl = new URL(importUrl, cssUrl).href;
                const response = await fetch(fullUrl);
                const importedContent = await response.text();
                const filename = this.getFilenameFromUrl(fullUrl);
                cssFolder.file(filename, importedContent);
                cssContent = cssContent.replace(importUrl, `./${filename}`);
            } catch (error) {
                this.log(`警告: 无法下载 @import 资源: ${importUrl}`, 'error');
            }
        }

        // 处理 CSS 中的 url() 引用（字体、图片等）
        const urlRegex = /url\(['"]?([^'"\)]+)['"]?\)/g;
        const baseUrl = new URL(cssUrl);

        cssContent = cssContent.replace(urlRegex, (match, url) => {
            // 跳过 data URLs
            if (url.startsWith('data:')) {
                return match;
            }

            try {
                const fullUrl = new URL(url, baseUrl).href;
                // 保留外部字体和图片的原始链接
                return match;
            } catch (error) {
                return match;
            }
        });

        return cssContent;
    }

    generateModifiedHtml() {
        let modifiedHtml = this.htmlContent;

        // 替换 CSS 链接
        this.resources.css.forEach(url => {
            const localPath = this.downloadedResources.get(url);
            if (localPath) {
                modifiedHtml = modifiedHtml.replace(
                    new RegExp(`href=["']${this.escapeRegex(url)}["']`, 'g'),
                    `href="${localPath}"`
                );
            }
        });

        // 替换 JS 链接
        this.resources.js.forEach(url => {
            const localPath = this.downloadedResources.get(url);
            if (localPath) {
                modifiedHtml = modifiedHtml.replace(
                    new RegExp(`src=["']${this.escapeRegex(url)}["']`, 'g'),
                    `src="${localPath}"`
                );
            }
        });

        return modifiedHtml;
    }

    getFilenameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;
            let filename = pathname.split('/').pop();

            // 如果文件名为空或只是路径，生成一个基于路径的文件名
            if (!filename || !filename.includes('.')) {
                const hash = this.simpleHash(url);
                const ext = url.includes('.css') ? '.css' : '.js';
                filename = `resource_${hash}${ext}`;
            }

            // 移除查询参数但保留版本信息
            filename = filename.split('?')[0];

            return filename;
        } catch (error) {
            const hash = this.simpleHash(url);
            const ext = url.includes('.css') ? '.css' : '.js';
            return `resource_${hash}${ext}`;
        }
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36).substring(0, 8);
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    updateProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `进度: ${current}/${total} (${percentage}%)`;
    }

    log(message, type = 'info') {
        const logOutput = document.getElementById('logOutput');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new ResourceLocalizer();
});
