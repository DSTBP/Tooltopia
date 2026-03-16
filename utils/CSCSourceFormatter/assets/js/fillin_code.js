let fileTreeData = [];
let processedDocument = null;
let currentFormData = null;
let currentDocStatus = null;

const DEFAULT_FORM_DATA = Object.freeze({
    fileName: 'processed_document',
    hasHeader: false,
    hasFooter: false,
    headerText: '',
    footerText: '',
    headerTextAlign: 'center',
    footerTextAlign: 'center',
    headerChineseFont: 'Microsoft YaHei',
    headerEnglishFont: 'Times New Roman',
    footerChineseFont: 'Microsoft YaHei',
    footerEnglishFont: 'Times New Roman',
    headerFontSize: '12',
    footerFontSize: '12',
    headerUnderline: false,
    footerUnderline: false,
    headerMarginTop: '1.5',
    footerMarginBottom: '1.75',
    lineSpacing: '1.15',
    fontSize: '12',
    chineseFont: 'Microsoft YaHei',
    englishFont: 'Times New Roman',
    textAlignment: 'left',
    margins: {
        top: '2.54',
        bottom: '2.54',
        left: '3.18',
        right: '3.18'
    },
    pageNumber: {
        location: 'none',
        alignment: 'center'
    },
    headerBeforeSpacing: '0',
    headerAfterSpacing: '0',
    headerTextSpacing: '1',
    footerBeforeSpacing: '0',
    footerAfterSpacing: '0',
    footerTextSpacing: '1',
    firstPage: {
        content: '',
        contentChineseFont: 'Microsoft YaHei',
        contentEnglishFont: 'Times New Roman',
        contentSize: '12',
        contentAlign: 'left'
    }
});

const STATUS_THEME = {
    success: {
        day: {
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            color: '#15803d',
            border: '1px solid rgba(34, 197, 94, 0.3)'
        },
        night: {
            backgroundColor: 'rgba(76, 175, 80, 0.15)',
            color: 'hsl(122 40% 70%)',
            border: '1px solid rgba(76, 175, 80, 0.3)'
        }
    },
    error: {
        day: {
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#b91c1c',
            border: '1px solid rgba(239, 68, 68, 0.3)'
        },
        night: {
            backgroundColor: 'rgba(244, 67, 54, 0.15)',
            color: 'hsl(4 80% 70%)',
            border: '1px solid rgba(244, 67, 54, 0.3)'
        }
    },
    warning: {
        day: {
            backgroundColor: 'rgba(217, 119, 6, 0.15)',
            color: '#b45309',
            border: '2px solid #d97706'
        },
        night: {
            backgroundColor: 'rgba(255, 193, 7, 0.15)',
            color: 'hsl(45 100% 70%)',
            border: '1px solid rgba(255, 193, 7, 0.3)'
        }
    }
};

function mergeWithDefaultFormData(formData) {
    const source = formData || {};

    return {
        ...DEFAULT_FORM_DATA,
        ...source,
        margins: {
            ...DEFAULT_FORM_DATA.margins,
            ...(source.margins || {})
        },
        pageNumber: {
            ...DEFAULT_FORM_DATA.pageNumber,
            ...(source.pageNumber || {})
        },
        firstPage: {
            ...DEFAULT_FORM_DATA.firstPage,
            ...(source.firstPage || {})
        }
    };
}

function getStoredFormData() {
    try {
        return sessionStorage.getItem('wordFormData');
    } catch (error) {
        return null;
    }
}

function showToast(message, background) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${background};
        color: white;
        padding: 15px 30px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 14px;
        max-width: 80%;
        text-align: center;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

function showError(message) {
    showToast(message, '#ff4444');
}

function showSuccess(message) {
    showToast(message, '#4CAF50');
}

function showInfo(message) {
    showToast(message, '#2196F3');
}

function updateDocStatusColor() {
    const docStatusDisplay = document.getElementById('docStatusDisplay');
    const isDayMode = document.body.classList.contains('day-mode');

    if (!docStatusDisplay || !currentDocStatus || !STATUS_THEME[currentDocStatus]) {
        return;
    }

    const theme = isDayMode ? 'day' : 'night';
    Object.assign(docStatusDisplay.style, STATUS_THEME[currentDocStatus][theme]);
}

function updateFileName(input, displayId) {
    const display = document.getElementById(displayId);
    if (!display || !input || !input.files) {
        return;
    }

    if (input.files.length === 0) {
        display.textContent = '';
        return;
    }

    if (input.webkitdirectory) {
        const path = input.files[0].webkitRelativePath || '';
        const folderName = path.split('/')[0] || input.files[0].name;
        display.textContent = `Selected folder: ${folderName}`;
        return;
    }

    display.textContent = `Selected file: ${input.files[0].name}`;
}

function getFileExtension(fileName) {
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

function buildTreeStructure(files, extensionSet) {
    const tree = {};
    const matchedFiles = [];

    files.forEach((file) => {
        const fileExt = getFileExtension(file.name);
        if (!extensionSet.has(fileExt)) {
            return;
        }

        const path = file.webkitRelativePath || file.name;
        const pathParts = path.split('/');
        const fileName = pathParts[pathParts.length - 1];
        let currentLevel = tree;

        for (let i = 0; i < pathParts.length - 1; i += 1) {
            const part = pathParts[i];
            if (!currentLevel[part]) {
                currentLevel[part] = { type: 'directory', children: {} };
            }
            currentLevel = currentLevel[part].children;
        }

        currentLevel[fileName] = {
            type: 'file',
            file,
            path
        };

        matchedFiles.push({ name: fileName, path, file });
    });

    return { tree, matchedFiles };
}

function renderTree(node, parentElement, level) {
    const entries = Object.entries(node).sort(([nameA, itemA], [nameB, itemB]) => {
        if (itemA.type !== itemB.type) {
            return itemA.type === 'directory' ? -1 : 1;
        }
        return nameA.localeCompare(nameB);
    });

    entries.forEach(([name, item]) => {
        const itemElement = document.createElement('div');
        itemElement.style.marginLeft = `${level * 20}px`;

        if (item.type === 'directory') {
            itemElement.className = 'directory-item';
            itemElement.innerHTML = `<span class="folder-icon">📁</span> ${name}`;
            parentElement.appendChild(itemElement);
            renderTree(item.children, parentElement, level + 1);
            return;
        }

        itemElement.className = 'file-item';
        itemElement.innerHTML = `<span class="file-icon">📄</span> ${name}`;
        itemElement.dataset.path = item.path;
        itemElement.addEventListener('click', () => displayFileContent(item.file, item.name));
        parentElement.appendChild(itemElement);
    });
}

function scanProject() {
    const projectInput = document.getElementById('projectPath');
    const fileExtensionsInput = document.getElementById('fileExtensions');
    const projectFiles = Array.from(projectInput?.files || []);
    const fileExtensions = fileExtensionsInput.value
        .split(',')
        .map((extension) => extension.trim().toLowerCase())
        .filter(Boolean);

    if (projectFiles.length === 0) {
        showInfo('请选择项目文件夹！');
        return;
    }

    if (fileExtensions.length === 0) {
        showInfo('请输入文件后缀！');
        fileExtensionsInput.classList.add('error');
        fileExtensionsInput.focus();
        return;
    }

    const invalidExtensions = fileExtensions.filter((extension) => !/^[a-zA-Z0-9]+$/.test(extension));
    if (invalidExtensions.length > 0) {
        showInfo(`文件后缀格式不正确：${invalidExtensions.join(', ')}`);
        fileExtensionsInput.classList.add('error');
        fileExtensionsInput.focus();
        return;
    }

    fileExtensionsInput.classList.remove('error');

    const extensionSet = new Set(fileExtensions);
    const { tree, matchedFiles } = buildTreeStructure(projectFiles, extensionSet);
    const fileTree = document.getElementById('fileTree');

    fileTreeData = matchedFiles;
    fileTree.innerHTML = '';

    if (fileTreeData.length === 0) {
        showInfo('No files matched the selected extensions.');
        return;
    }

    renderTree(tree, fileTree, 0);
}

function getCommentStrategy(filePath) {
    const normalizedPath = (filePath || '').toLowerCase();
    const fileName = normalizedPath.split('/').pop() || '';
    const extension = fileName.includes('.') ? fileName.split('.').pop() : '';

    if (['py', 'pyw'].includes(extension)) {
        return { type: 'python', prefix: '# @File    : ' };
    }

    if (['js', 'ts', 'java', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'go', 'kt', 'kts', 'swift', 'rs', 'php'].includes(extension)) {
        return { type: 'line', prefix: '// @File    : ' };
    }

    if (['html', 'htm', 'xml', 'svg', 'vue'].includes(extension)) {
        return { type: 'block', prefix: '<!-- @File    : ', suffix: ' -->' };
    }

    if (['css', 'scss', 'sass', 'less'].includes(extension)) {
        return { type: 'block', prefix: '/* @File    : ', suffix: ' */' };
    }

    if (extension === 'sql') {
        return { type: 'line', prefix: '-- @File    : ' };
    }

    if (
        ['sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'conf', 'rb', 'pl'].includes(extension) ||
        fileName === 'dockerfile' ||
        fileName === 'makefile'
    ) {
        return { type: 'line', prefix: '# @File    : ' };
    }

    return null;
}

function createFileHeaderComment(filePath, strategy) {
    return `${strategy.prefix}${filePath}${strategy.suffix || ''}`;
}

function processFileComments(content, filePath) {
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const strategy = getCommentStrategy(filePath);

    if (!strategy) {
        return normalizedContent.trim();
    }

    if (strategy.type !== 'python') {
        const trimmedContent = normalizedContent.trim();
        const fileHeader = createFileHeaderComment(filePath, strategy);
        return trimmedContent ? `${fileHeader}\n\n${trimmedContent}` : fileHeader;
    }

    const lines = normalizedContent.split('\n');
    const preservedLines = [];
    const contentLines = [];

    lines.forEach((line, index) => {
        if (index === 0 && line.startsWith('#!')) {
            preservedLines.push(line);
            return;
        }

        if (/^#\s*-\*-\s*coding:.*-\*-\s*$/i.test(line) || /^#\s*coding[:=]/i.test(line)) {
            preservedLines.push(line);
            return;
        }

        contentLines.push(line);
    });

    const strippedContent = contentLines
        .join('\n')
        .replace(/^\s*#.*$/gm, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    const prefix = preservedLines.length > 0 ? `${preservedLines.join('\n')}\n` : '';
    const fileHeader = createFileHeaderComment(filePath, strategy);

    return strippedContent ? `${prefix}${fileHeader}\n\n${strippedContent}` : `${prefix}${fileHeader}`;
}

function processFunctionComments(content, filePath) {
    const strategy = getCommentStrategy(filePath);

    if (!strategy || strategy.type !== 'python') {
        return content.replace(/(?:\r\n|\n|\r){2,}/g, '\n');
    }

    return content
        .replace(/"""(.*?)"""/gs, (match, section) => {
            let nextSection = section;
            nextSection = nextSection.replace(/Args:[\s\S]*?(?=\n\n|$)/g, '');
            nextSection = nextSection.replace(/Returns:[\s\S]*?(?=\n\n|$)/g, '');
            nextSection = nextSection.replace(/^\s*:param.*$/gm, '');
            nextSection = nextSection.replace(/^\s*:return.*$/gm, '');
            nextSection = nextSection.replace(/^\s*$(?:\r\n|\n|\r)/gm, '');
            nextSection = nextSection.replace(/(?:\r\n|\n|\r){2,}/g, '\n');
            nextSection = nextSection.trim();
            return `"""${nextSection}"""`;
        })
        .replace(/(?:\r\n|\n|\r){2,}/g, '\n');
}

function removeConsecutiveEmptyLines(content) {
    return content.replace(/\n{2,}/g, '\n\n');
}

function getAlignmentType(value) {
    if (!value) {
        return docx.AlignmentType.LEFT;
    }
    if (value.toLowerCase() === 'both') {
        return docx.AlignmentType.JUSTIFIED;
    }
    return docx.AlignmentType[value.toUpperCase()] || docx.AlignmentType.LEFT;
}

function isEnglishChar(char) {
    return /[a-zA-Z0-9\s!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/.test(char);
}

function isChineseChar(char) {
    return /^[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]$/.test(char);
}

function createMixedTextRuns(text, chineseFont, englishFont, size, spacing) {
    const runs = [];
    let currentRunText = '';
    let currentRunType = null;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const charType = isEnglishChar(char)
            ? 'english'
            : isChineseChar(char)
                ? 'chinese'
                : 'english';

        if (currentRunType === null) {
            currentRunType = charType;
        }

        if (charType === currentRunType) {
            currentRunText += char;
            continue;
        }

        runs.push(new docx.TextRun({
            text: currentRunText,
            font: currentRunType === 'english' ? englishFont : chineseFont,
            size,
            spacing: spacing ? { line: spacing * 240 } : undefined
        }));
        currentRunText = char;
        currentRunType = charType;
    }

    if (currentRunText.length > 0) {
        runs.push(new docx.TextRun({
            text: currentRunText,
            font: currentRunType === 'english' ? englishFont : chineseFont,
            size,
            spacing: spacing ? { line: spacing * 240 } : undefined
        }));
    }

    return runs;
}

function createPageNumberRuns(font, size) {
    return [
        new docx.TextRun({ text: '第', font, size }),
        new docx.TextRun({ children: [docx.PageNumber.CURRENT], font, size }),
        new docx.TextRun({ text: ' 页，共', font, size }),
        new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES], font, size }),
        new docx.TextRun({ text: ' 页', font, size })
    ];
}

function createHeaderFooterParagraph({
    text,
    chineseFont,
    englishFont,
    size,
    align,
    underline,
    showPageNumber,
    pageSize,
    pageWidthCm = 21.0,
    marginLeftCm,
    marginRightCm,
    beforeSpacingPt,
    afterSpacingPt,
    spacing
}) {
    const children = [];
    const tabStops = [];
    const isBoth = align === 'both' && showPageNumber;

    if (text && text.trim()) {
        children.push(...createMixedTextRuns(text, chineseFont, englishFont, size, spacing));
    }

    if (isBoth) {
        children.push(new docx.TextRun({ text: '\t' }));

        const usableWidthCm = pageWidthCm - parseFloat(marginRightCm) - parseFloat(marginLeftCm);
        tabStops.push({
            type: docx.TabStopType.RIGHT,
            position: docx.convertInchesToTwip(usableWidthCm / 2.54)
        });
    }

    if (showPageNumber) {
        children.push(...createPageNumberRuns(chineseFont, pageSize));
    }

    return new docx.Paragraph({
        alignment: getAlignmentType(isBoth ? 'left' : align),
        border: underline
            ? {
                bottom: {
                    style: docx.BorderStyle.SINGLE,
                    size: 6,
                    color: '000000'
                }
            }
            : undefined,
        spacing: {
            before: beforeSpacingPt ? docx.convertInchesToTwip(beforeSpacingPt / 72) : undefined,
            after: afterSpacingPt ? docx.convertInchesToTwip(afterSpacingPt / 72) : undefined,
            line: spacing ? spacing * 240 : undefined
        },
        tabStops,
        children
    });
}

function createPageMargins(formData) {
    return {
        top: docx.convertInchesToTwip(parseFloat(formData.margins.top) / 2.54),
        bottom: docx.convertInchesToTwip(parseFloat(formData.margins.bottom) / 2.54),
        left: docx.convertInchesToTwip(parseFloat(formData.margins.left) / 2.54),
        right: docx.convertInchesToTwip(parseFloat(formData.margins.right) / 2.54),
        header: docx.convertInchesToTwip(parseFloat(formData.headerMarginTop) / 2.54),
        footer: docx.convertInchesToTwip(parseFloat(formData.footerMarginBottom) / 2.54)
    };
}

async function generateWordDocument(formData, sections) {
    try {
        const effectiveFormData = mergeWithDefaultFormData(formData);
        const doc = new docx.Document({
            sections: [{
                properties: {
                    page: {
                        margin: createPageMargins(effectiveFormData)
                    }
                },
                headers: {
                    default: effectiveFormData.hasHeader ? new docx.Header({
                        children: [
                            createHeaderFooterParagraph({
                                text: effectiveFormData.headerText,
                                chineseFont: effectiveFormData.headerChineseFont,
                                englishFont: effectiveFormData.headerEnglishFont,
                                size: effectiveFormData.headerFontSize * 2,
                                align: effectiveFormData.headerTextAlign,
                                underline: effectiveFormData.headerUnderline,
                                showPageNumber: effectiveFormData.pageNumber.location === 'header',
                                pageSize: effectiveFormData.headerFontSize * 2,
                                marginLeftCm: effectiveFormData.margins.left,
                                marginRightCm: effectiveFormData.margins.right,
                                beforeSpacingPt: effectiveFormData.headerBeforeSpacing,
                                afterSpacingPt: effectiveFormData.headerAfterSpacing,
                                spacing: effectiveFormData.headerTextSpacing
                            })
                        ]
                    }) : undefined
                },
                footers: {
                    default: effectiveFormData.hasFooter ? new docx.Footer({
                        children: [
                            createHeaderFooterParagraph({
                                text: effectiveFormData.footerText,
                                chineseFont: effectiveFormData.footerChineseFont,
                                englishFont: effectiveFormData.footerEnglishFont,
                                size: effectiveFormData.footerFontSize * 2,
                                align: effectiveFormData.footerTextAlign,
                                underline: effectiveFormData.footerUnderline,
                                showPageNumber: effectiveFormData.pageNumber.location === 'footer',
                                pageSize: effectiveFormData.footerFontSize * 2,
                                marginLeftCm: effectiveFormData.margins.left,
                                marginRightCm: effectiveFormData.margins.right,
                                beforeSpacingPt: effectiveFormData.footerBeforeSpacing,
                                afterSpacingPt: effectiveFormData.footerAfterSpacing,
                                spacing: effectiveFormData.footerTextSpacing
                            })
                        ]
                    }) : undefined
                },
                children: effectiveFormData.firstPage.content
                    .split('\n')
                    .map((line) => new docx.Paragraph({
                        children: createMixedTextRuns(
                            line || ' ',
                            effectiveFormData.firstPage.contentChineseFont || effectiveFormData.chineseFont,
                            effectiveFormData.firstPage.contentEnglishFont || effectiveFormData.englishFont,
                            (effectiveFormData.firstPage.contentSize * 2) || (effectiveFormData.fontSize * 2)
                        ),
                        spacing: { line: effectiveFormData.lineSpacing * 240 },
                        alignment: getAlignmentType(effectiveFormData.firstPage.contentAlign || effectiveFormData.textAlignment)
                    }))
            }].concat(sections.map((section, index) => ({
                ...section,
                properties: {
                    ...section.properties,
                    type: index === 0 ? docx.SectionType.NEXT_PAGE : docx.SectionType.CONTINUOUS
                }
            })))
        });

        showSuccess('Word文档生成成功！');
        return doc;
    } catch (error) {
        console.error('生成Word文档时出错：', error);
        showError(`生成Word文档时出错：${error.message}`);
        return null;
    }
}

function createCodeParagraphs(lines, formData) {
    return lines.map((line) => new docx.Paragraph({
        children: createMixedTextRuns(
            line || ' ',
            formData.chineseFont,
            formData.englishFont,
            formData.fontSize * 2,
            formData.lineSpacing
        ),
        spacing: {
            after: 50,
            line: formData.lineSpacing * 240
        },
        alignment: getAlignmentType(formData.textAlignment)
    }));
}

function createSpacerSection(formData) {
    return {
        properties: {
            type: docx.SectionType.CONTINUOUS,
            lineNumbers: {
                start: 0,
                countBy: 0,
                restart: docx.LineNumberRestartFormat.NEW_SECTION,
                suppressAutoLineBreaks: true,
                distance: 100
            }
        },
        children: [
            new docx.Paragraph({
                children: createMixedTextRuns(' ', formData.chineseFont, formData.englishFont, formData.fontSize * 2),
                spacing: { line: formData.lineSpacing * 240 }
            }),
            new docx.Paragraph({
                children: createMixedTextRuns(' ', formData.chineseFont, formData.englishFont, formData.fontSize * 2),
                spacing: { line: formData.lineSpacing * 240 }
            })
        ]
    };
}

function createCodeSection(codeParagraphs, formData) {
    return {
        properties: {
            type: docx.SectionType.CONTINUOUS,
            lineNumbers: {
                start: 0,
                countBy: 1,
                restart: docx.LineNumberRestartFormat.NEW_SECTION,
                suppressAutoLineBreaks: true,
                distance: 200
            },
            page: {
                margin: createPageMargins(formData)
            }
        },
        children: codeParagraphs
    };
}

async function getCode() {
    const parsedCodeLineLimit = parseInt(document.getElementById('codeLines').value || '1000', 10);
    const codeLineLimit = Number.isFinite(parsedCodeLineLimit) && parsedCodeLineLimit > 0
        ? parsedCodeLineLimit
        : 1000;

    if (fileTreeData.length === 0) {
        showInfo('Please scan the project first.');
        return;
    }

    if (typeof docx === 'undefined') {
        showError('The docx library failed to load. Please refresh and try again.');
        return;
    }

    try {
        const processingStatus = document.getElementById('processingStatus');
        const progressInfo = document.getElementById('progressInfo');
        const statsList = document.getElementById('fileStatsList') || document.createElement('ul');
        const effectiveFormData = mergeWithDefaultFormData(currentFormData);
        const sections = [];
        const stats = [];

        let totalLines = 0;
        let firstFile = true;

        statsList.id = 'fileStatsList';
        statsList.innerHTML = '';
        processingStatus.style.display = 'block';
        progressInfo.textContent = 'Processing document...';

        if (!statsList.parentElement) {
            processingStatus.appendChild(statsList);
        }

        for (let i = 0; i < fileTreeData.length; i += 1) {
            const file = fileTreeData[i];
            const rawContent = await readFileContent(file.file);
            let processedContent = processFileComments(rawContent, file.path);
            processedContent = processFunctionComments(processedContent, file.path);
            processedContent = removeConsecutiveEmptyLines(processedContent);

            const lines = processedContent.split('\n');
            const lineCount = lines.length;

            if (totalLines + lineCount > codeLineLimit) {
                break;
            }

            totalLines += lineCount;

            if (!firstFile) {
                sections.push(createSpacerSection(effectiveFormData));
            }

            sections.push(createCodeSection(createCodeParagraphs(lines, effectiveFormData), effectiveFormData));
            stats.push({ name: file.path, lines: lineCount });
            firstFile = false;
        }

        if (stats.length === 0) {
            progressInfo.textContent = 'No code content matched the current filters.';
            showInfo('No code content matched the current filters.');
            return;
        }

        stats.forEach((stat) => {
            const item = document.createElement('li');
            item.textContent = `${stat.name} (${stat.lines} lines)`;
            statsList.appendChild(item);
        });

        processedDocument = await generateWordDocument(effectiveFormData, sections);
        currentFormData = effectiveFormData;
        progressInfo.textContent = `Document ready: ${totalLines} lines across ${stats.length} files.`;
        showSuccess('Document is ready to download.');
    } catch (error) {
        console.error('Error while processing document:', error);
        showError(`Error while processing document: ${error.message}`);
    }
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function displayFileContent(file, fileName) {
    const fileTree = document.getElementById('fileTree');
    const fileContentDisplay = document.getElementById('fileContentDisplay');
    const displayFileName = document.getElementById('displayFileName');
    const displayFileCode = document.getElementById('displayFileCode');

    try {
        const content = await readFileContent(file);
        let processedContent = processFileComments(content, file.webkitRelativePath);
        processedContent = processFunctionComments(processedContent, file.webkitRelativePath);
        processedContent = removeConsecutiveEmptyLines(processedContent);

        displayFileName.textContent = `文件: ${file.webkitRelativePath}`;
        displayFileCode.textContent = processedContent;
        fileTree.style.display = 'none';
        fileContentDisplay.style.display = 'block';
    } catch (error) {
        console.error(`显示文件 ${fileName} 时出错:`, error);
        showInfo(`无法显示文件内容: ${fileName}`);
    }
}

function backToFileTree() {
    document.getElementById('fileContentDisplay').style.display = 'none';
    document.getElementById('fileTree').style.display = 'block';
}

async function downloadDocument(fileName) {
    if (!processedDocument) {
        showInfo('Please process the document first.');
        return;
    }

    if (typeof saveAs === 'undefined') {
        showError('The file saving library failed to load. Please refresh and try again.');
        return;
    }

    try {
        const outputFileName = fileName || currentFormData?.fileName || DEFAULT_FORM_DATA.fileName;
        const blob = await docx.Packer.toBlob(processedDocument);
        saveAs(blob, `${outputFileName}.docx`);
        showSuccess('Document downloaded successfully.');
    } catch (error) {
        console.error('Error while downloading document:', error);
        showError(`Error while downloading document: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedFormData = getStoredFormData();
    const docStatusDisplay = document.getElementById('docStatusDisplay');

    if (savedFormData) {
        try {
            currentFormData = mergeWithDefaultFormData(JSON.parse(savedFormData));
            docStatusDisplay.textContent = '已成功加载初始化文档';
            currentDocStatus = 'success';
        } catch (error) {
            currentFormData = mergeWithDefaultFormData();
            docStatusDisplay.textContent = '未能正确解析初始化文档';
            currentDocStatus = 'error';
        }
    } else {
        currentFormData = mergeWithDefaultFormData();
        docStatusDisplay.textContent = '未找到初始化文档，将采用新建文档策略';
        currentDocStatus = 'warning';
    }

    updateDocStatusColor();

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            setTimeout(updateDocStatusColor, 10);
        });
    }
});

window.updateFileName = updateFileName;
window.scanProject = scanProject;
window.getCode = getCode;
window.backToFileTree = backToFileTree;
window.downloadDocument = downloadDocument;
