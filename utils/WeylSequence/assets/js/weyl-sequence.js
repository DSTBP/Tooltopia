/*
 * @Description: 
 * @Author: DSTBP
 * @Date: 2025-08-10 19:52:02
 * @LastEditTime: 2025-08-10 22:38:29
 * @LastEditors: DSTBP
 */
class WeylSequenceVisualizer {
    constructor() {
        this.canvas = document.getElementById('trackCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 响应式Canvas尺寸设置
        this.setupResponsiveCanvas();
        
        this.isRunning = false;
        this.animationId = null;
        this.currentStep = 0;
        this.alpha = Math.PI;
        this.speed = 600;
        
        this.points = [];
        this.maxPoints = 1000;
        
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
        
        this.isInitialized = false;
        this.initializeCanvas();
        this.bindEvents();
        this.drawTrack();
        
        // 添加触摸事件支持
        this.setupTouchEvents();
    }
    
    setupResponsiveCanvas() {
        // 获取设备信息
        this.isMobile = window.innerWidth <= 768;
        this.isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
        
        // 根据设备类型设置Canvas尺寸
        if (this.isMobile) {
            this.canvasSize = Math.min(window.innerWidth - 40, 350);
        } else if (this.isTablet) {
            this.canvasSize = Math.min(window.innerWidth - 80, 500);
        } else {
            this.canvasSize = 600;
        }
        
        // 设置Canvas尺寸
        this.canvas.width = this.canvasSize;
        this.canvas.height = this.canvasSize;
        
        // 更新相关属性
        this.centerX = this.canvasSize / 2;
        this.centerY = this.canvasSize / 2;
        this.radius = this.canvasSize / 2 - 20;
        
        // 更新CSS样式
        this.canvas.style.width = this.canvasSize + 'px';
        this.canvas.style.height = this.canvasSize + 'px';
    }
    
    setupTouchEvents() {
        // 触摸事件支持
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.isRunning) {
                this.pause();
            } else {
                this.start();
            }
        }, { passive: false });
        
        // 双击重置
        let lastTap = 0;
        this.canvas.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                // 双击检测
                this.reset();
            }
            lastTap = currentTime;
        });
    }
    
    initializeCanvas() {
        // 移除DPR相关逻辑，保持Canvas尺寸稳定
        // 只在首次初始化时设置半径
        if (!this.isInitialized) {
            this.radius = Math.min(this.centerX, this.centerY) - 20;
            this.isInitialized = true;
        }
    }
    
    // 响应式窗口大小变化处理
    handleResize() {
        // 重新计算Canvas尺寸
        this.setupResponsiveCanvas();
        this.initializeCanvas();
        this.recalculatePoints();
        this.drawTrack();
        this.redrawAllPoints();
    }
    
    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('continueBtn').addEventListener('click', () => this.continueAfterDuplicate());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        
        document.getElementById('alphaInput').addEventListener('change', (e) => {
            this.alpha = parseFloat(e.target.value);
            document.getElementById('alphaValue').textContent = this.alpha.toFixed(3);
            this.reset();
        });
        
        document.getElementById('speedInput').addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            document.getElementById('speedValue').textContent = this.speed + 'ms';
        });
        
        // 响应式resize事件处理
        window.addEventListener('resize', () => {
            // 防抖处理
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
        
        // 添加触摸手势支持
        this.setupGestureSupport();
    }
    
    setupGestureSupport() {
        // 手势支持：滑动控制速度
        let startY = 0;
        let startSpeed = 0;
        
        this.canvas.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startSpeed = this.speed;
        }, { passive: true });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const deltaY = startY - e.touches[0].clientY;
                const speedChange = deltaY * 2; // 每像素改变2ms
                const newSpeed = Math.max(100, Math.min(2000, startSpeed + speedChange));
                
                if (Math.abs(newSpeed - this.speed) > 50) {
                    this.speed = newSpeed;
                    document.getElementById('speedInput').value = this.speed;
                    document.getElementById('speedValue').textContent = this.speed + 'ms';
                }
            }
        }, { passive: true });
    }
    
    drawTrack() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.drawTrackMarkers();
        
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 3, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.fill();
    }
    
    drawTrackMarkers() {
        for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            const startX = this.centerX + (this.radius - 15) * Math.cos(angle);
            const startY = this.centerY + (this.radius - 15) * Math.sin(angle);
            const endX = this.centerX + this.radius * Math.cos(angle);
            const endY = this.centerY + this.radius * Math.sin(angle);
            
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }
    
    // 添加新点
    addPoint() {
        // 检测是否与之前的点重叠
        if (this.checkDuplicatePoint()) {
            this.showDuplicatePointAlert();
            this.pause();
            return;
        }
        
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        const currentAngleMod1 = ((this.currentStep * this.alpha) % 1).toFixed(10);
        
        const x = this.centerX + this.radius * Math.cos(currentAngle);
        const y = this.centerY + this.radius * Math.sin(currentAngle);
        
        // 生成颜色
        const hue = (this.currentStep * 30) % 360;
        const color = `hsl(${hue}, 70%, 60%)`;
        
        // 保存点信息，包括角度模1的值
        this.points.push({
            x: x,
            y: y,
            angle: currentAngle,
            angleMod1: currentAngleMod1,
            step: this.currentStep,
            color: color
        });
        
        // 绘制轨迹
        if (this.currentStep > 0) {
            const prevPoint = this.points[this.currentStep - 1];
            this.drawTrajectory(prevPoint.x, prevPoint.y, x, y, color);
        }
        
        // 绘制点
        this.drawPoint(x, y, color);
        
        this.currentStep++;
        this.updateInfo();
    }
    
    // 检测重复点的方法
    checkDuplicatePoint() {
        // 提高精度到小数点后10位
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        const currentAngleMod1 = ((this.currentStep * this.alpha) % 1).toFixed(10);
        
        return this.points.some(point => {
            // 检查角度模1的值（精确到小数点后10位）
            const pointAngleMod1 = point.angleMod1;
            const angleMatch = currentAngleMod1 === pointAngleMod1;
            
            // 如果角度模1匹配，认为是重复点
            return angleMatch;
        });
    }
    
    // 显示重复点弹窗
    showDuplicatePointAlert() {
        const modal = document.createElement('div');
        modal.className = 'duplicate-point-modal';
        
        // 找到重复的点
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        const currentAngleMod1 = ((this.currentStep * this.alpha) % 1).toFixed(10);
        const duplicatePoint = this.points.find(point => point.angleMod1 === currentAngleMod1);
        
        const stepDiff = duplicatePoint ? this.currentStep - duplicatePoint.step : '未知';
        
        // 生成详细的重复数据信息
        const duplicateData = `
重复点详细信息：
当前步数: ${this.currentStep}
重复步数: ${duplicatePoint ? duplicatePoint.step : '未知'}
步数差异: ${stepDiff}
当前角度: ${(currentAngle * 180 / Math.PI).toFixed(6)}°
角度模1值: ${currentAngleMod1}
坐标位置: (${(this.centerX + this.radius * Math.cos(currentAngle)).toFixed(6)}, ${(this.centerY + this.radius * Math.sin(currentAngle)).toFixed(6)})
        `.trim();
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3>🎯 发现重复点！</h3>
                <p>在第 ${this.currentStep} 步时，点落到了之前走过的位置。</p>
                <p>与第 ${duplicatePoint ? duplicatePoint.step : '未知'} 步的点重叠（相差 ${stepDiff} 步）</p>
                <p>这说明 Weyl Sequence 开始出现周期性行为。</p>
                
                <div class="duplicate-data">
                    <h4>重复数据详情：</h4>
                    <textarea readonly class="data-output">${duplicateData}</textarea>
                </div>
                
                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="this.closest('.duplicate-point-modal').remove()">关闭</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // 在重复点后继续生成
    continueAfterDuplicate() {
        // 直接添加当前点（跳过重复检测）
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        const currentAngleMod1 = ((this.currentStep * this.alpha) % 1).toFixed(10);
        
        const x = this.centerX + this.radius * Math.cos(currentAngle);
        const y = this.centerY + this.radius * Math.sin(currentAngle);
        
        // 生成颜色
        const hue = (this.currentStep * 30) % 360;
        const color = `hsl(${hue}, 70%, 60%)`;
        
        // 保存点信息
        this.points.push({
            x: x,
            y: y,
            angle: currentAngle,
            angleMod1: currentAngleMod1,
            step: this.currentStep,
            color: color
        });
        
        // 绘制轨迹
        if (this.currentStep > 0) {
            const prevPoint = this.points[this.currentStep - 1];
            this.drawTrajectory(prevPoint.x, prevPoint.y, x, y, color);
        }
        
        // 绘制点
        this.drawPoint(x, y, color);
        
        this.currentStep++;
        this.updateInfo();
        
        // 重新开始动画
        this.start();
    }
    
    drawPoint(x, y, color) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    drawTrajectory(x1, y1, x2, y2, color) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    recalculatePoints() {
        // 重新计算所有点的坐标，使其相对于新的圆盘位置
        this.points.forEach(point => {
            const angle = point.angle;
            point.x = this.centerX + this.radius * Math.cos(angle);
            point.y = this.centerY + this.radius * Math.sin(angle);
        });
    }
    
    redrawAllPoints() {
        this.points.forEach((point, index) => {
            if (index > 0) {
                const prevPoint = this.points[index - 1];
                this.drawTrajectory(prevPoint.x, prevPoint.y, point.x, point.y, point.color);
            }
            this.drawPoint(point.x, point.y, point.color);
        });
    }
    
    updateInfo() {
        document.getElementById('stepCount').textContent = this.currentStep;
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        document.getElementById('currentAngle').textContent = (currentAngle * 180 / Math.PI).toFixed(1) + '°';
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('continueBtn').disabled = true;
        
        this.animate();
    }
    
    pause() {
        this.isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('continueBtn').disabled = false;
        
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
    }
    
    reset() {
        this.pause();
        this.currentStep = 0;
        this.points = [];
        document.getElementById('continueBtn').disabled = true;
        this.drawTrack();
        this.updateInfo();
    }
    
    animate() {
        if (!this.isRunning) return;
        
        this.addPoint();
        
        this.animationId = setTimeout(() => {
            this.animate();
        }, this.speed);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const visualizer = new WeylSequenceVisualizer();
    
    const presetAlphas = [
        { name: 'π', value: Math.PI },
        { name: 'e', value: Math.E },
        { name: '√2', value: Math.sqrt(2) },
        { name: '√3', value: Math.sqrt(3) },
        { name: '黄金比例', value: (1 + Math.sqrt(5)) / 2 }
    ];
    
    const presetContainer = document.createElement('div');
    presetContainer.className = 'preset-alphas';
    presetContainer.innerHTML = '<label>预设α值:</label><div class="preset-buttons"></div>';
    
    const presetButtons = presetContainer.querySelector('.preset-buttons');
    presetAlphas.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary preset-btn';
        btn.textContent = preset.name;
        btn.addEventListener('click', () => {
            document.getElementById('alphaInput').value = preset.value;
            visualizer.alpha = preset.value;
            document.getElementById('alphaValue').textContent = preset.value.toFixed(3);
            visualizer.reset();
        });
        presetButtons.appendChild(btn);
    });
    
    const controls = document.querySelector('.controls');
    controls.insertBefore(presetContainer, controls.firstChild);
    
    const style = document.createElement('style');
    style.textContent = `
        .preset-alphas {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e9ecef;
        }
        .preset-alphas label {
            display: block;
            margin-bottom: 10px;
            font-weight: 600;
            color: #555;
        }
        .preset-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .preset-btn {
            padding: 8px 16px;
            font-size: 0.9rem;
            min-width: auto;
            flex: none;
        }
    `;
    document.head.appendChild(style);
}); 