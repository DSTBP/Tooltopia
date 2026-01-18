const state = {
    N: 16,
    points: [],
    arcs: [],
    offsets: []
};

let pointId = 0;
let arcId = 0;
let offsetId = 0;
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
    addOffsetBtn: document.getElementById('addOffsetBtn'),
    offsetList: document.getElementById('offsetList'),
    arcSelect: document.getElementById('arcSelect'),
    intervalSelect: document.getElementById('intervalSelect'),
    wrapFormula: document.getElementById('wrapFormula'),
    wrapValue: document.getElementById('wrapValue'),
    intervalFormula: document.getElementById('intervalFormula'),
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
const arcPalette = ['#ffd166', '#60a5fa', '#fca5a5', '#34d399', '#a78bfa', '#fb7185', '#f97316', '#2dd4bf'];

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

function getColor(item, index, palette) {
    if (item.color) return item.color;
    const fallback = palette[index % palette.length];
    item.color = fallback;
    return fallback;
}

const pointColor = (point, index) => getColor(point, index, pointPalette);
const arcColor = (arc, index) => getColor(arc, index, arcPalette);

function latexText(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/[{}%$]/g, '\\$&');
}

function normalizeLatexInput(value) {
    const trimmed = String(value).trim();
    if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
        return trimmed.slice(2, -2).trim();
    }
    if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

function isLikelyLatex(value) {
    return /[\\^_{}$]/.test(value);
}

const isValidLatex = (value) => {
    if (!window.MathJax?.tex2svg) return false;
    try {
        window.MathJax.tex2svg(value);
        return true;
    } catch (error) {
        return false;
    }
};

function formatInlineMath(value) {
    const normalized = normalizeLatexInput(value);
    if (!normalized) return '';
    if (!isLikelyLatex(normalized)) return normalized;
    if (isValidLatex(normalized)) return `\\(${normalized}\\)`;
    return String(value).trim();
}

function normalizeVariableKey(value) {
    return normalizeLatexInput(value).replace(/\s+/g, '');
}

function formatWrapTerm(value, fallback) {
    const raw = value && String(value).trim() ? String(value).trim() : fallback;
    const normalized = normalizeLatexInput(raw);
    if (normalized && isLikelyLatex(normalized) && isValidLatex(normalized)) {
        return normalized;
    }
    return `\\text{${latexText(raw)}}`;
}

const getLabel = (item, index, defaultPrefix) =>
    item.name.trim() || `${defaultPrefix} ${index + 1}`;

const pointLabel = (point, index) => getLabel(point, index, '点');
const offsetLabel = (offset, index) => getLabel(offset, index, '偏移');

const getById = (collection, id) => collection.find(item => item.id === id) || null;
const getPointById = (pointId) => getById(state.points, pointId);
const getOffsetById = (offsetId) => getById(state.offsets, offsetId);

function getLabelById(collection, id, labelFn) {
    const index = collection.findIndex(item => item.id === id);
    return index === -1 ? '' : labelFn(collection[index], index);
}

const getPointLabelById = (pointId) => getLabelById(state.points, pointId, pointLabel);
const getOffsetLabelById = (offsetId) => getLabelById(state.offsets, offsetId, offsetLabel);

const getOffsetValuesByIds = (offsetIds) =>
    (Array.isArray(offsetIds) ? offsetIds : [])
        .map(getOffsetById)
        .filter(Boolean)
        .map(offset => offset.value);

const getOffsetLabelsByIds = (offsetIds) =>
    (Array.isArray(offsetIds) ? offsetIds : [])
        .map(getOffsetLabelById)
        .filter(Boolean);

const getOffsetSumByIds = (offsetIds) =>
    getOffsetValuesByIds(offsetIds).reduce((sum, value) => sum + value, 0);

const getPointOffsetSum = (point) => getOffsetSumByIds(point.offsetIds);

function getSelectedArc() {
    const selectedId = elements.arcSelect ? Number(elements.arcSelect.value) : null;
    return state.arcs.find((entry) => entry.id === selectedId) || null;
}

const updateValue = (item, value, max) => {
    const clamped = clampValue(Number(value), max);
    item.value = clamped;
    if (item.slider) item.slider.value = clamped;
    if (item.input) item.input.value = clamped;
};

function updateRanges() {
    const pointMax = state.N;
    const updateItemRange = (item) => {
        if (item.slider) {
            item.slider.min = 0;
            item.slider.max = pointMax;
        }
        if (item.input) {
            item.input.min = 0;
            item.input.max = pointMax;
        }
    };
    state.points.forEach(updateItemRange);
    state.offsets.forEach(updateItemRange);
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

    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'offset-multi';
    offsetContainer.setAttribute('aria-label', 'offsets');

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
        updateArcPointOptions();
        updateDisplay();
    });

    const syncPointValue = (value) => {
        updateValue(point, value, state.N);
        updateDisplay();
    };

    slider.addEventListener('input', () => {
        syncPointValue(slider.value);
    });

    numberInput.addEventListener('change', () => {
        syncPointValue(numberInput.value);
    });

    const onOffsetChange = () => {
        point.offsetIds = getSelectedOffsetIds(offsetContainer);
        updateDisplay();
    };

    hideInput.addEventListener('change', () => {
        point.hidden = hideInput.checked;
        updateDisplay();
    });

    removeBtn.addEventListener('click', () => {
        state.points = state.points.filter((entry) => entry.id !== point.id);
        row.remove();
        updateArcSelectOptions();
        updateArcPointOptions();
        updateDisplay();
    });

    point.row = row;
    point.slider = slider;
    point.input = numberInput;
    point.offsetContainer = offsetContainer;
    point.onOffsetChange = onOffsetChange;

    renderOffsetMulti(offsetContainer, point.offsetIds, onOffsetChange);
    row.append(nameInput, slider, numberInput, offsetContainer, hideLabel, removeBtn);
    return row;
}

function addPoint() {
    pointId += 1;
    const point = {
        id: pointId,
        name: '',
        value: 0,
        hidden: false,
        color: pointPalette[(pointId - 1) % pointPalette.length],
        offsetIds: []
    };
    state.points.push(point);
    if (elements.pointList) {
        elements.pointList.appendChild(buildPointRow(point));
    }
    updateRanges();
    updateArcPointOptions();
    updateDisplay();
}

function buildOffsetRow(offset) {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.dataset.id = String(offset.id);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-field name-input';
    nameInput.placeholder = '名称';
    nameInput.value = offset.name;

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.className = 'number-input';
    numberInput.min = 0;
    numberInput.max = state.N;
    numberInput.step = 1;
    numberInput.value = offset.value;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'value-slider';
    slider.min = 0;
    slider.max = state.N;
    slider.step = 1;
    slider.value = offset.value;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-secondary btn-compact';
    removeBtn.textContent = '移除';

    nameInput.addEventListener('input', () => {
        offset.name = nameInput.value;
        updateArcOffsetOptions();
        updatePointOffsetOptions();
        updateDisplay();
    });

    numberInput.addEventListener('change', () => {
        updateValue(offset, numberInput.value, state.N);
        updateDisplay();
    });

    slider.addEventListener('input', () => {
        updateValue(offset, slider.value, state.N);
        updateDisplay();
    });

    removeBtn.addEventListener('click', () => {
        state.offsets = state.offsets.filter((entry) => entry.id !== offset.id);
        row.remove();
        updateArcOffsetOptions();
        updatePointOffsetOptions();
        updateDisplay();
    });

    offset.row = row;
    offset.input = numberInput;
    offset.slider = slider;

    row.append(nameInput, slider, numberInput, removeBtn);
    return row;
}

function addOffset() {
    offsetId += 1;
    const offset = {
        id: offsetId,
        name: '',
        value: 0
    };
    state.offsets.push(offset);
    if (elements.offsetList) {
        elements.offsetList.appendChild(buildOffsetRow(offset));
    }
    updateRanges();
    updateArcOffsetOptions();
    updatePointOffsetOptions();
    updateDisplay();
}

const getDefaultArcPointIds = () => {
    if (state.points.length === 0) return { startPointId: null, endPointId: null };
    const startPointId = state.points[0].id;
    const endPointId = state.points.length > 1 ? state.points[1].id : startPointId;
    return { startPointId, endPointId };
};

function ensureArcPointSelection(arc) {
    if (state.points.length === 0) {
        arc.startPointId = arc.endPointId = null;
        return;
    }
    const startValid = state.points.some(point => point.id === arc.startPointId);
    const endValid = state.points.some(point => point.id === arc.endPointId);

    if (!startValid || !endValid) {
        const { startPointId, endPointId } = getDefaultArcPointIds();
        if (!startValid) arc.startPointId = endValid ? arc.endPointId : startPointId;
        if (!endValid) arc.endPointId = startValid ? arc.startPointId : endPointId;
    }
}

function fillPointSelect(select, selectedId) {
    select.innerHTML = '';
    if (state.points.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '无点';
        option.disabled = option.selected = true;
        select.appendChild(option);
        select.disabled = true;
        return;
    }
    select.disabled = false;
    state.points.forEach((point, index) => {
        const option = document.createElement('option');
        option.value = String(point.id);
        option.textContent = pointLabel(point, index);
        option.selected = point.id === selectedId;
        select.appendChild(option);
    });
}

function updateArcPointOptions() {
    state.arcs.forEach((arc) => {
        ensureArcPointSelection(arc);
        if (arc.startSelect) {
            fillPointSelect(arc.startSelect, arc.startPointId);
        }
        if (arc.endSelect) {
            fillPointSelect(arc.endSelect, arc.endPointId);
        }
    });
}

function getSelectedOffsetIds(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.value))
        .filter((value) => Number.isFinite(value));
}

function renderOffsetMulti(container, selectedIds, onChange) {
    container.innerHTML = '';
    if (state.offsets.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'offset-empty';
        empty.textContent = '无偏移';
        container.appendChild(empty);
        return;
    }
    const selectedSet = new Set(selectedIds);
    state.offsets.forEach((offset, index) => {
        const label = document.createElement('label');
        label.className = 'offset-item';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(offset.id);
        input.checked = selectedSet.has(offset.id);
        input.addEventListener('change', onChange);
        const text = document.createElement('span');
        text.textContent = offsetLabel(offset, index);
        label.append(input, text);
        container.appendChild(label);
    });
}

const validateOffsetIds = (item) => {
    const validIds = Array.isArray(item.offsetIds)
        ? item.offsetIds.filter(offsetId => state.offsets.some(offset => offset.id === offsetId))
        : [];
    if (!Array.isArray(item.offsetIds) || validIds.length !== item.offsetIds.length) {
        item.offsetIds = validIds;
    }
    if (item.offsetContainer && item.onOffsetChange) {
        renderOffsetMulti(item.offsetContainer, item.offsetIds, item.onOffsetChange);
    }
};

const updateArcOffsetOptions = () => state.arcs.forEach(validateOffsetIds);
const updatePointOffsetOptions = () => state.points.forEach(validateOffsetIds);

function buildArcRow(arc) {
    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.dataset.id = String(arc.id);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-field name-input';
    nameInput.placeholder = '弧段名';
    nameInput.value = arc.name;

    const startSelect = document.createElement('select');
    startSelect.className = 'input-field';
    startSelect.setAttribute('aria-label', '弧段起点');
    startSelect.title = '起点';

    const endSelect = document.createElement('select');
    endSelect.className = 'input-field';
    endSelect.setAttribute('aria-label', '弧段终点');
    endSelect.title = '终点';

    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'offset-multi';
    offsetContainer.setAttribute('aria-label', 'offsets');

    const hideTargetLabel = document.createElement('label');
    hideTargetLabel.className = 'toggle-inline';
    const hideTargetInput = document.createElement('input');
    hideTargetInput.type = 'checkbox';
    hideTargetInput.checked = Boolean(arc.hideTarget);
    const hideTargetText = document.createElement('span');
    hideTargetText.textContent = '隐藏目标';
    hideTargetLabel.append(hideTargetInput, hideTargetText);

    const hideOffsetLabel = document.createElement('label');
    hideOffsetLabel.className = 'toggle-inline';
    const hideOffsetInput = document.createElement('input');
    hideOffsetInput.type = 'checkbox';
    hideOffsetInput.checked = Boolean(arc.hideOffset);
    const hideOffsetText = document.createElement('span');
    hideOffsetText.textContent = '隐藏偏移';
    hideOffsetLabel.append(hideOffsetInput, hideOffsetText);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-secondary btn-compact';
    removeBtn.textContent = '移除';

    nameInput.addEventListener('input', () => {
        arc.name = nameInput.value;
        updateArcSelectOptions();
        updateDisplay();
    });

    startSelect.addEventListener('change', () => {
        arc.startPointId = startSelect.value ? Number(startSelect.value) : null;
        updateDisplay();
    });

    endSelect.addEventListener('change', () => {
        arc.endPointId = endSelect.value ? Number(endSelect.value) : null;
        updateDisplay();
    });

    const onOffsetChange = () => {
        arc.offsetIds = getSelectedOffsetIds(offsetContainer);
        updateDisplay();
    };

    hideTargetInput.addEventListener('change', () => {
        arc.hideTarget = hideTargetInput.checked;
        updateDisplay();
    });

    hideOffsetInput.addEventListener('change', () => {
        arc.hideOffset = hideOffsetInput.checked;
        updateDisplay();
    });

    removeBtn.addEventListener('click', () => {
        state.arcs = state.arcs.filter((entry) => entry.id !== arc.id);
        row.remove();
        updateArcSelectOptions();
        updateDisplay();
    });

    arc.row = row;
    arc.startSelect = startSelect;
    arc.endSelect = endSelect;
    arc.offsetContainer = offsetContainer;
    arc.onOffsetChange = onOffsetChange;

    updateArcPointOptions();
    updateArcOffsetOptions();
    row.append(nameInput, startSelect, endSelect, offsetContainer, hideTargetLabel, hideOffsetLabel, removeBtn);
    return row;
}

function addArc() {
    const defaults = getDefaultArcPointIds();
    const arc = {
        id: arcId += 1,
        name: '',
        startPointId: defaults.startPointId,
        endPointId: defaults.endPointId,
        offsetIds: [],
        color: arcPalette[(arcId - 1) % arcPalette.length],
        hideTarget: false,
        hideOffset: false
    };
    state.arcs.push(arc);
    if (elements.arcList) {
        elements.arcList.appendChild(buildArcRow(arc));
    }
    updateArcSelectOptions();
    updateArcPointOptions();
    updateArcOffsetOptions();
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
    const addEntry = (name, value) => {
        const normalized = normalizeVariableKey(name);
        if (!normalized) return;
        values[normalized] = value;
        const lower = normalized.toLowerCase();
        if (lower !== normalized) {
            values[lower] = value;
        }
    };
    state.points.forEach((point) => {
        addEntry(point.name, point.value);
    });
    state.offsets.forEach((offset) => {
        addEntry(offset.name, offset.value);
    });
    return values;
}

function tokenizeExpression(expr) {
    const raw = expr.replace(/\s+/g, '');
    if (!raw) return null;
    const tokens = [];
    let current = '';
    let braceDepth = 0;

    for (let i = 0; i < raw.length; i += 1) {
        const char = raw[i];
        if (char === '{') {
            braceDepth += 1;
            current += char;
            continue;
        }
        if (char === '}') {
            braceDepth = Math.max(0, braceDepth - 1);
            current += char;
            continue;
        }
        if (braceDepth === 0 && (char === '+' || char === '-' || char === '(' || char === ')')) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            tokens.push(char);
            continue;
        }
        current += char;
    }
    if (current) {
        tokens.push(current);
    }
    return tokens.length ? tokens : null;
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
    let index = 0;
    let hasOperator = false;

    const parseFactor = () => {
        if (index >= tokens.length) throw new Error('Unexpected end');
        const token = tokens[index];
        if (token === '+' || token === '-') {
            hasOperator = true;
            index += 1;
            const value = parseFactor();
            return token === '-' ? -value : value;
        }
        if (token === '(') {
            index += 1;
            const value = parseExpression();
            if (tokens[index] !== ')') throw new Error('Missing closing paren');
            index += 1;
            return value;
        }
        if (token === ')') {
            throw new Error('Unexpected closing paren');
        }
        index += 1;
        if (/^\d+$/.test(token)) {
            return Number(token);
        }
        const normalized = normalizeVariableKey(token);
        const lower = normalized.toLowerCase();
        if (values[normalized] !== undefined) return values[normalized];
        if (values[lower] !== undefined) return values[lower];
        throw new Error('Unknown token');
    };

    const parseExpression = () => {
        let total = parseFactor();
        while (index < tokens.length && (tokens[index] === '+' || tokens[index] === '-')) {
            const op = tokens[index];
            hasOperator = true;
            index += 1;
            const rhs = parseFactor();
            total = op === '+' ? total + rhs : total - rhs;
        }
        return total;
    };

    try {
        const total = parseExpression();
        if (index !== tokens.length) return { error: true };
        return { value: hasOperator || tokens.length > 1 ? modValue(total) : total };
    } catch (error) {
        return { error: true };
    }
}

function renderReadoutCards() {
    const container = elements.readoutContainer;
    if (!container) return;

    const existing = new Map(
        Array.from(container.querySelectorAll('.readout-card')).map(card => [card.dataset.expr, card])
    );

    existing.forEach((card, key) => {
        if (!readoutExpressions.includes(key)) card.remove();
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

    if (window.MathJax?.typesetPromise) {
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

function getArcEndpoints(arc) {
    const startPoint = getPointById(arc.startPointId);
    const endPoint = getPointById(arc.endPointId);
    if (!startPoint || !endPoint) return null;
    return {
        start: modValue(startPoint.value),
        end: modValue(endPoint.value)
    };
}

function drawArcs() {
    if (!elements.arcGroupTarget || !elements.arcGroupOffset) return;
    elements.arcGroupTarget.innerHTML = '';
    elements.arcGroupOffset.innerHTML = '';

    state.arcs.forEach((arc, index) => {
        const endpoints = getArcEndpoints(arc);
        if (!endpoints) return;
        const color = arcColor(arc, index);
        const { start, end } = endpoints;
        const targetPath = arcPath(start, end, ring.arcRadius);
        if (targetPath && !arc.hideTarget) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', targetPath);
            path.setAttribute('class', 'ring-arc arc-target');
            path.setAttribute('data-arc-id', String(arc.id));
            path.setAttribute('data-arc-kind', 'target');
            path.style.stroke = color;
            path.style.color = color;
            elements.arcGroupTarget.appendChild(path);
        }

        const offsetIds = Array.isArray(arc.offsetIds) ? arc.offsetIds : [];
        if (offsetIds.length > 0 && !arc.hideOffset) {
            const offsetValue = getOffsetSumByIds(offsetIds);
            const offsetStart = modValue(start + offsetValue);
            const offsetEnd = modValue(end + offsetValue);
            const offsetPath = arcPath(offsetStart, offsetEnd, ring.arcRadius - ring.arcOffset);
            if (offsetPath) {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', offsetPath);
                path.setAttribute('class', 'ring-arc arc-offset');
                path.setAttribute('data-arc-id', String(arc.id));
                path.setAttribute('data-arc-kind', 'offset');
                path.style.stroke = color;
                path.style.color = color;
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
        const offsetValue = getPointOffsetSum(point);
        const angleIndex = modValue(point.value + offsetValue);
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
        if (point.hidden) item.classList.add('is-muted');

        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = point.color || pointPalette[index % pointPalette.length];

        const label = document.createElement('span');
        label.textContent = formatInlineMath(pointLabel(point, index));

        item.append(dot, label);
        container.appendChild(item);
    });

    state.arcs.forEach((arc, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        const swatchLine = document.createElement('span');
        swatchLine.className = 'legend-arc-line';
        swatchLine.style.background = arcColor(arc, index);
        swatch.append(swatchLine);

        const label = document.createElement('span');
        const name = arc.name.trim();
        const startLabel = getPointLabelById(arc.startPointId);
        const endLabel = getPointLabelById(arc.endPointId);
        label.textContent = (startLabel && endLabel)
            ? (name ? `${formatInlineMath(name)} (${formatInlineMath(startLabel)} -> ${formatInlineMath(endLabel)})`
                    : `${formatInlineMath(startLabel)} -> ${formatInlineMath(endLabel)}`)
            : (name ? formatInlineMath(name) : `弧段 ${index + 1}`);

        item.append(swatch, label);
        container.appendChild(item);
    });

    if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch(() => {});
    }
}

function updateWrapIndicator() {
    if (!elements.wrapValue || !elements.wrapFormula) return;
    if (elements.ringSvg) {
        elements.ringSvg.querySelectorAll('.ring-arc.arc-wrap').forEach((path) => {
            path.classList.remove('arc-wrap');
        });
    }
    const arc = getSelectedArc();
    if (!arc) {
        elements.wrapValue.textContent = '-';
        elements.wrapFormula.innerHTML = '\\(1\\{\\text{start} > \\text{end}\\}\\)';
        if (elements.intervalFormula) {
            elements.intervalFormula.innerHTML = '\\([\\text{start}, \\text{end})\\)';
        }
        return;
    }

    const useOffset = elements.intervalSelect && elements.intervalSelect.value === 'offset';
    const startLabel = getPointLabelById(arc.startPointId) || 'start';
    const endLabel = getPointLabelById(arc.endPointId) || 'end';
    const offsetLabels = getOffsetLabelsByIds(arc.offsetIds);
    const startTerm = formatWrapTerm(startLabel, 'start');
    const endTerm = formatWrapTerm(endLabel, 'end');
    const offsetTerms = offsetLabels.length
        ? offsetLabels.map((label) => formatWrapTerm(label, 'offset'))
        : [formatWrapTerm('offset', 'offset')];
    const offsetExpression = offsetTerms.join(' + ');
    const formula = useOffset
        ? `\\(1\\{${startTerm} + ${offsetExpression} > ${endTerm} + ${offsetExpression}\\}\\)`
        : `\\(1\\{${startTerm} > ${endTerm}\\}\\)`;
    elements.wrapFormula.innerHTML = formula;

    const endpoints = getArcEndpoints(arc);
    if (!endpoints) {
        elements.wrapValue.textContent = '-';
        if (elements.intervalFormula) {
            elements.intervalFormula.innerHTML = '\\([\\text{start}, \\text{end})\\)';
        }
        return;
    }

    const { start, end } = endpoints;
    const offsetIds = Array.isArray(arc.offsetIds) ? arc.offsetIds : [];
    const intervalStart = useOffset ? `${startTerm} + ${offsetExpression}` : startTerm;
    const intervalEnd = useOffset ? `${endTerm} + ${offsetExpression}` : endTerm;
    if (useOffset && offsetIds.length === 0) {
        elements.wrapValue.textContent = '-';
        if (elements.intervalFormula) {
            elements.intervalFormula.innerHTML = `\\([${intervalStart}, ${intervalEnd})\\)`;
        }
        return;
    }

    const offsetValue = getOffsetSumByIds(offsetIds);
    const wrap = useOffset ? modValue(start + offsetValue) > modValue(end + offsetValue) : start > end;
    elements.wrapValue.textContent = wrap ? '1' : '0';
    if (elements.intervalFormula) {
        elements.intervalFormula.innerHTML = wrap
            ? `\\([${intervalStart}, N-1] \\cup [0, ${intervalEnd})\\)`
            : `\\([${intervalStart}, ${intervalEnd})\\)`;
    }

    if (wrap && elements.ringSvg) {
        if (useOffset) {
            elements.ringSvg
                .querySelectorAll(`.ring-arc[data-arc-id="${arc.id}"][data-arc-kind="offset"]`)
                .forEach((path) => {
                    path.classList.add('arc-wrap');
                });
        } else {
            elements.ringSvg
                .querySelectorAll(`.ring-arc[data-arc-id="${arc.id}"][data-arc-kind="target"]`)
                .forEach((path) => {
                    path.classList.add('arc-wrap');
                });
        }
    }
}

function updateDisplay() {
    const variableMap = buildVariableMap();
    updateReadoutValues(variableMap);
    drawArcs();
    drawPoints(variableMap);
    updateWrapIndicator();
    renderLegend();

    if (elements.pointZero) {
        setPointPosition(elements.pointZero, 0, ring.pointRadius);
    }

    if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([elements.wrapFormula, elements.intervalFormula].filter(Boolean));
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

function initPointerEvents() {
    if (!elements.hitRing) return;
    let dragging = false;

    const updateFromPointer = (event) => {
        const index = pointerToIndex(event);
        const point = state.points.find((entry) => entry.name.trim().toLowerCase() === 'x');
        if (!point) return;
        updateValue(point, index, state.N);
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
        updateValue(point, point.value, state.N);
    });
    state.offsets.forEach((offset) => {
        updateValue(offset, offset.value, state.N);
    });
    updateAll();
}

function init() {
    updateTicks();
    initPointerEvents();
    updateArcSelectOptions();
    updateArcOffsetOptions();
    updateDisplay();

    elements.modSelect.addEventListener('change', () => {
        applyModFromSelect();
    });

    elements.resetBtn.addEventListener('click', () => {
        state.points = [];
        state.arcs = [];
        state.offsets = [];
        if (elements.pointList) elements.pointList.innerHTML = '';
        if (elements.arcList) elements.arcList.innerHTML = '';
        if (elements.offsetList) elements.offsetList.innerHTML = '';
        readoutExpressions = [];
        if (elements.readoutInput) elements.readoutInput.value = '';
        if (elements.readoutContainer) elements.readoutContainer.innerHTML = '';
        updateArcSelectOptions();
        updateArcOffsetOptions();
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

    if (elements.addOffsetBtn) {
        elements.addOffsetBtn.addEventListener('click', () => {
            addOffset();
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

}

document.addEventListener('DOMContentLoaded', init);
