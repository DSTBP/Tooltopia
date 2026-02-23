/**
 * CoverGen - 黑胶专辑封面生成器逻辑
 */

const AppState = {
    selectedStyleId: null,
    selectedStyleCoverUrl: null,
    uploadedImage: null,
    drag: { x: 0, y: 0, imgWidth: 0, imgHeight: 0, scale: 1, isDragging: false, startX: 0, startY: 0 },
    // 【修改点】：将坐标改为数组，每一列对应一个独立坐标！
    baimaDrag: {
        titlePos: [
            {x: 320, y: 30},   // 第1列 "白马村" 默认坐标
            {x: 180, y: 120},  // 第2列 "游记" 默认坐标
            {x: 80,  y: 80}    // 预留第3列默认坐标
        ],
        subPos: [
            {x: 120, y: 220},  // 副标题第1列
            {x: 80,  y: 220},  // 副标题第2列
            {x: 40,  y: 220}   // 预留第3列
        ],
        activeType: null, // 'title' 或 'sub'
        activeCol: -1,    // 当前正在拖动哪一列
        startX: 0, startY: 0
    }
};

// =========================================
// 1. 视图切换逻辑
// =========================================
function selectStyle(styleId, styleName, coverUrl) {
    AppState.selectedStyleId = styleId;
    AppState.selectedStyleCoverUrl = coverUrl;

    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('tool-interface').style.display = 'block';
    document.querySelector('.header').style.display = 'none';
    document.getElementById('mainHomeLink').style.display = 'none';
    document.getElementById('backToHomeBtn').style.display = 'inline-block';

    document.getElementById('currentStyleName').textContent = styleName;
    document.getElementById('currentStyleImg').src = coverUrl;
    
    document.getElementById('imOkSettings').style.display = 'none';
    const baimaSettings = document.getElementById('baimaSettings');
    if(baimaSettings) baimaSettings.style.display = 'none';

    // 显示特定的设置面板
    if (styleId === 'im_ok') {
        document.getElementById('imOkSettings').style.display = 'block';
    } else if (styleId === 'baima') {
        document.getElementById('baimaSettings').style.display = 'block';
    }
    
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('resultPreview').style.display = 'none';
}

function resetApp() {
    AppState.selectedStyleId = null;
    AppState.selectedStyleCoverUrl = null;
    AppState.uploadedImage = null;

    document.getElementById('landing-page').style.display = 'flex';
    document.getElementById('tool-interface').style.display = 'none';
    document.querySelector('.header').style.display = 'block';
    document.getElementById('mainHomeLink').style.display = 'inline-block';
    document.getElementById('backToHomeBtn').style.display = 'none';
    document.getElementById('imOkSettings').style.display = 'none';
    document.getElementById('userImage').value = '';
}

// =========================================
// 2. 图像读取与半调网点渲染算法
// =========================================
// 读取用户上传的图片为 Image 对象
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 生成 I'm OK 风格封面
async function renderImOkStyle() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 设定输出高清分辨率
    const size = 800; 
    canvas.width = size;
    canvas.height = size;

    // 1. 绘制经典黄色背景
    ctx.fillStyle = '#FFE000';
    ctx.fillRect(0, 0, size, size);

    // 2. 绘制人物半调网点
    const offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    const offCtx = offCanvas.getContext('2d');
    
    // 预填白色背景以生成基础网点
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, size, size);

    // 如果上传了图片，按照用户拖拽的位置进行绘制
    if (AppState.uploadedImage) {
        const previewBox = document.getElementById('imagePreviewBox');
        const boxSize = previewBox.getBoundingClientRect().width; // 微缩画板实际宽度（通常是 400）
        
        // 计算从预览框到 800x800 高清画布的放大比例 (理论上就是 800 / 400 = 2)
        const ratio = size / boxSize;
        
        // 将预览框的坐标映射到高清画布
        const targetX = AppState.drag.x * ratio;
        const targetY = AppState.drag.y * ratio;
        
        // 结合我们在 CSS 里应用给图片的 scale 缩放值计算最终尺寸
        const targetWidth = AppState.drag.imgWidth * AppState.drag.scale * ratio;
        const targetHeight = AppState.drag.imgHeight * AppState.drag.scale * ratio;

        offCtx.drawImage(AppState.uploadedImage, targetX, targetY, targetWidth, targetHeight);
    }

    const imgData = offCtx.getImageData(0, 0, size, size);
    const data = imgData.data;

    // ========================================================
    // --- 终极光学级复刻：45度角连续调半调 (AM Halftone) 算法 ---
    // ========================================================
    const outputData = ctx.createImageData(size, size);
    const outPixels = outputData.data;

    // 1. 网点参数设置
    const dotPeriodSlider = document.getElementById('dotPeriodSlider');
    const dotPeriod = dotPeriodSlider ? parseInt(dotPeriodSlider.value, 10) : 6; 
    const freq = (Math.PI * 2) / dotPeriod;
    const angle = Math.PI / 4;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;

            const r = data[i], g = data[i + 1], b = data[i + 2];

            // 提取明暗度
            let brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            let darkness = 1 - brightness;
            
            // Gamma 校正
            darkness = Math.pow(darkness, 1.1);

            // 【关键修改1：强制底纹】
            // 给 darkness 增加基础值 0.12，这意味着即使是纯背景，也会强制生成 12% 面积的网点
            let effective_darkness = 0.08 + darkness * 0.85;

            // 【关键修改2：动态网点颜色】
            // 浅色区域网点：#775E01 (RGB: 119, 94, 1)
            // 深色区域网点：#040400 (RGB: 4, 4, 0)
            // 根据图像原本的明暗度，让网点颜色在浅褐和深墨色之间平滑过渡
            const dotR = 119 * (1 - darkness) + 4 * darkness;
            const dotG = 94 * (1 - darkness) + 4 * darkness;
            const dotB = 1 * (1 - darkness) + 0 * darkness;

            // 45 度波浪阈值计算
            const rx = x * cosA - y * sinA;
            const ry = x * sinA + y * cosA;
            const wave = (Math.sin(rx * freq) + Math.sin(ry * freq)) / 2;
            const threshold = (wave + 1) / 2;

            const difference = effective_darkness - threshold;
            
            // 【关键修改3：极致柔滑边缘】
            // 将 sharpness 从 8 骤降到 3.5。
            // 极大地增加了抗锯齿的过渡带宽度，完美模拟老式印刷油墨渗入纸张的模糊晕染感！
            const sharpness = 3.5; 
            
            let blend = difference * sharpness + 0.5;
            blend = Math.max(0, Math.min(1, blend)); 

            // 颜色混合：背景经典黄 (#FFE000) -> 动态网点颜色
            outPixels[i] = 255 * (1 - blend) + dotR * blend;     // R
            outPixels[i + 1] = 224 * (1 - blend) + dotG * blend; // G
            outPixels[i + 2] = 0 * (1 - blend) + dotB * blend;   // B
            outPixels[i + 3] = 255;                              // Alpha
        }
    }
    
    ctx.putImageData(outputData, 0, 0);

    // 3. 绘制文字排版
    const titleText = document.getElementById('titleInput').value || "I'm ok";
    const subtitleText = document.getElementById('subtitleInput').value || "DAVID TAO 陶喆";

    try {
        // 修改：等待的字体大小也要对应更新为 96px
        await document.fonts.load('96px "BrushScriptMT"');
    } catch (e) {
        console.warn("字体加载失败", e);
    }

    // 主标题
    // 修改 1：字体从 110px 缩小到 96px，严格匹配预览框 3rem (48px * 2) 的比例
    ctx.font = '96px "BrushScriptMT", "Comic Sans MS", cursive';
    ctx.fillStyle = '#CC0000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // 修改 2：增加了第四个参数 maxWidth (size * 0.5 = 400px)，遇到极限长文本会自动压缩字宽，绝对不溢出
    ctx.fillText(titleText, size * 0.45, size * 0.63, size * 0.5);
    
    ctx.shadowColor = 'transparent';
    
    // 副标题
    // 修改 3：字体从 40px 缩小到 32px，严格匹配预览框 1rem (16px * 2) 的比例
    ctx.font = '900 32px "Microsoft YaHei", "Arial Black", sans-serif';
    ctx.fillStyle = '#2c3e50'; 
    ctx.letterSpacing = '2px';
    
    // 修改 4：增加 maxWidth 限制 (size * 0.4 = 320px)，防止超长副标题溢出屏幕
    ctx.fillText(subtitleText, size * 0.55, size * 0.70, size * 0.4);

    return canvas.toDataURL('image/png');
}

// =========================================
// 3. 交互与生成逻辑
// =========================================
async function handleGenerate() {
    // 根据当前选中的风格，决定禁用哪个按钮并显示 Loading
    const activeBtnId = AppState.selectedStyleId === 'baima' ? 'generateBtnBaima' : 'generateBtn';
    const generateBtn = document.getElementById(activeBtnId);
    
    const resultSection = document.getElementById('resultSection');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultPreview = document.getElementById('resultPreview');
    const generatedImg = document.getElementById('generatedImg');

    generateBtn.disabled = true;
    generateBtn.textContent = "AI 正在绘制...";
    resultSection.style.display = 'block';
    loadingIndicator.style.display = 'block';
    resultPreview.style.display = 'none';

    try {
        let finalImageUrl = AppState.selectedStyleCoverUrl;

        // 路由分发算法
        if (AppState.selectedStyleId === 'im_ok') {
            finalImageUrl = await renderImOkStyle();
        } else if (AppState.selectedStyleId === 'baima') {
            finalImageUrl = await renderBaimaStyle();
        }

        generatedImg.src = finalImageUrl;
        loadingIndicator.style.display = 'none';
        resultPreview.style.display = 'block';
        
        document.getElementById('downloadBtn').onclick = () => {
            const link = document.createElement('a');
            link.download = `${AppState.selectedStyleId}_cover_${new Date().getTime()}.png`;
            link.href = finalImageUrl;
            link.click();
        };

        resultSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        alert("生成出错！\n" + err.message);
        loadingIndicator.style.display = 'none';
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "重新生成";
    }
}

// =========================================
// 4. 事件绑定
// =========================================
window.addEventListener('load', function() {
    document.getElementById('backToHomeBtn').addEventListener('click', resetApp);
    document.getElementById('mainHomeLink').addEventListener('click', resetApp);
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    
    const btnBaima = document.getElementById('generateBtnBaima');
    if(btnBaima) btnBaima.addEventListener('click', handleGenerate);

    // 初始化图片拖拽与缩放逻辑
    initImageUploaderAndDrag();
    initBaimaDrag();

    // 监听文字输入，实时同步到微缩预览框
    const titleInput = document.getElementById('titleInput');
    const subtitleInput = document.getElementById('subtitleInput');
    const previewTitle = document.getElementById('previewTitle');
    const previewSubtitle = document.getElementById('previewSubtitle');

    const dotPeriodSlider = document.getElementById('dotPeriodSlider');
    const dotPeriodValue = document.getElementById('dotPeriodValue');
    if (dotPeriodSlider && dotPeriodValue) {
        dotPeriodSlider.addEventListener('input', (e) => {
            dotPeriodValue.textContent = e.target.value;
        });
    }

    titleInput.addEventListener('input', (e) => {
        previewTitle.textContent = e.target.value || "I'm ok";
    });

    subtitleInput.addEventListener('input', (e) => {
        previewSubtitle.textContent = e.target.value || "DAVID TAO 陶喆";
    });
});


// =========================================
// 5. 图片拖拽交互逻辑
// =========================================
function initImageUploaderAndDrag() {
    const userImageInput = document.getElementById('userImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewBox = document.getElementById('imagePreviewBox');
    const dragImg = document.getElementById('dragImg');
    const zoomSlider = document.getElementById('zoomSlider');

    // 1. 监听文件上传
    userImageInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            AppState.uploadedImage = await loadImage(file);
            
            // 显示包含画板和滑块的容器
            previewContainer.style.display = 'block';
            
            const boxSize = previewBox.getBoundingClientRect().width;
            const nativeW = AppState.uploadedImage.naturalWidth;
            const nativeH = AppState.uploadedImage.naturalHeight;
            
            // 计算基准大小：默认缩放至高度或宽度适配画板
            const baseRatio = Math.max(boxSize / nativeW, boxSize / nativeH);
            
            // 设定图片的基础宽度和高度 (scale 为 1 时的基准值)
            AppState.drag.imgWidth = nativeW * baseRatio;
            AppState.drag.imgHeight = nativeH * baseRatio;
            AppState.drag.scale = 1; // 默认缩放重置为 1
            
            dragImg.style.width = AppState.drag.imgWidth + 'px';
            dragImg.style.height = AppState.drag.imgHeight + 'px';
            
            // 初始位置：默认稍微偏右一点居中
            AppState.drag.x = -(AppState.drag.imgWidth * 0.2);
            AppState.drag.y = (boxSize - AppState.drag.imgHeight) / 2;
            
            dragImg.src = AppState.uploadedImage.src;
            zoomSlider.value = 1; // 重置滑块
            updateDragPosition();
        }
    });

    // 2. 监听缩放滑块
    zoomSlider.addEventListener('input', (e) => {
        AppState.drag.scale = parseFloat(e.target.value);
        updateDragPosition();
    });

    // 3. 监听滚轮直接在画板上缩放
    previewBox.addEventListener('wheel', (e) => {
        e.preventDefault(); // 防止页面滚动
        const zoomSpeed = 0.05;
        if (e.deltaY < 0) {
            AppState.drag.scale = Math.min(3, AppState.drag.scale + zoomSpeed);
        } else {
            AppState.drag.scale = Math.max(0.2, AppState.drag.scale - zoomSpeed);
        }
        zoomSlider.value = AppState.drag.scale; // 同步滑块
        updateDragPosition();
    });

    // 4. 监听指针拖拽事件 (兼容鼠标与触摸)
    previewBox.addEventListener('pointerdown', (e) => {
        if (!AppState.uploadedImage) return;
        AppState.drag.isDragging = true;
        previewBox.style.cursor = 'grabbing';
        AppState.drag.startX = e.clientX - AppState.drag.x;
        AppState.drag.startY = e.clientY - AppState.drag.y;
        previewBox.setPointerCapture(e.pointerId);
    });

    previewBox.addEventListener('pointermove', (e) => {
        if (!AppState.drag.isDragging) return;
        AppState.drag.x = e.clientX - AppState.drag.startX;
        AppState.drag.y = e.clientY - AppState.drag.startY;
        updateDragPosition();
    });

    previewBox.addEventListener('pointerup', (e) => {
        AppState.drag.isDragging = false;
        previewBox.style.cursor = 'grab';
        previewBox.releasePointerCapture(e.pointerId);
    });
}

// =========================================
// 6. 白马村风格 - 文字排版与拖拽引擎
// =========================================

// 辅助函数：取消自动转换，完全尊重用户输入的文本
function getBaimaProcessedText(inputId, defaultText) {
    return document.getElementById(inputId).value || defaultText;
}

function updateTradReference() {
    const refBox = document.getElementById('tradReferenceBox');
    if (!refBox || typeof cnchar === 'undefined') return;

    const title = document.getElementById('baimaTitleInput').value || "白马村\n游记";
    const sub = document.getElementById('baimaSubtitleInput').value || "上海彩虹\n室内合唱团";
    const combinedText = title + sub;

    // 提取所有唯一的中文字符 (过滤掉换行、空格、标点等)
    const uniqueChars = [...new Set(combinedText.replace(/[\n\sa-zA-Z0-9]/g, ''))];
    
    const mapping = [];
    uniqueChars.forEach(char => {
        // 调用第三方库检测对应的繁体字
        const trad = cnchar.convert.simpleToTrad(char);
        // 如果繁体字和简体字长得不一样，才展示出来
        if (trad !== char) {
            mapping.push(`<span style="background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">${char} ➔ <b style="color: #FFE000; cursor: pointer;" title="可直接手动复制" onclick="navigator.clipboard.writeText('${trad}')">${trad}</b></span>`);
        }
    });

    if (mapping.length > 0) {
        refBox.innerHTML = mapping.join('');
    } else {
        refBox.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">当前文本没有对应的繁体字，或已全部为繁体。</span>';
    }
}

function updateBaimaPreview() {
    const dragArea = document.getElementById('baimaDragArea');
    if (!dragArea) return;

    // 直接获取原始输入
    const titleLines = getBaimaProcessedText('baimaTitleInput', "白马村\n游记").split('\n');
    const subLines = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团").split('\n');
    
    const titleBaseSize = (parseInt(document.getElementById('baimaTitleSize').value) || 320) * 0.5;
    const subBaseSize = (parseInt(document.getElementById('baimaSubSize').value) || 75) * 0.5;
    const titleSpacing = parseFloat(document.getElementById('baimaTitleSpacing').value) || 0.85;
    const subSpacing = parseFloat(document.getElementById('baimaSubSpacing').value) || 0.95;

    while(AppState.baimaDrag.titlePos.length < titleLines.length) AppState.baimaDrag.titlePos.push({x: 200, y: 100});
    while(AppState.baimaDrag.subPos.length < subLines.length) AppState.baimaDrag.subPos.push({x: 100, y: 200});

    let html = '';

    titleLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.titlePos[idx];
        let size = titleBaseSize;
        if (idx === 1) size = titleBaseSize * 0.8; 
        else if (idx > 1) size = titleBaseSize * 0.8;

        let colHtml = `<div class="drag-baima-col" data-type="title" data-col="${idx}" style="position:absolute; left:${pos.x}px; top:${pos.y}px; cursor:grab; padding: 10px; margin: -10px;">`;
        let curY = 0;
        for(let i=0; i<col.length; i++) {
            colHtml += `<div style="position:absolute; left:10px; top:${curY + 10}px; transform:translate(-50%, 0); font-size:${size}px; font-family:'ShanHaiTaoYuan', serif; color:#1A1C1A; line-height:1; white-space:pre; user-select:none;">${col[i]}</div>`;
            curY += size * titleSpacing; 
        }
        colHtml += `<div style="width: ${size}px; height: ${curY}px; transform:translate(-50%, 0);"></div></div>`;
        html += colHtml;
    });

    subLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.subPos[idx];
        let size = subBaseSize;

        let colHtml = `<div class="drag-baima-col" data-type="sub" data-col="${idx}" style="position:absolute; left:${pos.x}px; top:${pos.y}px; cursor:grab; padding: 10px; margin: -10px;">`;
        let curY = 0;
        for(let i=0; i<col.length; i++) {
            colHtml += `<div style="position:absolute; left:10px; top:${curY + 10}px; transform:translate(-50%, 0); font-size:${size}px; font-family:'ShanHaiTaoYuan', serif; color:#1A1C1A; line-height:1; white-space:pre; user-select:none;">${col[i]}</div>`;
            curY += size * subSpacing;
        }
        colHtml += `<div style="width: ${size}px; height: ${curY}px; transform:translate(-50%, 0);"></div></div>`;
        html += colHtml;
    });

    dragArea.innerHTML = html;
}

function initBaimaDrag() {
    const previewBox = document.getElementById('baimaPreviewBox');
    if(!previewBox) return;

    // 初始加载时也要计算一次简繁参考
    updateTradReference();
    updateBaimaPreview();

    previewBox.addEventListener('pointerdown', (e) => {
        const targetCol = e.target.closest('.drag-baima-col');
        if (!targetCol) return;
        
        AppState.baimaDrag.activeType = targetCol.getAttribute('data-type');
        AppState.baimaDrag.activeCol = parseInt(targetCol.getAttribute('data-col'));
        previewBox.style.cursor = 'grabbing';
        
        const pos = AppState.baimaDrag.activeType === 'title' 
            ? AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol] 
            : AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol];
        
        AppState.baimaDrag.startX = e.clientX - pos.x;
        AppState.baimaDrag.startY = e.clientY - pos.y;
        
        previewBox.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    previewBox.addEventListener('pointermove', (e) => {
        if (!AppState.baimaDrag.activeType) return;
        const newX = e.clientX - AppState.baimaDrag.startX;
        const newY = e.clientY - AppState.baimaDrag.startY;
        
        if (AppState.baimaDrag.activeType === 'title') {
            AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol].x = newX;
            AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol].y = newY;
        } else {
            AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol].x = newX;
            AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol].y = newY;
        }
        updateBaimaPreview();
    });

    previewBox.addEventListener('pointerup', (e) => {
        AppState.baimaDrag.activeType = null;
        AppState.baimaDrag.activeCol = -1;
        previewBox.style.cursor = 'default';
        previewBox.releasePointerCapture(e.pointerId);
    });

    // 绑定所有的输入框事件
    ['baimaTitleInput', 'baimaSubtitleInput'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', () => {
                updateTradReference(); // 更新提示框
                updateBaimaPreview();  // 重绘排版
            });
        }
    });

    // 其他滑块只触发排版重绘
    ['baimaTitleSize', 'baimaSubSize', 'baimaTitleSpacing', 'baimaSubSpacing'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', updateBaimaPreview);
    });
}

async function renderBaimaStyle() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 800; 
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#F2EFE8';
    ctx.fillRect(0, 0, size, size);

    const textCanvas = document.createElement('canvas');
    textCanvas.width = size;
    textCanvas.height = size;
    const tCtx = textCanvas.getContext('2d');

    try {
        await document.fonts.load('320px "ShanHaiTaoYuan"');
    } catch (e) {
        console.warn("字体加载失败", e);
    }

    // 【修改点】：直接读取输入框的 value。因为输入框里已经是用户肉眼可见的繁体/简体了
    const titleText = document.getElementById('baimaTitleInput').value || "白马村\n游记";
    const subtitleText = document.getElementById('baimaSubtitleInput').value || "上海彩虹\n室内合唱团";
    
    const titleSpacing = parseFloat(document.getElementById('baimaTitleSpacing').value) || 0.85;
    const subSpacing = parseFloat(document.getElementById('baimaSubSpacing').value) || 0.95;

    tCtx.fillStyle = '#1A1C1A'; 
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle'; 

    const charPosInfo = []; 

    // --- 映射主标题 ---
    const titleLines = titleText.split('\n');
    const titleBaseSize = parseInt(document.getElementById('baimaTitleSize').value) || 320;

    titleLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.titlePos[idx] || {x: 200, y: 100};
        let size = titleBaseSize;
        if (idx === 1) size = titleBaseSize * 0.8; 
        else if (idx > 1) size = titleBaseSize * 0.8;

        const finalColX = pos.x * 2; 
        const finalColY = pos.y * 2;
        let curY = finalColY;

        for(let i=0; i<col.length; i++) {
            const char = col[i];
            const angle = (Math.random() - 0.5) * 0.16; 
            const offsetX = (Math.random() - 0.5) * 30;
            const offsetY = (Math.random() - 0.5) * 30;
            
            const finalX = finalColX + offsetX;
            const finalY = curY + size / 2 + offsetY; 
            
            tCtx.save();
            tCtx.translate(finalX, finalY);
            tCtx.rotate(angle);
            tCtx.font = `${size}px "ShanHaiTaoYuan", serif`;
            tCtx.fillText(char, 0, 0);
            tCtx.restore();
            
            charPosInfo.push({char: char, cx: finalX, cy: finalY, size: size, textAngle: angle});
            curY += size * titleSpacing; 
        }
    });

    // --- 映射副标题 ---
    const subLines = subtitleText.split('\n');
    const subBaseSize = parseInt(document.getElementById('baimaSubSize').value) || 75;

    subLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.subPos[idx] || {x: 100, y: 200};
        let size = subBaseSize;

        const finalColX = pos.x * 2;
        const finalColY = pos.y * 2;
        let curY = finalColY;

        for(let i=0; i<col.length; i++) {
            const char = col[i];
            const angle = (Math.random() - 0.5) * 0.08;
            const offsetX = (Math.random() - 0.5) * 10;
            const offsetY = (Math.random() - 0.5) * 10;

            const finalX = finalColX + offsetX;
            const finalY = curY + size / 2 + offsetY;

            tCtx.save();
            tCtx.translate(finalX, finalY);
            tCtx.rotate(angle);
            tCtx.font = `${size}px "ShanHaiTaoYuan", serif`;
            tCtx.fillText(char, 0, 0);
            tCtx.restore();
            
            charPosInfo.push({char: char, cx: finalX, cy: finalY, size: size, textAngle: angle});
            curY += size * subSpacing; 
        }
    });

    // --- 定向枯笔飞白渲染 ---
    tCtx.globalCompositeOperation = 'destination-out';

    function drawDryBrush(ctx, x, y, length, angle, intensity, thickness) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
        
        for(let b = 0; b < 20; b++) {
            const bristleY = (Math.random() - 0.5) * thickness;
            const bristleLength = length * (0.4 + Math.random() * 0.6); 
            for(let l = 0; l < bristleLength; l += 2) {
                if (Math.random() < 0.9 - (l / bristleLength) * 0.7) { 
                    ctx.fillRect(l, bristleY + (Math.random() - 0.5) * 4, Math.random() * 4 + 1, Math.random() * 2 + 0.5);
                }
            }
        }
        ctx.restore();
    }

    charPosInfo.forEach(info => {
        const { char, cx, cy, size: s, textAngle } = info;
        
        if (char === '白') drawDryBrush(tCtx, cx - s*0.2, cy + s*0.35, s*0.4, textAngle + 0, 0.9, s*0.1);
        else if (char === '馬' || char === '马') {
            drawDryBrush(tCtx, cx + s*0.1, cy - s*0.3, s*0.5, textAngle - 0.05, 0.95, s*0.15);
            drawDryBrush(tCtx, cx - s*0.25, cy + s*0.4, s*0.5, textAngle + 0.05, 0.8, s*0.1);
            drawDryBrush(tCtx, cx + s*0.15, cy + s*0.1, s*0.3, textAngle + Math.PI/2, 0.8, s*0.1);
        } 
        else if (char === '村') {
            drawDryBrush(tCtx, cx - s*0.25, cy + s*0.1, s*0.4, textAngle + Math.PI/2.5, 0.85, s*0.1);
        } 
        else if (char === '遊' || char === '游') {
            drawDryBrush(tCtx, cx - s*0.35, cy + s*0.35, s*0.9, textAngle - 0.15, 0.98, s*0.25);
        } 
        else if (char === '記' || char === '记') {
            drawDryBrush(tCtx, cx + s*0.1, cy + s*0.2, s*0.4, textAngle + 0.2, 0.85, s*0.15);
        } 
        else {
            // 普通字体大幅降低飞白概率
            if (Math.random() < 0.25) {
                drawDryBrush(tCtx, cx - s*0.2, cy, s*0.5, textAngle + (Math.random() - 0.5) * Math.PI, 0.7, s*0.15);
            }
        }
    });

    tCtx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for(let i = 0; i < 15000; i++) tCtx.fillRect(Math.random() * size, Math.random() * size, 1, Math.random() > 0.5 ? 2 : 1);

    ctx.drawImage(textCanvas, 0, 0);
    return canvas.toDataURL('image/png');
}