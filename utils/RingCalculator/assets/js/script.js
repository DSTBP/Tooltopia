const state = {
    N: 16,
    points: [],
    arcs: []
};

let pointId = 0;
let arcId = 0;
let readoutExpressions = [];

const ringSvg = document.getElementById('ringSvg');
const ringBase = ringSvg ? ringSvg.querySelector('.ring-base') : null;
const viewBox = ringSvg ? ringSvg.getAttribute('viewBox') : null;
const viewBoxParts = viewBox ? viewBox.split(/\s+/).map(Number) : null;
const ringSize = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[2] : 600;
const ringCenter = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[0] + ringSize / 2 : 300;
const baseRadius = ringBase ? Number(ringBase.getAttribute('r')) : 270;

const ring = {
    size: ringSize,
    center: ringCenter,
    radius: baseRadius,
    arcRadius: baseRadius - 28,
    arcOffset: 22,
    pointRadius: baseRadius - 12
};

const elements = {
    modSelect: document.getElementById('modSelect'),
    resetBtn: document.getElementById('resetBtn'),
    addPointBtn: document.getElementById('addPointBtn'),
    pointList: document.getElementById('pointList'),
    addArcBtn: document.getElementById('addArcBtn'),
    arcList: document.getElementById('arcList'),
    readoutInput: document.getElementById('readoutInput'),
    readoutContainer: document.getElementById('readoutContainer'),
    arcSelect: document.getElementById('arcSelect'),
    intervalSelect: document.getElementById('intervalSelect'),
    wrapFormula: document.getElementById('wrapFormula'),
    wrapValue: document.getElementById('wrapValue'),
    hideTargetArcToggle: document.getElementById('hideTargetArcToggle'),
    hideOffsetArcToggle: document.getElementById('hideOffsetArcToggle'),
    ringSvg: document.getElementById('ringSvg'),
    tickGroup: document.getElementById('tickGroup'),
    arcGroupTarget: document.getElementById('arcGroupTarget'),
    arcGroupOffset: document.getElementById('arcGroupOffset'),
    arrowGroup: document.getElementById('arrowGroup'),
    pointGroup: document.getElementById('pointGroup'),
    pointZero: document.getElementById('pointZero'),
    hitRing: document.getElementById('hitRing'),
    legendList: document.getElementById('legendList')
};

const pointPalette = ['#3fb8f4', '#f59e0b', '#22c55e', '#f472b6', '#38bdf8', '#a855f7'];

function modValue(value) {
    const n = state.N;
    return ((value % n) + n) % n;
}

function clampValue(value, max) {
    return Math.max(0, Math.min(max, value));
}

function indexToAngle(index) {
    return (index / state.N) * Math.PI * 2 - Math.PI / 2;
}

function polar(radius, angle) {
    return {
        x: ring.center + radius * Math.cos(angle),
        y: ring.center + radius * Math.sin(angle)
    };
}

function arcPath(startIndex, endIndex, radius) {
    const n = state.N;
    const diff = (endIndex - startIndex + n) % n;
    if (diff === 0) return '';
    const startAngle = indexToAngle(startIndex);
    const endAngle = startAngle + (diff / n) * Math.PI * 2;
    const start = polar(radius, startAngle);
    const end = polar(radius, endAngle);
    const largeArc = diff > n / 2 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function updateTicks() {
    if (!elements.tickGroup) return;
    elements.tickGroup.innerHTML = '';
    const majorStep = state.N >= 32 ? 8 : 4;
    const fontSize = state.N <= 16 ? 16 : state.N <= 32 ? 14 : 12;

    for (let i = 0; i < state.N; i += 1) {
        const angle = indexToAngle(i);
        const isMajor = i % majorStep === 0;
        const tickLength = isMajor ? 18 : 12;
        const outer = polar(ring.radius, angle);
        const inner = polar(ring.radius - tickLength, angle);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', inner.x);
        line.setAttribute('y1', inner.y);
        line.setAttribute('x2', outer.x);
        line.setAttribute('y2', outer.y);
        line.setAttribute('class', `tick-line${isMajor ? ' major' : ''}`);
        elements.tickGroup.appendChild(line);

        const labelPos = polar(ring.radius + 20, angle);
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', labelPos.x);
        label.setAttribute('y', labelPos.y);
        label.setAttribute('class', 'tick-label');
        label.setAttribute('style', `font-size: ${fontSize}px;`);
        label.textContent = i === 0 ? `0/${state.N}` : i;
        elements.tickGroup.appendChild(label);
    }
}

function pointColor(point, index) {
    if (point.color) return point.color;
    const fallback = pointPalette[index % pointPalette.length];
    point.color = fallback;
    return fallback;
}

function updateRanges() {
    const pointMax = state.N;
    const arcMax = state.N - 1;

    state.points.forEach((point) => {
        if (point.slider) {
            point.slider.min = 0;
            point.slider.max = pointMax;
        }
        if (point.input) {
            point.input.min = 0;
            point.input.max = pointMax;
        }
    });

    state.arcs.forEach((arc) => {
        if (arc.startSlider) {
            arc.startSlider.min = 0;
            arc.startSlider.max = arcMax;
        }
        if (arc.endSlider) {
            arc.endSlider.min = 0;
            arc.endSlider.max = arcMax;
        }
        if (arc.startInput) {
            arc.startInput.min = 0;
            arc.startInput.max = arcMax;
        }
        if (arc.endInput) {
            arc.endInput.min = 0;
            arc.endInput.max = arcMax;
        }
    });
}

function setArrowPosition(line, index, radius) {
    const angle = indexToAngle(index);
    const point = polar(radius, angle);
    line.setAttribute('x1', ring.center);
    line.setAttribute('y1', ring.center);
    line.setAttribute('x2', point.x);
    line.setAttribute('y2', point.y);
}

function setPointPosition(point, index, radius) {
    const angle = indexToAngle(index);
    const pos = polar(radius, angle);
    point.setAttribute('cx', pos.x);
    point.setAttribute('cy', pos.y);
}

function buildPointRow(point) {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.dataset.id = String(point.id);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-field name-input';
    nameInput.placeholder = '名称';
    nameInput.value = point.name;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'value-slider';
    slider.min = 0;
    slider.max = state.N;
    slider.step = 1;
    slider.value = point.value;

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.className = 'number-input';
    numberInput.min = 0;
    numberInput.max = state.N;
    numberInput.step = 1;
    numberInput.value = point.value;

    const hideLabel = document.createElement('label');
    hideLabel.className = 'toggle-inline';
    const hideInput = document.createElement('input');
    hideInput.type = 'checkbox';
    hideInput.checked = point.hidden;
    const hideText = document.createElement('span');
    hideText.textContent = '隐藏';
    hideLabel.append(hideInput, hideText);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-secondary btn-compact';
    removeBtn.textContent = '移除';

    nameInput.addEventListener('input', () => {
        point.name = nameInput.value;
        updateArcSelectOptions();
        updateDisplay();
    });

    const syncPointValue = (value) => {
        const clamped = clampValue(Number(value), state.N);
        point.value = clamped;
        slider.value = clamped;
        numberInput.value = clamped;
        updateDisplay();
    };

    slider.addEventListener('input', () => {
        syncPointValue(slider.value);
    });

    numberInput.addEventListener('change', () => {
        syncPointValue(numberInput.value);
    });

    hideInput.addEventListener('change', () => {
        point.hidden = hideInput.checked;
        updateDisplay();
    });

    removeBtn.addEventListener('click', () => {
        state.points = state.points.filter((entry) => entry.id !== point.id);
        row.remove();
        updateArcSelectOptions();
        updateDisplay();
    });

    point.row = row;
    point.slider = slider;
    point.input = numberInput;

    row.append(nameInput, slider, numberInput, hideLabel, removeBtn);
    return row;
}

function addPoint() {
    pointId += 1;
    const point = {
        id: pointId,
        name: '',
        value: 0,
        hidden: false,
        color: pointPalette[(pointId - 1) % pointPalette.length]
    };
    state.points.push(point);
    if (elements.pointList) {
        elements.pointList.appendChild(buildPointRow(point));
    }
    updateRanges();
    updateDisplay();
}

function buildArcRow(arc) {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.dataset.id = String(arc.id);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-field name-input';
    nameInput.placeholder = '弧段名';
    nameInput.value = arc.name;

    const startSlider = document.createElement('input');
    startSlider.type = 'range';
    startSlider.className = 'value-slider';
    startSlider.min = 0;
    startSlider.max = state.N - 1;
    startSlider.step = 1;
    startSlider.value = arc.start;

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.className = 'number-input';
    startInput.min = 0;
    startInput.max = state.N - 1;
    startInput.step = 1;
    startInput.value = arc.start;

    const endSlider = document.createElement('input');
    endSlider.type = 'range';
    endSlider.className = 'value-slider';
    endSlider.min = 0;
    endSlider.max = state.N - 1;
    endSlider.step = 1;
    endSlider.value = arc.end;

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.className = 'number-input';
    endInput.min = 0;
    endInput.max = state.N - 1;
    endInput.step = 1;
    endInput.value = arc.end;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-secondary btn-compact';
    removeBtn.textContent = '移除';

    nameInput.addEventListener('input', () => {
        arc.name = nameInput.value;
        updateArcSelectOptions();
    });

    const syncArcStart = (value) => {
        const clamped = clampValue(Number(value), state.N - 1);
        arc.start = clamped;
        startSlider.value = clamped;
        startInput.value = clamped;
        updateDisplay();
    };

    const syncArcEnd = (value) => {
        const clamped = clampValue(Number(value), state.N - 1);
        arc.end = clamped;
        endSlider.value = clamped;
        endInput.value = clamped;
        updateDisplay();
    };

    startSlider.addEventListener('input', () => {
        syncArcStart(startSlider.value);
    });
    startInput.addEventListener('change', () => {
        syncArcStart(startInput.value);
    });
    endSlider.addEventListener('input', () => {
        syncArcEnd(endSlider.value);
    });
    endInput.addEventListener('change', () => {
        syncArcEnd(endInput.value);
    });

    removeBtn.addEventListener('click', () => {
        state.arcs = state.arcs.filter((entry) => entry.id !== arc.id);
        row.remove();
        updateArcSelectOptions();
        updateDisplay();
    });

    arc.row = row;
    arc.startSlider = startSlider;
    arc.endSlider = endSlider;
    arc.startInput = startInput;
    arc.endInput = endInput;

    row.append(nameInput, startSlider, startInput, endSlider, endInput, removeBtn);
    return row;
}

function addArc() {
    const arc = {
        id: arcId += 1,
        name: '',
        start: 0,
        end: Math.min(3, state.N - 1)
    };
    state.arcs.push(arc);
    if (elements.arcList) {
        elements.arcList.appendChild(buildArcRow(arc));
    }
    updateArcSelectOptions();
    updateDisplay();
}

function updateArcSelectOptions() {
    if (!elements.arcSelect) return;
    elements.arcSelect.innerHTML = '';
    if (state.arcs.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '无弧段';
        elements.arcSelect.appendChild(option);
        return;
    }
    state.arcs.forEach((arc, index) => {
        const option = document.createElement('option');
        option.value = String(arc.id);
        const name = arc.name.trim() || `弧段 ${index + 1}`;
        option.textContent = name;
        elements.arcSelect.appendChild(option);
    });
}

function buildVariableMap() {
    const values = { n: state.N, N: state.N };
    state.points.forEach((point) => {
        const key = point.name.trim().toLowerCase();
        if (!key) return;
        values[key] = point.value;
    });
    return values;
}

function tokenizeExpression(expr) {
    const raw = expr.replace(/\s+/g, '');
    if (!raw) return null;
    const tokens = raw.match(/([A-Za-z]+|\d+|[+\-])/g);
    if (!tokens || tokens.join('') !== raw) return null;
    return tokens;
}

function formatExpressionLabel(expr) {
    const tokens = tokenizeExpression(expr);
    if (!tokens) return `\\(${expr}\\)`;
    const parts = tokens.map((token) => {
        const lower = token.toLowerCase();
        if (lower === 'alpha') return '\\alpha';
        if (lower === 'beta') return '\\beta';
        if (lower === 'n') return 'N';
        return token;
    });
    return `\\(${parts.join(' ')}\\)`;
}

function evaluateExpression(expr, values) {
    const tokens = tokenizeExpression(expr);
    if (!tokens) return { error: true };
    let total = 0;
    let expectingTerm = true;
    let sign = 1;
    let hasOperator = false;

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === '+' || token === '-') {
            hasOperator = true;
            sign = token === '-' ? -1 : 1;
            expectingTerm = true;
            continue;
        }
        if (!expectingTerm) return { error: true };
        const lower = token.toLowerCase();
        let value;
        if (/^\d+$/.test(token)) {
            value = Number(token);
        } else if (values[lower] !== undefined) {
            value = values[lower];
        } else if (values[token] !== undefined) {
            value = values[token];
        } else {
            return { error: true };
        }
        total += sign * value;
        expectingTerm = false;
        sign = 1;
    }

    if (expectingTerm) return { error: true };
    return { value: hasOperator || tokens.length > 1 ? modValue(total) : total };
}

function renderReadoutCards() {
    const container = elements.readoutContainer;
    if (!container) return;

    const existing = new Map();
    container.querySelectorAll('.readout-card').forEach((card) => {
        existing.set(card.dataset.expr, card);
    });

    existing.forEach((card, key) => {
        if (!readoutExpressions.includes(key)) {
            card.remove();
        }
    });

    readoutExpressions.forEach((expr) => {
        if (existing.has(expr)) return;
        const card = document.createElement('div');
        card.className = 'readout-card';
        card.dataset.expr = expr;
        const label = document.createElement('span');
        label.className = 'readout-label';
        label.innerHTML = formatExpressionLabel(expr);
        const value = document.createElement('span');
        value.className = 'readout-value mono';
        value.textContent = '0';
        card.append(label, value);
        container.appendChild(card);
    });

    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        window.MathJax.typesetPromise([container]);
    }
}

function parseReadoutInput() {
    if (!elements.readoutInput) return;
    readoutExpressions = elements.readoutInput.value
        .split(/[,，;；\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    renderReadoutCards();
}

function updateReadoutValues(values) {
    const container = elements.readoutContainer;
    if (!container) return;
    readoutExpressions.forEach((expr) => {
        const card = container.querySelector(`.readout-card[data-expr="${expr}"]`);
        if (!card) return;
        const valueEl = card.querySelector('.readout-value');
        if (!valueEl) return;
        const result = evaluateExpression(expr, values);
        valueEl.textContent = result.error ? '错误: 表达式' : result.value;
    });
}

function drawArcs(rValue) {
    if (!elements.arcGroupTarget || !elements.arcGroupOffset) return;
    elements.arcGroupTarget.innerHTML = '';
    elements.arcGroupOffset.innerHTML = '';

    state.arcs.forEach((arc) => {
        const start = modValue(arc.start);
        const end = modValue(arc.end);
        const targetPath = arcPath(start, end, ring.arcRadius);
        if (targetPath) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', targetPath);
            path.setAttribute('class', 'ring-arc arc-target');
            elements.arcGroupTarget.appendChild(path);
        }

        if (rValue !== null && rValue !== undefined) {
            const offsetStart = modValue(start + rValue);
            const offsetEnd = modValue(end + rValue);
            const offsetPath = arcPath(offsetStart, offsetEnd, ring.arcRadius - ring.arcOffset);
            if (offsetPath) {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', offsetPath);
                path.setAttribute('class', 'ring-arc arc-offset');
                elements.arcGroupOffset.appendChild(path);
            }
        }
    });
}

function drawPoints(variableMap) {
    if (!elements.arrowGroup || !elements.pointGroup) return;
    elements.arrowGroup.innerHTML = '';
    elements.pointGroup.innerHTML = '';

    const visiblePoints = state.points.filter((point) => !point.hidden);
    visiblePoints.forEach((point, index) => {
        const color = pointColor(point, index);
        const angleIndex = modValue(point.value);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'ring-arrow');
        line.setAttribute('marker-end', 'url(#arrowHead)');
        line.setAttribute('stroke', color);
        line.setAttribute('color', color);
        setArrowPosition(line, angleIndex, ring.pointRadius);
        elements.arrowGroup.appendChild(line);

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'ring-point');
        dot.setAttribute('r', '6');
        dot.setAttribute('fill', color);
        setPointPosition(dot, angleIndex, ring.pointRadius);
        elements.pointGroup.appendChild(dot);
    });

}

function renderLegend() {
    const container = elements.legendList;
    if (!container) return;
    container.innerHTML = '';

    state.points.forEach((point, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        if (point.hidden) {
            item.classList.add('is-muted');
        }

        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = point.color || pointPalette[index % pointPalette.length];

        const label = document.createElement('span');
        const name = point.name.trim();
        label.textContent = name ? name : `点 ${index + 1}`;

        item.append(dot, label);
        container.appendChild(item);
    });

    state.arcs.forEach((arc, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';

        const targetDot = document.createElement('span');
        targetDot.className = 'legend-dot dot-arc';
        const offsetDot = document.createElement('span');
        offsetDot.className = 'legend-dot dot-mask';

        swatch.append(targetDot, offsetDot);

        const label = document.createElement('span');
        const name = arc.name.trim();
        label.textContent = name ? name : `弧段 ${index + 1}`;

        item.append(swatch, label);
        container.appendChild(item);
    });
}

function updateWrapIndicator(variableMap) {
    if (!elements.wrapValue || !elements.wrapFormula) return;
    const selectedId = elements.arcSelect ? Number(elements.arcSelect.value) : null;
    const arc = state.arcs.find((entry) => entry.id === selectedId);
    if (!arc) {
        elements.wrapValue.textContent = '-';
        elements.wrapFormula.innerHTML = '\\(1\\{\\text{start} > \\text{end}\\}\\)';
        return;
    }

    const start = modValue(arc.start);
    const end = modValue(arc.end);
    const rValue = variableMap.r;
    const useOffset = elements.intervalSelect && elements.intervalSelect.value === 'offset';
    const formula = useOffset
        ? '\\(1\\{\\text{start} + r > \\text{end} + r\\}\\)'
        : '\\(1\\{\\text{start} > \\text{end}\\}\\)';
    elements.wrapFormula.innerHTML = formula;

    if (useOffset && rValue === undefined) {
        elements.wrapValue.textContent = '-';
        return;
    }

    const wrap = useOffset
        ? modValue(start + rValue) > modValue(end + rValue)
        : start > end;
    elements.wrapValue.textContent = wrap ? '1' : '0';
}

function updateDisplay() {
    const variableMap = buildVariableMap();
    updateReadoutValues(variableMap);
    drawArcs(variableMap.r);
    drawPoints(variableMap);
    updateWrapIndicator(variableMap);
    renderLegend();

    if (elements.pointZero) {
        setPointPosition(elements.pointZero, 0, ring.pointRadius);
    }

    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        window.MathJax.typesetPromise([elements.wrapFormula]);
    }
}

function updateAll() {
    updateRanges();
    updateTicks();
    updateDisplay();
}

function pointerToIndex(event) {
    const rect = elements.ringSvg.getBoundingClientRect();
    const scaleX = ring.size / rect.width;
    const scaleY = ring.size / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const angle = Math.atan2(y - ring.center, x - ring.center);
    const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const rawIndex = Math.round((normalized / (Math.PI * 2)) * state.N) % state.N;
    return clampValue(rawIndex, state.N);
}

function updatePointValue(point, value) {
    const clamped = clampValue(Number(value), state.N);
    point.value = clamped;
    if (point.slider) point.slider.value = clamped;
    if (point.input) point.input.value = clamped;
}

function initPointerEvents() {
    if (!elements.hitRing) return;
    let dragging = false;

    const updateFromPointer = (event) => {
        const index = pointerToIndex(event);
        const point = state.points.find((entry) => entry.name.trim().toLowerCase() === 'x');
        if (!point) return;
        updatePointValue(point, index);
        updateDisplay();
    };

    elements.hitRing.addEventListener('pointerdown', (event) => {
        dragging = true;
        elements.hitRing.setPointerCapture(event.pointerId);
        updateFromPointer(event);
    });

    elements.hitRing.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        updateFromPointer(event);
    });

    elements.hitRing.addEventListener('pointerup', (event) => {
        dragging = false;
        elements.hitRing.releasePointerCapture(event.pointerId);
    });

    elements.hitRing.addEventListener('pointerleave', () => {
        dragging = false;
    });
}

function applyModFromSelect() {
    state.N = Number(elements.modSelect.value);
    state.points.forEach((point) => {
        point.value = clampValue(point.value, state.N);
        if (point.slider) point.slider.value = point.value;
        if (point.input) point.input.value = point.value;
    });
    state.arcs.forEach((arc) => {
        arc.start = clampValue(arc.start, state.N - 1);
        arc.end = clampValue(arc.end, state.N - 1);
        if (arc.startSlider) arc.startSlider.value = arc.start;
        if (arc.endSlider) arc.endSlider.value = arc.end;
        if (arc.startInput) arc.startInput.value = arc.start;
        if (arc.endInput) arc.endInput.value = arc.end;
    });
    updateAll();
}

function init() {
    updateTicks();
    initPointerEvents();
    updateArcSelectOptions();
    updateDisplay();

    elements.modSelect.addEventListener('change', () => {
        applyModFromSelect();
    });

    elements.resetBtn.addEventListener('click', () => {
        state.points = [];
        state.arcs = [];
        if (elements.pointList) elements.pointList.innerHTML = '';
        if (elements.arcList) elements.arcList.innerHTML = '';
        readoutExpressions = [];
        if (elements.readoutInput) elements.readoutInput.value = '';
        if (elements.readoutContainer) elements.readoutContainer.innerHTML = '';
        updateArcSelectOptions();
        updateDisplay();
    });

    if (elements.addPointBtn) {
        elements.addPointBtn.addEventListener('click', () => {
            addPoint();
        });
    }

    if (elements.addArcBtn) {
        elements.addArcBtn.addEventListener('click', () => {
            addArc();
        });
    }

    if (elements.readoutInput) {
        elements.readoutInput.addEventListener('input', () => {
            parseReadoutInput();
            updateDisplay();
        });
    }

    if (elements.intervalSelect) {
        elements.intervalSelect.addEventListener('change', () => {
            updateDisplay();
        });
    }

    if (elements.arcSelect) {
        elements.arcSelect.addEventListener('change', () => {
            updateDisplay();
        });
    }

    if (elements.hideTargetArcToggle) {
        elements.hideTargetArcToggle.addEventListener('change', () => {
            document.body.classList.toggle('hide-target-arc', elements.hideTargetArcToggle.checked);
        });
    }

    if (elements.hideOffsetArcToggle) {
        elements.hideOffsetArcToggle.addEventListener('change', () => {
            document.body.classList.toggle('hide-offset-arc', elements.hideOffsetArcToggle.checked);
        });
    }
}

document.addEventListener('DOMContentLoaded', init);
