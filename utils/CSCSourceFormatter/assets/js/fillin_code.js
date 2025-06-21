// 保存当前选择的文件，用于重新筛选
let selectedFiles = [];

// 存储文件树数据
let fileTreeData = [];

// 存储处理后的文档
let processedDocument = null;

// 存储文档生成所用的 formData
let currentFormData = null;

// 显示错误信息
function showError(message) {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; top: 20px; left: 50%;
        transform: translateX(-50%);
        background: #ff4444; color: white;
        padding: 15px 30px; border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000; font-size: 14px;
        max-width: 80%; text-align: center;
    `;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => document.body.removeChild(div), 3000);
}

// 显示成功提示
function showSuccess(message) {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; top: 20px; left: 50%;
        transform: translateX(-50%);
        background: #4CAF50; color: white;
        padding: 15px 30px; border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000; font-size: 14px;
        max-width: 80%; text-align: center;
    `;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => document.body.removeChild(div), 3000);
}

// 显示信息提示
function showInfo(message) {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; top: 20px; left: 50%;
        transform: translateX(-50%);
        background: #2196F3; color: white;
        padding: 15px 30px; border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000; font-size: 14px;
        max-width: 80%; text-align: center;
    `;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => document.body.removeChild(div), 3000);
}


// 页面加载时初始化文档
document.addEventListener('DOMContentLoaded', async function () {
    const savedFormData = sessionStorage.getItem('wordFormData');
    const docStatusDisplay = document.getElementById('docStatusDisplay');
    
    if (savedFormData) {
        try {
            currentFormData = JSON.parse(savedFormData);
            docStatusDisplay.textContent = '已成功加载初始化文档';
            docStatusDisplay.style.backgroundColor = '#e8f5e9';
            docStatusDisplay.style.color = '#2e7d32';
        } catch (error) {
            docStatusDisplay.textContent = '未能正确解析初始化文档';
            docStatusDisplay.style.backgroundColor = '#ffebee';
            docStatusDisplay.style.color = '#c62828';
            currentFormData = null;
        }
    } else {
        docStatusDisplay.textContent = '未找到初始化文档，将采用新建文档策略';
        docStatusDisplay.style.backgroundColor = '#e3f2fd';
        docStatusDisplay.style.color = '#1565c0';
        currentFormData = null;
    }
});

// 文件扫描和目录树显示功能
function scanProject() {
    const projectPath = document.getElementById('projectPath').files;
    const fileExtensionsInput = document.getElementById('fileExtensions');
    const fileExtensions = fileExtensionsInput.value.split(',').map(ext => ext.trim()).filter(ext => ext);
    
    if (!projectPath || projectPath.length === 0) {
        showInfo('请选择项目文件夹！');
        return;
    }

    if (fileExtensions.length === 0) {
        showInfo('请输入文件后缀！');
        fileExtensionsInput.classList.add('error');
        fileExtensionsInput.focus();
        return;
    }

    // 验证文件后缀格式
    const invalidExtensions = fileExtensions.filter(ext => !/^[a-zA-Z0-9]+$/.test(ext));
    if (invalidExtensions.length > 0) {
        showInfo(`文件后缀格式不正确：${invalidExtensions.join(', ')}`);
        fileExtensionsInput.classList.add('error');
        fileExtensionsInput.focus();
        return;
    }

    fileExtensionsInput.classList.remove('error');
    const fileTree = document.getElementById('fileTree');
    fileTree.innerHTML = '';
    fileTreeData = [];

    // 创建文件树结构
    const treeStructure = {};
    
    // 遍历文件并构建树结构
    for (let file of projectPath) {
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (fileExtensions.includes(fileExt)) {
            const pathParts = file.webkitRelativePath.split('/');
            let currentLevel = treeStructure;
            
            // 构建目录树
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!currentLevel[part]) {
                    currentLevel[part] = { type: 'directory', children: {} };
                }
                currentLevel = currentLevel[part].children;
            }
            
            // 添加文件
            const fileName = pathParts[pathParts.length - 1];
            currentLevel[fileName] = {
                type: 'file',
                file: file,
                path: file.webkitRelativePath
            };
            
            fileTreeData.push({
                name: fileName,
                path: file.webkitRelativePath,
                file: file
            });
        }
    }

    // 递归渲染树结构
    function renderTree(node, parentElement, level = 0) {
        for (const [name, item] of Object.entries(node)) {
            const itemElement = document.createElement('div');
            itemElement.style.marginLeft = `${level * 20}px`;
            
            if (item.type === 'directory') {
                itemElement.className = 'directory-item';
                itemElement.innerHTML = `<span class="folder-icon">📁</span> ${name}`;
                parentElement.appendChild(itemElement);
                
                // 递归处理子目录
                renderTree(item.children, parentElement, level + 1);
            } else {
                itemElement.className = 'file-item';
                itemElement.innerHTML = `<span class="file-icon">📄</span> ${name}`;
                itemElement.setAttribute('data-path', item.path);
                itemElement.addEventListener('click', () => displayFileContent(item.file, item.name));
                parentElement.appendChild(itemElement);
            }
        }
    }

    // 渲染文件树
    renderTree(treeStructure, fileTree);
}

// 渲染目录树HTML
function renderTree(tree, level = 0) {
    let html = '';

    // 渲染目录
    if (tree.dirs) {
        Object.entries(tree.dirs).forEach(([dir, subtree]) => {
            html += `<div class="tree-item" style="margin-left: ${level * 20}px">
                <span style="color: #3498db;">📁 ${dir}</span>
                ${renderTree(subtree, level + 1)}
            </div>`;
        });
    }

    // 渲染文件
    if (tree.files) {
        tree.files.forEach(file => {
            html += `<div class="tree-item" style="margin-left: ${level * 20}px">
                <span style="color: #666;">📄 ${file.name}</span>
                <span style="color: #999; margin-left: 10px;">(${file.size})</span>
            </div>`;
        });
    }

    return html;
}

// 处理文件注释
function processFileComments(content, filePath) {
    // 保留 coding 声明
    const codingRegex = /# -\*- coding:.*?-\*-/;
    let codingLine = content.match(codingRegex)?.[0] || '';

    // 移除所有 # 开头的注释
    content = content.replace(/^#.*$/gm, '');

    // 移除所有可能存在的空行，为后续重新添加注释做准备
    content = content.replace(/\n\s*\n/g, '\n').trim();

    // 重新添加保留的注释和新的文件路径注释
    let newContent = '';
    if (codingLine) {
        newContent += codingLine + '\n';
    }
    newContent += `# @File    : ${filePath}\n`;
    
    // 确保注释和代码之间至少有一行空行
    if (content.length > 0 && !content.startsWith('\n')) {
        newContent += '\n';
    }

    newContent += content;
    
    return newContent;
}

// 处理函数注释
function processFunctionComments(content) {
    // 处理 """ 类型的注释
    content = content.replace(/"""(.*?)"""/gs, (match, p1) => {
        // 移除 Args 和 Returns 部分
        p1 = p1.replace(/Args:[\s\S]*?(?=\n\n|$)/g, '');
        p1 = p1.replace(/Returns:[\s\S]*?(?=\n\n|$)/g, '');
        // 移除 param 和 return 行
        p1 = p1.replace(/^\s*:param.*$/gm, '');
        p1 = p1.replace(/^\s*:return.*$/gm, '');
        // 移除空行和只包含空格的行
        p1 = p1.replace(/^\s*$(?:\r\n|\n|\r)/gm, '');
        // 将连续的换行符合并为单个换行符
        p1 = p1.replace(/(?:\r\n|\n|\r){2,}/g, '\n');
        // 清理多余的空行
        p1 = p1.trim();
        return `"""${p1}"""`;
    });
    
    // 处理注释块外的内容
    content = content.replace(/(?:\r\n|\n|\r){2,}/g, '\n');
    
    return content;
}

// 移除连续的空行
function removeConsecutiveEmptyLines(content) {
    return content.replace(/\n{2,}/g, '\n\n');
}

// 将字符串转换为 docx 对齐方式
function getAlignmentType(val) {
    if (!val) return docx.AlignmentType.LEFT;
    if (val.toLowerCase() === 'both') return docx.AlignmentType.JUSTIFIED;
    return docx.AlignmentType[val.toUpperCase()] || docx.AlignmentType.LEFT;
}

// 辅助函数：判断字符是否属于英文字符、数字或英文标点
function isEnglishChar(char) {
    // 包含基本拉丁字母、数字、以及常见的英文标点符号
    return /[a-zA-Z0-9\s!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/.test(char);
}

// 辅助函数：判断字符是否属于中文字符或中文标点
function isChineseChar(char) {
    // 包含常用汉字范围 (CJK Unified Ideographs) 和常见的中文全角标点符号
    return /^[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]$/.test(char);
}

// 将文本分割成中文和英文部分，并应用相应的字体
function createMixedTextRuns(text, chineseFont, englishFont, size, spacing) {
    const runs = [];
    let currentRunText = '';
    let currentRunType = null; // 'english' or 'chinese'

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        let charType;

        if (isEnglishChar(char)) {
            charType = 'english';
        } else if (isChineseChar(char)) {
            charType = 'chinese';
        } else {
            // 无法明确判断的"其他"字符，默认使用英文字体
            charType = 'english';
        }

        if (currentRunType === null) {
            currentRunType = charType;
        }

        if (charType === currentRunType) {
            currentRunText += char;
        } else {
            // 字符类型变化，将当前累积的文本作为一个 TextRun 添加
            runs.push(new docx.TextRun({
                text: currentRunText,
                font: currentRunType === 'english' ? englishFont : chineseFont,
                size,
                spacing: spacing ? { line: spacing * 240 } : undefined
            }));
            currentRunText = char;
            currentRunType = charType;
        }
    }

    // 添加最后一个 TextRun
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

// 创建"第 X 页 / 共 Y 页"结构
function createPageNumberRuns(font, size) {
    return [
        new docx.TextRun({ text: '第 ', font, size }),
        new docx.TextRun({ children: [docx.PageNumber.CURRENT], font, size }),
        new docx.TextRun({ text: ' 页，共 ', font, size }),
        new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES], font, size }),
        new docx.TextRun({ text: ' 页', font, size })
    ];
}

// 构建页眉/页脚段落（可包含文本 + 页码 + 制表位）
function createHeaderFooterParagraph({
    text,
    chineseFont,
    englishFont,
    size,
    align,
    underline,
    showPageNumber,
    pageFont,
    pageSize,
    location,
    pageWidthCm = 21.0,
    marginLeftCm,
    marginRightCm,
    beforeSpacingPt,         // 段前间距（磅）
    afterSpacingPt,          // 段后间距（磅）
    spacing                // 文本间距（倍数）
}) {
    const children = [];
    const tabStops = [];

    const isBoth = align === 'both' && showPageNumber;

    if (text?.trim()) {
        children.push(...createMixedTextRuns(text, chineseFont, englishFont, size, spacing));
    }

    if (isBoth) {
        children.push(new docx.TextRun({ text: '\t' }));

        const usableWidthCm = pageWidthCm - parseFloat(marginRightCm) - parseFloat(marginLeftCm);
        const tabStopPosition = docx.convertInchesToTwip(usableWidthCm / 2.54);

        tabStops.push({
            type: docx.TabStopType.RIGHT,
            position: tabStopPosition
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
                    color: "000000"
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

// 生成 Word 文档（主函数）
async function generateWordDocument(formData, sections) {
    try {
        const doc = new docx.Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: docx.convertInchesToTwip(parseFloat(formData.margins.top) / 2.54),
                            bottom: docx.convertInchesToTwip(parseFloat(formData.margins.bottom) / 2.54),
                            left: docx.convertInchesToTwip(parseFloat(formData.margins.left) / 2.54),
                            right: docx.convertInchesToTwip(parseFloat(formData.margins.right) / 2.54),
                            header: docx.convertInchesToTwip(parseFloat(formData.headerMarginTop) / 2.54),   // 页眉距顶边 1.5cm
                            footer: docx.convertInchesToTwip(parseFloat(formData.footerMarginBottom) / 2.54)   // 页脚距底边 1.75cm
                        }
                    }
                },
                headers: {
                    default: formData.hasHeader ? new docx.Header({
                        children: [
                            createHeaderFooterParagraph({
                                text: formData.headerText,
                                chineseFont: formData.headerChineseFont,
                                englishFont: formData.headerEnglishFont,
                                size: formData.headerFontSize * 2,
                                align: formData.headerTextAlign,
                                underline: formData.headerUnderline,
                                showPageNumber: formData.pageNumber.location === 'header',
                                pageFont: formData.headerChineseFont,
                                pageSize: formData.headerFontSize * 2,
                                location: 'header',
                                pageWidthCm: 21.0,
                                marginLeftCm: formData.margins.left,
                                marginRightCm: formData.margins.right,
                                beforeSpacingPt: formData.headerBeforeSpacing,
                                afterSpacingPt: formData.headerAfterSpacing,
                                spacing: formData.headerTextSpacing
                            })
                        ]
                    }) : undefined
                },
                footers: {
                    default: formData.hasFooter ? new docx.Footer({
                        children: [
                            createHeaderFooterParagraph({
                                text: formData.footerText,
                                chineseFont: formData.footerChineseFont,
                                englishFont: formData.footerEnglishFont,
                                size: formData.footerFontSize * 2,
                                align: formData.footerTextAlign,
                                underline: formData.footerUnderline,
                                showPageNumber: formData.pageNumber.location === 'footer',
                                pageFont: formData.footerChineseFont,
                                pageSize: formData.footerFontSize * 2,
                                location: 'footer',
                                pageWidthCm: 21.0,
                                marginLeftCm: formData.margins.left,
                                marginRightCm: formData.margins.right,
                                beforeSpacingPt: formData.footerBeforeSpacing,
                                afterSpacingPt: formData.footerAfterSpacing,
                                spacing: formData.footerTextSpacing
                            })
                        ]
                    }) : undefined
                },
                children: [
                    // 第一页内容（保持格式）
                    ...formData.firstPage.content.split('\n').map(line =>
                        new docx.Paragraph({
                            children: createMixedTextRuns(
                                line || ' ', // 空行用空格代替
                                formData.firstPage.contentChineseFont || formData.chineseFont,
                                formData.firstPage.contentEnglishFont || formData.englishFont,
                                (formData.firstPage.contentSize * 2) || (formData.fontSize * 2) // 确保字号转换为半磅
                            ),
                            spacing: { line: formData.lineSpacing * 240 },
                            alignment: getAlignmentType(formData.firstPage.contentAlign || formData.textAlignment)
                        })
                    )
                ]
            }].concat(sections.map((section, index) => ({
                ...section,
                properties: {
                    ...section.properties,
                    type: index === 0 ? docx.SectionType.NEXT_PAGE : docx.SectionType.CONTINUOUS // 只有第一个section从新页开始
                }
            })))
        });

        showSuccess('Word文档生成成功！');
        return doc
    } catch (error) {
        console.error('生成Word文档时出错：', error);
        showError(`生成Word文档时出错：${error.message}`);
    }
}


// 获取代码函数
async function getCode() {
    const codeLineLimit = parseInt(document.getElementById('codeLines').value || '1000');

    if (!fileTreeData || fileTreeData.length === 0) {
        showInfo('请先扫描项目！');
        return;
    }

    try {
        const processingStatus = document.getElementById('processingStatus');
        const progressInfo = document.getElementById('progressInfo');
        const statsList = document.getElementById('fileStatsList') || document.createElement('ul');
        statsList.id = 'fileStatsList';
        statsList.innerHTML = '';

        processingStatus.style.display = 'block';
        progressInfo.innerHTML = '正在处理文档...';
        processingStatus.appendChild(statsList);

        // 导入所需组件
        const { 
            Document, 
            Paragraph, 
            TextRun, 
            LineNumberRestartFormat,
            SectionType  // 新增关键导入
        } = docx;
        
        const children = [];
        const stats = [];
        const sections = []; // 存储所有section

        let totalLines = 0;
        let firstFile = true;

        for (let i = 0; i < fileTreeData.length; i++) {
            const file = fileTreeData[i];

            // 读取并处理文件内容
            const rawContent = await readFileContent(file.file);
            let processed = processFileComments(rawContent, file.path);
            processed = processFunctionComments(processed);
            processed = removeConsecutiveEmptyLines(processed);

            const lines = processed.split('\n');
            const lineCount = lines.length;

            // 检查行数限制
            if (totalLines + lineCount > codeLineLimit) break;
            totalLines += lineCount;

            // 创建当前文件的代码段落
            const codeParagraphs = lines.map((line) => {
                return new Paragraph({
                    children: createMixedTextRuns(
                        line || ' ', // 空行用空格代替
                        currentFormData ? currentFormData.chineseFont : 'SimSun',
                        currentFormData ? currentFormData.englishFont : 'Courier New',
                        currentFormData ? currentFormData.fontSize * 2 : 20,
                        currentFormData ? currentFormData.lineSpacing : undefined
                    ),
                    spacing: { 
                        after: 50,
                        line: currentFormData ? currentFormData.lineSpacing * 240 : undefined
                    },
                    alignment: currentFormData ? getAlignmentType(currentFormData.textAlignment) : undefined
                });
            });

            // 如果不是第一个文件，添加分节符实现连续排版
            if (!firstFile) {
                sections.push({
                    properties: {
                        type: SectionType.CONTINUOUS,
                        lineNumbers: {
                            start: 0,
                            countBy: 0, // 不显示行号
                            restart: LineNumberRestartFormat.NEW_SECTION,
                            suppressAutoLineBreaks: true,
                            distance: 100
                        }
                    },
                    children: [
                        new Paragraph({ 
                            children: createMixedTextRuns(
                                ' ',
                                currentFormData ? currentFormData.chineseFont : 'SimSun',
                                currentFormData ? currentFormData.englishFont : 'Courier New',
                                currentFormData ? currentFormData.fontSize * 2 : 20
                            ),
                            spacing: currentFormData ? { line: currentFormData.lineSpacing * 240 } : undefined
                        }),
                        new Paragraph({ 
                            children: createMixedTextRuns(
                                ' ',
                                currentFormData ? currentFormData.chineseFont : 'SimSun',
                                currentFormData ? currentFormData.englishFont : 'Courier New',
                                currentFormData ? currentFormData.fontSize * 2 : 20
                            ),
                            spacing: currentFormData ? { line: currentFormData.lineSpacing * 240 } : undefined
                        })
                    ]
                });
            }
            firstFile = false;

            // 添加当前文件内容
            children.push(...codeParagraphs);

            // 创建带行号配置的section
            sections.push({
                properties: {
                    type: SectionType.CONTINUOUS, // 连续排版不分页
                    lineNumbers: {
                        start: 0,  // 每节行号从1开始
                        countBy: 1, // 每行编号
                        restart: LineNumberRestartFormat.NEW_SECTION, // 每节重新编号
                        suppressAutoLineBreaks: true, // 禁止空行编号
                        distance: 200 // 行号与代码间距
                    },
                    page: currentFormData ? {
                        margin: {
                            top: docx.convertInchesToTwip(parseFloat(currentFormData.margins.top) / 2.54),
                            bottom: docx.convertInchesToTwip(parseFloat(currentFormData.margins.bottom) / 2.54),
                            left: docx.convertInchesToTwip(parseFloat(currentFormData.margins.left) / 2.54),
                            right: docx.convertInchesToTwip(parseFloat(currentFormData.margins.right) / 2.54),
                            header: docx.convertInchesToTwip(parseFloat(currentFormData.headerMarginTop) / 2.54),   // 页眉距顶边 1.5cm
                            footer: docx.convertInchesToTwip(parseFloat(currentFormData.footerMarginBottom) / 2.54)   // 页脚距底边 1.75cm
                        }
                    } : {
                        margin: {
                            left: 1440, // 左边距（twip 单位）
                            right: 720  // 右边距
                        }
                    }
                },
                children: [...children] // 当前节内容
            });

            // 清空临时children准备下一节
            children.length = 0;
            stats.push({ name: file.path, lines: lineCount });
        }

        // 显示文件统计信息
        stats.forEach(stat => {
            const li = document.createElement('li');
            li.textContent = `${stat.name}（${stat.lines} 行）`;
            statsList.appendChild(li);
        });

        // 如果没有从session中读取到文档就构建文档
        processedDocument = await generateWordDocument(currentFormData, sections);

        progressInfo.innerHTML = `文档处理完成，共 ${totalLines} 行，${stats.length} 个文件`;
        showSuccess('文档已准备好下载！');
    } catch (error) {
        console.error('处理文档时出错：', error);
        showError('处理文档时出错：' + error.message);
    }
}

// 读取代码文件内容
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// 显示代码文件内容
async function displayFileContent(file, fileName) {
    const fileTreeDiv = document.getElementById('fileTree');
    const fileContentDisplayDiv = document.getElementById('fileContentDisplay');
    const displayFileName = document.getElementById('displayFileName');
    const displayFileCode = document.getElementById('displayFileCode');

    try {
        const content = await readFileContent(file);
        // 传递文件路径给 processFileComments
        let processedContent = processFileComments(content, file.webkitRelativePath);
        processedContent = processFunctionComments(processedContent);
        processedContent = removeConsecutiveEmptyLines(processedContent);

        // 使用文件的相对路径来显示文件名
        displayFileName.textContent = `文件: ${file.webkitRelativePath}`;
        displayFileCode.textContent = processedContent;

        fileTreeDiv.style.display = 'none';
        fileContentDisplayDiv.style.display = 'block';
    } catch (error) {
        console.error(`显示文件 ${fileName} 时出错:`, error);
        showInfo(`无法显示文件内容: ${fileName}`);
    }
}

// 返回文件树视图
function backToFileTree() {
    const fileTreeDiv = document.getElementById('fileTree');
    const fileContentDisplayDiv = document.getElementById('fileContentDisplay');

    fileContentDisplayDiv.style.display = 'none';
    fileTreeDiv.style.display = 'block';
}

// 下载文件
async function downloadDocument(fileName = currentFormData.fileName) {
    if (!processedDocument) {
        showInfo('请先处理文档！');
        return;
    }

    try {
        // 使用docx.Packer生成Blob
        const blob = await docx.Packer.toBlob(processedDocument);
        
        // 使用saveAs直接保存文件，无需创建DOM元素
        saveAs(
            blob, 
            (fileName || 'processed_document') + '.docx' // 简化文件名判断逻辑
        );

        showSuccess('文档下载成功！');
    } catch (error) {
        console.error('下载文档时出错：', error);
        showError('下载文档时出错：' + error.message);
    }
}