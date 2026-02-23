/**
 * CoverGen - 黑胶专辑封面生成器逻辑
 * 全面重构版：逻辑分离，移动端适配，修复拖拽
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

async function handleGenerate() {
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

        // 核心渲染分发路由
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


// =====================================================================
// 模块 2：I'm OK 风格专区 (交互与渲染)
// =====================================================================

// 【修复点】：补回了丢失的 updateDragPosition 函数
function updateDragPosition() {
    const dragImg = document.getElementById('dragImg');
    if (dragImg) {
        // 利用 transform 进行丝滑的拖拽和缩放偏移
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

    // --- 纯正圆形半调算法 ---
    const outputData = ctx.createImageData(size, size);
    const outPixels = outputData.data;

    const dotPeriodSlider = document.getElementById('dotPeriodSlider');
    const dotPeriod = dotPeriodSlider ? parseInt(dotPeriodSlider.value, 10) : 6; 
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

            let effective_darkness = 0.08 + darkness * 0.85;

            const dotR = 119 * (1 - darkness) + 4 * darkness;
            const dotG = 94 * (1 - darkness) + 4 * darkness;
            const dotB = 1 * (1 - darkness) + 0 * darkness;

            // 完美的圆形距离计算
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
// 模块 3：白马村游记 风格专区 (交互与渲染)
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

function updateBaimaPreview() {
    const dragArea = document.getElementById('baimaDragArea');
    const previewBox = document.getElementById('baimaPreviewBox');
    if (!dragArea || !previewBox) return;

    // 动态缩放比，适配所有手机屏幕
    const boxSize = previewBox.getBoundingClientRect().width || 400;
    const scale = boxSize / 800; 

    const titleLines = getBaimaProcessedText('baimaTitleInput', "白马村\n游记").split('\n');
    const subLines = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团").split('\n');
    
    const titleBaseSize = (parseInt(document.getElementById('baimaTitleSize').value) || 320) * scale;
    const subBaseSize = (parseInt(document.getElementById('baimaSubSize').value) || 75) * scale;
    const titleSpacing = parseFloat(document.getElementById('baimaTitleSpacing').value) || 0.85;
    const subSpacing = parseFloat(document.getElementById('baimaSubSpacing').value) || 0.95;

    while(AppState.baimaDrag.titlePos.length < titleLines.length) AppState.baimaDrag.titlePos.push({x: 400, y: 200});
    while(AppState.baimaDrag.subPos.length < subLines.length) AppState.baimaDrag.subPos.push({x: 200, y: 400});

    let html = '';

    titleLines.forEach((col, idx) => {
        const logicalPos = AppState.baimaDrag.titlePos[idx];
        const displayX = logicalPos.x * scale;
        const displayY = logicalPos.y * scale;

        let size = titleBaseSize;
        if (idx === 1) size = titleBaseSize * 0.8; 
        else if (idx > 1) size = titleBaseSize * 0.8;

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
        let size = subBaseSize;

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
                updateBaimaPreview();
            });
        }
    });

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

    try { await document.fonts.load('320px "ShanHaiTaoYuan"'); } catch (e) {}

    const titleText = getBaimaProcessedText('baimaTitleInput', "白马村\n游记");
    const subtitleText = getBaimaProcessedText('baimaSubtitleInput', "上海彩虹\n室内合唱团");
    
    const titleSpacing = parseFloat(document.getElementById('baimaTitleSpacing').value) || 0.85;
    const subSpacing = parseFloat(document.getElementById('baimaSubSpacing').value) || 0.95;

    tCtx.fillStyle = '#1A1C1A'; 
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle'; 

    const charPosInfo = []; 

    const titleLines = titleText.split('\n');
    const titleBaseSize = parseInt(document.getElementById('baimaTitleSize').value) || 320;

    titleLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.titlePos[idx] || {x: 400, y: 200};
        let size = titleBaseSize;
        if (idx === 1) size = titleBaseSize * 0.8; 
        else if (idx > 1) size = titleBaseSize * 0.8;

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
    const subBaseSize = parseInt(document.getElementById('baimaSubSize').value) || 75;

    subLines.forEach((col, idx) => {
        const pos = AppState.baimaDrag.subPos[idx] || {x: 200, y: 400};
        let size = subBaseSize;

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
// 模块 4：事件总线初始化
// =====================================================================

window.addEventListener('load', function() {
    document.getElementById('backToHomeBtn').addEventListener('click', resetApp);
    document.getElementById('mainHomeLink').addEventListener('click', resetApp);
    
    // 生成按钮绑定
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    const btnBaima = document.getElementById('generateBtnBaima');
    if(btnBaima) btnBaima.addEventListener('click', handleGenerate);

    // I'm OK 模块初始化
    initImageUploaderAndDrag();
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

    // 白马村模块初始化
    initBaimaDrag();
});