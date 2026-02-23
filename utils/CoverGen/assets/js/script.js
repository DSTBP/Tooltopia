/**
 * CoverGen - 黑胶专辑封面生成器逻辑
 */

const AppState = {
    selectedStyleId: null,
    selectedStyleCoverUrl: null,
    uploadedImage: null,
    drag: {
        x: 0,
        y: 0,
        imgWidth: 0,
        imgHeight: 0,
        scale: 1, // 新增：用于记录当前的缩放倍率
        isDragging: false,
        startX: 0,
        startY: 0
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
    
    // 显示特定的设置面板
    if (styleId === 'im_ok') {
        document.getElementById('imOkSettings').style.display = 'block';
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
    const generateBtn = document.getElementById('generateBtn');
    const resultSection = document.getElementById('resultSection');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultPreview = document.getElementById('resultPreview');
    const generatedImg = document.getElementById('generatedImg');

    generateBtn.disabled = true;
    generateBtn.textContent = "正在运用像素级网点算法...";
    resultSection.style.display = 'block';
    loadingIndicator.style.display = 'block';
    resultPreview.style.display = 'none';

    try {
        let finalImageUrl = AppState.selectedStyleCoverUrl; // 默认 fallback

        if (AppState.selectedStyleId === 'im_ok') {
            // 调用 Canvas 算法生成图片
            finalImageUrl = await renderImOkStyle();
        }

        // 渲染生成结果
        generatedImg.src = finalImageUrl;
        loadingIndicator.style.display = 'none';
        resultPreview.style.display = 'block';
        
        // 绑定下载按钮
        document.getElementById('downloadBtn').onclick = () => {
            const link = document.createElement('a');
            link.download = `cover_${new Date().getTime()}.png`;
            link.href = finalImageUrl;
            link.click();
        };

        resultSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        alert("生成出错，请确保上传了正确的图片格式！\n" + err.message);
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
    
    // 初始化图片拖拽与缩放逻辑
    initImageUploaderAndDrag();

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

function updateDragPosition() {
    const dragImg = document.getElementById('dragImg');
    // 同时应用 translate 位移 和 scale 缩放
    dragImg.style.transform = `translate(${AppState.drag.x}px, ${AppState.drag.y}px) scale(${AppState.drag.scale})`;
}