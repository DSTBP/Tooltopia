/*
 * @Description: 
 * @Author: DSTBP
 * @Date: 2025-08-10 19:52:02
 * @LastEditTime: 2025-08-10 20:34:31
 * @LastEditors: DSTBP
 */
class WeylSequenceVisualizer {
    constructor() {
        this.canvas = document.getElementById('trackCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 设置固定的Canvas尺寸，避免动态变化
        this.canvas.width = 600;
        this.canvas.height = 600;
        
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = 250;
        
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
    }
    
    initializeCanvas() {
        // 移除DPR相关逻辑，保持Canvas尺寸稳定
        // 只在首次初始化时设置半径
        if (!this.isInitialized) {
            this.radius = Math.min(this.centerX, this.centerY) - 20;
            this.isInitialized = true;
        }
    }
    
    // 简化窗口大小变化处理，避免重新计算Canvas尺寸
    handleResize() {
        // 保持Canvas尺寸不变，只重新绘制内容
        this.drawTrack();
        this.redrawAllPoints();
    }
    
    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
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
        
        // 简化resize事件处理
        window.addEventListener('resize', () => {
            this.handleResize();
        });
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
    
    addPoint() {
        const angle = (this.currentStep * this.alpha) % (2 * Math.PI);
        
        const x = this.centerX + this.radius * Math.cos(angle);
        const y = this.centerY + this.radius * Math.sin(angle);
        
        // 检测是否与之前的点重叠
        if (this.checkDuplicatePoint(x, y)) {
            this.showDuplicatePointAlert();
            this.pause();
            return;
        }
        
        this.points.push({
            x: x,
            y: y,
            angle: angle,
            step: this.currentStep,
            color: this.colors[this.currentStep % this.colors.length]
        });
        
        if (this.points.length > this.maxPoints) {
            this.points.shift();
        }
        
        this.updateInfo();
        
        this.drawPoint(x, y, this.colors[this.currentStep % this.colors.length]);
        
        if (this.points.length > 1) {
            const prevPoint = this.points[this.points.length - 2];
            this.drawTrajectory(prevPoint.x, prevPoint.y, x, y, this.colors[this.currentStep % this.colors.length]);
        }
        
        this.currentStep++;
    }
    
    // 检测重复点的方法
    checkDuplicatePoint(x, y) {
        const tolerance = 8; // 坐标容差范围，考虑到点的绘制大小
        const angleTolerance = 0.1; // 角度容差范围（弧度）
        
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        
        return this.points.some(point => {
            // 检查坐标距离
            const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
            const coordinateMatch = distance < tolerance;
            
            // 检查角度（考虑模2π的周期性）
            const angleDiff = Math.abs((currentAngle - point.angle + Math.PI) % (2 * Math.PI) - Math.PI);
            const angleMatch = angleDiff < angleTolerance;
            
            // 如果坐标和角度都匹配，认为是重复点
            return coordinateMatch && angleMatch;
        });
    }
    
    // 显示重复点弹窗
    showDuplicatePointAlert() {
        const modal = document.createElement('div');
        modal.className = 'duplicate-point-modal';
        
        // 找到最接近的重复点
        const currentAngle = (this.currentStep * this.alpha) % (2 * Math.PI);
        const closestPoint = this.points.find(point => {
            const distance = Math.sqrt((point.x - (this.centerX + this.radius * Math.cos(currentAngle))) ** 2 + 
                                     (point.y - (this.centerY + this.radius * Math.sin(currentAngle))) ** 2);
            return distance < 8;
        });
        
        const stepDiff = closestPoint ? this.currentStep - closestPoint.step : '未知';
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3>🎯 发现重复点！</h3>
                <p>在第 ${this.currentStep} 步时，点落到了之前走过的位置。</p>
                <p>与第 ${closestPoint ? closestPoint.step : '未知'} 步的点重叠（相差 ${stepDiff} 步）</p>
                <p>Weyl Sequence 开始出现周期性行为。</p>
                <div class="modal-buttons">
                    <button class="btn btn-primary" onclick="this.closest('.duplicate-point-modal').remove()">确定</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
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
        
        this.animate();
    }
    
    pause() {
        this.isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
    }
    
    reset() {
        this.pause();
        this.currentStep = 0;
        this.points = [];
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