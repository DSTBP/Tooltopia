class ResourceLocalizer {
    constructor() {
        this.htmlFile = null;
        this.htmlContent = '';
        // 扩充支持的资源类型
        this.resources = {
            css: [],
            js: [],
            img: [],
            font: [],
            other: []
        };
        this.downloadedResources = new Map();
        this.resourceStrategies = new Map();

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

        document.getElementById('batchLocalBtn').addEventListener('click', () => this.setBatchStrategy('local'));
        document.getElementById('batchFallbackBtn').addEventListener('click', () => this.setBatchStrategy('fallback'));
    }
    
    setBatchStrategy(strategy) {
        // 1. 更新内存中的策略状态
        ['css', 'js', 'img', 'font', 'other'].forEach(type => {
            this.resources[type].forEach(url => {
                this.resourceStrategies.set(url, strategy);
            });
        });

        // 2. 同步更新页面上所有下拉框的选中值
        const selects = document.querySelectorAll('.strategy-select');
        selects.forEach(select => {
            select.value = strategy;
        });

        // 3. 打印日志反馈
        const strategyName = strategy === 'local' ? '纯本地加载' : '优先外源 (降级本地)';
        this.log(`已将所有资源批量设置为: ${strategyName}`, 'info');
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

        // 清空之前的资源
        this.resources = { css: [], js: [], img: [], font: [], other: [] };

        const addResource = (url, type) => {
            if (url && (url.startsWith('http://') || url.startsWith('https://')) && !this.resources[type].includes(url)) {
                this.resources[type].push(url);
            }
        };

        // 1. CSS
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => addResource(el.getAttribute('href'), 'css'));
        // 2. JS
        doc.querySelectorAll('script[src]').forEach(el => addResource(el.getAttribute('src'), 'js'));
        // 3. 图片 (Img, Svg, 图标等)
        doc.querySelectorAll('img[src]').forEach(el => addResource(el.getAttribute('src'), 'img'));
        doc.querySelectorAll('link[rel*="icon"]').forEach(el => addResource(el.getAttribute('href'), 'img'));
        // 4. 字体 (ttf, woff, woff2)
        doc.querySelectorAll('link[rel="preload"][as="font"]').forEach(el => addResource(el.getAttribute('href'), 'font'));
        // 5. 其他 (JSON, manifest, ejs, 媒体 source 等)
        doc.querySelectorAll('link[rel="manifest"], link[rel="prefetch"], source[src]').forEach(el => {
            const url = el.getAttribute('href') || el.getAttribute('src');
            addResource(url, 'other');
        });

        this.displayAnalysisResults();
        document.getElementById('step2').style.display = 'block';
        this.log('分析完成！', 'success');
    }

    displayAnalysisResults() {
        const counts = {
            css: this.resources.css.length,
            js: this.resources.js.length,
            img: this.resources.img.length,
            font: this.resources.font.length,
            other: this.resources.other.length
        };
        const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

        // 更新基础统计 (如果有更多 UI 卡片可自行在 HTML 中添加 id 并赋值)
        if(document.getElementById('cssCount')) document.getElementById('cssCount').textContent = counts.css;
        if(document.getElementById('jsCount')) document.getElementById('jsCount').textContent = counts.js;
        if(document.getElementById('totalCount')) document.getElementById('totalCount').textContent = totalCount;

        const resourceList = document.getElementById('resourceList');
        resourceList.innerHTML = '';

        const createResourceItem = (url, type) => {
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
            select.innerHTML = `
                <option value="local">纯本地加载</option>
                <option value="fallback">优先外源 (降级本地)</option>
            `;

            if (!this.resourceStrategies.has(url)) {
                this.resourceStrategies.set(url, 'local');
            }
            select.value = this.resourceStrategies.get(url);
            select.addEventListener('change', (e) => this.resourceStrategies.set(url, e.target.value));

            item.appendChild(typeSpan);
            item.appendChild(urlSpan);
            item.appendChild(select);
            resourceList.appendChild(item);
        };

        // 按顺序渲染
        ['css', 'js', 'img', 'font', 'other'].forEach(type => {
            this.resources[type].forEach(url => createResourceItem(url, type));
        });
    }

    async downloadResources() {
        document.getElementById('step3').style.display = 'block';
        document.getElementById('downloadBtn').disabled = true;

        // 合并所有需要下载的资源并附带类型
        const allResources = [];
        ['css', 'js', 'img', 'font', 'other'].forEach(type => {
            if (this.resources[type]) {
                this.resources[type].forEach(url => allResources.push({ url, type }));
            }
        });

        const total = allResources.length;
        let completed = 0;
        let failedUrls = []; // 记录下载失败的资源

        this.log(`开始下载 ${total} 个资源...`, 'info');

        const zip = new JSZip();
        const staticFolder = zip.folder('static');
        
        // 创建各类型文件夹
        const folders = {
            css: staticFolder.folder('css'),
            js: staticFolder.folder('js'),
            img: staticFolder.folder('img'),
            font: staticFolder.folder('font'),
            other: staticFolder.folder('other')
        };

        for (const { url, type } of allResources) {
            try {
                this.log(`下载中: ${url}`, 'info');
                
                // 【修改点1】调用封装好的带有重试机制的 fetch 方法
                const response = await this.fetchWithRetry(url, 3);
                
                const filename = this.getFilenameFromUrl(url);
                const localPath = `./static/${type}/${filename}`;

                // 区分文本和二进制的下载方式
                if (type === 'css' || type === 'js') {
                    const content = await response.text();
                    if (type === 'css') {
                        const processedContent = await this.processCssContent(content, url, folders.css);
                        folders.css.file(filename, processedContent);
                    } else {
                        folders.js.file(filename, content);
                    }
                } else {
                    const blob = await response.blob();
                    folders[type].file(filename, blob);
                }

                this.downloadedResources.set(url, localPath);
                this.log(`✓ 下载成功: ${filename}`, 'success');
            } catch (error) {
                // 【修改点2】记录失败的资源，不抛出异常以保证循环继续
                this.log(`✗ 彻底失败: ${url} (${error.message})`, 'error');
                failedUrls.push(url);
            } finally {
                // 无论成功还是失败，进度条都要走
                completed++;
                this.updateProgress(completed, total);
            }
        }

        // 【修改点3】判断是否有失败的资源，如果有，弹窗询问用户
        if (failedUrls.length > 0) {
            this.log(`⚠️ 下载环节结束。有 ${failedUrls.length} 个资源下载失败，等待用户决策...`, 'error');
            
            // 延迟一点点弹窗，确保 UI 和日志已经更新
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const userContinue = window.confirm(
                `有 ${failedUrls.length} 个资源下载失败。\n` +
                `👉 常见原因：目标网址404，或者被 uBlock Origin 等广告插件拦截。\n\n` +
                `💡 如果是被拦截，您可以【临时关闭广告插件】后重试。\n\n` +
                `• 点击【确定】: 忽略失败项，继续打包（失败项将保留原始外网链接）\n` +
                `• 点击【取消】: 中止打包`
            );

            if (!userContinue) {
                this.log('⛔ 用户已取消生成 ZIP 包，任务终止。', 'error');
                document.getElementById('downloadBtn').disabled = false;
                return; // 提前退出函数，不执行打包
            } else {
                this.log('▶️ 用户选择忽略失败项，继续生成 ZIP 包...', 'info');
            }
        }

        // 生成修改后的 HTML
        const modifiedHtml = this.generateModifiedHtml();
        zip.file('index.html', modifiedHtml);

        this.log('正在生成 ZIP 文件...', 'info');
        const blob = await zip.generateAsync({ type: 'blob' });

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${this.htmlFile.name.replace('.html', '')}_localized.zip`;
        downloadLink.click();

        this.log('✓ 全部完成！ZIP 文件已生成', 'success');
        document.getElementById('downloadBtn').disabled = false;
    }

    async fetchWithRetry(url, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            const startTime = Date.now(); // 记录请求开始时间
            try {
                const response = await fetch(url, {
                    mode: 'cors',
                    cache: 'no-cache'
                });

                if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                    throw new Error(`HTTP ${response.status} - 客户端错误，放弃重试`);
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return response;
            } catch (error) {
                const duration = Date.now() - startTime; // 计算请求耗时
                lastError = error;
                const isNetworkError = error instanceof TypeError && error.message === 'Failed to fetch';
                
                // 【核心策略】如果请求在极短时间（< 150ms）内发生 Failed to fetch，
                // 极大概率是被 uBlock Origin 等广告拦截器拦截，或者触发了严格的 CORS 策略。
                // 此时重试毫无意义，直接中断。
                if (isNetworkError && duration < 150) {
                    this.log(`⚠️ 请求瞬间被阻断 (${url})，可能是被广告插件(如uBlock)拦截，放弃重试`, 'error');
                    throw new Error('被浏览器扩展或CORS拦截');
                }

                // 如果是最后一次尝试，或者是不应该重试的错误，直接抛出
                if (i === maxRetries - 1 || (!isNetworkError && error.message.includes('客户端错误'))) {
                    throw error;
                }

                this.log(`⚠️ 网络请求失败，准备进行第 ${i + 1} 次重试: ${url}`, 'info');
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        throw lastError;
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

        const processReplacements = (type) => {
            this.resources[type].forEach(url => {
                const localPath = this.downloadedResources.get(url);
                const strategy = this.resourceStrategies.get(url) || 'local';

                if (localPath) {
                    const escapedUrl = this.escapeRegex(url);
                    // 同时匹配 href 和 src
                    const hrefRegex = new RegExp(`href=["']${escapedUrl}["']`, 'g');
                    const srcRegex = new RegExp(`src=["']${escapedUrl}["']`, 'g');

                    if (strategy === 'local') {
                        modifiedHtml = modifiedHtml.replace(hrefRegex, `href="${localPath}"`);
                        modifiedHtml = modifiedHtml.replace(srcRegex, `src="${localPath}"`);
                    } else if (strategy === 'fallback') {
                        if (type === 'css' || type === 'font') {
                            modifiedHtml = modifiedHtml.replace(
                                hrefRegex,
                                `href="${url}" onerror="this.onerror=null;this.href='${localPath}'"`
                            );
                        } else if (type === 'js') {
                            modifiedHtml = modifiedHtml.replace(
                                srcRegex,
                                `src="${url}" onerror="document.write('<script src=\\'${localPath}\\'><\\/script>')"`
                            );
                        } else if (type === 'img' || type === 'other') {
                            // 对于图片等标签，降级替换 src 属性
                            modifiedHtml = modifiedHtml.replace(
                                srcRegex,
                                `src="${url}" onerror="this.onerror=null;this.src='${localPath}'"`
                            );
                            // 万一 other 类型使用的是 href (例如 manifest)，也做预备替换
                            modifiedHtml = modifiedHtml.replace(
                                hrefRegex,
                                `href="${url}" onerror="this.onerror=null;this.href='${localPath}'"`
                            );
                        }
                    }
                }
            });
        };

        ['css', 'js', 'img', 'font', 'other'].forEach(type => processReplacements(type));

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
