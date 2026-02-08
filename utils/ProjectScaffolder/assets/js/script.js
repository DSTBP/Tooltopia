class ProjectScaffolder {
    constructor() {
        // UI Elements
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
        
        this.currentMode = 'generate'; // 'generate' or 'parse'
        this.zipFile = null;
        
        this.bindEvents();
    }
    
    bindEvents() {
        // Tab Switching
        this.genTab.addEventListener('click', () => this.switchMode('generate'));
        this.parseTab.addEventListener('click', () => this.switchMode('parse'));
        
        // Checkbox Toggle
        this.addHeaderComments.addEventListener('change', (e) => {
            this.metaInputs.style.opacity = e.target.checked ? '1' : '0.5';
            this.metaInputs.style.pointerEvents = e.target.checked ? 'auto' : 'none';
        });
        
        // File Upload Drag & Drop
        this.fileUploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); this.fileUploadArea.classList.add('drag-over'); });
        this.fileUploadArea.addEventListener('dragleave', () => this.fileUploadArea.classList.remove('drag-over'));
        this.fileUploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Actions
        this.actionBtn.addEventListener('click', () => this.handleAction());
        this.copyBtn.addEventListener('click', () => this.copyResult());
        this.clearBtn.addEventListener('click', () => this.clearAll());
    }
    
    switchMode(mode) {
        this.currentMode = mode;
        if (mode === 'generate') {
            this.genTab.classList.add('active');
            this.parseTab.classList.remove('active');
            this.genContent.classList.add('active');
            this.parseContent.classList.remove('active');
            
            this.genResult.style.display = 'flex';
            this.parseResult.style.display = 'none';
            this.actionBtn.textContent = '生成 ZIP压缩包';
            this.copyBtn.style.display = 'none';
            this.outputTitle.textContent = '生成结果';
        } else {
            this.parseTab.classList.add('active');
            this.genTab.classList.remove('active');
            this.parseContent.classList.add('active');
            this.genContent.classList.remove('active');
            
            this.genResult.style.display = 'none';
            this.parseResult.style.display = 'block';
            this.actionBtn.textContent = '开始解析结构';
            this.copyBtn.style.display = 'inline-block';
            this.outputTitle.textContent = '解析结果';
        }
        this.updateStatus('就绪');
    }
    
    handleDrop(e) {
        e.preventDefault();
        this.fileUploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.zip')) {
            this.processZipFile(files[0]);
        } else {
            this.showNotification('请上传 .zip 格式文件', 'error');
        }
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.name.endsWith('.zip')) {
            this.processZipFile(file);
        } else {
            this.fileInput.value = '';
        }
    }
    
    processZipFile(file) {
        this.zipFile = file;
        this.fileName.textContent = file.name;
        this.updateStatus('已加载文件');
    }
    
    async handleAction() {
        if (this.currentMode === 'generate') {
            await this.generateZip();
        } else {
            await this.parseZip();
        }
    }
    
    // ================= Logic: Generate Zip from Tree =================
    
    async generateZip() {
        const input = this.treeInput.value.trim();
        if (!input) {
            this.showNotification('请输入目录结构', 'error');
            return;
        }
        
        this.updateStatus('正在生成...');
        const zip = new JSZip();
        const lines = input.split('\n');
        
        // State for path tracking
        const pathStack = []; // stores {indent: number, name: string}
        let rootDetected = false;
        
        const now = new Date();
        const dateStr = this.formatDate(now);
        const timeStr = this.formatDate(now); // Same format for simplicity
        
        for (let line of lines) {
            if (!line.trim()) continue;
            
            // 1. Parse Indentation & Name & Comment
            // Regex matches: (indentation)(connector)(filename)( # comment)?
            // handling "│   ", "├── ", "└── " etc.
            
            // Special handling for root folder (no symbols usually)
            let cleanLine = line.replace(/[│]/g, ' '); // Replace pipe with space to calc indent
            
            // Calculate indent level (approximate by spaces)
            const indentMatch = cleanLine.match(/^(\s*)(?:├──|└──)?\s*(.*)/);
            const rawIndent = indentMatch[1].length;
            let contentPart = indentMatch[2];
            
            // Extract comment
            let comment = '';
            const commentIndex = contentPart.indexOf('#');
            if (commentIndex !== -1) {
                comment = contentPart.substring(commentIndex + 1).trim();
                contentPart = contentPart.substring(0, commentIndex).trim();
            } else {
                contentPart = contentPart.trim();
            }
            
            if (!contentPart) continue;
            
            const isDirectory = contentPart.endsWith('/');
            const name = isDirectory ? contentPart.slice(0, -1) : contentPart;
            
            // 2. Determine Hierarchy
            // If it's the very first line and looks like a root folder
            if (!rootDetected && pathStack.length === 0) {
                pathStack.push({ indent: -1, name: name });
                rootDetected = true;
                // Add root folder to zip
                zip.folder(name);
                continue;
            }
            
            // Pop stack until we find the parent (indentation < current)
            // Note: Tree output indentation is usually 4 chars per level
            while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= rawIndent) {
                pathStack.pop();
            }
            
            // Build full path
            const currentPath = pathStack.map(p => p.name).join('/');
            const fullPath = currentPath ? `${currentPath}/${name}` : name;
            
            if (isDirectory) {
                zip.folder(fullPath);
                pathStack.push({ indent: rawIndent, name: name });
            } else {
                // It's a file
                let content = '';
                if (this.addHeaderComments.checked) {
                    content = this.generateFileHeader(name, comment, dateStr, timeStr);
                }
                zip.file(fullPath, content);
            }
        }
        
        // Trigger Download
        const blob = await zip.generateAsync({type: "blob"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "project_scaffold.zip";
        a.click();
        URL.revokeObjectURL(url);
        
        this.updateStatus('生成完成');
        this.showNotification('压缩包已开始下载', 'success');
    }
    
    generateFileHeader(filename, description, date, time) {
        const ext = filename.split('.').pop().toLowerCase();
        const author = this.inputAuthor.value || 'Developer';
        const editor = this.inputEditor.value || author;
        
        // Template Data
        const info = {
            desc: description || filename,
            author: author,
            date: `${date} ${time.split(' ')[1] || ''}`, // Rough fix
            editor: editor
        };
        
        // Python Style
        if (['py'].includes(ext)) {
            return `'''
Description: ${info.desc}
Author: ${info.author}
Date: ${info.date}
LastEditTime: ${info.date}
LastEditors: ${info.editor}
'''
`;
        }
        
        // HTML/XML Style
        if (['html', 'xml', 'htm', 'vue'].includes(ext)) {
            return ``;
        }
        
        // Shell/Yaml Style
        if (['yaml', 'yml', 'sh', 'conf', 'properties'].includes(ext)) {
            return `# 
# Description: ${info.desc}
# Author: ${info.author}
# Date: ${info.date}
# LastEditTime: ${info.date}
# LastEditors: ${info.editor}
#
`;
        }
        
        // Default C-Style (JS, C, CPP, Java, CSS, etc.)
        return `/*
 * @Description: ${info.desc}
 * @Author: ${info.author}
 * @Date: ${info.date}
 * @LastEditTime: ${info.date}
 * @LastEditors: ${info.editor}
 */
`;
    }
    
    // ================= Logic: Parse Zip to Tree =================
    
    async parseZip() {
        if (!this.zipFile) {
            this.showNotification('请先上传 ZIP 文件', 'error');
            return;
        }
        
        this.updateStatus('正在解析...');
        try {
            const zip = await JSZip.loadAsync(this.zipFile);
            const fileStructure = {}; // Nested object representation
            
            // 1. Build structure object
            const filePaths = Object.keys(zip.files).sort();
            
            for (const path of filePaths) {
                const parts = path.split('/');
                let current = fileStructure;
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (!part) continue; // Trailing slash results in empty part
                    
                    if (!current[part]) {
                        current[part] = { 
                            __isDir: (i < parts.length - 1) || zip.files[path].dir, 
                            __path: path,
                            __children: {} 
                        };
                    }
                    current = current[part].__children;
                }
            }
            
            // 2. Generate Tree String (Recursive)
            let treeOutput = "";
            const rootKeys = Object.keys(fileStructure);
            
            // Handle root folder explicitly if it exists as a single top-level dir
            let rootObj = fileStructure;
            let startDepth = 0;
            
            // Traverse
            treeOutput = await this.renderTree(rootObj, "", zip);
            
            this.parseResult.value = treeOutput;
            this.updateStatus('解析完成');
            
        } catch (e) {
            console.error(e);
            this.showNotification('ZIP 解析失败: ' + e.message, 'error');
        }
    }
    
    async renderTree(structure, prefix, zip) {
        let output = "";
        const keys = Object.keys(structure).sort((a, b) => {
            // Folders first, then files
            const aIsDir = structure[a].__isDir;
            const bIsDir = structure[b].__isDir;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const node = structure[key];
            const isLast = (i === keys.length - 1);
            
            const connector = isLast ? "└── " : "├── ";
            const childPrefix = isLast ? "    " : "│   ";
            
            // Check for comment description
            let comment = "";
            if (!node.__isDir && this.extractHeaderComments.checked) {
                try {
                    // Fetch partial content to find description
                    const file = zip.file(node.__path);
                    if (file) {
                        const content = await file.async("string");
                        // Regex to find @Description: xxx or Description: xxx
                        const match = content.match(/(?:@Description|Description)\s*:\s*(.*)/i);
                        if (match && match[1]) {
                            comment = `  # ${match[1].trim()}`;
                        }
                    }
                } catch (e) {
                    // Ignore read errors
                }
            }
            
            const line = `${prefix}${connector}${key}${node.__isDir ? "/" : ""}${comment}\n`;
            output += line;
            
            if (node.__isDir) {
                output += await this.renderTree(node.__children, prefix + childPrefix, zip);
            }
        }
        return output;
    }

    // ================= Utils =================
    
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }
    
    copyResult() {
        if (this.parseResult.value) {
            navigator.clipboard.writeText(this.parseResult.value);
            this.showNotification('已复制到剪贴板', 'success');
        }
    }
    
    clearAll() {
        this.treeInput.value = '';
        this.fileInput.value = '';
        this.fileName.textContent = '';
        this.zipFile = null;
        this.parseResult.value = '';
        this.genResult.style.display = (this.currentMode === 'generate') ? 'flex' : 'none';
        this.parseResult.style.display = (this.currentMode === 'parse') ? 'block' : 'none';
    }
    
    updateStatus(text) {
        this.statusInfo.textContent = text;
    }
    
    showNotification(msg, type) {
        // Reuse existing notification logic if available in style or create simple alert
        const div = document.createElement('div');
        div.className = `notification ${type} show`;
        div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProjectScaffolder();
});