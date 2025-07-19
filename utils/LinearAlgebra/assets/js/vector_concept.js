class CoordinateSystem {
    constructor(canvasId) {
        this.canvasId = canvasId;
        
        // 画布尺寸（将在resizeCanvas中设置）
        this.width = 0;
        this.height = 0;
        
        // 坐标系参数
        this.scale = 50; // 每个单位对应的像素数
        this.originX = 0;
        this.originY = 0;
        
        // 缩放参数
        this.zoom = 1;
        this.minZoom = 0.1;
        this.maxZoom = 5;
        
        // 向量数据
        this.startPoint = { x: 0, y: 0 };
        this.endPoint = { x: 2.0, y: 2.0 };
        
        // 动画相关
        this.isAnimating = false;
        this.animationId = null;
        this.animationProgress = 0;
        
        // 矩阵显示相关
        this.showingMatrix = false;
        
        this.init();
    }
    
    init() {
        this.canvas = document.getElementById(this.canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // 设置画布为全屏
        this.resizeCanvas();
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.updateVector();
        });
        
        this.drawGrid();
        this.updateVector();
        this.setupEventListeners();
        this.setupSidebarToggle();
        this.setupInfoSidebarToggle();
    }
    
    // 调整画布大小为全屏
    resizeCanvas() {
        const canvasArea = document.querySelector('.canvas-area');
        const rect = canvasArea.getBoundingClientRect();
        
        this.width = rect.width;
        this.height = rect.height;
        
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // 设置原点位置
        this.originX = this.width / 2;
        this.originY = this.height / 2;
    }
    
    // 设置侧边栏收起功能
    setupSidebarToggle() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
            
            // 延迟重新调整画布大小，等待CSS过渡完成
            setTimeout(() => {
                this.resizeCanvas();
                this.updateVector();
            }, 300);
        });
    }
    
    // 设置右侧信息栏收起功能
    setupInfoSidebarToggle() {
        const infoSidebar = document.querySelector('.info-sidebar');
        const toggleBtn = document.getElementById('infoToggleBtn');
        
        toggleBtn.addEventListener('click', () => {
            infoSidebar.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
            
            // 延迟重新调整画布大小，等待CSS过渡完成
            setTimeout(() => {
                this.resizeCanvas();
                this.updateVector();
            }, 300);
        });
    }
    
    // 绘制网格和坐标轴
    drawGrid() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // 计算缩放后的单位间距
        const unitSpacing = this.scale * this.zoom;
        
        // 绘制背景网格
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 0.5;
        
        // 垂直线
        for (let x = this.originX % unitSpacing; x < this.width; x += unitSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        
        // 水平线
        for (let y = this.originY % unitSpacing; y < this.height; y += unitSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
        
        // 绘制坐标轴
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1.5;
        
        // X轴
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.originY);
        this.ctx.lineTo(this.width, this.originY);
        this.ctx.stroke();
        
        // Y轴
        this.ctx.beginPath();
        this.ctx.moveTo(this.originX, 0);
        this.ctx.lineTo(this.originX, this.height);
        this.ctx.stroke();
        
        
        // 绘制刻度
        this.drawTicks();
    }
    
    // 绘制刻度
    drawTicks() {
        this.ctx.fillStyle = '#333';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const unitSpacing = this.scale * this.zoom;
        
        // 计算合适的刻度间隔
        const tickInterval = this.calculateTickInterval(unitSpacing);
        
        // 计算显示的刻度范围
        const xRange = Math.floor(this.width / unitSpacing);
        const yRange = Math.floor(this.height / unitSpacing);
        const maxRange = Math.max(xRange, yRange);
        
        // 绘制X轴刻度
        this.drawAxisTicks('x', tickInterval, maxRange);
        
        // 绘制Y轴刻度
        this.drawAxisTicks('y', tickInterval, maxRange);
        
        // 原点标记 - 绘制圆点和文字标签
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(this.originX, this.originY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // 绘制原点标签
        this.ctx.fillStyle = '#333';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('(0,0)', this.originX + 8, this.originY - 8);
    }
    
    // 计算合适的刻度间隔
    calculateTickInterval(unitSpacing) {
        // 当unitSpacing小时（画布缩小），应该显示更大的刻度间隔
        // 当unitSpacing大时（画布放大），应该显示更小的刻度间隔
        
        // 计算合适的刻度间隔，确保刻度线之间有足够的间距
        const minSpacing = 30; // 刻度线之间的最小像素间距
        
        if (unitSpacing <= 3) {
            return 20; // 画布很小时，显示20单位间隔
        } else if (unitSpacing <= 6) {
            return 10; // 画布较小时，显示10单位间隔
        } else if (unitSpacing <= 12) {
            return 5; // 画布中等时，显示5单位间隔
        } else if (unitSpacing <= 25) {
            return 2; // 画布较大时，显示2单位间隔
        } else if (unitSpacing <= 50) {
            return 1; // 画布很大时，显示1单位间隔
        } else if (unitSpacing <= 100) {
            return 0.5; // 画布非常大时，显示0.5单位间隔
        } else if (unitSpacing <= 200) {
            return 0.25; // 画布极大时，显示0.25单位间隔
        } else {
            return 0.1; // 画布超级大时，显示0.1单位间隔
        }
    }
    
    // 绘制坐标轴刻度
    drawAxisTicks(axis, tickInterval, maxRange) {
        const unitSpacing = this.scale * this.zoom;
        const tickSpacing = tickInterval * unitSpacing;
        
        // 计算刻度范围 - 根据画布大小和刻度间隔调整
        const range = Math.max(maxRange / 2, 20); // 确保有足够的刻度范围
        const startTick = Math.ceil(-range / tickInterval) * tickInterval;
        const endTick = Math.floor(range / tickInterval) * tickInterval;
        
        for (let tick = startTick; tick <= endTick; tick += tickInterval) {
            if (Math.abs(tick) < 0.001) continue; // 跳过原点
            
            let x, y;
            if (axis === 'x') {
                x = this.originX + tick * unitSpacing;
                y = this.originY;
                
                if (x > 0 && x < this.width) {
                    // 绘制刻度线
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y - 4);
                    this.ctx.lineTo(x, y + 4);
                    this.ctx.stroke();
                    
                    // 绘制刻度标签
                    this.ctx.fillText(this.formatTickLabel(tick), x, y + 18);
                }
            } else { // y轴
                x = this.originX;
                y = this.originY - tick * unitSpacing;
                
                if (y > 0 && y < this.height) {
                    // 绘制刻度线
                    this.ctx.beginPath();
                    this.ctx.moveTo(x - 4, y);
                    this.ctx.lineTo(x + 4, y);
                    this.ctx.stroke();
                    
                    // 绘制刻度标签
                    this.ctx.textAlign = 'right';
                    this.ctx.fillText(this.formatTickLabel(tick), x - 8, y + 4);
                    this.ctx.textAlign = 'center';
                }
            }
        }
    }
    
    // 格式化刻度标签
    formatTickLabel(tick) {
        // 如果是整数，直接显示
        if (Math.abs(tick - Math.round(tick)) < 0.001) {
            return Math.round(tick).toString();
        }
        // 如果是小数，保留适当的小数位数
        if (Math.abs(tick) >= 10) {
            return Math.round(tick).toString(); // 大数字不显示小数
        } else if (Math.abs(tick) >= 1) {
            return tick.toFixed(1);
        } else {
            return tick.toFixed(2);
        }
    }
    
    // 绘制箭头
    drawArrow(fromX, fromY, toX, toY, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();
    }
    
    // 坐标转换：数学坐标到屏幕坐标
    mathToScreen(x, y) {
        return {
            x: this.originX + x * this.scale * this.zoom,
            y: this.originY - y * this.scale * this.zoom
        };
    }
    
    // 绘制点
    drawPoint(x, y, color = '#ff4757', size = 4) {
        const screenPos = this.mathToScreen(x, y);
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, size, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // 绘制坐标标签（原点不绘制标签，避免重复）
        if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01) {
            this.ctx.fillStyle = '#333';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`(${x.toFixed(2)}, ${y.toFixed(2)})`, screenPos.x + 8, screenPos.y - 8);
        }
    }
    
    // 绘制向量
    drawVector(startX, startY, endX, endY, color = '#667eea', lineWidth = 3) {
        const start = this.mathToScreen(startX, startY);
        const end = this.mathToScreen(endX, endY);
        
        // 计算向量长度
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // 如果两点重合，不绘制向量
        if (length < 0.1) {
            return;
        }
        
        // 绘制向量线
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        
        // 绘制箭头
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;
        
        const arrowX1 = end.x - arrowLength * Math.cos(angle - arrowAngle);
        const arrowY1 = end.y - arrowLength * Math.sin(angle - arrowAngle);
        const arrowX2 = end.x - arrowLength * Math.cos(angle + arrowAngle);
        const arrowY2 = end.y - arrowLength * Math.sin(angle + arrowAngle);
        
        this.ctx.beginPath();
        this.ctx.moveTo(end.x, end.y);
        this.ctx.lineTo(arrowX1, arrowY1);
        this.ctx.moveTo(end.x, end.y);
        this.ctx.lineTo(arrowX2, arrowY2);
        this.ctx.stroke();
    }
    
    // 更新向量显示
    updateVector() {
        this.drawGrid();
        
        // 绘制起点和终点
        this.drawPoint(this.startPoint.x, this.startPoint.y, '#ff4757');
        this.drawPoint(this.endPoint.x, this.endPoint.y, '#2ed573');
        
        // 绘制向量
        this.drawVector(this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y);
        
        // 绘制主向量标签
        if (Math.abs(this.endPoint.x - this.startPoint.x) > 0.1 || Math.abs(this.endPoint.y - this.startPoint.y) > 0.1) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            this.drawVectorLabel(midX, midY, "v1'", '#667eea');
        }
        
        // 如果正在显示矩阵，重新绘制矩阵内容
        if (this.showingMatrix) {
            this.drawComponentLines();
        }
        
        // 更新向量信息
        this.updateVectorInfo();
    }
    
    // 绘制向量标签
    drawVectorLabel(x, y, label, color) {
        const screenPos = this.mathToScreen(x, y);
        
        // 计算向量方向，调整标签位置避免被遮挡
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const angle = Math.atan2(dy, dx);
        
        // 根据向量方向调整标签位置
        const offsetX = Math.cos(angle + Math.PI/2) * 15;
        const offsetY = -Math.sin(angle + Math.PI/2) * 15;
        
        this.ctx.fillStyle = color;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, screenPos.x + offsetX, screenPos.y + offsetY);
    }
    
    // 更新向量信息显示
    updateVectorInfo() {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        document.getElementById('vectorText').textContent = `(${dx.toFixed(2)}, ${dy.toFixed(2)})`;
        document.getElementById('vectorLength').textContent = length.toFixed(2);
        document.getElementById('vectorAngle').textContent = `${angle.toFixed(1)}°`;
    }
    
    // 设置事件监听器
    setupEventListeners() {
        const inputs = ['startX', 'startY', 'endX', 'endY'];
        
        inputs.forEach(id => {
            const input = document.getElementById(id);
            input.addEventListener('input', () => {
                this.startPoint.x = parseFloat(document.getElementById('startX').value) || 0;
                this.startPoint.y = parseFloat(document.getElementById('startY').value) || 0;
                this.endPoint.x = parseFloat(document.getElementById('endX').value) || 0;
                this.endPoint.y = parseFloat(document.getElementById('endY').value) || 0;
                this.updateVector();
            });
        });
        
        // 添加缩放事件监听器
        this.canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));
                this.updateVector();
            }
        });
        
        // 添加触摸缩放支持
        let initialDistance = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                if (initialDistance > 0) {
                    const delta = currentDistance / initialDistance;
                    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));
                    this.updateVector();
                }
                initialDistance = currentDistance;
            }
        });
        
        // 添加按钮事件监听器
        this.setupButtonListeners();
    }
    
    // 设置按钮事件监听器
    setupButtonListeners() {
        const showMatrixBtn = document.getElementById('showMatrix');
        const showTrajectoryBtn = document.getElementById('showTrajectory');
        
        showMatrixBtn.addEventListener('click', () => {
            this.showMatrix();
        });
        
        showTrajectoryBtn.addEventListener('click', () => {
            this.showTrajectory();
        });
    }
    
    // 显示数值矩阵
    showMatrix() {
        if (this.showingMatrix) {
            this.hideMatrix();
            return;
        }
        
        this.showingMatrix = true;
        this.drawMatrixComponents();
        
        // 更新按钮文本
        const showMatrixBtn = document.getElementById('showMatrix');
        showMatrixBtn.innerHTML = '<span class="btn-icon">❌</span>隐藏分量';
    }
    
    // 隐藏数值矩阵
    hideMatrix() {
        this.showingMatrix = false;
        this.updateVector();
        
        // 恢复按钮文本
        const showMatrixBtn = document.getElementById('showMatrix');
        showMatrixBtn.innerHTML = '<span class="btn-icon">📊</span>显示向量分量';
    }
    
    // 绘制矩阵分量
    drawMatrixComponents() {
        this.drawGrid();
        
        // 绘制起点和终点
        this.drawPoint(this.startPoint.x, this.startPoint.y, '#ff4757');
        this.drawPoint(this.endPoint.x, this.endPoint.y, '#2ed573');
        
        // 绘制向量
        this.drawVector(this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y);
        
        // 绘制向量标签
        if (Math.abs(this.endPoint.x - this.startPoint.x) > 0.1 || Math.abs(this.endPoint.y - this.startPoint.y) > 0.1) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            this.drawVectorLabel(midX, midY, "v1'", '#667eea');
        }
        
        // 绘制分量线
        this.drawComponentLines();
    }
    
    // 绘制分量线
    drawComponentLines() {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        
        // 绘制X分量线（水平蓝色线）
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.mathToScreen(this.startPoint.x, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x, this.startPoint.y).y);
        this.ctx.lineTo(this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).y);
        this.ctx.stroke();
        
        // 绘制Y分量线（垂直绿色线）
        this.ctx.strokeStyle = '#2ecc71';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).y);
        this.ctx.lineTo(this.mathToScreen(this.endPoint.x, this.endPoint.y).x, 
                        this.mathToScreen(this.endPoint.x, this.endPoint.y).y);
        this.ctx.stroke();
        
        // 绘制分量点
        this.drawPoint(this.startPoint.x + dx, this.startPoint.y, '#3498db', 4);
        
        // 绘制分量标签
        this.drawComponentLabels(dx, dy);
    }
    
    // 绘制分量标签
    drawComponentLabels(dx, dy) {
        // X分量标签
        const xLabelX = this.startPoint.x + dx / 2;
        const xLabelY = this.startPoint.y - 0.3;
        const xScreenPos = this.mathToScreen(xLabelX, xLabelY);
        
        this.ctx.fillStyle = '#3498db';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`x = ${dx.toFixed(2)}`, xScreenPos.x, xScreenPos.y);
        
        // Y分量标签
        const yLabelX = this.startPoint.x + dx + 0.3;
        const yLabelY = this.startPoint.y + dy / 2;
        const yScreenPos = this.mathToScreen(yLabelX, yLabelY);
        
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`y = ${dy.toFixed(2)}`, yScreenPos.x, yScreenPos.y);
    }
    

    
    // 显示运动轨迹动画
    showTrajectory() {
        if (this.isAnimating) {
            this.stopAnimation();
            return;
        }
        
        this.startAnimation();
    }
    
    // 开始动画
    startAnimation() {
        this.isAnimating = true;
        this.animationProgress = 0;
        this.animateTrajectory();
        
        // 更新按钮文本
        const showTrajectoryBtn = document.getElementById('showTrajectory');
        showTrajectoryBtn.innerHTML = '<span class="btn-icon">⏹️</span>停止动画';
    }
    
    // 停止动画
    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 恢复按钮文本
        const showTrajectoryBtn = document.getElementById('showTrajectory');
        showTrajectoryBtn.innerHTML = '<span class="btn-icon">🎯</span>显示运动轨迹';
        
        // 重新绘制向量
        this.updateVector();
    }
    
    // 动画轨迹
    animateTrajectory() {
        if (!this.isAnimating) return;
        
        this.animationProgress += 0.01; // 动画速度（从0.02改为0.01，速度减半）
        
        if (this.animationProgress >= 1) {
            this.stopAnimation();
            return;
        }
        
        // 计算当前动画位置
        const currentPos = this.calculateAnimationPosition(this.animationProgress);
        
        // 绘制动画
        this.drawAnimation(currentPos);
        
        this.animationId = requestAnimationFrame(() => this.animateTrajectory());
    }
    
    // 计算动画位置
    calculateAnimationPosition(progress) {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        
        // 分两段动画：先沿X轴移动，再沿Y轴移动
        if (progress < 0.5) {
            // 第一阶段：沿X轴移动
            const xProgress = progress * 2; // 0到1
            const currentX = this.startPoint.x + dx * xProgress;
            const currentY = this.startPoint.y;
            return { x: currentX, y: currentY };
        } else {
            // 第二阶段：沿Y轴移动
            const yProgress = (progress - 0.5) * 2; // 0到1
            const currentX = this.startPoint.x + dx;
            const currentY = this.startPoint.y + dy * yProgress;
            return { x: currentX, y: currentY };
        }
    }
    
    // 绘制动画
    drawAnimation(currentPos) {
        this.drawGrid();
        
        // 绘制起点和终点
        this.drawPoint(this.startPoint.x, this.startPoint.y, '#ff4757');
        this.drawPoint(this.endPoint.x, this.endPoint.y, '#2ed573');
        
        // 绘制动画点
        this.drawPoint(currentPos.x, currentPos.y, '#ffa500', 6);
        
        // 绘制轨迹线
        this.drawTrajectoryPath(currentPos);
        
        // 绘制向量
        this.drawVector(this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y);
        
        // 绘制向量标签
        if (Math.abs(this.endPoint.x - this.startPoint.x) > 0.1 || Math.abs(this.endPoint.y - this.startPoint.y) > 0.1) {
            const midX = (this.startPoint.x + this.endPoint.x) / 2;
            const midY = (this.startPoint.y + this.endPoint.y) / 2;
            this.drawVectorLabel(midX, midY, "v1'", '#667eea');
        }
    }
    

    
    // 绘制轨迹路径
    drawTrajectoryPath(currentPos) {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        
        // 绘制X轴移动轨迹
        this.ctx.strokeStyle = '#ffa500';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.mathToScreen(this.startPoint.x, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x, this.startPoint.y).y);
        this.ctx.lineTo(this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).y);
        this.ctx.stroke();
        
        // 绘制Y轴移动轨迹
        this.ctx.beginPath();
        this.ctx.moveTo(this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).x, 
                        this.mathToScreen(this.startPoint.x + dx, this.startPoint.y).y);
        this.ctx.lineTo(this.mathToScreen(this.endPoint.x, this.endPoint.y).x, 
                        this.mathToScreen(this.endPoint.x, this.endPoint.y).y);
        this.ctx.stroke();
        
        // 重置线条样式
        this.ctx.setLineDash([]);
    }
    

}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    const coordinateSystem = new CoordinateSystem('coordinateCanvas');
}); 