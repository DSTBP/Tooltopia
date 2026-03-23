class DPFVisualizer {
    constructor() {
        this.n = 3;
        this.maxDepth = 6;

        this.offlineView = document.getElementById('offlineView');
        this.onlineView = document.getElementById('onlineView');
        this.canvasTitle = document.getElementById('canvasTitle');

        this.canvasOffline = document.getElementById('treeCanvasOffline');
        this.canvasOnline0 = document.getElementById('treeCanvasOnline0');
        this.canvasOnline1 = document.getElementById('treeCanvasOnline1');

        this.logArea = document.getElementById('statusLog');
        this.depthInput = document.getElementById('depthInput');
        this.alphaInput = document.getElementById('alphaInput');
        this.betaInput = document.getElementById('betaInput');
        this.xInput = document.getElementById('xInput');
        this.depthHint = document.getElementById('depthHint');
        this.alphaHint = document.getElementById('alphaHint');
        this.betaHint = document.getElementById('betaHint');
        this.xHint = document.getElementById('xHint');

        this.btnOffline = document.getElementById('btnOffline');
        this.btnOnline0 = document.getElementById('btnOnline0');
        this.btnOnline1 = document.getElementById('btnOnline1');
        this.btnClear = document.getElementById('btnClear');

        this.calcWindowTitle = document.getElementById('calcWindowTitle');
        this.calcWindowSubtitle = document.getElementById('calcWindowSubtitle');
        this.calcWindow = document.getElementById('calcWindow');
        this.reconstructionPanel = document.getElementById('reconstructionPanel');
        this.reconstructionSummary = document.getElementById('reconstructionSummary');
        this.reconstructionBody = document.getElementById('reconstructionBody');

        this.cw = [];
        this.outputCorrectionWord = 0;
        this.beta = 1;
        this.targetAlpha = null;
        this.targetAlphaBits = null;
        this.eval0 = null;
        this.eval1 = null;
        this.onlineTraceStarted = false;
        this.onlineQuery = null;
        this.onlineQueryBits = null;

        this.trees = {
            offline: this.createTreeState(),
            online0: this.createTreeState(),
            online1: this.createTreeState()
        };

        this.bindEvents();
        this.reset();
    }

    createTreeState() {
        return { nodes: [], edges: [], labels: [] };
    }

    bindEvents() {
        this.btnOffline.addEventListener('click', () => this.runOffline());
        this.btnOnline0.addEventListener('click', () => this.runOnline(0));
        this.btnOnline1.addEventListener('click', () => this.runOnline(1));
        this.btnClear.addEventListener('click', () => this.reset());
        this.depthInput?.addEventListener('change', () => this.handleDepthChange());
        this.alphaInput?.addEventListener('change', () => this.syncParameterInputs());
        this.betaInput?.addEventListener('change', () => this.syncParameterInputs());
        this.xInput?.addEventListener('change', () => this.syncParameterInputs());
    }

    parseBoundedInt(value, fallback, min, max) {
        const parsed = Number.parseInt(value, 10);
        const safeValue = Number.isFinite(parsed) ? parsed : fallback;
        return Math.min(max, Math.max(min, safeValue));
    }

    parseInteger(value, fallback) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    getLeafCount() {
        return Math.pow(2, this.n);
    }

    getMaxIndex() {
        return this.getLeafCount() - 1;
    }

    syncIndexedInput(input, maxIndex, fallbackValue) {
        if (!input) {
            return fallbackValue;
        }

        const safeFallback = Math.min(Math.max(fallbackValue, 0), maxIndex);
        const nextValue = this.parseBoundedInt(input.value, safeFallback, 0, maxIndex);
        input.min = '0';
        input.max = String(maxIndex);
        input.value = String(nextValue);
        return nextValue;
    }

    syncBetaInput() {
        if (!this.betaInput) {
            return this.beta;
        }

        this.beta = this.parseInteger(this.betaInput.value, this.beta);
        this.betaInput.value = String(this.beta);

        if (this.betaHint) {
            this.betaHint.textContent = `DPF{alpha, beta}: if x = alpha, output beta = ${this.beta}; otherwise output 0.`;
        }

        return this.beta;
    }

    syncParameterInputs() {
        const currentDepth = this.n || 3;
        this.n = this.parseBoundedInt(this.depthInput?.value, currentDepth, 1, this.maxDepth);

        if (this.depthInput) {
            this.depthInput.value = String(this.n);
        }

        const leafCount = this.getLeafCount();
        const maxIndex = leafCount - 1;
        const defaultIndex = Math.min(3, maxIndex);

        this.syncIndexedInput(this.alphaInput, maxIndex, defaultIndex);
        this.syncBetaInput();
        this.syncIndexedInput(this.xInput, maxIndex, defaultIndex);

        if (this.depthHint) {
            this.depthHint.textContent = `Leaf count: 2^${this.n} = ${leafCount}`;
        }

        if (this.alphaHint) {
            this.alphaHint.textContent = `Valid alpha range: 0-${maxIndex}`;
        }

        if (this.xHint) {
            this.xHint.textContent = `Valid x range: 0-${maxIndex}`;
        }
    }

    handleDepthChange() {
        const previousDepth = this.n;
        this.syncParameterInputs();

        if (previousDepth !== this.n) {
            this.reset();
        }
    }

    readIndexedInput(input, fallback = 0) {
        return this.syncIndexedInput(input, this.getMaxIndex(), Math.min(fallback, this.getMaxIndex()));
    }

    readBetaInput() {
        return this.syncBetaInput();
    }

    getBits(value) {
        return value.toString(2).padStart(this.n, '0').split('').map(Number);
    }

    getRootState(partyNum) {
        return partyNum === 0 ? { s: '1A', t: 0 } : { s: '8F', t: 1 };
    }

    getTreeMinHeight(isOffline) {
        const baseHeight = isOffline ? 550 : 450;
        const extraPerLevel = isOffline ? 72 : 64;
        return Math.max(baseHeight, 120 + this.n * extraPerLevel);
    }

    getTreeSpacePerNode(isOffline) {
        const baseSpace = isOffline ? 126 : 104;
        const shrinkPerLevel = isOffline ? 10 : 8;
        const minSpace = isOffline ? 86 : 78;
        return Math.max(minSpace, baseSpace - Math.max(0, this.n - 3) * shrinkPerLevel);
    }

    log(message) {
        const entry = document.createElement('div');
        entry.textContent = `> ${message}`;
        this.logArea.appendChild(entry);
        this.logArea.scrollTop = this.logArea.scrollHeight;
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    renderLatex(target, warningLabel = 'LaTeX render failed') {
        if (!window.DPFLatex) {
            return;
        }

        window.DPFLatex.renderLatex(target).catch((error) => {
            console.warn(warningLabel, error);
        });
    }

    scrollContainerToBottom(container) {
        if (!container) {
            return;
        }

        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    setTraceHeader(title, subtitle) {
        if (this.calcWindowTitle) {
            this.calcWindowTitle.textContent = title;
        }
        if (this.calcWindowSubtitle) {
            this.calcWindowSubtitle.textContent = subtitle;
        }
    }

    clearFormulaWindow(message = 'Run a stage to see formula traces here.') {
        if (!this.calcWindow) {
            return;
        }

        this.calcWindow.innerHTML = '';
        const emptyState = document.createElement('div');
        emptyState.className = 'calc-empty';
        emptyState.textContent = message;
        this.calcWindow.appendChild(emptyState);
    }

    ensureFormulaWindowContent() {
        if (!this.calcWindow) {
            return;
        }

        const emptyState = this.calcWindow.querySelector('.calc-empty');
        if (emptyState) {
            emptyState.remove();
        }
    }

    addFormulaSection(title) {
        if (!this.calcWindow) {
            return;
        }

        this.ensureFormulaWindowContent();

        const section = document.createElement('div');
        section.className = 'calc-section';
        section.textContent = title;
        this.calcWindow.appendChild(section);
        this.scrollContainerToBottom(this.calcWindow);
    }

    createFormulaLines(lines) {
        const container = document.createElement('div');
        container.className = 'calc-step__content';
        container.setAttribute('data-latex-scope', '');

        lines.forEach((line) => {
            const row = document.createElement('div');
            row.innerHTML = line;
            container.appendChild(row);
        });

        return container;
    }

    appendFormulaStep({
        badge = 'STEP',
        title,
        lhsLabel = 'Formula',
        lhsLines = [],
        rhsLabel = 'Output',
        rhsLines = [],
        tone = ''
    }) {
        if (!this.calcWindow) {
            return;
        }

        this.ensureFormulaWindowContent();

        const step = document.createElement('article');
        step.className = `calc-step${tone ? ` calc-step--${tone}` : ''}`;

        const meta = document.createElement('div');
        meta.className = 'calc-step__meta';

        const badgeEl = document.createElement('span');
        badgeEl.className = 'calc-step__badge';
        badgeEl.textContent = badge;

        const titleEl = document.createElement('h4');
        titleEl.className = 'calc-step__title';
        titleEl.textContent = title;

        meta.appendChild(badgeEl);
        meta.appendChild(titleEl);

        const lhsPanel = document.createElement('div');
        lhsPanel.className = 'calc-step__panel calc-step__panel--lhs';

        const lhsTitle = document.createElement('div');
        lhsTitle.className = 'calc-step__label';
        lhsTitle.textContent = lhsLabel;

        lhsPanel.appendChild(lhsTitle);
        lhsPanel.appendChild(this.createFormulaLines(lhsLines));

        const rhsPanel = document.createElement('div');
        rhsPanel.className = 'calc-step__panel calc-step__panel--rhs';

        const rhsTitle = document.createElement('div');
        rhsTitle.className = 'calc-step__label';
        rhsTitle.textContent = rhsLabel;

        rhsPanel.appendChild(rhsTitle);
        rhsPanel.appendChild(this.createFormulaLines(rhsLines));

        step.appendChild(meta);
        step.appendChild(lhsPanel);
        step.appendChild(rhsPanel);

        this.calcWindow.appendChild(step);
        this.renderLatex(step, 'Formula LaTeX render failed');
        requestAnimationFrame(() => step.classList.add('visible'));
        this.scrollContainerToBottom(this.calcWindow);
    }

    clearReconstructionWindow(summary = 'The reconstructed output for the selected x appears here after both parties finish the Online phase using y_0(x) + y_1(x) for DPF{alpha, beta}.') {
        if (!this.reconstructionPanel || !this.reconstructionBody) {
            return;
        }

        this.reconstructionPanel.hidden = true;
        this.reconstructionBody.innerHTML = '';
        if (this.reconstructionSummary) {
            this.reconstructionSummary.textContent = summary;
        }
    }

    showReconstructionWindow(summary) {
        if (!this.reconstructionPanel) {
            return;
        }

        this.reconstructionPanel.hidden = false;
        if (summary && this.reconstructionSummary) {
            this.reconstructionSummary.textContent = summary;
        }
    }

    appendReconstructionCard(index, eval0, eval1, value) {
        if (!this.reconstructionBody) {
            return;
        }

        const card = document.createElement('article');
        card.className = `result-card result-card--${value !== 0 ? 'one' : 'zero'}`;

        const indexEl = document.createElement('div');
        indexEl.className = 'result-card__index';
        indexEl.textContent = `x=${index}`;

        const formulaEl = document.createElement('div');
        formulaEl.className = 'result-card__formula';
        formulaEl.setAttribute('data-latex-scope', '');
        formulaEl.innerHTML =
            `\\(${this.formatHexSymbol(`s_0^{(n)}[${index}]`, eval0.s)},\\ ${this.formatBitSymbol(`t_0^{(n)}[${index}]`, eval0.t)}\\)<br>` +
            `\\(${this.formatHexSymbol(`s_1^{(n)}[${index}]`, eval1.s)},\\ ${this.formatBitSymbol(`t_1^{(n)}[${index}]`, eval1.t)}\\)<br>` +
            `\\(${this.formatDecSymbol(`z_0(${index})`, eval0.converted)} = \\mathrm{Conv}(${this.formatHexSymbol(`s_0^{(n)}[${index}]`, eval0.s)})\\)<br>` +
            `\\(${this.formatDecSymbol(`z_1(${index})`, eval1.converted)} = \\mathrm{Conv}(${this.formatHexSymbol(`s_1^{(n)}[${index}]`, eval1.s)})\\)<br>` +
            `\\(${this.formatDecSymbol(`y_0(${index})`, eval0.share)} = ${this.formatDecSymbol(`z_0(${index})`, eval0.converted)} + ${this.formatBitSymbol(`t_0^{(n)}[${index}]`, eval0.t)}\\cdot ${this.formatDecSymbol(`\\mathrm{OCW}`, this.outputCorrectionWord)}\\)<br>` +
            `\\(${this.formatDecSymbol(`y_1(${index})`, eval1.share)} = -\\left(${this.formatDecSymbol(`z_1(${index})`, eval1.converted)} + ${this.formatBitSymbol(`t_1^{(n)}[${index}]`, eval1.t)}\\cdot ${this.formatDecSymbol(`\\mathrm{OCW}`, this.outputCorrectionWord)}\\right)\\)<br>` +
            `\\(${this.formatDecSymbol('x', index)},\\ ${this.formatDecSymbol('f(x)', value)} = ${this.formatDecSymbol(`y_0(${index})`, eval0.share)} + ${this.formatDecSymbol(`y_1(${index})`, eval1.share)}\\)`;

        const valueEl = document.createElement('div');
        valueEl.className = 'result-card__value';
        valueEl.textContent = String(value);

        card.appendChild(indexEl);
        card.appendChild(formulaEl);
        card.appendChild(valueEl);

        this.reconstructionBody.appendChild(card);
        this.renderLatex(card, 'Reconstruction LaTeX render failed');
        requestAnimationFrame(() => card.classList.add('visible'));
        this.scrollContainerToBottom(this.reconstructionBody);
    }

    hexToDec(seed) {
        return parseInt(seed, 16);
    }

    formatHexSymbol(symbol, value) {
        return `${symbol}(\\mathtt{${value}})`;
    }

    formatBitSymbol(symbol, value) {
        return `${symbol}(${value})`;
    }

    formatDecSymbol(symbol, value) {
        return `${symbol}(${value})`;
    }

    convertSeedToGroup(seed) {
        return this.hexToDec(seed) & 1;
    }

    getSignedPartyFactor(partyNum) {
        return partyNum === 0 ? 1 : -1;
    }

    getBranchMeta(bit) {
        const keep = bit === 0 ? 'L' : 'R';
        const lose = bit === 0 ? 'R' : 'L';

        return {
            keep,
            lose,
            keepSeedKey: `s${keep}`,
            loseSeedKey: `s${lose}`,
            keepTKey: `t${keep}`,
            loseTKey: `t${lose}`,
            keepSeedSymbolKey: keep === 'L' ? 'rawSL' : 'rawSR',
            loseSeedSymbolKey: lose === 'L' ? 'rawSL' : 'rawSR',
            keepTSymbolKey: keep === 'L' ? 'rawTL' : 'rawTR',
            loseTSymbolKey: lose === 'L' ? 'rawTL' : 'rawTR'
        };
    }

    buildCorrectionWord(bit, prg0, prg1) {
        const branch = this.getBranchMeta(bit);

        return {
            seed: this.xorHex(prg0[branch.loseSeedKey], prg1[branch.loseSeedKey]),
            tL: prg0.tL ^ prg1.tL ^ bit ^ 1,
            tR: prg0.tR ^ prg1.tR ^ bit
        };
    }

    computeOutputCorrectionWord(finalState0, finalState1) {
        const z0 = this.convertSeedToGroup(finalState0.s);
        const z1 = this.convertSeedToGroup(finalState1.s);
        const sign = finalState1.t === 1 ? -1 : 1;
        return sign * (this.beta - z0 + z1);
    }

    evaluateShare(finalState, partyNum) {
        const converted = this.convertSeedToGroup(finalState.s);
        const share = this.getSignedPartyFactor(partyNum) * (converted + finalState.t * this.outputCorrectionWord);
        return { ...finalState, converted, share };
    }

    buildTraceSymbols(partyIndex, level, parentIndex) {
        const suffix = `[${parentIndex}]`;
        return {
            inputSeed: `s_{${partyIndex}}^{(${level - 1})}${suffix}`,
            inputT: `t_{${partyIndex}}^{(${level - 1})}${suffix}`,
            base: `b_{${partyIndex}}^{(${level})}${suffix}`,
            rawSL: `\\widetilde{s}_{${partyIndex},L}^{(${level})}${suffix}`,
            rawSR: `\\widetilde{s}_{${partyIndex},R}^{(${level})}${suffix}`,
            rawTL: `\\widetilde{t}_{${partyIndex},L}^{(${level})}${suffix}`,
            rawTR: `\\widetilde{t}_{${partyIndex},R}^{(${level})}${suffix}`,
            finalSL: `s_{${partyIndex},L}^{(${level})}${suffix}`,
            finalSR: `s_{${partyIndex},R}^{(${level})}${suffix}`,
            finalTL: `t_{${partyIndex},L}^{(${level})}${suffix}`,
            finalTR: `t_{${partyIndex},R}^{(${level})}${suffix}`
        };
    }

    buildCWTraceSymbols(partyIndex, level) {
        return {
            inputSeed: `s_{${partyIndex}}^{(${level - 1})}`,
            rawSL: `\\widetilde{s}_{${partyIndex},L}^{(${level})}`,
            rawSR: `\\widetilde{s}_{${partyIndex},R}^{(${level})}`,
            rawTL: `\\widetilde{t}_{${partyIndex},L}^{(${level})}`,
            rawTR: `\\widetilde{t}_{${partyIndex},R}^{(${level})}`
        };
    }

    buildCWSymbols(level) {
        return {
            seed: `\\mathrm{CW}_{${level},s}`,
            tL: `\\mathrm{CW}_{${level},t_L}`,
            tR: `\\mathrm{CW}_{${level},t_R}`,
            ocw: '\\mathrm{OCW}'
        };
    }

    buildNodeLabelMarkup(level, index) {
        return level === this.n ? `\\(x=${index}\\)` : `\\(L_{${level}}\\)`;
    }

    buildOfflineNodeValueMarkup(p0State, p1State) {
        return `\\(\\mathrm{P}_0:\\ \\mathtt{${p0State.s}},\\ t=${p0State.t}\\)<br>` +
            `\\(\\mathrm{P}_1:\\ \\mathtt{${p1State.s}},\\ t=${p1State.t}\\)`;
    }

    buildOnlineNodeValueMarkup(state) {
        return `\\(s=\\mathtt{${state.s}}\\)<br>\\(t=${state.t}\\)`;
    }

    setNodeValue(nodeState, markup) {
        nodeState.valEl.innerHTML = markup;
        this.renderLatex(nodeState.valEl, 'Node LaTeX render failed');
    }

    drawEmptyTree(canvas, treeKey, isOffline) {
        canvas.innerHTML = '';
        this.trees[treeKey] = this.createTreeState();

        const leafCount = this.getLeafCount();
        const safeSpacePerNode = this.getTreeSpacePerNode(isOffline);
        const minTreeWidth = leafCount * safeSpacePerNode;
        const leftOffset = isOffline ? 196 : 24;
        const rightOffset = 36;
        const minHeight = this.getTreeMinHeight(isOffline);

        const containerWidth = canvas.parentElement?.clientWidth || 600;
        const treeRenderWidth = Math.max(containerWidth - leftOffset - rightOffset, minTreeWidth);
        const totalCanvasWidth = treeRenderWidth + leftOffset + rightOffset;

        canvas.style.minWidth = `${totalCanvasWidth}px`;
        canvas.style.minHeight = `${minHeight}px`;

        const height = Math.max(canvas.clientHeight || 0, minHeight);
        const levelHeight = height / (this.n + 1.2);

        for (let level = 0; level <= this.n; level++) {
            const numNodes = Math.pow(2, level);
            const levelY = levelHeight * (level + 0.6);
            const sectionWidth = treeRenderWidth / numNodes;

            for (let i = 0; i < numNodes; i++) {
                const x = leftOffset + sectionWidth * i + sectionWidth / 2;

                if (level > 0) {
                    const parentIndex = Math.floor(i / 2);
                    const parentSectionWidth = treeRenderWidth / Math.pow(2, level - 1);
                    const parentX = leftOffset + parentSectionWidth * parentIndex + parentSectionWidth / 2;
                    const parentY = levelHeight * (level - 0.4);
                    const bitLabel = i % 2 === 0 ? '0' : '1';
                    this.drawEdge(canvas, treeKey, parentX, parentY, x, levelY, level, i, bitLabel);
                }

                this.drawNode(canvas, treeKey, x, levelY, level, i, isOffline);
            }
        }
    }

    drawNode(canvas, treeKey, x, y, level, index, isOffline) {
        const id = `${treeKey}-node-${level}-${index}`;
        const node = document.createElement('div');
        node.className = `tree-node ${isOffline ? 'offline-node' : ''}`;
        node.id = id;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        const label = document.createElement('div');
        label.className = 'node-label';
        label.setAttribute('data-latex-scope', '');
        label.innerHTML = this.buildNodeLabelMarkup(level, index);

        const value = document.createElement('div');
        value.className = 'node-value';
        value.id = `${id}-val`;
        value.setAttribute('data-latex-scope', '');
        value.innerHTML = '\\(?\\)';

        node.appendChild(label);
        node.appendChild(value);
        canvas.appendChild(node);

        this.renderLatex([label, value], 'Node LaTeX render failed');
        this.trees[treeKey].nodes.push({ level, index, el: node, labelEl: label, valEl: value });
    }

    drawEdge(canvas, treeKey, x1, y1, x2, y2, level, index, bitText) {
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

        const edge = document.createElement('div');
        edge.className = 'tree-edge';
        edge.style.width = `${length}px`;
        edge.style.left = `${x1}px`;
        edge.style.top = `${y1}px`;
        edge.style.transform = `rotate(${angle}deg)`;

        const label = document.createElement('div');
        label.className = 'edge-label';
        label.textContent = bitText;
        label.style.left = `${(x1 + x2) / 2}px`;
        label.style.top = `${(y1 + y2) / 2}px`;

        canvas.appendChild(edge);
        canvas.appendChild(label);
        this.trees[treeKey].edges.push({ level, index, el: edge, labelEl: label });
    }

    buildCWFormula(level, cw) {
        return `\\(\\mathrm{CW}_{${level}}\\)<br>` +
            `\\(${this.formatHexSymbol(`\\mathrm{CW}_{${level},s}`, cw.seed)}\\)<br>` +
            `\\(${this.formatBitSymbol(`\\mathrm{CW}_{${level},t_L}`, cw.tL)},\\ ${this.formatBitSymbol(`\\mathrm{CW}_{${level},t_R}`, cw.tR)}\\)`;
    }

    drawCWLabel(canvas, level, cwMarkup) {
        const height = Math.max(canvas.clientHeight || 0, this.getTreeMinHeight(true));
        const levelHeight = height / (this.n + 1.2);
        const y = levelHeight * (level + 0.6);
        const label = document.createElement('div');
        label.className = 'cw-label';
        label.setAttribute('data-latex-scope', '');
        label.style.top = `${y}px`;
        label.innerHTML = cwMarkup;
        canvas.appendChild(label);

        this.renderLatex(label, 'CW LaTeX render failed');
        requestAnimationFrame(() => label.classList.add('visible'));
    }

    getNode(treeKey, level, index) {
        return this.trees[treeKey].nodes.find((node) => node.level === level && node.index === index);
    }

    getEdge(treeKey, level, index) {
        return this.trees[treeKey].edges.find((edge) => edge.level === level && edge.index === index);
    }

    xorHex(left, right) {
        const leftValue = parseInt(left, 16);
        const rightValue = parseInt(right, 16);
        return (leftValue ^ rightValue).toString(16).padStart(2, '0').toUpperCase();
    }

    prg(seed) {
        const base = parseInt(seed, 16);
        const sL = ((base * 31 + 17) % 256).toString(16).padStart(2, '0').toUpperCase();
        const sR = ((base * 13 + 37) % 256).toString(16).padStart(2, '0').toUpperCase();
        const tL = base % 2;
        const tR = 1 - tL;
        return { sL, tL, sR, tR };
    }

    applyCorrection(rawResult, controlBit, cw) {
        const before = { ...rawResult };
        const after = { ...rawResult };
        const applied = controlBit === 1 && !!cw;

        if (applied) {
            after.sL = this.xorHex(after.sL, cw.seed);
            after.tL ^= cw.tL;
            after.sR = this.xorHex(after.sR, cw.seed);
            after.tR ^= cw.tR;
        }

        return { before, after, applied };
    }

    buildPrgFormulaLines(seed, result, symbols) {
        const base = this.hexToDec(seed);
        const inputSeed = this.formatHexSymbol(symbols.inputSeed, seed);
        const baseSymbol = this.formatDecSymbol(symbols.base, base);
        const rawTL = this.formatBitSymbol(symbols.rawTL, result.tL);
        return [
            `\\(${baseSymbol} = \\mathrm{hex}(${inputSeed})\\)`,
            `\\(${this.formatHexSymbol(symbols.rawSL, result.sL)} = (31\\cdot ${baseSymbol} + 17)\\bmod 256\\)`,
            `\\(${this.formatHexSymbol(symbols.rawSR, result.sR)} = (13\\cdot ${baseSymbol} + 37)\\bmod 256\\)`,
            `\\(${rawTL} = ${baseSymbol}\\bmod 2\\)`,
            `\\(${this.formatBitSymbol(symbols.rawTR, result.tR)} = 1 \\oplus ${rawTL}\\)`
        ];
    }

    buildCorrectionLines(symbols, before, after, applied, controlBit, cw, level) {
        const cwSymbols = this.buildCWSymbols(level);
        if (!applied) {
            return [
                `\\(${this.formatBitSymbol(symbols.inputT, controlBit)} = 0\\Rightarrow \\text{skip } \\mathrm{CW}_{${level}}\\)`,
                `\\(${this.formatHexSymbol(symbols.finalSL, after.sL)} = ${this.formatHexSymbol(symbols.rawSL, before.sL)}\\)`,
                `\\(${this.formatBitSymbol(symbols.finalTL, after.tL)} = ${this.formatBitSymbol(symbols.rawTL, before.tL)}\\)`,
                `\\(${this.formatHexSymbol(symbols.finalSR, after.sR)} = ${this.formatHexSymbol(symbols.rawSR, before.sR)}\\)`,
                `\\(${this.formatBitSymbol(symbols.finalTR, after.tR)} = ${this.formatBitSymbol(symbols.rawTR, before.tR)}\\)`
            ];
        }

        return [
            `\\(${this.formatBitSymbol(symbols.inputT, controlBit)} = 1\\Rightarrow \\text{apply } \\mathrm{CW}_{${level}}\\)`,
            `\\(${this.formatHexSymbol(symbols.finalSL, after.sL)} = ${this.formatHexSymbol(symbols.rawSL, before.sL)} \\oplus ${this.formatHexSymbol(cwSymbols.seed, cw.seed)}\\)`,
            `\\(${this.formatBitSymbol(symbols.finalTL, after.tL)} = ${this.formatBitSymbol(symbols.rawTL, before.tL)} \\oplus ${this.formatBitSymbol(cwSymbols.tL, cw.tL)}\\)`,
            `\\(${this.formatHexSymbol(symbols.finalSR, after.sR)} = ${this.formatHexSymbol(symbols.rawSR, before.sR)} \\oplus ${this.formatHexSymbol(cwSymbols.seed, cw.seed)}\\)`,
            `\\(${this.formatBitSymbol(symbols.finalTR, after.tR)} = ${this.formatBitSymbol(symbols.rawTR, before.tR)} \\oplus ${this.formatBitSymbol(cwSymbols.tR, cw.tR)}\\)`
        ];
    }

    buildChildOutputLines(symbols, after) {
        return [
            `\\(\\text{left} = (${this.formatHexSymbol(symbols.finalSL, after.sL)},\\ ${this.formatBitSymbol(symbols.finalTL, after.tL)})\\)`,
            `\\(\\text{right} = (${this.formatHexSymbol(symbols.finalSR, after.sR)},\\ ${this.formatBitSymbol(symbols.finalTR, after.tR)})\\)`
        ];
    }

    appendOfflineInitTrace(alpha, alphaBits) {
        this.addFormulaSection('Offline Init');
        this.appendFormulaStep({
            badge: 'INIT',
            title: 'Distribute root seeds',
            lhsLines: [
                `\\(\\alpha(${alpha}),\\quad \\alpha_{bits}(${alphaBits.join('')}),\\quad ${this.formatDecSymbol('\\beta', this.beta)}\\)`,
                `\\(${this.formatHexSymbol('s_0^{(0)}', '1A')},\\ ${this.formatBitSymbol('t_0^{(0)}', 0)}\\)`,
                `\\(${this.formatHexSymbol('s_1^{(0)}', '8F')},\\ ${this.formatBitSymbol('t_1^{(0)}', 1)}\\)`
            ],
            rhsLabel: 'Roots',
            rhsLines: [
                `\\(\\mathrm{P}_0 \\mapsto (${this.formatHexSymbol('s_0^{(0)}', '1A')},\\ ${this.formatBitSymbol('t_0^{(0)}', 0)})\\)`,
                `\\(\\mathrm{P}_1 \\mapsto (${this.formatHexSymbol('s_1^{(0)}', '8F')},\\ ${this.formatBitSymbol('t_1^{(0)}', 1)})\\)`
            ],
            tone: 'result'
        });
    }

    appendOutputCorrectionTrace(alpha, finalState0, finalState1) {
        const z0 = this.convertSeedToGroup(finalState0.s);
        const z1 = this.convertSeedToGroup(finalState1.s);
        const ocw = this.outputCorrectionWord;

        this.addFormulaSection('Offline Output Correction');
        this.appendFormulaStep({
            badge: 'OCW',
            title: 'Compute the standard DPF output correction word',
            lhsLines: [
                `\\(${this.formatDecSymbol(`z_0[${alpha}]`, z0)} = \\mathrm{Conv}(${this.formatHexSymbol(`s_0^{(n)}[${alpha}]`, finalState0.s)}) = ${this.formatHexSymbol(`s_0^{(n)}[${alpha}]`, finalState0.s)} \\bmod 2\\)`,
                `\\(${this.formatDecSymbol(`z_1[${alpha}]`, z1)} = \\mathrm{Conv}(${this.formatHexSymbol(`s_1^{(n)}[${alpha}]`, finalState1.s)}) = ${this.formatHexSymbol(`s_1^{(n)}[${alpha}]`, finalState1.s)} \\bmod 2\\)`,
                `\\(${this.formatDecSymbol(`\\beta`, this.beta)}\\)`,
                `\\(${this.formatDecSymbol(`\\mathrm{OCW}`, ocw)} = (-1)^{${this.formatBitSymbol(`t_1^{(n)}[${alpha}]`, finalState1.t)}}\\cdot\\left(${this.formatDecSymbol(`\\beta`, this.beta)} - ${this.formatDecSymbol(`z_0[${alpha}]`, z0)} + ${this.formatDecSymbol(`z_1[${alpha}]`, z1)}\\right)\\)`
            ],
            rhsLabel: 'Output',
            rhsLines: [
                `\\(${this.formatDecSymbol(`\\mathrm{OCW}`, ocw)}\\)`,
                `\\(\\text{Keys now contain root seeds, all } \\mathrm{CW}_i, \\text{ and } \\mathrm{OCW}.\\)`
            ],
            tone: 'result'
        });
    }

    appendOnlineInputTrace(x, xBits) {
        this.appendFormulaStep({
            badge: 'INPUT',
            title: 'Fix the online query point',
            lhsLines: [
                `\\(${this.formatDecSymbol('x', x)},\\quad ${this.formatBitSymbol('x_{bits}', xBits.join(''))}\\)`
            ],
            rhsLabel: 'Meaning',
            rhsLines: [
                '\\(\\text{Both parties evaluate the same query path determined by } x.\\)'
            ],
            tone: 'result'
        });
    }

    appendCWTrace(level, bit, p0Seed, prg0, p1Seed, prg1, cw) {
        const sym0 = this.buildCWTraceSymbols(0, level);
        const sym1 = this.buildCWTraceSymbols(1, level);
        const cwSymbols = this.buildCWSymbols(level);
        const branch = this.getBranchMeta(bit);
        const alphaSymbol = this.formatBitSymbol(`\\alpha_${level}`, bit);
        const p0Input = this.formatHexSymbol(sym0.inputSeed, p0Seed);
        const p1Input = this.formatHexSymbol(sym1.inputSeed, p1Seed);
        const p0LoseSeedSymbol = sym0[branch.loseSeedSymbolKey];
        const p1LoseSeedSymbol = sym1[branch.loseSeedSymbolKey];

        this.appendFormulaStep({
            badge: 'CW',
            title: `Compute CW_${level} on the active path`,
            lhsLines: [
                `\\(${alphaSymbol} \\Rightarrow \\mathrm{keep}(${branch.keep}),\\ \\mathrm{lose}(${branch.lose})\\)`,
                `\\(\\mathrm{PRG}(${p0Input}) \\Rightarrow (${this.formatHexSymbol(sym0.rawSL, prg0.sL)},\\ ${this.formatHexSymbol(sym0.rawSR, prg0.sR)},\\ ${this.formatBitSymbol(sym0.rawTL, prg0.tL)},\\ ${this.formatBitSymbol(sym0.rawTR, prg0.tR)})\\)`,
                `\\(\\mathrm{PRG}(${p1Input}) \\Rightarrow (${this.formatHexSymbol(sym1.rawSL, prg1.sL)},\\ ${this.formatHexSymbol(sym1.rawSR, prg1.sR)},\\ ${this.formatBitSymbol(sym1.rawTL, prg1.tL)},\\ ${this.formatBitSymbol(sym1.rawTR, prg1.tR)})\\)`,
                `\\(${this.formatHexSymbol(cwSymbols.seed, cw.seed)} = ${this.formatHexSymbol(p0LoseSeedSymbol, prg0[branch.loseSeedKey])} \\oplus ${this.formatHexSymbol(p1LoseSeedSymbol, prg1[branch.loseSeedKey])}\\)`,
                `\\(${this.formatBitSymbol(cwSymbols.tL, cw.tL)} = ${this.formatBitSymbol(sym0.rawTL, prg0.tL)} \\oplus ${this.formatBitSymbol(sym1.rawTL, prg1.tL)} \\oplus ${alphaSymbol} \\oplus 1\\)`,
                `\\(${this.formatBitSymbol(cwSymbols.tR, cw.tR)} = ${this.formatBitSymbol(sym0.rawTR, prg0.tR)} \\oplus ${this.formatBitSymbol(sym1.rawTR, prg1.tR)} \\oplus ${alphaSymbol}\\)`
            ],
            rhsLabel: 'CW Output',
            rhsLines: [
                `\\(\\mathrm{CW}_{${level}} = (${this.formatHexSymbol(cwSymbols.seed, cw.seed)},\\ ${this.formatBitSymbol(cwSymbols.tL, cw.tL)},\\ ${this.formatBitSymbol(cwSymbols.tR, cw.tR)})\\)`
            ],
            tone: 'cw'
        });
    }

    appendExpansionTrace(stage, partyIndex, partyLabel, tone, level, parentIndex, seed, controlBit, trace, cw) {
        const symbols = this.buildTraceSymbols(partyIndex, level, parentIndex);
        const lhsLines = [
            ...this.buildPrgFormulaLines(seed, trace.before, symbols),
            ...this.buildCorrectionLines(symbols, trace.before, trace.after, trace.applied, controlBit, cw, level)
        ];

        this.appendFormulaStep({
            badge: trace.applied ? 'PRG+CW' : 'PRG',
            title: `${stage} / ${partyLabel} / L${level} / parent ${parentIndex}`,
            lhsLines,
            rhsLabel: 'Children',
            rhsLines: this.buildChildOutputLines(symbols, trace.after),
            tone
        });
    }

    appendOnlineRootTrace(partyNum, seed, t) {
        this.appendFormulaStep({
            badge: 'ROOT',
            title: `Online / Party ${partyNum} / root`,
            lhsLines: [`\\(${this.formatHexSymbol(`s_${partyNum}^{(0)}`, seed)},\\quad ${this.formatBitSymbol(`t_${partyNum}^{(0)}`, t)}\\)`],
            rhsLabel: 'Node',
            rhsLines: [`\\(L_0 \\mapsto (${this.formatHexSymbol(`s_${partyNum}^{(0)}`, seed)},\\ ${this.formatBitSymbol(`t_${partyNum}^{(0)}`, t)})\\)`],
            tone: partyNum === 0 ? 'p0' : 'p1'
        });
    }

    appendReconstructionRuleTrace(x) {
        this.addFormulaSection('Reconstruction');
        this.appendFormulaStep({
            badge: 'SUM',
            title: `Reconstruct the queried output at x = ${x}`,
            lhsLines: [
                `\\(y_b(x)=(-1)^b\\cdot\\left(\\mathrm{Conv}(s_b^{(n)}[x]) + t_b^{(n)}[x]\\cdot ${this.formatDecSymbol(`\\mathrm{OCW}`, this.outputCorrectionWord)}\\right)\\)`,
                `\\(f(x)=y_0(x)+y_1(x)\\)`,
                `\\(f(x)=${this.formatDecSymbol(`\\beta`, this.beta)}\\ \\text{iff}\\ x=\\alpha,\\qquad f(x)=0\\ \\text{otherwise}\\)`
            ],
            rhsLabel: 'Meaning',
            rhsLines: [
                `\\(\\text{Standard DPF reconstructs by additive shares, not by final-seed xor.}\\)`
            ],
            tone: 'result'
        });
    }

    async runOffline() {
        this.reset();
        this.btnOffline.disabled = true;
        this.depthInput.disabled = true;
        this.alphaInput.disabled = true;
        this.betaInput.disabled = true;
        this.xInput.disabled = false;

        const alpha = this.readIndexedInput(this.alphaInput, 0);
        const beta = this.readBetaInput();
        const alphaBits = this.getBits(alpha);
        this.beta = beta;
        this.targetAlpha = alpha;
        this.targetAlphaBits = alphaBits;

        this.canvasTitle.textContent = `Offline Stage: GGM Tree Generation (n=${this.n}, alpha=${alpha}, beta=${beta})`;
        this.setTraceHeader('Offline Formula Trace', `n = ${this.n}, alpha = ${alpha}, beta = ${beta}. Standard DPF key generation, CW derivation, and OCW construction are animated here.`);
        this.clearFormulaWindow('Offline derivations will appear here while the GGM tree expands.');
        this.clearReconstructionWindow();
        this.log(`[Offline] Start. n = ${this.n}, alpha = ${alpha} (${alphaBits.join('')}), beta = ${beta}.`);
        this.appendOfflineInitTrace(alpha, alphaBits);

        let currentP0 = [this.getRootState(0)];
        let currentP1 = [this.getRootState(1)];
        this.cw = [];

        const rootNode = this.getNode('offline', 0, 0);
        rootNode.el.classList.add('visible');
        this.setNodeValue(rootNode, this.buildOfflineNodeValueMarkup(this.getRootState(0), this.getRootState(1)));
        await this.sleep(700);

        for (let i = 0; i < this.n; i++) {
            const bit = alphaBits[i];
            const nextP0 = [];
            const nextP1 = [];

            const activeIndex = parseInt(alphaBits.slice(0, i).join('') || '0', 2);
            const p0State = currentP0[activeIndex];
            const p1State = currentP1[activeIndex];

            const prg0 = this.prg(p0State.s);
            const prg1 = this.prg(p1State.s);
            const cw = this.buildCorrectionWord(bit, prg0, prg1);

            this.addFormulaSection(`Offline Level ${i + 1}`);
            this.cw.push(cw);
            this.drawCWLabel(this.canvasOffline, i + 1, this.buildCWFormula(i + 1, cw));
            this.appendCWTrace(i + 1, bit, p0State.s, prg0, p1State.s, prg1, cw);
            await this.sleep(220);

            for (let j = 0; j < Math.pow(2, i); j++) {
                const isPath = j === activeIndex;

                const p0Raw = this.prg(currentP0[j].s);
                const p0Trace = this.applyCorrection(p0Raw, currentP0[j].t, cw);
                nextP0.push(
                    { s: p0Trace.after.sL, t: p0Trace.after.tL },
                    { s: p0Trace.after.sR, t: p0Trace.after.tR }
                );

                const p1Raw = this.prg(currentP1[j].s);
                const p1Trace = this.applyCorrection(p1Raw, currentP1[j].t, cw);
                nextP1.push(
                    { s: p1Trace.after.sL, t: p1Trace.after.tL },
                    { s: p1Trace.after.sR, t: p1Trace.after.tR }
                );

                this.appendExpansionTrace('Offline', 0, 'P0', 'p0', i + 1, j, currentP0[j].s, currentP0[j].t, p0Trace, cw);
                this.appendExpansionTrace('Offline', 1, 'P1', 'p1', i + 1, j, currentP1[j].s, currentP1[j].t, p1Trace, cw);

                const leftChildIndex = j * 2;
                const rightChildIndex = j * 2 + 1;

                const edgeL = this.getEdge('offline', i + 1, leftChildIndex);
                const edgeR = this.getEdge('offline', i + 1, rightChildIndex);
                edgeL.el.classList.add('visible');
                edgeL.labelEl.classList.add('visible');
                edgeR.el.classList.add('visible');
                edgeR.labelEl.classList.add('visible');

                const leftNode = this.getNode('offline', i + 1, leftChildIndex);
                const rightNode = this.getNode('offline', i + 1, rightChildIndex);
                leftNode.el.classList.add('visible');
                rightNode.el.classList.add('visible');

                this.setNodeValue(leftNode, this.buildOfflineNodeValueMarkup(
                    { s: p0Trace.after.sL, t: p0Trace.after.tL },
                    { s: p1Trace.after.sL, t: p1Trace.after.tL }
                ));
                this.setNodeValue(rightNode, this.buildOfflineNodeValueMarkup(
                    { s: p0Trace.after.sR, t: p0Trace.after.tR },
                    { s: p1Trace.after.sR, t: p1Trace.after.tR }
                ));

                if (isPath) {
                    if (bit === 0) {
                        edgeL.el.classList.add('active-path');
                        leftNode.el.classList.add('active-path');
                    } else {
                        edgeR.el.classList.add('active-path');
                        rightNode.el.classList.add('active-path');
                    }
                }

                await this.sleep(220);
            }

            currentP0 = nextP0;
            currentP1 = nextP1;
            await this.sleep(360);
        }

        const finalState0 = currentP0[alpha];
        const finalState1 = currentP1[alpha];
        this.outputCorrectionWord = this.computeOutputCorrectionWord(finalState0, finalState1);
        this.appendOutputCorrectionTrace(alpha, finalState0, finalState1);
        this.log(`[Offline] OCW = ${this.outputCorrectionWord} for DPF{alpha=${alpha}, beta=${beta}}.`);
        this.log(`[Offline] Finished. Online evaluation is now enabled for x in [0, ${this.getMaxIndex()}].`);
        this.btnOnline0.disabled = false;
        this.btnOnline1.disabled = false;
    }

    async runOnline(partyNum) {
        const x = this.onlineQuery ?? this.readIndexedInput(this.xInput, 0);
        const xBits = this.onlineQueryBits ?? this.getBits(x);

        this.offlineView.style.display = 'none';
        this.onlineView.style.display = 'flex';
        this.canvasTitle.textContent = `Online Stage: Evaluate x = ${x} (n=${this.n})`;

        if (this.trees[`online${partyNum}`].nodes.length === 0) {
            this.drawEmptyTree(this.canvasOnline0, 'online0', false);
            this.drawEmptyTree(this.canvasOnline1, 'online1', false);
        }

        if (!this.onlineTraceStarted) {
            this.setTraceHeader('Online Formula Trace', `Evaluate x = ${x} (${xBits.join('')}) with the standard DPF evaluator for DPF{alpha=${this.targetAlpha}, beta=${this.beta}}; reconstruction uses additive shares and OCW.`);
            this.clearFormulaWindow('Online PRG expansions on the selected x-path will appear here.');
            this.clearReconstructionWindow();
            this.addFormulaSection('Online Query');
            this.appendOnlineInputTrace(x, xBits);
            this.onlineTraceStarted = true;
            this.onlineQuery = x;
            this.onlineQueryBits = xBits;
            this.xInput.value = String(x);
            this.xInput.disabled = true;
        }

        const treeKey = `online${partyNum}`;
        const rootState = this.getRootState(partyNum);
        const rootSeed = rootState.s;
        const rootT = rootState.t;
        const colorClass = partyNum === 0 ? 'eval-p0' : 'eval-p1';
        const tone = partyNum === 0 ? 'p0' : 'p1';

        this.addFormulaSection(`Online / Party ${partyNum}`);
        this.appendOnlineRootTrace(partyNum, rootSeed, rootT);
        this.log(`[Online] Party ${partyNum} starts evaluation on x = ${x} (${xBits.join('')}).`);
        if (partyNum === 0) {
            this.btnOnline0.disabled = true;
        } else {
            this.btnOnline1.disabled = true;
        }

        let currentNode = { s: rootSeed, t: rootT, idx: 0 };

        const rootNode = this.getNode(treeKey, 0, 0);
        rootNode.el.classList.add('visible', colorClass);
        this.setNodeValue(rootNode, this.buildOnlineNodeValueMarkup({ s: rootSeed, t: rootT }));
        await this.sleep(500);

        for (let i = 0; i < this.n; i++) {
            const cw = this.cw[i];
            const bit = xBits[i];

            this.addFormulaSection(`Party ${partyNum} / Level ${i + 1}`);

            const rawPrg = this.prg(currentNode.s);
            const trace = this.applyCorrection(rawPrg, currentNode.t, cw);

            this.appendExpansionTrace(
                `Online / Party ${partyNum}`,
                partyNum,
                `node ${currentNode.idx}`,
                tone,
                i + 1,
                currentNode.idx,
                currentNode.s,
                currentNode.t,
                trace,
                cw
            );

            const leftIndex = currentNode.idx * 2;
            const rightIndex = currentNode.idx * 2 + 1;

            const edgeL = this.getEdge(treeKey, i + 1, leftIndex);
            const edgeR = this.getEdge(treeKey, i + 1, rightIndex);
            edgeL.el.classList.add('visible');
            edgeL.labelEl.classList.add('visible');
            edgeR.el.classList.add('visible');
            edgeR.labelEl.classList.add('visible');

            const leftNode = this.getNode(treeKey, i + 1, leftIndex);
            const rightNode = this.getNode(treeKey, i + 1, rightIndex);
            leftNode.el.classList.add('visible', colorClass);
            rightNode.el.classList.add('visible', colorClass);

            this.setNodeValue(leftNode, this.buildOnlineNodeValueMarkup({ s: trace.after.sL, t: trace.after.tL }));
            this.setNodeValue(rightNode, this.buildOnlineNodeValueMarkup({ s: trace.after.sR, t: trace.after.tR }));

            if (bit === 0) {
                edgeL.el.classList.add('active-path');
                leftNode.el.classList.add('active-path');
                currentNode = { s: trace.after.sL, t: trace.after.tL, idx: leftIndex };
            } else {
                edgeR.el.classList.add('active-path');
                rightNode.el.classList.add('active-path');
                currentNode = { s: trace.after.sR, t: trace.after.tR, idx: rightIndex };
            }

            await this.sleep(140);
            await this.sleep(240);
        }

        if (partyNum === 0) {
            this.eval0 = { x, ...currentNode };
        } else {
            this.eval1 = { x, ...currentNode };
        }

        if (this.eval0 && this.eval1) {
            this.log('[Result] Both parties finished. Opening the reconstruction window.');
            this.appendReconstructionRuleTrace(x);
            this.showReconstructionWindow(
                `Reconstruct the selected query x = ${x} with y_0(x) + y_1(x). Target alpha = ${this.targetAlpha}, beta = ${this.beta}.`
            );

            const eval0 = this.evaluateShare(this.eval0, 0);
            const eval1 = this.evaluateShare(this.eval1, 1);
            const value = eval0.share + eval1.share;

            this.appendReconstructionCard(x, eval0, eval1, value);
            this.log(`[Reconstruct] x=${x}: y0=${eval0.share}, y1=${eval1.share}, y0+y1=${value}.`);
            await this.sleep(140);

            if (this.reconstructionSummary) {
                this.reconstructionSummary.textContent = `alpha=${this.targetAlpha}, x=${x}. y0(x) = ${eval0.share}, y1(x) = ${eval1.share}, f(x) = ${value}.`;
            }

            this.btnOnline0.disabled = true;
            this.btnOnline1.disabled = true;
        }
    }

    reset() {
        this.syncParameterInputs();
        this.logArea.innerHTML = '';
        this.log('System reset.');

        this.btnOffline.disabled = false;
        this.btnOnline0.disabled = true;
        this.btnOnline1.disabled = true;
        this.depthInput.disabled = false;
        this.alphaInput.disabled = false;
        this.betaInput.disabled = false;
        this.xInput.disabled = false;

        this.eval0 = null;
        this.eval1 = null;
        this.cw = [];
        this.outputCorrectionWord = 0;
        this.targetAlpha = null;
        this.targetAlphaBits = null;
        this.onlineTraceStarted = false;
        this.onlineQuery = null;
        this.onlineQueryBits = null;

        this.setTraceHeader('Formula Trace', 'Step-by-step PRG, CW, and control-bit calculations.');
        this.clearFormulaWindow('Run Offline first to animate how each seed and control bit is derived.');
        this.clearReconstructionWindow();

        this.offlineView.style.display = 'block';
        this.onlineView.style.display = 'none';
        this.canvasTitle.textContent = 'Offline Stage: GGM Tree Generation';

        this.drawEmptyTree(this.canvasOffline, 'offline', true);

        this.canvasOnline0.innerHTML = '';
        this.canvasOnline1.innerHTML = '';
        this.trees.online0 = this.createTreeState();
        this.trees.online1 = this.createTreeState();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DPFVisualizer();
});
