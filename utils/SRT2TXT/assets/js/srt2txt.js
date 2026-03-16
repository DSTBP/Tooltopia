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
        this.srtData = [];
        this.notificationTimer = null;
        this.pasteUpdateTimer = null;

        this.bindEvents();
        this.updateSeparatorOptions();
        this.updateButtons();
    }

    bindEvents() {
        this.fileTab.addEventListener('click', () => this.switchTab('file'));
        this.pasteTab.addEventListener('click', () => this.switchTab('paste'));

        this.fileUploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (event) => this.handleFileSelect(event));

        this.fileUploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.fileUploadArea.classList.add('drag-over');
        });

        this.fileUploadArea.addEventListener('dragleave', () => {
            this.fileUploadArea.classList.remove('drag-over');
        });

        this.fileUploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            this.fileUploadArea.classList.remove('drag-over');

            const file = event.dataTransfer?.files?.[0];
            if (!file) {
                return;
            }

            if (!this.isSrtFile(file.name)) {
                this.showError('Please choose an .srt subtitle file.');
                return;
            }

            this.setSelectedFile(file);
            this.readFile(file);
        });

        this.pasteInput.addEventListener('input', () => this.schedulePasteParsing());
        this.pasteInput.addEventListener('paste', () => this.schedulePasteParsing());

        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.downloadBtn.addEventListener('click', () => this.downloadFile());
        this.clearBtn.addEventListener('click', () => this.clearAll());

        [this.withTimestamp, this.withoutTimestamp, this.separatorNewline, this.separatorPunctuation].forEach((input) => {
            input.addEventListener('change', () => {
                this.updateSeparatorOptions();
                this.updateOutput();
            });
        });
    }

    switchTab(tab) {
        const isFileTab = tab === 'file';
        this.fileTab.classList.toggle('active', isFileTab);
        this.pasteTab.classList.toggle('active', !isFileTab);
        this.fileContent.classList.toggle('active', isFileTab);
        this.pasteContent.classList.toggle('active', !isFileTab);
    }

    isSrtFile(fileName) {
        return fileName.toLowerCase().endsWith('.srt');
    }

    setSelectedFile(file) {
        this.fileName.textContent = file.name;

        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            this.fileInput.files = dataTransfer.files;
        } catch (error) {
            // Ignore browsers that do not support programmatic FileList assignment.
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (!this.isSrtFile(file.name)) {
            this.showError('Please choose an .srt subtitle file.');
            this.fileInput.value = '';
            this.fileName.textContent = '';
            return;
        }

        this.fileName.textContent = file.name;
        this.readFile(file);
    }

    readFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => this.convertSRT(event.target.result || '');
        reader.onerror = () => this.showError('Failed to read the subtitle file.');
        reader.readAsText(file, 'UTF-8');
    }

    schedulePasteParsing() {
        clearTimeout(this.pasteUpdateTimer);
        this.pasteUpdateTimer = setTimeout(() => this.handlePasteInput(), 60);
    }

    handlePasteInput() {
        const content = this.pasteInput.value.trim();
        if (!content) {
            this.clearOutput();
            return;
        }

        this.convertSRT(content);
    }

    normalizeSrtContent(content) {
        return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    parseSRT(content) {
        const normalizedContent = this.normalizeSrtContent(content);
        const lines = normalizedContent.split('\n');
        const subtitles = [];

        let index = 0;
        while (index < lines.length) {
            const line = lines[index].trim();

            if (!line) {
                index += 1;
                continue;
            }

            if (/^\d+$/.test(line)) {
                const block = this.parseStandardBlock(lines, index);
                index = block.nextIndex;
                if (block.subtitle) {
                    subtitles.push(block.subtitle);
                }
                continue;
            }

            if (line.includes('-->')) {
                const block = this.parseTimestampFirstBlock(lines, index);
                index = block.nextIndex;
                if (block.subtitle) {
                    subtitles.push(block.subtitle);
                }
                continue;
            }

            subtitles.push({
                timestamp: '',
                text: line
            });
            index += 1;
        }

        return subtitles;
    }

    parseStandardBlock(lines, startIndex) {
        let index = startIndex + 1;
        let timestamp = '';

        if (index < lines.length && lines[index].trim().includes('-->')) {
            timestamp = lines[index].trim();
            index += 1;
        }

        const textLines = [];
        while (index < lines.length) {
            const line = lines[index].trim();

            if (!line) {
                index += 1;
                break;
            }

            if (/^\d+$/.test(line) && index + 1 < lines.length && lines[index + 1].trim().includes('-->')) {
                break;
            }

            if (!line.includes('-->')) {
                textLines.push(line);
            }

            index += 1;
        }

        return {
            nextIndex: index,
            subtitle: textLines.length > 0
                ? {
                    timestamp,
                    text: textLines.join('\n')
                }
                : null
        };
    }

    parseTimestampFirstBlock(lines, startIndex) {
        let index = startIndex;
        const timestamp = lines[index].trim();
        index += 1;

        const textLines = [];
        while (index < lines.length) {
            const line = lines[index].trim();

            if (!line) {
                index += 1;
                break;
            }

            if (/^\d+$/.test(line) && index + 1 < lines.length && lines[index + 1].trim().includes('-->')) {
                break;
            }

            if (!line.includes('-->')) {
                textLines.push(line);
            }

            index += 1;
        }

        return {
            nextIndex: index,
            subtitle: textLines.length > 0
                ? {
                    timestamp,
                    text: textLines.join('\n')
                }
                : null
        };
    }

    convertSRT(srtContent) {
        try {
            this.srtData = this.parseSRT(srtContent);
            this.updateSeparatorOptions();
            this.updateOutput();
        } catch (error) {
            this.showError(`Conversion failed: ${error.message}`);
        }
    }

    updateSeparatorOptions() {
        this.separatorOptions.style.display = this.withoutTimestamp.checked ? 'flex' : 'none';
    }

    buildOutputLines(includeTimestamp) {
        return this.srtData.map((subtitle) => {
            if (includeTimestamp && subtitle.timestamp) {
                return `[${subtitle.timestamp}] ${subtitle.text}`;
            }
            return subtitle.text;
        });
    }

    updateOutput() {
        if (!this.srtData || this.srtData.length === 0) {
            this.clearOutput();
            return;
        }

        const includeTimestamp = this.withTimestamp.checked;
        const textLines = this.buildOutputLines(includeTimestamp);

        if (includeTimestamp) {
            this.currentText = textLines.join('\n');
        } else if (this.separatorPunctuation.checked) {
            this.currentText = textLines.map((line) => line.replace(/\n+/g, '')).join('，');
        } else {
            this.currentText = textLines.join('\n');
        }

        this.outputText.value = this.currentText;
        this.updateStats();
        this.updateButtons();
    }

    updateStats() {
        const lineTotal = this.currentText
            ? this.currentText.split(/\n/).filter((line) => line.trim().length > 0).length
            : 0;
        const charTotal = this.currentText.length;

        this.lineCount.textContent = `${lineTotal} 行`;
        this.charCount.textContent = `${charTotal} 字符`;
    }

    updateButtons() {
        const hasContent = this.currentText.trim().length > 0;
        this.copyBtn.disabled = !hasContent;
        this.downloadBtn.disabled = !hasContent;
    }

    async copyToClipboard() {
        if (!this.currentText) {
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(this.currentText);
            } else {
                this.outputText.select();
                document.execCommand('copy');
            }

            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '✓ 已复制';
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
            }, 2000);
            this.showSuccess('Copied to clipboard.');
        } catch (error) {
            this.showError('Copy failed.');
        }
    }

    downloadFile() {
        if (!this.currentText) {
            return;
        }

        const blob = new Blob([this.currentText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'subtitle.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        this.showSuccess('TXT file downloaded.');
    }

    clearAll() {
        this.fileInput.value = '';
        this.fileName.textContent = '';
        this.pasteInput.value = '';
        this.srtData = [];
        this.clearOutput();
    }

    clearOutput() {
        this.currentText = '';
        this.outputText.value = '';
        this.srtData = [];
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
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => {
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
