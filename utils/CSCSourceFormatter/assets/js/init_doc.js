// 页面加载后初始化设置
document.addEventListener('DOMContentLoaded', function () {
    // 设置默认值（厘米、倍数等）
    const defaultValues = {
        lineSpacing: '1.15',
        marginTop: '2.54',
        marginBottom: '2.54',
        marginLeft: '3.18',
        marginRight: '3.18',
        headerDistance: '1.5',
        footerDistance: '1.75'
    };

    // 应用默认值
    Object.entries(defaultValues).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    });

    // 字体预览
    const chineseFontSelect = document.getElementById('chineseFont');
    const englishFontSelect = document.getElementById('englishFont');
    const fontSizeSelect = document.getElementById('fontSize');
    const previewElement = document.createElement('div');
    previewElement.className = 'font-preview';
    previewElement.textContent = '预览文本：AaBbCc 123 测试文本';
    
    // 检查字体选择器是否存在
    if (chineseFontSelect && englishFontSelect && fontSizeSelect) {
        chineseFontSelect.parentNode.appendChild(previewElement);

        // 更新字体预览
        function updatePreview() {
            previewElement.style.fontFamily = `${chineseFontSelect.value}, ${englishFontSelect.value}`;
            previewElement.style.fontSize = fontSizeSelect.value + 'px';
        }

        chineseFontSelect.addEventListener('change', updatePreview);
        englishFontSelect.addEventListener('change', updatePreview);
        fontSizeSelect.addEventListener('change', updatePreview);
        updatePreview();
    }

    // 限制数字输入框范围
    const numberInputs = document.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
        input.addEventListener('input', function () {
            const value = parseFloat(this.value);
            const min = parseFloat(this.min);
            const max = parseFloat(this.max);
            if (value < min) this.value = min;
            if (value > max) this.value = max;
        });
    });

    // 提交按钮逻辑
    document.getElementById('wordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateForm()) return;

        // 收集表单数据
        const formData = {
            fileName: document.getElementById('fileName').value,
            hasHeader: document.getElementById('hasHeader').checked,
            hasFooter: document.getElementById('hasFooter').checked,
            headerText: document.getElementById('headerText').value,
            footerText: document.getElementById('footerText').value,
            headerTextAlign: document.getElementById('headerTextAlign').value,
            footerTextAlign: document.getElementById('footerTextAlign').value,
            headerChineseFont: document.getElementById('headerChineseFont').value,
            headerEnglishFont: document.getElementById('headerEnglishFont').value,
            footerChineseFont: document.getElementById('footerChineseFont').value,
            footerEnglishFont: document.getElementById('footerEnglishFont').value,
            headerFontSize: document.getElementById('headerFontSize').value,
            footerFontSize: document.getElementById('footerFontSize').value,
            headerUnderline: document.getElementById('headerUnderline').checked,
            footerUnderline: document.getElementById('footerUnderline').checked,
            headerMarginTop: document.getElementById('headerMarginTop').value,
            footerMarginBottom: document.getElementById('footerMarginBottom').value,
            lineSpacing: document.getElementById('lineSpacing').value,
            fontSize: document.getElementById('fontSize').value,
            chineseFont: document.getElementById('chineseFont').value,
            englishFont: document.getElementById('englishFont').value,
            textAlignment: document.getElementById('textAlignment').value,
            margins: {
                top: document.getElementById('marginTop').value,
                bottom: document.getElementById('marginBottom').value,
                left: document.getElementById('marginLeft').value,
                right: document.getElementById('marginRight').value
            },
            pageNumber: {
                location: document.getElementById('pageNumberLocation').value,
                alignment: document.getElementById('pageNumberAlignment').value
            },
            headerBeforeSpacing: document.getElementById('headerBeforeSpacing').value,
            headerAfterSpacing: document.getElementById('headerAfterSpacing').value,
            headerTextSpacing: document.getElementById('headerTextSpacing').value,
            footerBeforeSpacing: document.getElementById('footerBeforeSpacing').value,
            footerAfterSpacing: document.getElementById('footerAfterSpacing').value,
            footerTextSpacing: document.getElementById('footerTextSpacing').value,
            // 修改第一页设计相关数据
            firstPage: {
                content: document.getElementById('firstPageContent').value,
                contentChineseFont: document.getElementById('firstPageContentChineseFont').value,
                contentEnglishFont: document.getElementById('firstPageContentEnglishFont').value,
                contentSize: document.getElementById('firstPageContentSize').value,
                contentAlign: document.getElementById('firstPageContentAlign').value
            }
        };

        // 将 formData 保存到 SessionStorage
        sessionStorage.setItem('wordFormData', JSON.stringify(formData));

        // 检查 docx 库是否加载
        if (typeof docx === 'undefined') {
            showError('Word文档生成库未正确加载，请刷新页面重试。');
            return;
        }

        // 调用文档生成函数
        generateWordDocument(formData);
    });
});

// 表单验证：必须填写文件名
function validateForm() {
    const fileName = document.getElementById('fileName').value;
    if (!fileName) {
        showInfo('请填写文件名！');
        return false;
    }
    return true;
}

// 显示或隐藏页眉页脚设置区域
function toggleHeaderFooter() {
    const hasHeader = document.getElementById('hasHeader').checked;
    const hasFooter = document.getElementById('hasFooter').checked;
    document.getElementById('headerTextGroup').style.display = hasHeader ? 'block' : 'none';
    document.getElementById('footerTextGroup').style.display = hasFooter ? 'block' : 'none';

    const pageNumberLocation = document.getElementById('pageNumberLocation').value;
    if (pageNumberLocation === 'header' && !hasHeader) {
        document.getElementById('pageNumberLocation').value = 'none';
        togglePageNumberSettings();
    }
    if (pageNumberLocation === 'footer' && !hasFooter) {
        document.getElementById('pageNumberLocation').value = 'none';
        togglePageNumberSettings();
    }
}

// 控制页码设置是否可见
function togglePageNumberSettings() {
    const pageNumberLocation = document.getElementById('pageNumberLocation').value;
    const pageNumberAlignmentGroup = document.getElementById('pageNumberAlignmentGroup');
    if (pageNumberLocation === 'none') {
        pageNumberAlignmentGroup.style.display = 'none';
        // 还原页眉页脚的对齐方式
        document.getElementById('headerTextAlign').value = 'center';
        document.getElementById('footerTextAlign').value = 'center';
    } else {
        pageNumberAlignmentGroup.style.display = 'block';
        if (pageNumberLocation === 'header') {
            document.getElementById('hasHeader').checked = true;
            document.getElementById('headerTextGroup').style.display = 'block';
        }
        if (pageNumberLocation === 'footer') {
            document.getElementById('hasFooter').checked = true;
            document.getElementById('footerTextGroup').style.display = 'block';
        }
    }
}

// 添加页码对齐方式变化时的处理函数
document.getElementById('pageNumberAlignment').addEventListener('change', function() {
    const pageNumberLocation = document.getElementById('pageNumberLocation').value;
    const alignment = this.value;
    
    if (pageNumberLocation === 'header') {
        document.getElementById('headerTextAlign').value = alignment;
    }
    if (pageNumberLocation === 'footer') {
        document.getElementById('footerTextAlign').value = alignment;
    }
});

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

// 将字符串转换为 docx 对齐方式
function getAlignmentType(val) {
    if (!val) return docx.AlignmentType.LEFT;
    if (val.toLowerCase() === 'both') return docx.AlignmentType.JUSTIFIED;
    return docx.AlignmentType[val.toUpperCase()] || docx.AlignmentType.LEFT;
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
async function generateWordDocument(formData) {
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
            }],
            styles: {
                default: {
                    document: {
                        run: {
                            font: formData.chineseFont,
                            size: formData.fontSize * 2,
                        }
                    }
                }
            }
        });

        const blob = await docx.Packer.toBlob(doc);
        saveAs(blob, `${formData.fileName}.docx`);
        showSuccess('Word文档生成成功！');

    } catch (error) {
        console.error('生成Word文档时出错：', error);
        showError(`生成Word文档时出错：${error.message}`);
    }
}