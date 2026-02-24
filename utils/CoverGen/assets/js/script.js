/**
 * CoverGen - 黑胶专辑封面生成器逻辑
 * 全面重构版：逻辑分离，移动端适配，修复拖拽，终极光学渲染
 */

// =====================================================================
// 模块 1：全局状态与视图路由
// =====================================================================

const AppState = {
    selectedStyleId: null,
    selectedStyleCoverUrl: null,
    uploadedImage: null,
    // I'm OK 风格的图片拖拽状态
    drag: { x: 0, y: 0, imgWidth: 0, imgHeight: 0, scale: 1, isDragging: false, startX: 0, startY: 0 },
    
    // 白马村风格的拖拽状态 (绝对映射到 800x800 画布的逻辑坐标系，不受手机屏幕压缩影响)
    baimaDrag: {
        titlePos: [
            {x: 600, y: 60},   // 第1列 "白马村" 
            {x: 360, y: 240},  // 第2列 "游记" 
            {x: 160, y: 160}   // 预留第3列
        ],
        subPos: [
            {x: 240, y: 440},  // 副标题第1列
            {x: 160, y: 440},  // 副标题第2列
            {x: 80,  y: 440}   // 预留第3列
        ],
        activeType: null, 
        activeCol: -1,    
        startX: 0, startY: 0
    },

    dtBlueDrag: {
        activeItem: null,
        startX: 0, startY: 0,
        pos: {
            image: { x: 0, y: 300, scale: 1 },
            // 调整初始位置：感叹号在最上 -> 英文标题 -> 中文标题
            symbol: { x: 400, y: 80 },     
            enTitle: { x: 400, y: 220 },   
            zhTitle: { x: 400, y: 350 },   
            s1: { x: 50, y: 650 },
            s2: { x: 50, y: 690 },
            s3: { x: 50, y: 730 },
            s4: { x: 50, y: 770 }
        },
        imgWidth: 0, imgHeight: 0
    }
};

// 工具函数：读取本地图片文件
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
    const dtBlueSettings = document.getElementById('dtBlueSettings');
    if(dtBlueSettings) dtBlueSettings.style.display = 'none';

    if (styleId === 'im_ok') {
        document.getElementById('imOkSettings').style.display = 'block';
    } else if (styleId === 'baima') {
        document.getElementById('baimaSettings').style.display = 'block';
    } else if (styleId === 'dt_blue') {
        document.getElementById('dtBlueSettings').style.display = 'block';
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

async function handleGenerate() {
    let activeBtnId = 'generateBtn';
    if (AppState.selectedStyleId === 'baima') activeBtnId = 'generateBtnBaima';
    if (AppState.selectedStyleId === 'dt_blue') activeBtnId = 'generateBtnDTBlue';
    
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

        if (AppState.selectedStyleId === 'im_ok') {
            finalImageUrl = await renderImOkStyle();
        } else if (AppState.selectedStyleId === 'baima') {
            finalImageUrl = await renderBaimaStyle();
        } else if (AppState.selectedStyleId === 'dt_blue') {
            finalImageUrl = await renderDTBlueStyle();
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


// =====================================================================
// 事件总线初始化
// =====================================================================
window.addEventListener('load', function() {
    document.getElementById('backToHomeBtn').addEventListener('click', resetApp);
    document.getElementById('mainHomeLink').addEventListener('click', resetApp);
    
    // 生成按钮绑定
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    const btnBaima = document.getElementById('generateBtnBaima');
    if(btnBaima) btnBaima.addEventListener('click', handleGenerate);

    const btnDTBlue = document.getElementById('generateBtnDTBlue');
    if(btnDTBlue) btnDTBlue.addEventListener('click', handleGenerate);

    // I'm OK 模块初始化
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

    // 绑定颜色深浅滑块事件
    const imOkDarknessSlider = document.getElementById('imOkDarknessSlider');
    const imOkDarknessValue = document.getElementById('imOkDarknessValue');
    if (imOkDarknessSlider && imOkDarknessValue) {
        imOkDarknessSlider.addEventListener('input', (e) => {
            imOkDarknessValue.textContent = parseFloat(e.target.value).toFixed(1);
        });
    }

    if(titleInput) {
        titleInput.addEventListener('input', (e) => {
            previewTitle.textContent = e.target.value || "I'm ok";
        });
    }
    if(subtitleInput) {
        subtitleInput.addEventListener('input', (e) => {
            previewSubtitle.textContent = e.target.value || "DAVID TAO 陶喆";
        });
    }

    initImageUploaderAndDrag();
    initBaimaDrag();
    initDTBlueModule();
});

// =====================================================================
// 日夜主题切换逻辑 (原版完全复刻)
// =====================================================================
(() => {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const THEME_KEY = 'tooltopia-theme';

    // 从 localStorage 读取保存的主题偏好
    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'day') {
            body.classList.add('day-mode');
            if(themeToggle) themeToggle.checked = true;
        } else {
            body.classList.remove('day-mode');
            if(themeToggle) themeToggle.checked = false;
        }
    }

    // 保存主题偏好到 localStorage
    function saveThemePreference(isDayMode) {
        localStorage.setItem(THEME_KEY, isDayMode ? 'day' : 'night');
    }

    // 切换主题
    function toggleTheme() {
        const isDayMode = themeToggle.checked;

        if (isDayMode) {
            body.classList.add('day-mode');
        } else {
            body.classList.remove('day-mode');
        }

        saveThemePreference(isDayMode);
    }

    // 页面加载时恢复主题
    loadThemePreference();

    // 监听切换器变化
    if(themeToggle) themeToggle.addEventListener('change', toggleTheme);
})();


// =====================================================================
// 模块：I'm OK 风格专区 (交互与渲染)
// =====================================================================
function updateDragPosition() {
    const dragImg = document.getElementById('dragImg');
    if (dragImg) {
        dragImg.style.transform = `translate(${AppState.drag.x}px, ${AppState.drag.y}px) scale(${AppState.drag.scale})`;
        dragImg.style.transformOrigin = 'top left'; 
    }
}

function initImageUploaderAndDrag() {
    const userImageInput = document.getElementById('userImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewBox = document.getElementById('imagePreviewBox');
    const dragImg = document.getElementById('dragImg');
    const zoomSlider = document.getElementById('zoomSlider');

    userImageInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            AppState.uploadedImage = await loadImage(file);
            previewContainer.style.display = 'block';
            
            const boxSize = previewBox.getBoundingClientRect().width;
            const nativeW = AppState.uploadedImage.naturalWidth;
            const nativeH = AppState.uploadedImage.naturalHeight;
            const baseRatio = Math.max(boxSize / nativeW, boxSize / nativeH);
            
            AppState.drag.imgWidth = nativeW * baseRatio;
            AppState.drag.imgHeight = nativeH * baseRatio;
            AppState.drag.scale = 1; 
            
            dragImg.style.width = AppState.drag.imgWidth + 'px';
            dragImg.style.height = AppState.drag.imgHeight + 'px';
            
            AppState.drag.x = -(AppState.drag.imgWidth * 0.2);
            AppState.drag.y = (boxSize - AppState.drag.imgHeight) / 2;
            
            dragImg.src = AppState.uploadedImage.src;
            if(zoomSlider) zoomSlider.value = 1; 
            updateDragPosition();
        }
    });

    if(zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            AppState.drag.scale = parseFloat(e.target.value);
            updateDragPosition();
        });
    }

    if(previewBox) {
        previewBox.addEventListener('wheel', (e) => {
            e.preventDefault(); 
            const zoomSpeed = 0.05;
            if (e.deltaY < 0) {
                AppState.drag.scale = Math.min(3, AppState.drag.scale + zoomSpeed);
            } else {
                AppState.drag.scale = Math.max(0.2, AppState.drag.scale - zoomSpeed);
            }
            if(zoomSlider) zoomSlider.value = AppState.drag.scale; 
            updateDragPosition();
        });

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
}

async function renderImOkStyle() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 800; 
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#FFE000';
    ctx.fillRect(0, 0, size, size);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    const offCtx = offCanvas.getContext('2d');
    
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, size, size);

    if (AppState.uploadedImage) {
        const previewBox = document.getElementById('imagePreviewBox');
        const boxSize = previewBox.getBoundingClientRect().width; 
        const ratio = size / boxSize;
        
        const targetX = AppState.drag.x * ratio;
        const targetY = AppState.drag.y * ratio;
        const targetWidth = AppState.drag.imgWidth * AppState.drag.scale * ratio;
        const targetHeight = AppState.drag.imgHeight * AppState.drag.scale * ratio;

        offCtx.drawImage(AppState.uploadedImage, targetX, targetY, targetWidth, targetHeight);
    }

    const imgData = offCtx.getImageData(0, 0, size, size);
    const data = imgData.data;

    // --- 光学级连续调半调渲染 (完美圆形算法) ---
    const outputData = ctx.createImageData(size, size);
    const outPixels = outputData.data;

    const dotPeriodSlider = document.getElementById('dotPeriodSlider');
    const dotPeriod = dotPeriodSlider ? parseInt(dotPeriodSlider.value, 10) : 6; 
    
    // 获取用户设置的颜色深浅倍率 (默认 1.0)
    const imOkDarknessSlider = document.getElementById('imOkDarknessSlider');
    const darknessFactor = imOkDarknessSlider ? parseFloat(imOkDarknessSlider.value) : 1.0;

    const angle = Math.PI / 4;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];

            let brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            let darkness = 1 - brightness;
            darkness = Math.pow(darkness, 1.1);

            // 乘上颜色深浅倍率
            let effective_darkness = 0.08 + (darkness * 0.85 * darknessFactor);

            const dotR = 119 * (1 - darkness) + 4 * darkness;
            const dotG = 94 * (1 - darkness) + 4 * darkness;
            const dotB = 1 * (1 - darkness) + 0 * darkness;

            // 核心：欧几里得距离计算完美圆形网点
            const rx = x * cosA - y * sinA;
            const ry = x * sinA + y * cosA;
            const cellCX = Math.round(rx / dotPeriod) * dotPeriod;
            const cellCY = Math.round(ry / dotPeriod) * dotPeriod;
            const dx = rx - cellCX;
            const dy = ry - cellCY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let circularVal = dist / (dotPeriod * 0.55);
            const threshold = Math.max(0.0, Math.min(1.0, circularVal));

            const difference = effective_darkness - threshold;
            const sharpness = 3.5; 
            
            let blend = difference * sharpness + 0.5;
            blend = Math.max(0, Math.min(1, blend)); 

            outPixels[i] = 255 * (1 - blend) + dotR * blend;     
            outPixels[i + 1] = 224 * (1 - blend) + dotG * blend; 
            outPixels[i + 2] = 0 * (1 - blend) + dotB * blend;   
            outPixels[i + 3] = 255;                              
        }
    }
    
    ctx.putImageData(outputData, 0, 0);

    const titleText = document.getElementById('titleInput').value || "I'm ok";
    const subtitleText = document.getElementById('subtitleInput').value || "DAVID TAO 陶喆";

    try { await document.fonts.load('96px "BrushScriptMT"'); } catch (e) { }

    ctx.font = '96px "BrushScriptMT", "Comic Sans MS", cursive';
    ctx.fillStyle = '#CC0000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(titleText, size * 0.45, size * 0.63, size * 0.5);
    
    ctx.shadowColor = 'transparent';
    ctx.font = '900 32px "Microsoft YaHei", "Arial Black", sans-serif';
    ctx.fillStyle = '#2c3e50'; 
    ctx.letterSpacing = '2px';
    ctx.fillText(subtitleText, size * 0.55, size * 0.70, size * 0.4);

    return canvas.toDataURL('image/png');
}


// =====================================================================
// 模块：白马村游记 风格专区 (交互与渲染)
// =====================================================================
function getBaimaProcessedText(inputId, defaultText) {
    return document.getElementById(inputId).value || defaultText;
}

function updateTradReference() {
    const refBox = document.getElementById('tradReferenceBox');
    if (!refBox || typeof cnchar === 'undefined') return;

    const title = document.getElementById('baimaTitleInput').value || "白马村\n游记";
    const sub = document.getElementById('baimaSubtitleInput').value || "上海彩虹\n室内合唱团";
    const combinedText = title + sub;

    const uniqueChars = [...new Set(combinedText.replace(/[\n\sa-zA-Z0-9]/g, ''))];
    const mapping = [];
    uniqueChars.forEach(char => {
        const trad = cnchar.convert.simpleToTrad(char);
        if (trad !== char) {
            mapping.push(`<span style="background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">${char} ➔ <b style="color: #FFE000; cursor: pointer;" title="点击复制" onclick="navigator.clipboard.writeText('${trad}')">${trad}</b></span>`);
        }
    });

    if (mapping.length > 0) refBox.innerHTML = mapping.join('');
    else refBox.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">当前文本没有对应的繁体字，或已全部为繁体。</span>';
}

function updateBaimaControls() {
    const titleLines = getBaimaProcessedText('baimaTitleInput', "白马村\n游记").split('\n');
    const subLines = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团").split('\n');

    const titleContainer = document.getElementById('baimaTitleControls');
    const subContainer = document.getElementById('baimaSubControls');
    if (!titleContainer || !subContainer) return;

    // 生成主标题控制条
    let titleHtml = '';
    titleLines.forEach((col, idx) => {
        const sizeEl = document.getElementById(`titleSize_${idx}`);
        const spacingEl = document.getElementById(`titleSpacing_${idx}`);
        // 记忆之前的数值，若是新列则赋默认值
        const currentSize = sizeEl ? sizeEl.value : (idx === 0 ? 320 : 256);
        const currentSpacing = spacingEl ? spacingEl.value : 0.85;
        const labelText = col.length > 3 ? col.substring(0,3) + '..' : (col || '空');

        titleHtml += `
            <div style="display: flex; gap: 10px; margin-top: 8px; align-items: center; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--accent-highlight); width: 45px; font-size: 0.85rem; white-space: nowrap; overflow: hidden; font-weight: bold;">${labelText}</span>
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">字号</span>
                    <input type="range" id="titleSize_${idx}" class="baima-dynamic-slider" min="100" max="500" step="5" value="${currentSize}" style="width: 100%; accent-color: var(--accent-highlight);">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">间距</span>
                    <input type="range" id="titleSpacing_${idx}" class="baima-dynamic-slider" min="0.5" max="1.8" step="0.05" value="${currentSpacing}" style="width: 100%; accent-color: var(--accent-highlight);">
                </div>
            </div>`;
    });
    titleContainer.innerHTML = titleHtml;

    // 生成副标题控制条
    let subHtml = '';
    subLines.forEach((col, idx) => {
        const sizeEl = document.getElementById(`subSize_${idx}`);
        const spacingEl = document.getElementById(`subSpacing_${idx}`);
        const currentSize = sizeEl ? sizeEl.value : 75;
        const currentSpacing = spacingEl ? spacingEl.value : 0.95;
        const labelText = col.length > 3 ? col.substring(0,3) + '..' : (col || '空');

        subHtml += `
            <div style="display: flex; gap: 10px; margin-top: 8px; align-items: center; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-secondary); width: 45px; font-size: 0.85rem; white-space: nowrap; overflow: hidden; font-weight: bold;">${labelText}</span>
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">字号</span>
                    <input type="range" id="subSize_${idx}" class="baima-dynamic-slider" min="30" max="180" step="5" value="${currentSize}" style="width: 100%; accent-color: var(--accent-highlight);">
                </div>
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">间距</span>
                    <input type="range" id="subSpacing_${idx}" class="baima-dynamic-slider" min="0.5" max="1.8" step="0.05" value="${currentSpacing}" style="width: 100%; accent-color: var(--accent-highlight);">
                </div>
            </div>`;
    });
    subContainer.innerHTML = subHtml;

    // 给所有新生成的滑块绑定实时刷新事件
    document.querySelectorAll('.baima-dynamic-slider').forEach(el => {
        el.addEventListener('input', updateBaimaPreview);
    });
}

function updateBaimaPreview() {
    const dragArea = document.getElementById('baimaDragArea');
    const previewBox = document.getElementById('baimaPreviewBox');
    if (!dragArea || !previewBox) return;

    const boxSize = previewBox.getBoundingClientRect().width || 400;
    const scale = boxSize / 800; 

    const titleLines = getBaimaProcessedText('baimaTitleInput', "白马村\n游记").split('\n');
    const subLines = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团").split('\n');
    
    while(AppState.baimaDrag.titlePos.length < titleLines.length) AppState.baimaDrag.titlePos.push({x: 400, y: 200});
    while(AppState.baimaDrag.subPos.length < subLines.length) AppState.baimaDrag.subPos.push({x: 200, y: 400});

    let html = '';

    titleLines.forEach((col, idx) => {
        const logicalPos = AppState.baimaDrag.titlePos[idx];
        const displayX = logicalPos.x * scale;
        const displayY = logicalPos.y * scale;

        // 【修改点】：动态读取这一列专属的滑块值
        const sizeInput = document.getElementById(`titleSize_${idx}`);
        const spaceInput = document.getElementById(`titleSpacing_${idx}`);
        const rawSize = sizeInput ? parseInt(sizeInput.value) : (idx === 0 ? 320 : 256);
        const titleSpacing = spaceInput ? parseFloat(spaceInput.value) : 0.85;
        const size = rawSize * scale;

        let colHtml = `<div class="drag-baima-col" data-type="title" data-col="${idx}" style="position:absolute; left:${displayX}px; top:${displayY}px; cursor:grab; padding: 10px; margin: -10px;">`;
        let curY = 0;
        for(let i=0; i<col.length; i++) {
            colHtml += `<div style="position:absolute; left:10px; top:${curY + 10}px; transform:translate(-50%, 0); font-size:${size}px; font-family:'ShanHaiTaoYuan', serif; color:#1A1C1A; line-height:1; white-space:pre; user-select:none;">${col[i]}</div>`;
            curY += size * titleSpacing; 
        }
        colHtml += `<div style="width: ${size}px; height: ${curY}px; transform:translate(-50%, 0);"></div></div>`;
        html += colHtml;
    });

    subLines.forEach((col, idx) => {
        const logicalPos = AppState.baimaDrag.subPos[idx];
        const displayX = logicalPos.x * scale;
        const displayY = logicalPos.y * scale;
        
        // 【修改点】：动态读取这一列专属的滑块值
        const sizeInput = document.getElementById(`subSize_${idx}`);
        const spaceInput = document.getElementById(`subSpacing_${idx}`);
        const rawSize = sizeInput ? parseInt(sizeInput.value) : 75;
        const subSpacing = spaceInput ? parseFloat(spaceInput.value) : 0.95;
        const size = rawSize * scale;

        let colHtml = `<div class="drag-baima-col" data-type="sub" data-col="${idx}" style="position:absolute; left:${displayX}px; top:${displayY}px; cursor:grab; padding: 10px; margin: -10px;">`;
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

    updateTradReference();
    updateBaimaControls(); // 初始化时生成控制条
    updateBaimaPreview();
    
    window.addEventListener('resize', updateBaimaPreview);

    previewBox.addEventListener('pointerdown', (e) => {
        const targetCol = e.target.closest('.drag-baima-col');
        if (!targetCol) return;
        
        const boxSize = previewBox.getBoundingClientRect().width || 400;
        const scale = boxSize / 800;

        AppState.baimaDrag.activeType = targetCol.getAttribute('data-type');
        AppState.baimaDrag.activeCol = parseInt(targetCol.getAttribute('data-col'));
        previewBox.style.cursor = 'grabbing';
        
        const logicalPos = AppState.baimaDrag.activeType === 'title' 
            ? AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol] 
            : AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol];
        
        AppState.baimaDrag.startX = e.clientX - (logicalPos.x * scale);
        AppState.baimaDrag.startY = e.clientY - (logicalPos.y * scale);
        
        previewBox.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    previewBox.addEventListener('pointermove', (e) => {
        if (!AppState.baimaDrag.activeType) return;
        
        const boxSize = previewBox.getBoundingClientRect().width || 400;
        const scale = boxSize / 800;
        const newDisplayX = e.clientX - AppState.baimaDrag.startX;
        const newDisplayY = e.clientY - AppState.baimaDrag.startY;
        
        if (AppState.baimaDrag.activeType === 'title') {
            AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol].x = newDisplayX / scale;
            AppState.baimaDrag.titlePos[AppState.baimaDrag.activeCol].y = newDisplayY / scale;
        } else {
            AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol].x = newDisplayX / scale;
            AppState.baimaDrag.subPos[AppState.baimaDrag.activeCol].y = newDisplayY / scale;
        }
        updateBaimaPreview();
    });

    previewBox.addEventListener('pointerup', (e) => {
        AppState.baimaDrag.activeType = null;
        AppState.baimaDrag.activeCol = -1;
        previewBox.style.cursor = 'default';
        previewBox.releasePointerCapture(e.pointerId);
    });

    ['baimaTitleInput', 'baimaSubtitleInput'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', () => {
                updateTradReference();
                updateBaimaControls(); // 文本改变可能导致行数增减，需重新生成控制条
                updateBaimaPreview();
            });
        }
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

    try { await document.fonts.load('320px "ShanHaiTaoYuan"'); } catch (e) {}

    const titleText = getBaimaProcessedText('baimaTitleInput', "白马村\n游记");
    const subtitleText = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团");
    
    tCtx.fillStyle = '#1A1C1A'; 
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle'; 

    const charPosInfo = []; 

    const titleLines = titleText.split('\n');

    titleLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.titlePos[idx] || {x: 400, y: 200};
        
        // 在生成图片时同样读取独立的滑块值
        const sizeInput = document.getElementById(`titleSize_${idx}`);
        const spaceInput = document.getElementById(`titleSpacing_${idx}`);
        const size = sizeInput ? parseInt(sizeInput.value) : (idx === 0 ? 320 : 256);
        const titleSpacing = spaceInput ? parseFloat(spaceInput.value) : 0.85;

        const finalColX = pos.x; 
        const finalColY = pos.y;
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

    const subLines = subtitleText.split('\n');

    subLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.subPos[idx] || {x: 200, y: 400};
        
        const sizeInput = document.getElementById(`subSize_${idx}`);
        const spaceInput = document.getElementById(`subSpacing_${idx}`);
        const size = sizeInput ? parseInt(sizeInput.value) : 75;
        const subSpacing = spaceInput ? parseFloat(spaceInput.value) : 0.95;

        const finalColX = pos.x;
        const finalColY = pos.y;
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


// =====================================================================
// 模块：陶喆 (克莱因蓝剪影) 风格专区
// =====================================================================
function initDTBlueModule() {
    const input = document.getElementById('dtBlueImage');
    const previewContainer = document.getElementById('dtBlueImagePreviewContainer');
    const previewBox = document.getElementById('dtBluePreviewBox');
    const zoomSlider = document.getElementById('dtBlueZoom');

    updateDTBluePreview();

    if (!input) return;

    input.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            AppState.uploadedImage = await loadImage(e.target.files[0]);
            previewContainer.style.display = 'block';
            
            const nativeW = AppState.uploadedImage.naturalWidth;
            const nativeH = AppState.uploadedImage.naturalHeight;
            const baseRatio = Math.max(800 / nativeW, 800 / nativeH);
            
            AppState.dtBlueDrag.imgWidth = nativeW * baseRatio;
            AppState.dtBlueDrag.imgHeight = nativeH * baseRatio;
            AppState.dtBlueDrag.pos.image.scale = 1; 
            AppState.dtBlueDrag.pos.image.x = -(AppState.dtBlueDrag.imgWidth - 800) / 2;
            AppState.dtBlueDrag.pos.image.y = 800 - AppState.dtBlueDrag.imgHeight + 20; 
            
            document.getElementById('dtBlueDragImg').src = AppState.uploadedImage.src;
            if(zoomSlider) zoomSlider.value = 1; 
            updateDTBluePreview();
        }
    });

    if(zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            AppState.dtBlueDrag.pos.image.scale = parseFloat(e.target.value);
            updateDTBluePreview();
        });
    }

    // 绑定所有的数值滑块和输入框，确保实时刷新
    const bindIds = [
        'dtBlueEnTitle', 'dtBlueZhTitle', 'dtBlueEnSize', 'dtBlueZhSize', 
        'dtBlueEnSpacing', 'dtBlueZhSpacing', 'dtBlueThreshold',
        'dtBlueSSize', 'dtBlueSymbol', 'dtBlueSymbolSize', 
        'dtBlueS1', 'dtBlueS2', 'dtBlueS3', 'dtBlueS4'
    ];
    bindIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', updateDTBluePreview);
    });

    if(previewBox) {
        previewBox.addEventListener('pointerdown', (e) => {
            const textTarget = e.target.closest('.drag-dt-item');
            const imgTarget = e.target.closest('#dtBlueDragImg');
            
            let activeId = null;
            if (textTarget) activeId = textTarget.getAttribute('data-id');
            else if (imgTarget && AppState.uploadedImage) activeId = 'image';
            else return;

            const boxSize = previewBox.getBoundingClientRect().width || 400;
            const scale = boxSize / 800;

            AppState.dtBlueDrag.activeItem = activeId;
            previewBox.style.cursor = 'grabbing';
            if (textTarget) textTarget.style.cursor = 'grabbing';
            
            const pos = AppState.dtBlueDrag.pos[activeId];
            AppState.dtBlueDrag.startX = e.clientX - (pos.x * scale);
            AppState.dtBlueDrag.startY = e.clientY - (pos.y * scale);
            
            previewBox.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        previewBox.addEventListener('pointermove', (e) => {
            if (!AppState.dtBlueDrag.activeItem) return;
            const boxSize = previewBox.getBoundingClientRect().width || 400;
            const scale = boxSize / 800;
            
            AppState.dtBlueDrag.pos[AppState.dtBlueDrag.activeItem].x = (e.clientX - AppState.dtBlueDrag.startX) / scale;
            AppState.dtBlueDrag.pos[AppState.dtBlueDrag.activeItem].y = (e.clientY - AppState.dtBlueDrag.startY) / scale;
            updateDTBluePreview();
        });

        previewBox.addEventListener('pointerup', (e) => {
            AppState.dtBlueDrag.activeItem = null;
            previewBox.style.cursor = 'default';
            previewBox.releasePointerCapture(e.pointerId);
            updateDTBluePreview();
        });
    }
}

function updateDTBluePreview() {
    const dragArea = document.getElementById('dtBlueDragArea');
    const previewBox = document.getElementById('dtBluePreviewBox');
    const imgEl = document.getElementById('dtBlueDragImg');
    if (!dragArea || !previewBox) return;

    // 1. 更新预览框背景为图片
    previewBox.style.background = "url('./assets/img/bg.png') center/cover no-repeat";
    previewBox.style.backgroundColor = "#1650A2";

    const boxSize = previewBox.getBoundingClientRect().width || 400;
    const scale = boxSize / 800;

    if (imgEl && AppState.uploadedImage) {
        imgEl.style.width = `${AppState.dtBlueDrag.imgWidth * scale}px`;
        imgEl.style.height = `${AppState.dtBlueDrag.imgHeight * scale}px`;
        imgEl.style.transform = `translate(${AppState.dtBlueDrag.pos.image.x * scale}px, ${AppState.dtBlueDrag.pos.image.y * scale}px) scale(${AppState.dtBlueDrag.pos.image.scale})`;
    }

    const inputs = {
        symbol: document.getElementById('dtBlueSymbol').value || "!",
        enTitle: document.getElementById('dtBlueEnTitle').value || "David Tao",
        zhTitle: document.getElementById('dtBlueZhTitle').value || "陶喆",
        s1: document.getElementById('dtBlueS1').value || "R&B / SOUL / 1997",
        s2: document.getElementById('dtBlueS2').value || "SHOCK RECORDS",
        s3: document.getElementById('dtBlueS3').value || "PRODUCED BY DAVID TAO",
        s4: document.getElementById('dtBlueS4').value || "ALL RIGHTS RESERVED"
    };

    const enSize = parseInt(document.getElementById('dtBlueEnSize').value) || 85;
    const zhSize = parseInt(document.getElementById('dtBlueZhSize').value) || 120;
    const symbolSize = parseInt(document.getElementById('dtBlueSymbolSize').value) || 120;
    const sSize = parseInt(document.getElementById('dtBlueSSize').value) || 26;
    
    // 获取间距值
    const enSpacing = parseInt(document.getElementById('dtBlueEnSpacing').value) || 0;
    const zhSpacing = parseInt(document.getElementById('dtBlueZhSpacing').value) || 0;

    let html = '';
    const createText = (id, text, font, size, align, customStyle) => {
        const pxX = AppState.dtBlueDrag.pos[id].x * scale;
        const pxY = AppState.dtBlueDrag.pos[id].y * scale;
        const pxSize = size * scale;
        const transform = align === 'center' ? 'translate(-50%, -50%)' : 'translate(0, -50%)';
        // 对 symbol 强制加上 z-index: 10，保证鼠标能选中它且视觉在最上层
        const zIndex = id === 'symbol' ? 10 : 1;
        
        return `<div class="drag-dt-item" data-id="${id}" style="position:absolute; left:${pxX}px; top:${pxY}px; cursor:grab; padding:10px; margin:-10px; user-select:none; pointer-events:auto; z-index:${zIndex};">
            <div style="transform:${transform}; font-family:${font}, sans-serif; font-size:${pxSize}px; white-space:nowrap; ${customStyle}">${text}</div>
        </div>`;
    };

    // 先生成主副标题 (排在DOM层级下方)
    html += createText('enTitle', inputs.enTitle, "'XinJian', 'XinHeiTi'", enSize, 'center', `color: #e6e8e6; letter-spacing: ${enSpacing * scale}px;`);
    html += createText('zhTitle', inputs.zhTitle, "'XinJian', 'XinHeiTi'", zhSize, 'center', `color: #e6e8e6; letter-spacing: ${zhSpacing * scale}px;`);
    
    // 再生成独立符号 (排在DOM层级上方，且自带z-index)
    html += createText('symbol', inputs.symbol, "'ShangShouHaoRan'", symbolSize, 'center', 'color: #050505;');
    
    // 最后生成四行小字
    const lowResStyle = 'color: #e6e8e6; filter: blur(1.2px); opacity: 0.55; mix-blend-mode: screen; transform: scale(1.02); transform-origin: left center;';
    html += createText('s1', inputs.s1, "'MuLanTi'", sSize, 'left', lowResStyle);
    html += createText('s2', inputs.s2, "'MuLanTi'", sSize, 'left', lowResStyle);
    html += createText('s3', inputs.s3, "'MuLanTi'", sSize, 'left', lowResStyle);
    html += createText('s4', inputs.s4, "'MuLanTi'", sSize, 'left', lowResStyle);

    dragArea.innerHTML = html;
}

async function renderDTBlueStyle() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 800; 
    canvas.width = size;
    canvas.height = size;

    // 预加载背景图和所有字体
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous"; 
    bgImg.src = './assets/img/bg.png';

    try {
        await Promise.all([
            new Promise((resolve, reject) => { bgImg.onload = resolve; bgImg.onerror = reject; }),
            document.fonts.load('120px "ShangShouHaoRan"'), 
            document.fonts.load('85px "XinJian"'), 
            document.fonts.load('85px "XinHeiTi"'), 
            document.fonts.load('26px "MuLanTi"')
        ]);
    } catch (e) {
        console.warn("字体资源加载部分失败，将尝试继续绘制", e);
    }

    // 1. 绘制背景图片 (包含底色 fallback)
    ctx.fillStyle = '#1650A2';
    ctx.fillRect(0, 0, size, size);
    if(bgImg.complete) {
        ctx.drawImage(bgImg, 0, 0, size, size);
    }

    // 2. 处理剪影与倒影
    if (AppState.uploadedImage) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = size;
        offCanvas.height = size;
        const offCtx = offCanvas.getContext('2d');
        
        const targetX = AppState.dtBlueDrag.pos.image.x;
        const targetY = AppState.dtBlueDrag.pos.image.y;
        const targetWidth = AppState.dtBlueDrag.imgWidth * AppState.dtBlueDrag.pos.image.scale;
        const targetHeight = AppState.dtBlueDrag.imgHeight * AppState.dtBlueDrag.pos.image.scale;

        offCtx.drawImage(AppState.uploadedImage, targetX, targetY, targetWidth, targetHeight);

        const imgData = offCtx.getImageData(0, 0, size, size);
        const data = imgData.data;
        const threshold = parseInt(document.getElementById('dtBlueThreshold').value) || 128;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] > 0) {
                let luma = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                if (luma < threshold) {
                    let noise = Math.random() * 15;
                    data[i] = noise; data[i+1] = noise; data[i+2] = noise;
                    data[i+3] = 255;
                } else {
                    data[i+3] = 0; // 亮部透明
                }
            }
        }
        offCtx.putImageData(imgData, 0, 0);

        // 绘制水波倒影
        const waterLineY = targetY + targetHeight - 20; 
        ctx.save();
        ctx.translate(0, waterLineY);
        ctx.scale(1, -0.6); 
        ctx.globalAlpha = 0.35; 
        ctx.drawImage(offCanvas, 0, -waterLineY);
        ctx.restore();

        // 绘制主体剪影
        ctx.drawImage(offCanvas, 0, 0);
    }

    // 3. 排版文字 (应用原生 letterSpacing API)
    const enSize = parseInt(document.getElementById('dtBlueEnSize').value) || 85;
    const zhSize = parseInt(document.getElementById('dtBlueZhSize').value) || 120;
    const symbolSize = parseInt(document.getElementById('dtBlueSymbolSize').value) || 120;
    
    const enSpacing = parseInt(document.getElementById('dtBlueEnSpacing').value) || 0;
    const zhSpacing = parseInt(document.getElementById('dtBlueZhSpacing').value) || 0;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // -- 层级 1：先画英文标题 (底层) --
    ctx.fillStyle = '#e6e8e6';
    ctx.font = `${enSize}px "XinJian", "XinHeiTi", sans-serif`;
    ctx.letterSpacing = `${enSpacing}px`;  
    ctx.fillText(document.getElementById('dtBlueEnTitle').value, AppState.dtBlueDrag.pos.enTitle.x, AppState.dtBlueDrag.pos.enTitle.y);
    
    // -- 层级 2：再画中文标题 (中层) --
    ctx.font = `${zhSize}px "XinJian", "XinHeiTi", sans-serif`;
    ctx.letterSpacing = `${zhSpacing}px`;
    ctx.fillText(document.getElementById('dtBlueZhTitle').value, AppState.dtBlueDrag.pos.zhTitle.x, AppState.dtBlueDrag.pos.zhTitle.y);

    // 恢复默认字距给后续使用
    ctx.letterSpacing = '0px';

    // -- 层级 3：最后画独立感叹号 (最顶层，完全覆盖在标题上方) --
    ctx.fillStyle = '#050505';
    ctx.font = `${symbolSize}px "ShangShouHaoRan", sans-serif`;
    ctx.fillText(document.getElementById('dtBlueSymbol').value, AppState.dtBlueDrag.pos.symbol.x, AppState.dtBlueDrag.pos.symbol.y);

    // 4. 四行小字（极限降采样重绘：实现低分辨率涂抹模糊感）
    const sSize = parseInt(document.getElementById('dtBlueSSize').value) || 26;
    const sRatio = 0.25; // 分辨率降至 25%
    
    const smallTextCanvas = document.createElement('canvas');
    smallTextCanvas.width = size * sRatio;
    smallTextCanvas.height = size * sRatio;
    const stCtx = smallTextCanvas.getContext('2d');
    
    stCtx.fillStyle = '#e6e8e6';
    stCtx.textAlign = 'left';
    stCtx.textBaseline = 'middle';
    stCtx.font = `${sSize * sRatio}px "MuLanTi", sans-serif`;
    stCtx.filter = 'blur(0.5px)'; // 在小画布上微弱模糊
    
    stCtx.fillText(document.getElementById('dtBlueS1').value, AppState.dtBlueDrag.pos.s1.x * sRatio, AppState.dtBlueDrag.pos.s1.y * sRatio);
    stCtx.fillText(document.getElementById('dtBlueS2').value, AppState.dtBlueDrag.pos.s2.x * sRatio, AppState.dtBlueDrag.pos.s2.y * sRatio);
    stCtx.fillText(document.getElementById('dtBlueS3').value, AppState.dtBlueDrag.pos.s3.x * sRatio, AppState.dtBlueDrag.pos.s3.y * sRatio);
    stCtx.fillText(document.getElementById('dtBlueS4').value, AppState.dtBlueDrag.pos.s4.x * sRatio, AppState.dtBlueDrag.pos.s4.y * sRatio);

    ctx.save();
    ctx.globalAlpha = 0.55; 
    ctx.globalCompositeOperation = 'screen'; // 滤色模式融入背景
    ctx.imageSmoothingEnabled = true; // 强制双线性插值拉伸
    ctx.drawImage(smallTextCanvas, 0, 0, smallTextCanvas.width, smallTextCanvas.height, 0, 0, size, size);
    ctx.restore();

    return canvas.toDataURL('image/png');
}