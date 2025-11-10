/*
 * @Description: SRT 转 TXT 工具
 * @Author: DSTBP
 * @Date: 2025-11-10
 */
class SRT2TXTConverter {
    constructor() {
        this.fileInput = document.getElementById('fileInput');
        this.fileUploadArea = document.getElementById('fileUploadArea');
        this.pasteInput = document.getElementById('pasteInput');
        this.outputText = document.getElementById('outputText');
        this.copyBtn = document.getElementById('copyBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.fileTab = document.getElementById('fileTab');
        this.pasteTab = document.getElementById('pasteTab');
        this.fileContent = document.getElementById('fileContent');
        this.pasteContent = document.getElementById('pasteContent');
        this.fileName = document.getElementById('fileName');
        this.lineCount = document.getElementById('lineCount');
        this.charCount = document.getElementById('charCount');
        this.withTimestamp = document.getElementById('withTimestamp');
        this.withoutTimestamp = document.getElementById('withoutTimestamp');
        this.separatorOptions = document.getElementById('separatorOptions');
        this.separatorNewline = document.getElementById('separatorNewline');
        this.separatorPunctuation = document.getElementById('separatorPunctuation');
        
        this.currentText = '';
        this.srtData = null; // 保存原始解析的数据
        
        this.bindEvents();
    }
    
    bindEvents() {
        // 标签切换
        this.fileTab.addEventListener('click', () => this.switchTab('file'));
        this.pasteTab.addEventListener('click', () => this.switchTab('paste'));
        
        // 文件上传
        this.fileUploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // 拖拽上传
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
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].name.endsWith('.srt')) {
                this.readFile(files[0]);
            } else {
                this.showError('请选择 .srt 格式的文件');
            }
        });
        
        // 粘贴输入
        this.pasteInput.addEventListener('input', () => this.handlePasteInput());
        this.pasteInput.addEventListener('paste', () => {
            setTimeout(() => this.handlePasteInput(), 10);
        });
        
        // 按钮事件
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.downloadBtn.addEventListener('click', () => this.downloadFile());
        this.clearBtn.addEventListener('click', () => this.clearAll());
        
        // 格式选项切换
        this.withTimestamp.addEventListener('change', () => {
            this.updateSeparatorOptions();
            this.updateOutput();
        });
        this.withoutTimestamp.addEventListener('change', () => {
            this.updateSeparatorOptions();
            this.updateOutput();
        });
        
        // 分割格式切换
        this.separatorNewline.addEventListener('change', () => this.updateOutput());
        this.separatorPunctuation.addEventListener('change', () => this.updateOutput());
    }
    
    switchTab(tab) {
        if (tab === 'file') {
            this.fileTab.classList.add('active');
            this.pasteTab.classList.remove('active');
            this.fileContent.classList.add('active');
            this.pasteContent.classList.remove('active');
        } else {
            this.pasteTab.classList.add('active');
            this.fileTab.classList.remove('active');
            this.pasteContent.classList.add('active');
            this.fileContent.classList.remove('active');
        }
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.name.endsWith('.srt')) {
                this.fileName.textContent = file.name;
                this.readFile(file);
            } else {
                this.showError('请选择 .srt 格式的文件');
                this.fileInput.value = '';
                this.fileName.textContent = '';
            }
        }
    }
    
    readFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.convertSRT(content);
        };
        reader.onerror = () => {
            this.showError('文件读取失败，请重试');
        };
        reader.readAsText(file, 'UTF-8');
    }
    
    handlePasteInput() {
        const content = this.pasteInput.value.trim();
        if (content) {
            this.convertSRT(content);
        } else {
            this.clearOutput();
        }
    }
    
    convertSRT(srtContent) {
        try {
            const lines = srtContent.split(/\r?\n/);
            const subtitles = [];
            let i = 0;
            
            while (i < lines.length) {
                const line = lines[i].trim();
                
                // 跳过空行
                if (!line) {
                    i++;
                    continue;
                }
                
                // 检查是否是序号（纯数字）
                if (/^\d+$/.test(line)) {
                    const index = parseInt(line);
                    i++;
                    
                    // 读取时间码行
                    let timestamp = '';
                    if (i < lines.length && lines[i].trim().includes('-->')) {
                        timestamp = lines[i].trim();
                        i++;
                    }
                    
                    // 收集文本行直到遇到空行或下一个序号
                    const currentSubtitle = [];
                    while (i < lines.length) {
                        const textLine = lines[i].trim();
                        
                        // 遇到空行，结束当前字幕
                        if (!textLine) {
                            i++;
                            break;
                        }
                        
                        // 检查是否是下一个序号
                        if (/^\d+$/.test(textLine)) {
                            break;
                        }
                        
                        // 检查是否是时间码（可能出现在字幕中间，需要跳过）
                        if (textLine.includes('-->')) {
                            i++;
                            continue;
                        }
                        
                        // 收集文本
                        currentSubtitle.push(textLine);
                        i++;
                    }
                    
                    // 保存字幕数据
                    if (currentSubtitle.length > 0) {
                        subtitles.push({
                            index: index,
                            timestamp: timestamp,
                            text: currentSubtitle.join('\n')
                        });
                    }
                } else {
                    // 如果不是标准格式，尝试直接提取文本（兼容性处理）
                    if (!line.includes('-->') && !/^\d+$/.test(line)) {
                        subtitles.push({
                            index: subtitles.length + 1,
                            timestamp: '',
                            text: line
                        });
                    }
                    i++;
                }
            }
            
            // 保存解析的数据
            this.srtData = subtitles;
            this.updateSeparatorOptions();
            this.updateOutput();
        } catch (error) {
            this.showError('转换失败：' + error.message);
        }
    }
    
    updateSeparatorOptions() {
        // 仅在不带时间戳时显示分割格式选项
        if (this.withoutTimestamp.checked) {
            this.separatorOptions.style.display = 'flex';
        } else {
            this.separatorOptions.style.display = 'none';
        }
    }
    
    updateOutput() {
        if (!this.srtData || this.srtData.length === 0) {
            this.currentText = '';
            this.outputText.value = '';
            this.updateStats();
            this.updateButtons();
            return;
        }
        
        const includeTimestamp = this.withTimestamp.checked;
        const textLines = [];
        
        this.srtData.forEach(subtitle => {
            if (includeTimestamp && subtitle.timestamp) {
                // 带时间戳格式：[时间戳] 文本
                textLines.push(`[${subtitle.timestamp}] ${subtitle.text}`);
            } else {
                // 不带时间戳格式：只保留文本
                textLines.push(subtitle.text);
            }
        });
        
        // 根据分割格式选项处理输出
        if (!includeTimestamp) {
            const usePunctuation = this.separatorPunctuation.checked;
            if (usePunctuation) {
                // 标点分隔：用中文标点符号连接
                this.currentText = textLines.join('，').replace(/\n/g, '');
            } else {
                // 换行分隔：每段字幕一行
                this.currentText = textLines.join('\n');
            }
        } else {
            // 带时间戳时使用换行分隔
            this.currentText = textLines.join('\n');
        }
        
        this.outputText.value = this.currentText;
        this.updateStats();
        this.updateButtons();
    }
    
    updateStats() {
        const lines = this.currentText.split('\n').filter(line => line.trim());
        const chars = this.currentText.length;
        this.lineCount.textContent = `${lines.length} 行`;
        this.charCount.textContent = `${chars} 字符`;
    }
    
    updateButtons() {
        const hasContent = this.currentText.trim().length > 0;
        this.copyBtn.disabled = !hasContent;
        this.downloadBtn.disabled = !hasContent;
    }
    
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.currentText);
            this.showSuccess('已复制到剪贴板！');
            // 临时改变按钮文本
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '✓ 已复制';
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
            }, 2000);
        } catch (error) {
            // 降级方案
            this.outputText.select();
            document.execCommand('copy');
            this.showSuccess('已复制到剪贴板！');
        }
    }
    
    downloadFile() {
        if (!this.currentText) return;
        
        const blob = new Blob([this.currentText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subtitle.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showSuccess('文件下载成功！');
    }
    
    clearAll() {
        this.fileInput.value = '';
        this.fileName.textContent = '';
        this.pasteInput.value = '';
        this.srtData = null;
        this.clearOutput();
    }
    
    clearOutput() {
        this.currentText = '';
        this.outputText.value = '';
        this.srtData = null;
        this.lineCount.textContent = '0 行';
        this.charCount.textContent = '0 字符';
        this.updateButtons();
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showNotification(message, type) {
        // 移除已存在的通知
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 显示动画
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // 自动移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SRT2TXTConverter();
});
