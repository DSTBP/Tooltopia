class VectorVisualization {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.baseScale = 100; // 初始像素/单位
        this.scale = this.baseScale;
        this.minScale = 20;
        this.maxScale = 400;

        // 初始化基向量
        this.e1 = { x: 1, y: 0 };
        this.e2 = { x: 0, y: 1 };
        // 多个向量v，每个有a1,a2
        this.maxVectors = 10;
        this.colors = [
            '#4444ff', '#ffb703', '#06d6a0', '#ef476f', '#8338ec', '#3a86ff', '#fb5607', '#ff006e', '#ffd166', '#118ab2'
        ];
        this.vectors = [this.createVector()];
        this.showSpanTrans = false;

        this.setupEventListeners();
        this.renderVectorsControl();
        this.draw();
    }

    createVector() {
        // 随机分配未被用过的颜色
        const usedColors = this.vectors ? this.vectors.map(v => v.color) : [];
        const availableColors = this.colors.filter(c => !usedColors.includes(c));
        let color = availableColors.length > 0 ? availableColors[Math.floor(Math.random() * availableColors.length)] : this.colors[Math.floor(Math.random() * this.colors.length)];
        return {
            a1: 1,
            a2: 1,
            color
        };
    }

    setupEventListeners() {
        // 基向量e1的输入框
        const e1xNum = document.getElementById('e1x-num');
        const e1yNum = document.getElementById('e1y-num');
        e1xNum.addEventListener('input', (e) => {
            this.e1.x = parseFloat(e.target.value);
            this.draw();
            this.renderVectorsControl();
        });
        e1yNum.addEventListener('input', (e) => {
            this.e1.y = parseFloat(e.target.value);
            this.draw();
            this.renderVectorsControl();
        });
        // 基向量e2的输入框
        const e2xNum = document.getElementById('e2x-num');
        const e2yNum = document.getElementById('e2y-num');
        e2xNum.addEventListener('input', (e) => {
            this.e2.x = parseFloat(e.target.value);
            this.draw();
            this.renderVectorsControl();
        });
        e2yNum.addEventListener('input', (e) => {
            this.e2.y = parseFloat(e.target.value);
            this.draw();
            this.renderVectorsControl();
        });
        // 画布尺寸
        document.getElementById('resizeCanvas').addEventListener('click', () => {
            const w = parseInt(document.getElementById('canvas-width').value);
            const h = parseInt(document.getElementById('canvas-height').value);
            this.canvas.width = w;
            this.canvas.height = h;
            this.centerX = w / 2;
            this.centerY = h / 2;
            this.draw();
        });
        // 画布缩放
        this.canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const oldScale = this.scale;
                if (e.deltaY < 0) {
                    this.scale = Math.min(this.maxScale, this.scale * 1.1);
                } else {
                    this.scale = Math.max(this.minScale, this.scale / 1.1);
                }
                // 缩放时保持画布中心不变
                this.draw();
            }
        }, { passive: false });
        // 添加向量
        document.getElementById('addVector').addEventListener('click', () => {
            if (this.vectors.length < this.maxVectors) {
                this.vectors.push(this.createVector());
                this.renderVectorsControl();
                this.draw();
            }
        });
        // 随机基向量
        document.getElementById('randomBasis').addEventListener('click', () => {
            this.generateRandomBasis();
        });
        // 重置
        document.getElementById('resetBasis').addEventListener('click', () => {
            this.resetToStandardBasis();
        });
        document.getElementById('showSpanTrans').addEventListener('click', () => {
            this.showSpanTrans = !this.showSpanTrans;
            this.draw();
            document.getElementById('showSpanTrans').textContent = this.showSpanTrans ? '隐藏张成空间变换' : '显示张成空间变换';
        });
    }

    renderVectorsControl() {
        const container = document.getElementById('vectors-control');
        container.innerHTML = '';
        this.vectors.forEach((vec, idx) => {
            const group = document.createElement('div');
            group.className = 'vector-group';
            // 标签
            const label = document.createElement('div');
            label.className = 'vector-label';
            label.textContent = `向量 v${idx + 1}`;
            group.appendChild(label);
            // 表达式
            const expr = document.createElement('div');
            expr.className = 'vector-expr';
            expr.id = `vector-expr-${idx}`;
            expr.textContent = this.getVectorExpr(idx);
            group.appendChild(expr);
            // 结果值
            const valueDiv = document.createElement('div');
            valueDiv.className = 'vector-expr';
            valueDiv.style.color = '#888';
            valueDiv.style.fontSize = '0.98em';
            valueDiv.id = `vector-value-${idx}`;
            valueDiv.textContent = this.getVectorValue(idx);
            group.appendChild(valueDiv);
            // a1滑块+输入框
            const row1 = document.createElement('div');
            row1.className = 'slider-row';
            const a1Label = document.createElement('label');
            a1Label.textContent = 'a₁';
            row1.appendChild(a1Label);
            const a1Slider = document.createElement('input');
            a1Slider.type = 'range';
            a1Slider.min = -50;
            a1Slider.max = 50;
            a1Slider.step = 0.1;
            a1Slider.value = vec.a1;
            a1Slider.id = `a1-${idx}`;
            row1.appendChild(a1Slider);
            const a1Value = document.createElement('span');
            a1Value.className = 'slider-value';
            a1Value.id = `a1-value-${idx}`;
            a1Value.textContent = vec.a1.toFixed(1);
            row1.appendChild(a1Value);
            const a1Input = document.createElement('input');
            a1Input.type = 'number';
            a1Input.className = 'slider-input';
            a1Input.min = -50;
            a1Input.max = 50;
            a1Input.step = 0.1;
            a1Input.value = vec.a1;
            row1.appendChild(a1Input);
            group.appendChild(row1);
            // a2滑块+输入框
            const row2 = document.createElement('div');
            row2.className = 'slider-row';
            const a2Label = document.createElement('label');
            a2Label.textContent = 'a₂';
            row2.appendChild(a2Label);
            const a2Slider = document.createElement('input');
            a2Slider.type = 'range';
            a2Slider.min = -50;
            a2Slider.max = 50;
            a2Slider.step = 0.1;
            a2Slider.value = vec.a2;
            a2Slider.id = `a2-${idx}`;
            row2.appendChild(a2Slider);
            const a2Value = document.createElement('span');
            a2Value.className = 'slider-value';
            a2Value.id = `a2-value-${idx}`;
            a2Value.textContent = vec.a2.toFixed(1);
            row2.appendChild(a2Value);
            const a2Input = document.createElement('input');
            a2Input.type = 'number';
            a2Input.className = 'slider-input';
            a2Input.min = -50;
            a2Input.max = 50;
            a2Input.step = 0.1;
            a2Input.value = vec.a2;
            row2.appendChild(a2Input);
            group.appendChild(row2);
            // 删除按钮
            if (this.vectors.length > 1) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'control-btn btn-remove';
                removeBtn.textContent = '删除';
                removeBtn.onclick = () => {
                    this.vectors.splice(idx, 1);
                    this.renderVectorsControl();
                    this.draw();
                };
                group.appendChild(removeBtn);
            }
            // 事件
            a1Slider.addEventListener('input', (e) => {
                vec.a1 = parseFloat(e.target.value);
                a1Value.textContent = vec.a1.toFixed(1);
                a1Input.value = vec.a1;
                expr.textContent = this.getVectorExpr(idx);
                valueDiv.textContent = this.getVectorValue(idx);
                this.draw();
            });
            a1Input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 0;
                val = Math.max(-50, Math.min(50, val));
                vec.a1 = val;
                a1Slider.value = val;
                a1Value.textContent = val.toFixed(1);
                expr.textContent = this.getVectorExpr(idx);
                valueDiv.textContent = this.getVectorValue(idx);
                this.draw();
            });
            a2Slider.addEventListener('input', (e) => {
                vec.a2 = parseFloat(e.target.value);
                a2Value.textContent = vec.a2.toFixed(1);
                a2Input.value = vec.a2;
                expr.textContent = this.getVectorExpr(idx);
                valueDiv.textContent = this.getVectorValue(idx);
                this.draw();
            });
            a2Input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 0;
                val = Math.max(-50, Math.min(50, val));
                vec.a2 = val;
                a2Slider.value = val;
                a2Value.textContent = val.toFixed(1);
                expr.textContent = this.getVectorExpr(idx);
                valueDiv.textContent = this.getVectorValue(idx);
                this.draw();
            });
            container.appendChild(group);
        });
    }

    getVectorExpr(idx) {
        const v = this.vectors[idx];
        return `v${idx + 1} = ${v.a1.toFixed(1)}·e₁ + ${v.a2.toFixed(1)}·e₂`;
    }

    getVectorValue(idx) {
        const v = this.vectors[idx];
        const x = v.a1 * this.e1.x + v.a2 * this.e2.x;
        const y = v.a1 * this.e1.y + v.a2 * this.e2.y;
        return `v${idx + 1} = (${x.toFixed(2)}, ${y.toFixed(2)})`;
    }

    generateRandomBasis() {
        do {
            this.e1.x = parseFloat((Math.random() * 6 - 3).toFixed(1));
            this.e1.y = parseFloat((Math.random() * 6 - 3).toFixed(1));
            this.e2.x = parseFloat((Math.random() * 6 - 3).toFixed(1));
            this.e2.y = parseFloat((Math.random() * 6 - 3).toFixed(1));
        } while (Math.abs(this.e1.x * this.e2.y - this.e1.y * this.e2.x) < 0.2);
        document.getElementById('e1x-num').value = this.e1.x;
        document.getElementById('e1y-num').value = this.e1.y;
        document.getElementById('e2x-num').value = this.e2.x;
        document.getElementById('e2y-num').value = this.e2.y;
        this.draw();
        this.renderVectorsControl();
    }

    resetToStandardBasis() {
        this.e1 = { x: 1, y: 0 };
        this.e2 = { x: 0, y: 1 };
        this.vectors = [this.createVector()];
        document.getElementById('e1x-num').value = this.e1.x;
        document.getElementById('e1y-num').value = this.e1.y;
        document.getElementById('e2x-num').value = this.e2.x;
        document.getElementById('e2y-num').value = this.e2.y;
        this.scale = this.baseScale;
        this.draw();
        this.renderVectorsControl();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.drawGrid();
        if (this.showSpanTrans) this.drawTransformedGrid();
        this.drawAxes();
        // 先画原坐标下的虚线基向量和v
        this.drawStandardBasisVectors();
        this.drawStandardVectors();
        // 再画当前张成空间下的实线基向量和v
        this.drawBasisVectors();
        this.drawVectors();
        this.drawOrigin();
    }

    drawGrid() {
        const step = this.scale;
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.save();
        this.ctx.strokeStyle = '#eee';
        this.ctx.lineWidth = 1;
        for (let x = this.centerX % step; x < w; x += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
            this.ctx.stroke();
        }
        for (let y = this.centerY % step; y < h; y += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawAxes() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.save();
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 2;
        // X轴
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.centerY);
        this.ctx.lineTo(w, this.centerY);
        this.ctx.stroke();
        // Y轴
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, 0);
        this.ctx.lineTo(this.centerX, h);
        this.ctx.stroke();
        // 坐标数值
        this.ctx.font = '13px Arial';
        this.ctx.fillStyle = '#888';
        for (let i = -Math.floor(this.centerX / this.scale); i <= Math.floor((w - this.centerX) / this.scale); i++) {
            if (i === 0) continue;
            const x = this.centerX + i * this.scale;
            this.ctx.fillText(i.toString(), x - 8, this.centerY + 18);
        }
        for (let i = -Math.floor(this.centerY / this.scale); i <= Math.floor((h - this.centerY) / this.scale); i++) {
            if (i === 0) continue;
            const y = this.centerY - i * this.scale;
            this.ctx.fillText(i.toString(), this.centerX + 6, y + 4);
        }
        this.ctx.restore();
    }

    drawOrigin() {
        // 原点坐标
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 4, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#22223b';
        this.ctx.fill();
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillStyle = '#22223b';
        this.ctx.fillText('(0,0)', this.centerX + 8, this.centerY - 8);
        this.ctx.restore();
    }

    drawBasisVectors() {
        // 绘制基向量e1,e2（固定红/绿）
        this.drawVector(this.e1.x, this.e1.y, '#00CC00', 'i', false, 1.5);
        this.drawVector(this.e2.x, this.e2.y, '#ff4444', 'j', false, 1.5);
    }

    drawVectors() {
        // 绘制所有v
        this.vectors.forEach((v, idx) => {
            const color = v.color;
            const resultX = v.a1 * this.e1.x + v.a2 * this.e2.x;
            const resultY = v.a1 * this.e1.y + v.a2 * this.e2.y;
            this.drawVector(resultX, resultY, color, `v${idx + 1}`, false, 2.5);
        });
    }

    drawVector(x, y, color, label, isDashed = false, width = 2) {
        const startX = this.centerX;
        const startY = this.centerY;
        const endX = this.centerX + x * this.scale;
        const endY = this.centerY - y * this.scale;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        if (isDashed) {
            this.ctx.setLineDash([5, 5]);
        } else {
            this.ctx.setLineDash([]);
        }
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        // 箭头
        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowLength = 14;
        const arrowAngle = Math.PI / 7;
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(
            endX - arrowLength * Math.cos(angle - arrowAngle),
            endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.lineTo(
            endX - arrowLength * Math.cos(angle + arrowAngle),
            endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        // 标签
        if (label) {
            this.ctx.font = '16px Arial';
            this.ctx.fillStyle = color;
            this.ctx.fillText(label, endX + 10, endY - 10);
        }
        this.ctx.restore();
    }

    drawTransformedGrid() {
        // 变换矩阵 [e1.x e2.x; e1.y e2.y]
        const step = this.scale;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const gridRange = 10; // 变换前网格范围
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(67,97,238,0.35)';
        this.ctx.lineWidth = 1.5;
        // 画变换后的竖线
        for (let i = -gridRange; i <= gridRange; i++) {
            let p1 = this.applyBasis(i, -gridRange);
            let p2 = this.applyBasis(i, gridRange);
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX + p1.x * this.scale, this.centerY - p1.y * this.scale);
            this.ctx.lineTo(this.centerX + p2.x * this.scale, this.centerY - p2.y * this.scale);
            this.ctx.stroke();
        }
        // 画变换后的横线
        for (let j = -gridRange; j <= gridRange; j++) {
            let p1 = this.applyBasis(-gridRange, j);
            let p2 = this.applyBasis(gridRange, j);
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX + p1.x * this.scale, this.centerY - p1.y * this.scale);
            this.ctx.lineTo(this.centerX + p2.x * this.scale, this.centerY - p2.y * this.scale);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    applyBasis(i, j) {
        // 线性变换: (i, j) -> i*e1 + j*e2
        return {
            x: i * this.e1.x + j * this.e2.x,
            y: i * this.e1.y + j * this.e2.y
        };
    }

    drawStandardBasisVectors() {
        // 标准基向量 (1,0) (0,1) 虚线 红/绿
        this.drawVector(1, 0, 'rgba(68,255,68,0.5)', 'i′', true, 1.5);
        this.drawVector(0, 1, 'rgba(255,68,68,0.5)', 'j′', true, 1.5);
    }

    drawStandardVectors() {
        // 所有v在标准基下的虚线（即a1*(1,0)+a2*(0,1)）
        this.vectors.forEach((v, idx) => {
            const color = this.hexToRgba(v.color, 0.4);
            const resultX = v.a1 * 1 + v.a2 * 0;
            const resultY = v.a1 * 0 + v.a2 * 1;
            this.drawVector(resultX, resultY, color, `v${idx + 1}′`, true, 2);
        });
    }

    hexToRgba(hex, alpha) {
        // 支持 #RRGGBB
        let r = 0, g = 0, b = 0;
        if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }
}

window.addEventListener('load', () => {
    new VectorVisualization('vectorCanvas');
}); 