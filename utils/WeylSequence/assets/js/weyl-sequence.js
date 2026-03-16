class WeylSequenceVisualizer {
    constructor() {
        this.canvas = document.getElementById('trackCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.continueBtn = document.getElementById('continueBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.alphaInput = document.getElementById('alphaInput');
        this.speedInput = document.getElementById('speedInput');
        this.speedValue = document.getElementById('speedValue');
        this.stepCountEl = document.getElementById('stepCount');
        this.currentAngleEl = document.getElementById('currentAngle');
        this.alphaValueEl = document.getElementById('alphaValue');

        this.isRunning = false;
        this.animationTimer = null;
        this.currentStep = 0;
        this.alpha = Math.PI;
        this.speed = 600;
        this.points = [];
        this.maxPoints = 1000;
        this.isInitialized = false;
        this.pausedDueToDuplicate = false;
        this.pendingPoint = null;
        this.resizeTimeout = null;
        this.duplicateTolerance = 1e-10;

        this.setupResponsiveCanvas();
        this.initializeCanvas();
        this.bindEvents();
        this.drawTrack();
        this.updateInfo();
        this.setupTouchEvents();
    }

    get fullCircle() {
        return 2 * Math.PI;
    }

    setupResponsiveCanvas() {
        this.isMobile = window.innerWidth <= 768;
        this.isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;

        if (this.isMobile) {
            this.canvasSize = Math.min(window.innerWidth - 40, 350);
        } else if (this.isTablet) {
            this.canvasSize = Math.min(window.innerWidth - 80, 500);
        } else {
            this.canvasSize = 600;
        }

        this.canvas.width = this.canvasSize;
        this.canvas.height = this.canvasSize;
        this.canvas.style.width = `${this.canvasSize}px`;
        this.canvas.style.height = `${this.canvasSize}px`;
        this.centerX = this.canvasSize / 2;
        this.centerY = this.canvasSize / 2;
        this.radius = this.canvasSize / 2 - 20;
    }

    setupTouchEvents() {
        this.canvas.addEventListener('touchstart', (event) => {
            event.preventDefault();
            if (this.isRunning) {
                this.pause();
            } else {
                this.start();
            }
        }, { passive: false });

        let lastTap = 0;
        this.canvas.addEventListener('touchend', () => {
            const currentTime = Date.now();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                this.reset();
            }
            lastTap = currentTime;
        });
    }

    initializeCanvas() {
        if (!this.isInitialized) {
            this.radius = Math.min(this.centerX, this.centerY) - 20;
            this.isInitialized = true;
        }
    }

    handleResize() {
        this.setupResponsiveCanvas();
        this.initializeCanvas();
        this.recalculatePoints();
        this.drawTrack();
        this.redrawAllPoints();
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.continueBtn.addEventListener('click', () => this.continueAnimation());
        this.resetBtn.addEventListener('click', () => this.reset());

        this.alphaInput.addEventListener('change', (event) => {
            const nextValue = parseFloat(event.target.value);
            if (!Number.isFinite(nextValue)) {
                event.target.value = this.alpha;
                return;
            }

            this.alpha = nextValue;
            this.alphaValueEl.textContent = this.alpha.toFixed(3);
            this.reset();
        });

        this.speedInput.addEventListener('input', (event) => {
            this.speed = parseInt(event.target.value, 10);
            this.speedValue.textContent = `${this.speed}ms`;
            if (this.isRunning) {
                this.restartAnimationLoop();
            }
        });

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.handleResize(), 250);
        });

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('change', () => {
                this.drawTrack();
                this.redrawAllPoints();
            });
        }

        this.setupGestureSupport();
    }

    setupGestureSupport() {
        let startY = 0;
        let startSpeed = 0;

        this.canvas.addEventListener('touchstart', (event) => {
            startY = event.touches[0].clientY;
            startSpeed = this.speed;
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (event) => {
            if (event.touches.length !== 1) {
                return;
            }

            const deltaY = startY - event.touches[0].clientY;
            const speedChange = deltaY * 2;
            const newSpeed = Math.max(100, Math.min(2000, startSpeed + speedChange));

            if (Math.abs(newSpeed - this.speed) > 50) {
                this.speed = newSpeed;
                this.speedInput.value = this.speed;
                this.speedValue.textContent = `${this.speed}ms`;
            }
        }, { passive: true });
    }

    normalizeAngle(angle) {
        return ((angle % this.fullCircle) + this.fullCircle) % this.fullCircle;
    }

    getTurnPosition(step = this.currentStep) {
        const turns = (step * this.alpha) / this.fullCircle;
        return ((turns % 1) + 1) % 1;
    }

    createPointState(step = this.currentStep) {
        const angle = this.normalizeAngle(step * this.alpha);
        const turnPosition = this.getTurnPosition(step);
        const x = this.centerX + this.radius * Math.cos(angle);
        const y = this.centerY + this.radius * Math.sin(angle);
        const hue = (step * 30) % 360;

        return {
            x,
            y,
            angle,
            turnPosition,
            turnPositionLabel: turnPosition.toFixed(10),
            step,
            color: `hsl(${hue}, 70%, 60%)`
        };
    }

    findDuplicatePoint(step = this.currentStep) {
        const turnPosition = this.getTurnPosition(step);

        return this.points.find((point) => {
            const delta = Math.abs(point.turnPosition - turnPosition);
            return delta < this.duplicateTolerance || Math.abs(delta - 1) < this.duplicateTolerance;
        }) || null;
    }

    drawTrack() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const isDayMode = document.body.classList.contains('day-mode');
        const trackStroke = isDayMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
        const centerFill = isDayMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)';

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, this.fullCircle);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.fill();
        this.ctx.strokeStyle = trackStroke;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.drawTrackMarkers();

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 3, 0, this.fullCircle);
        this.ctx.fillStyle = centerFill;
        this.ctx.fill();
    }

    drawTrackMarkers() {
        const isDayMode = document.body.classList.contains('day-mode');
        const markerStroke = isDayMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.4)';

        for (let i = 0; i < 12; i += 1) {
            const angle = (i * Math.PI) / 6;
            const startX = this.centerX + (this.radius - 15) * Math.cos(angle);
            const startY = this.centerY + (this.radius - 15) * Math.sin(angle);
            const endX = this.centerX + this.radius * Math.cos(angle);
            const endY = this.centerY + this.radius * Math.sin(angle);

            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.strokeStyle = markerStroke;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    addPoint() {
        const nextPoint = this.createPointState(this.currentStep);
        const duplicatePoint = this.findDuplicatePoint(this.currentStep);

        if (duplicatePoint) {
            this.pendingPoint = nextPoint;
            this.showDuplicatePointAlert(duplicatePoint, nextPoint);
            this.pause('duplicate');
            return;
        }

        this.commitPoint(nextPoint);
    }

    commitPoint(pointState) {
        this.points.push(pointState);

        if (this.currentStep > 0) {
            const previousPoint = this.points[this.currentStep - 1];
            this.drawTrajectory(previousPoint.x, previousPoint.y, pointState.x, pointState.y, pointState.color);
        }

        this.drawPoint(pointState.x, pointState.y, pointState.color);
        this.currentStep += 1;
        this.updateInfo();
    }

    showDuplicatePointAlert(duplicatePoint, pendingPoint) {
        document.querySelector('.duplicate-point-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'duplicate-point-modal';

        const stepDiff = this.currentStep - duplicatePoint.step;
        const duplicateData = `
Repeat point details:
Current step: ${this.currentStep}
Duplicate step: ${duplicatePoint.step}
Step difference: ${stepDiff}
Current angle: ${(pendingPoint.angle * 180 / Math.PI).toFixed(6)}°
Normalized position: ${pendingPoint.turnPositionLabel}
Coordinates: (${pendingPoint.x.toFixed(6)}, ${pendingPoint.y.toFixed(6)})
        `.trim();

        modal.innerHTML = `
            <div class="modal-content">
                <h3>Repeated Point Detected</h3>
                <p>The current point falls on a previously visited position.</p>
                <p>It overlaps with step ${duplicatePoint.step} after ${stepDiff} steps.</p>
                <p>This indicates periodic behavior for the current alpha value.</p>

                <div class="duplicate-data">
                    <h4>Details</h4>
                    <textarea readonly class="data-output">${duplicateData}</textarea>
                </div>

                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="this.closest('.duplicate-point-modal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    continueAnimation() {
        if (this.isRunning) {
            return;
        }

        if (this.pausedDueToDuplicate && this.pendingPoint) {
            this.commitPoint(this.pendingPoint);
            this.pendingPoint = null;
            this.pausedDueToDuplicate = false;
        }

        this.resumeAnimation();
    }

    drawPoint(x, y, color) {
        const isDayMode = document.body.classList.contains('day-mode');
        const pointStroke = isDayMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)';

        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, this.fullCircle);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = pointStroke;
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
        this.points = this.points.map((point) => {
            const refreshedPoint = this.createPointState(point.step);
            return {
                ...point,
                x: refreshedPoint.x,
                y: refreshedPoint.y,
                angle: refreshedPoint.angle,
                turnPosition: refreshedPoint.turnPosition,
                turnPositionLabel: refreshedPoint.turnPositionLabel
            };
        });

        if (this.pendingPoint) {
            const refreshedPendingPoint = this.createPointState(this.pendingPoint.step);
            this.pendingPoint = {
                ...this.pendingPoint,
                x: refreshedPendingPoint.x,
                y: refreshedPendingPoint.y,
                angle: refreshedPendingPoint.angle,
                turnPosition: refreshedPendingPoint.turnPosition,
                turnPositionLabel: refreshedPendingPoint.turnPositionLabel
            };
        }
    }

    redrawAllPoints() {
        this.points.forEach((point, index) => {
            if (index > 0) {
                const previousPoint = this.points[index - 1];
                this.drawTrajectory(previousPoint.x, previousPoint.y, point.x, point.y, point.color);
            }
            this.drawPoint(point.x, point.y, point.color);
        });
    }

    updateInfo() {
        this.stepCountEl.textContent = this.currentStep;
        const currentAngle = this.currentStep === 0
            ? 0
            : this.points[this.points.length - 1].angle;
        this.currentAngleEl.textContent = `${(currentAngle * 180 / Math.PI).toFixed(1)}°`;
        this.alphaValueEl.textContent = this.alpha.toFixed(3);
    }

    start() {
        if (this.isRunning) {
            return;
        }

        if (this.pausedDueToDuplicate && this.pendingPoint) {
            this.continueAnimation();
            return;
        }

        this.resumeAnimation();
    }

    resumeAnimation() {
        this.isRunning = true;
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.continueBtn.disabled = true;
        this.scheduleNextFrame();
    }

    pause(reason = 'manual') {
        this.isRunning = false;
        this.pausedDueToDuplicate = reason === 'duplicate';
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.continueBtn.disabled = false;

        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
    }

    reset() {
        this.pause();
        this.currentStep = 0;
        this.points = [];
        this.pendingPoint = null;
        this.pausedDueToDuplicate = false;
        this.continueBtn.disabled = true;
        document.querySelector('.duplicate-point-modal')?.remove();
        this.drawTrack();
        this.updateInfo();
    }

    animate() {
        if (!this.isRunning) {
            return;
        }

        this.addPoint();

        if (this.isRunning) {
            this.scheduleNextFrame();
        }
    }

    scheduleNextFrame() {
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
        }

        this.animationTimer = setTimeout(() => this.animate(), this.speed);
    }

    restartAnimationLoop() {
        if (!this.isRunning) {
            return;
        }

        this.scheduleNextFrame();
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
    presetContainer.innerHTML = '<label>预设 α 值:</label><div class="preset-buttons"></div>';

    const presetButtons = presetContainer.querySelector('.preset-buttons');
    presetAlphas.forEach((preset) => {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary preset-btn';
        button.textContent = preset.name;
        button.addEventListener('click', () => {
            visualizer.alphaInput.value = preset.value;
            visualizer.alpha = preset.value;
            visualizer.alphaValueEl.textContent = preset.value.toFixed(3);
            visualizer.reset();
        });
        presetButtons.appendChild(button);
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
            color: hsl(0 0% 85%);
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
        body.day-mode .preset-alphas label {
            color: #1a202c;
        }
    `;
    document.head.appendChild(style);
});
