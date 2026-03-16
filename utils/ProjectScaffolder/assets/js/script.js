class ProjectScaffolder {
    constructor() {
        this.genTab = document.getElementById('genTab');
        this.parseTab = document.getElementById('parseTab');
        this.genContent = document.getElementById('genContent');
        this.parseContent = document.getElementById('parseContent');

        this.treeInput = document.getElementById('treeInput');
        this.addHeaderComments = document.getElementById('addHeaderComments');
        this.metaInputs = document.getElementById('metaInputs');
        this.inputAuthor = document.getElementById('inputAuthor');
        this.inputEditor = document.getElementById('inputEditor');

        this.fileUploadArea = document.getElementById('fileUploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.fileName = document.getElementById('fileName');
        this.extractHeaderComments = document.getElementById('extractHeaderComments');

        this.outputTitle = document.getElementById('outputTitle');
        this.statusInfo = document.getElementById('statusInfo');
        this.genResult = document.getElementById('genResult');
        this.parseResult = document.getElementById('parseResult');
        this.actionBtn = document.getElementById('actionBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.clearBtn = document.getElementById('clearBtn');

        this.currentMode = 'generate';
        this.zipFile = null;
        this.notificationElement = null;
        this.notificationTimer = 0;
        this.isBusy = false;
        this.descriptionPattern = /(?:@Description|Description)\s*:\s*(.*)/i;
        this.textFileExtensions = new Set([
            'c', 'cc', 'cpp', 'css', 'go', 'h', 'hpp', 'html', 'htm', 'java', 'js', 'jsx',
            'json', 'kt', 'md', 'mjs', 'py', 'rb', 'rs', 'scss', 'sh', 'sql', 'svg', 'toml',
            'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml'
        ]);

        this.bindEvents();
        this.syncMetaInputState();
    }

    bindEvents() {
        this.genTab?.addEventListener('click', () => this.switchMode('generate'));
        this.parseTab?.addEventListener('click', () => this.switchMode('parse'));

        this.addHeaderComments?.addEventListener('change', () => {
            this.syncMetaInputState();
        });

        if (this.fileUploadArea && this.fileInput) {
            this.fileUploadArea.addEventListener('click', () => this.fileInput.click());
            this.fileUploadArea.addEventListener('dragover', (event) => {
                event.preventDefault();
                this.fileUploadArea.classList.add('drag-over');
            });
            this.fileUploadArea.addEventListener('dragleave', () => {
                this.fileUploadArea.classList.remove('drag-over');
            });
            this.fileUploadArea.addEventListener('drop', (event) => this.handleDrop(event));
            this.fileInput.addEventListener('change', (event) => this.handleFileSelect(event));
        }

        this.actionBtn?.addEventListener('click', () => this.handleAction());
        this.copyBtn?.addEventListener('click', () => this.copyResult());
        this.clearBtn?.addEventListener('click', () => this.clearAll());
    }

    setBusy(isBusy) {
        this.isBusy = isBusy;
        if (this.actionBtn) this.actionBtn.disabled = isBusy;
        if (this.copyBtn && this.currentMode === 'parse') this.copyBtn.disabled = isBusy;
        if (this.clearBtn) this.clearBtn.disabled = isBusy;
        if (this.genTab) this.genTab.disabled = isBusy;
        if (this.parseTab) this.parseTab.disabled = isBusy;
    }

    syncMetaInputState() {
        if (!this.metaInputs || !this.addHeaderComments) return;
        const enabled = this.addHeaderComments.checked;
        this.metaInputs.style.opacity = enabled ? '1' : '0.5';
        this.metaInputs.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    switchMode(mode) {
        this.currentMode = mode;
        const isGenerate = mode === 'generate';

        this.genTab?.classList.toggle('active', isGenerate);
        this.parseTab?.classList.toggle('active', !isGenerate);
        this.genContent?.classList.toggle('active', isGenerate);
        this.parseContent?.classList.toggle('active', !isGenerate);

        if (this.genResult) this.genResult.style.display = isGenerate ? 'flex' : 'none';
        if (this.parseResult) this.parseResult.style.display = isGenerate ? 'none' : 'block';
        if (this.actionBtn) this.actionBtn.textContent = isGenerate ? '生成 ZIP 压缩包' : '开始解析结果';
        if (this.copyBtn) this.copyBtn.style.display = isGenerate ? 'none' : 'inline-block';
        if (this.outputTitle) this.outputTitle.textContent = isGenerate ? '生成结果' : '解析结果';

        this.updateStatus('就绪');
    }

    isZipFile(file) {
        return Boolean(file && file.name && file.name.toLowerCase().endsWith('.zip'));
    }

    handleDrop(event) {
        event.preventDefault();
        this.fileUploadArea?.classList.remove('drag-over');
        const file = event.dataTransfer?.files?.[0] || null;
        if (!this.isZipFile(file)) {
            this.showNotification('请上传 .zip 格式文件', 'error');
            return;
        }
        this.processZipFile(file);
    }

    handleFileSelect(event) {
        const file = event.target.files?.[0] || null;
        if (!this.isZipFile(file)) {
            if (this.fileInput) this.fileInput.value = '';
            this.showNotification('请上传 .zip 格式文件', 'error');
            return;
        }
        this.processZipFile(file);
    }

    processZipFile(file) {
        this.zipFile = file;
        if (this.fileName) this.fileName.textContent = file.name;
        this.updateStatus('已加载文件');
    }

    async handleAction() {
        if (this.isBusy) return;
        if (this.currentMode === 'generate') {
            await this.generateZip();
        } else {
            await this.parseZip();
        }
    }

    async generateZip() {
        if (typeof JSZip === 'undefined') {
            this.showNotification('JSZip 未加载，无法生成 ZIP 文件', 'error');
            return;
        }

        const input = this.treeInput?.value.trim() || '';
        if (!input) {
            this.showNotification('请输入目录结构', 'error');
            return;
        }

        const entries = this.parseTreeInput(input);
        if (entries.length === 0) {
            this.showNotification('目录树内容无效，无法生成项目结构', 'error');
            return;
        }

        this.updateStatus('正在生成...');
        this.setBusy(true);

        try {
            const zip = new JSZip();
            const timestamp = this.formatTimestamp(new Date());

            entries.forEach((entry) => {
                if (entry.isDirectory) {
                    zip.folder(entry.path);
                    return;
                }

                const content = this.addHeaderComments?.checked
                    ? this.generateFileHeader(entry.name, entry.comment, timestamp)
                    : '';
                zip.file(entry.path, content);
            });

            const archiveName = this.getArchiveName(entries);
            const blob = await zip.generateAsync({ type: 'blob' });
            this.downloadBlob(blob, archiveName);

            this.updateStatus('生成完成');
            this.showNotification('压缩包已开始下载', 'success');
        } catch (error) {
            this.updateStatus('生成失败');
            this.showNotification(`生成失败: ${error.message}`, 'error');
        } finally {
            this.setBusy(false);
        }
    }

    parseTreeInput(input) {
        const lines = input.split(/\r?\n/);
        const entries = [];
        const pathStack = [];

        lines.forEach((rawLine) => {
            if (!rawLine.trim()) return;

            const lineInfo = this.parseTreeLine(rawLine);
            if (!lineInfo || !lineInfo.name) return;

            while (pathStack.length > 0 && pathStack[pathStack.length - 1].depth >= lineInfo.depth) {
                pathStack.pop();
            }

            const parentPath = pathStack.length > 0 ? pathStack[pathStack.length - 1].path : '';
            const fullPath = parentPath ? `${parentPath}/${lineInfo.name}` : lineInfo.name;

            entries.push({
                name: lineInfo.name,
                path: fullPath,
                isDirectory: lineInfo.isDirectory,
                comment: lineInfo.comment
            });

            if (lineInfo.isDirectory) {
                pathStack.push({
                    depth: lineInfo.depth,
                    path: fullPath
                });
            }
        });

        return entries;
    }

    parseTreeLine(line) {
        const expandedLine = line.replace(/\t/g, '    ');
        const commentIndex = expandedLine.indexOf('#');
        const comment = commentIndex === -1 ? '' : expandedLine.slice(commentIndex + 1).trim();
        const contentWithoutComment = commentIndex === -1 ? expandedLine : expandedLine.slice(0, commentIndex);
        const sanitized = contentWithoutComment
            .replace(/[│┃]/g, ' ')
            .replace(/[├└┌┬┴┼┣┗]/g, ' ')
            .replace(/[─━]/g, ' ')
            .replace(/[┠┨┯┷┿╞╘╟]/g, ' ')
            .trimEnd();

        if (!sanitized.trim()) return null;

        const leadingSpaces = sanitized.match(/^\s*/)?.[0].length || 0;
        const depth = Math.floor(leadingSpaces / 4);
        const content = sanitized.trim();
        const isDirectory = content.endsWith('/');
        const name = isDirectory ? content.slice(0, -1).trim() : content.trim();

        if (!name) return null;

        return {
            depth,
            name,
            isDirectory,
            comment
        };
    }

    generateFileHeader(filename, description, timestamp) {
        const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
        const author = (this.inputAuthor?.value || '').trim() || 'Developer';
        const editor = (this.inputEditor?.value || '').trim() || author;
        const info = {
            desc: description || filename,
            author,
            editor,
            timestamp
        };

        if (ext === 'py') {
            return `'''\nDescription: ${info.desc}\nAuthor: ${info.author}\nDate: ${info.timestamp}\nLastEditTime: ${info.timestamp}\nLastEditors: ${info.editor}\n'''\n`;
        }

        if (['html', 'htm', 'xml', 'vue'].includes(ext)) {
            return `<!--\nDescription: ${info.desc}\nAuthor: ${info.author}\nDate: ${info.timestamp}\nLastEditTime: ${info.timestamp}\nLastEditors: ${info.editor}\n-->\n`;
        }

        if (['yaml', 'yml', 'sh', 'conf', 'properties', 'toml'].includes(ext)) {
            return `# Description: ${info.desc}\n# Author: ${info.author}\n# Date: ${info.timestamp}\n# LastEditTime: ${info.timestamp}\n# LastEditors: ${info.editor}\n`;
        }

        return `/*\n * @Description: ${info.desc}\n * @Author: ${info.author}\n * @Date: ${info.timestamp}\n * @LastEditTime: ${info.timestamp}\n * @LastEditors: ${info.editor}\n */\n`;
    }

    getArchiveName(entries) {
        const firstDirectory = entries.find((entry) => entry.isDirectory);
        const baseName = firstDirectory ? firstDirectory.name : 'project_scaffold';
        return `${this.sanitizeFilename(baseName) || 'project_scaffold'}.zip`;
    }

    async parseZip() {
        if (typeof JSZip === 'undefined') {
            this.showNotification('JSZip 未加载，无法解析 ZIP 文件', 'error');
            return;
        }

        if (!this.zipFile) {
            this.showNotification('请先上传 ZIP 文件', 'error');
            return;
        }

        this.updateStatus('正在解析...');
        this.setBusy(true);

        try {
            const zip = await JSZip.loadAsync(this.zipFile);
            const fileStructure = {};
            const filePaths = Object.keys(zip.files)
                .filter((path) => path && !path.startsWith('__MACOSX/'))
                .sort();

            filePaths.forEach((path) => {
                const zipEntry = zip.files[path];
                const parts = path.split('/').filter(Boolean);
                let current = fileStructure;

                parts.forEach((part, index) => {
                    if (!current[part]) {
                        current[part] = {
                            __isDir: index < parts.length - 1 || zipEntry.dir,
                            __path: path,
                            __children: {}
                        };
                    }
                    current = current[part].__children;
                });
            });

            const descriptionMap = this.extractHeaderComments?.checked
                ? await this.buildDescriptionMap(zip, filePaths)
                : new Map();
            const lines = [];
            this.renderTree(fileStructure, '', descriptionMap, lines);
            const treeOutput = lines.join('');
            if (this.parseResult) {
                this.parseResult.value = treeOutput;
            }
            this.updateStatus('解析完成');
        } catch (error) {
            console.error(error);
            this.updateStatus('解析失败');
            this.showNotification(`ZIP 解析失败: ${error.message}`, 'error');
        } finally {
            this.setBusy(false);
        }
    }

    renderTree(structure, prefix, descriptionMap, lines) {
        const keys = Object.keys(structure).sort((a, b) => {
            const aIsDir = structure[a].__isDir;
            const bIsDir = structure[b].__isDir;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const node = structure[key];
            const isLast = i === keys.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = isLast ? '    ' : '│   ';

            const comment = !node.__isDir ? (descriptionMap.get(node.__path) || '') : '';

            lines.push(`${prefix}${connector}${key}${node.__isDir ? '/' : ''}${comment}\n`);

            if (node.__isDir) {
                this.renderTree(node.__children, prefix + childPrefix, descriptionMap, lines);
            }
        }
    }

    async buildDescriptionMap(zip, filePaths) {
        const descriptionMap = new Map();
        const tasks = filePaths
            .filter((path) => {
                if (zip.files[path]?.dir) {
                    return false;
                }
                const filename = path.split('/').pop() || '';
                const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
                return this.textFileExtensions.has(ext);
            })
            .map(async (path) => {
                const comment = await this.extractDescription(zip.file(path));
                if (comment) {
                    descriptionMap.set(path, comment);
                }
            });

        await Promise.all(tasks);
        return descriptionMap;
    }

    async extractDescription(file) {
        if (!file) return '';

        const filename = file.name.split('/').pop() || '';
        const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
        if (!this.textFileExtensions.has(ext)) {
            return '';
        }

        try {
            const content = await file.async('string');
            const match = content.match(this.descriptionPattern);
            return match && match[1] ? `  # ${match[1].trim()}` : '';
        } catch (error) {
            return '';
        }
    }

    formatTimestamp(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }

    async copyResult() {
        const text = this.parseResult?.value || '';
        if (!text) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                this.copyTextFallback(text);
            }
            this.showNotification('已复制到剪贴板', 'success');
        } catch (error) {
            try {
                this.copyTextFallback(text);
                this.showNotification('已复制到剪贴板', 'success');
            } catch (fallbackError) {
                this.showNotification('复制失败，请手动复制', 'error');
            }
        }
    }

    copyTextFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    clearAll() {
        if (this.treeInput) this.treeInput.value = '';
        if (this.fileInput) this.fileInput.value = '';
        if (this.fileName) this.fileName.textContent = '';
        if (this.parseResult) this.parseResult.value = '';
        this.zipFile = null;
        this.updateStatus('就绪');

        if (this.currentMode === 'generate') {
            if (this.genResult) this.genResult.style.display = 'flex';
            if (this.parseResult) this.parseResult.style.display = 'none';
        } else {
            if (this.genResult) this.genResult.style.display = 'none';
            if (this.parseResult) this.parseResult.style.display = 'block';
        }
    }

    updateStatus(text) {
        if (this.statusInfo) {
            this.statusInfo.textContent = text;
        }
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

    sanitizeFilename(value) {
        return String(value || '')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80);
    }

    showNotification(message, type) {
        if (!this.notificationElement) {
            this.notificationElement = document.createElement('div');
            document.body.appendChild(this.notificationElement);
        }

        window.clearTimeout(this.notificationTimer);
        this.notificationElement.className = `notification ${type} show`;
        this.notificationElement.textContent = message;

        this.notificationTimer = window.setTimeout(() => {
            if (this.notificationElement) {
                this.notificationElement.classList.remove('show');
            }
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProjectScaffolder();
});
