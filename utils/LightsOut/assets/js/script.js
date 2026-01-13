(() => {
    const boardEl = document.getElementById('board');
    const levelSelect = document.getElementById('levelSelect');
    const prevLevelBtn = document.getElementById('prevLevel');
    const nextLevelBtn = document.getElementById('nextLevel');
    const rowsInput = document.getElementById('rowsInput');
    const colsInput = document.getElementById('colsInput');
    const resetBtn = document.getElementById('reset');
    const undoBtn = document.getElementById('undo');
    const customizeBtn = document.getElementById('customize');
    const customDoneBtn = document.getElementById('customDone');
    const hintBtn = document.getElementById('hint');
    const moveCountEl = document.getElementById('moveCount');
    const statusText = document.getElementById('statusText');

    let TOTAL_LEVELS;
    let successTimer = null;
    let isCustomizing = false;
    let hintMode = false;
    let hintPlan = null;
    let clickedHints = new Set(); // 记录已点击的提示位置

    /**
     * 关卡定义策略：
     * - 每一关使用 (rows, cols) 与随机步数 seed 生成一个“可解”状态：
     *   从全0状态开始，随机选择K个坐标执行翻转，得到目标初始盘面。
     * - K 随关卡递增，保证难度提升且必可解（用相同翻转序列即可复原）。
     */
    // 生成关卡：每个矩阵尺寸两关（先全灭、后随机），尺寸从 2x3 增至 12x12
    const baseSizes = [
        [2,3], [3,3], [3,4], [4,4], [4,5],
        [5,5], [5,6], [6,6], [6,7], [7,7],
        [7,8], [8,8], [8,9], [9,9], [10,10],
        [10,11], [11,11], [12,12], [12,13], [13,13],
        [13,14], [14,14], [14,15], [15,15], [15,16],
        [16,16], [16,17], [17,17], [17,18], [18,18],
        [18,19], [19,19], [19,20], [20,20], [20,21],
        [21,21], [21,22], [22,22], [22,23], [23,23]
    ];
    
    // 穿插特殊尺寸到常规关卡中
    const specialSizes = [
        // 行列相差2的3关
        [3,5], [4,6], [5,7],
        // 行列相差3的6关
        [3,6], [4,7], [5,8], [6,9], [7,10], [8,11],
        // 行列相差4的6关
        [3,7], [4,8], [5,9], [6,10], [7,11], [8,12]
    ];
    
    // 将特殊尺寸穿插到基础尺寸中
    const finalSizes = [];
    let specialIndex = 0;
    for (let i = 0; i < baseSizes.length; i++) {
        finalSizes.push(baseSizes[i]);
        // 每5个常规关卡后插入1个特殊关卡
        if ((i + 1) % 5 === 0 && specialIndex < specialSizes.length) {
            finalSizes.push(specialSizes[specialIndex]);
            specialIndex++;
        }
    }
    const levelConfigs = [];
    for (const [r, c] of finalSizes) {
        const rows = Math.min(23, r);
        const cols = Math.min(23, c);
        // 全灭一关
        levelConfigs.push({ rows, cols, moves: 0, mode: 'allOff' });
        // 随机初始一关：按面积的25%作为翻转步数上限
        const area = rows * cols;
        const moves = Math.max(1, Math.min(area, Math.round(area * 0.25)));
        levelConfigs.push({ rows, cols, moves, mode: 'random' });
    }
    TOTAL_LEVELS = levelConfigs.length;

    let currentLevelIndex = 0;
    let rows = levelConfigs[0].rows;
    let cols = levelConfigs[0].cols;
    let grid = createMatrix(rows, cols, 0);
    let moveCount = 0;
    let undoStack = [];
    let levelSeedMoves = [];
    const initialStates = Array(TOTAL_LEVELS).fill(null); // 缓存每关初始盘面

    init();

    function init() {
        // 填充下拉
        for (let i = 0; i < TOTAL_LEVELS; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `第 ${i + 1} 关`;
            levelSelect.appendChild(opt);
        }
        levelSelect.value = String(currentLevelIndex);

        // 事件绑定
        boardEl.addEventListener('click', onBoardClick);
        prevLevelBtn.addEventListener('click', () => switchLevel(currentLevelIndex - 1));
        nextLevelBtn.addEventListener('click', () => switchLevel(currentLevelIndex + 1));
        levelSelect.addEventListener('change', () => switchLevel(parseInt(levelSelect.value, 10)));
        // 尺寸与随机打乱按钮已移除
        resetBtn.addEventListener('click', () => generateLevel(currentLevelIndex, false));
        undoBtn.addEventListener('click', undoMove);

        // 自定义模式
        if (customizeBtn) customizeBtn.addEventListener('click', enterCustomizeMode);
        if (customDoneBtn) customDoneBtn.addEventListener('click', finishCustomizeMode);
        if (hintBtn) hintBtn.addEventListener('click', toggleHint);

        // 实时监听尺寸输入（仅在自定义模式生效）
        if (rowsInput) rowsInput.addEventListener('input', onSizeInputChange);
        if (colsInput) colsInput.addEventListener('input', onSizeInputChange);

        // 初始关卡
        generateLevel(0, false);
    }

    function createMatrix(r, c, fill = 0) {
        return Array.from({ length: r }, () => Array.from({ length: c }, () => fill));
    }

    function renderBoard() {
        boardEl.innerHTML = '';
        boardEl.style.setProperty('--rows', String(rows));
        boardEl.style.setProperty('--cols', String(cols));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('button');
                cell.className = 'fo-cell';
                cell.setAttribute('data-r', String(r));
                cell.setAttribute('data-c', String(c));
                cell.setAttribute('aria-label', `r${r + 1} c${c + 1}`);
                // 不显示0/1，仅通过样式表现亮灭
                if (grid[r][c] === 1) {
                    cell.classList.add('on');
                }
                // 提示模式：显示求解器建议的点击位置（未点击的）
                if (hintMode && hintPlan && hintPlan[r] && hintPlan[r][c] === 1) {
                    const hintKey = `${r},${c}`;
                    if (!clickedHints.has(hintKey)) {
                        cell.classList.add('hint');
                    }
                }
                boardEl.appendChild(cell);
            }
        }

        moveCountEl.textContent = String(moveCount);
        undoBtn.disabled = undoStack.length === 0;
        statusText.textContent = '';
    }

    function onBoardClick(e) {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains('fo-cell')) return;
        const r = parseInt(target.getAttribute('data-r'), 10);
        const c = parseInt(target.getAttribute('data-c'), 10);
        if (isCustomizing) {
            if (!inBounds(r, c)) return;
            grid[r][c] = grid[r][c] ^ 1; // 仅切换当前格
            renderBoard();
            return;
        }
        applyFlip(r, c, true);
        
        // 提示模式：记录已点击的提示位置
        if (hintMode && hintPlan && hintPlan[r] && hintPlan[r][c] === 1) {
            const hintKey = `${r},${c}`;
            clickedHints.add(hintKey);
            
            // 立即刷新，使当前格子的数字即时变化
            renderBoard();
        }
    }

    function applyFlip(r, c, recordHistory) {
        if (!inBounds(r, c)) return;
        const snapshot = deepClone(grid);
        flip(r, c);
        moveCount++;
        if (recordHistory) {
            undoStack.push(snapshot);
        }
        renderBoard();
        if (isAllOn()) {
            showSuccessModal();
        }
    }

    function flip(r, c) {
        const deltas = [ [0,0], [1,0], [-1,0], [0,1], [0,-1] ];
        for (const [dr, dc] of deltas) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
                grid[nr][nc] = grid[nr][nc] ^ 1;
            }
        }
    }

    function inBounds(r, c) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    function deepClone(mat) {
        return mat.map(row => row.slice());
    }

    function isAllOn() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] !== 1) return false;
            }
        }
        return true;
    }

    function undoMove() {
        if (undoStack.length === 0) return;
        const prev = undoStack.pop();
        grid = prev;
        moveCount--;
        renderBoard();
    }

    function switchLevel(nextIndex) {
        cancelSuccessTimer();
        if (isCustomizing) return; // 自定义中禁止切关
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= TOTAL_LEVELS) nextIndex = TOTAL_LEVELS - 1;
        currentLevelIndex = nextIndex;
        levelSelect.value = String(currentLevelIndex);
        generateLevel(currentLevelIndex, false);
    }

    function generateLevel(levelIndex, reshuffle) {
        cancelSuccessTimer();
        // 自定义进行中禁止切换
        if (isCustomizing) return;
        // 退出提示模式
        exitHintMode();
        const config = levelConfigs[levelIndex];
        rows = clamp(config.rows, 2, 100);
        cols = clamp(config.cols, 2, 100);
        if (rowsInput) rowsInput.value = String(rows);
        if (colsInput) colsInput.value = String(cols);

        // 若已缓存初始状态，则直接使用缓存，确保“重开本关”不变化
        if (initialStates[levelIndex]) {
            grid = deepClone(initialStates[levelIndex]);
            // 同步尺寸到缓存矩阵的维度
            rows = grid.length;
            cols = grid[0]?.length || 0;
            if (rowsInput) rowsInput.value = String(rows);
            if (colsInput) colsInput.value = String(cols);
        } else {
            if (config.mode === 'allOff') {
                grid = createMatrix(rows, cols, 0);
            } else {
                // 目标为全亮：从全亮出发随机翻转K步得到起始面（保证非全亮）
                const result = generateRandomInitial(rows, cols, config.moves);
                grid = result.grid;
                levelSeedMoves = result.moves;
            }
            initialStates[levelIndex] = deepClone(grid);
        }

        moveCount = 0;
        undoStack = [];
        renderBoard();
    }

    function enterCustomizeMode() {
        if (isCustomizing) return;
        isCustomizing = true;
        // 输入框启用并将上限设为100
        if (rowsInput) {
            rowsInput.disabled = false;
            rowsInput.max = '100';
        }
        if (colsInput) {
            colsInput.disabled = false;
            colsInput.max = '100';
        }
        // 显示“完成”按钮
        if (customDoneBtn) customDoneBtn.classList.remove('is-hidden');
        // 自定义开始时，重置步数与撤销
        moveCount = 0;
        undoStack = [];
        renderBoard();
    }

    function finishCustomizeMode() {
        if (!isCustomizing) return;
        isCustomizing = false;
        // 保存为本关初始状态，后续重开本关固定不变
        initialStates[currentLevelIndex] = deepClone(grid);
        // 关闭输入框
        if (rowsInput) rowsInput.disabled = true;
        if (colsInput) colsInput.disabled = true;
        // 隐藏“完成”按钮
        if (customDoneBtn) customDoneBtn.classList.add('is-hidden');
        // 同步关卡配置的尺寸，确保切关返回时基础尺寸合理
        levelConfigs[currentLevelIndex].rows = clamp(grid.length, 2, 100);
        levelConfigs[currentLevelIndex].cols = clamp(grid[0]?.length || 0, 2, 100);
        renderBoard();
    }

    function onSizeInputChange() {
        if (!isCustomizing) return;
        const rVal = clamp(parseInt(rowsInput.value || '0', 10) || 0, 2, 100);
        const cVal = clamp(parseInt(colsInput.value || '0', 10) || 0, 2, 100);
        if (rVal !== rows || cVal !== cols) {
            rows = rVal;
            cols = cVal;
            grid = createMatrix(rows, cols, 0); // 尺寸变化即刻重建为空盘
            moveCount = 0;
            undoStack = [];
            renderBoard();
        }
    }
    
    function showSuccessModal() {
        if (successTimer) {
            clearTimeout(successTimer);
            successTimer = null;
        }
        const modal = document.createElement('div');
        modal.className = 'success-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>通关成功</h3>
                <p>5 秒后自动进入下一关…</p>
                <div class="modal-buttons">
                    <button class="btn btn-primary" id="nextNow">立即下一关</button>
                    <button class="btn btn-secondary" id="closeModal">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const cleanup = () => {
            if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        };
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup();
        });
        modal.querySelector('#closeModal').addEventListener('click', cleanup);
        modal.querySelector('#nextNow').addEventListener('click', () => {
            cleanup();
            switchLevel(currentLevelIndex + 1);
        });

        successTimer = setTimeout(() => {
            cleanup();
            switchLevel(currentLevelIndex + 1);
        }, 5000);
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function cancelSuccessTimer() {
        if (successTimer) {
            clearTimeout(successTimer);
            successTimer = null;
        }
        const modal = document.querySelector('.success-modal');
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    function toggleHint() {
        if (isCustomizing) return;
        if (hintMode) {
            exitHintMode();
        } else {
            enterHintMode();
        }
    }

    function enterHintMode() {
        if (isCustomizing) return;
        try {
            // 将游戏状态转换为求解器期望的格式：灯亮=0，灯灭=1
            const solverInput = grid.map(row => row.map(cell => cell === 1 ? 0 : 1));
            const solver = new BinaryMatrixSolver(solverInput);
            const [minFlips, firstRowPath] = solver.solve();
            if (solver.hasSolution) {
                // 求解器返回的提示计划直接使用（已经是正确的点击位置）
                hintPlan = solver.fullPlan;
                hintMode = true;
                if (hintBtn) hintBtn.textContent = '隐藏提示';
                renderBoard();
                statusText.textContent = `最少需要 ${minFlips} 步`;
            } else {
                statusText.textContent = '此关卡无解';
            }
        } catch (error) {
            statusText.textContent = '求解失败: ' + error.message;
        }
    }

    function exitHintMode() {
        hintMode = false;
        hintPlan = null;
        clickedHints.clear(); // 清空已点击记录
        if (hintBtn) hintBtn.textContent = '提示';
        statusText.textContent = '';
        renderBoard();
    }

    // 生成随机初始盘面，避免重复坐标导致“仍为全亮”的退化情况
    function generateRandomInitial(r, c, moves) {
        const maxTries = 5;
        for (let attempt = 0; attempt < maxTries; attempt++) {
            // 从全亮开始
            const g = createMatrix(r, c, 1);
            const used = new Set();
            const seq = [];
            let steps = Math.max(1, Math.min(r * c, moves | 0));
            while (steps-- > 0) {
                // 去重采样，避免太多重复坐标抵消
                let rr, cc, key, guard = 0;
                do {
                    rr = Math.floor(Math.random() * r);
                    cc = Math.floor(Math.random() * c);
                    key = rr + ':' + cc;
                    guard++;
                    if (guard > 8) break; // 放宽去重，避免小盘死循环
                } while (used.has(key));
                used.add(key);
                seq.push([rr, cc]);
                // 应用十字翻转
                const deltas = [ [0,0], [1,0], [-1,0], [0,1], [0,-1] ];
                for (const [dr, dc] of deltas) {
                    const nr = rr + dr, nc = cc + dc;
                    if (nr >= 0 && nr < r && nc >= 0 && nc < c) {
                        g[nr][nc] = g[nr][nc] ^ 1;
                    }
                }
            }
            // 检测是否非全亮
            let allOnFlag = true;
            outer: for (let i = 0; i < r; i++) {
                for (let j = 0; j < c; j++) {
                    if (g[i][j] !== 1) { allOnFlag = false; break outer; }
                }
            }
            if (!allOnFlag) return { grid: g, moves: seq };
        }
        // 兜底：至少翻转(0,0)一次，确保不是全亮
        const fallback = createMatrix(r, c, 1);
        const deltas = [ [0,0], [1,0], [-1,0], [0,1], [0,-1] ];
        for (const [dr, dc] of deltas) {
            const nr = 0 + dr, nc = 0 + dc;
            if (nr >= 0 && nr < r && nc >= 0 && nc < c) {
                fallback[nr][nc] = fallback[nr][nc] ^ 1;
            }
        }
        return { grid: fallback, moves: [[0,0]] };
    }

})();
