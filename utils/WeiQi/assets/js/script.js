(() => {
    const canvas = document.getElementById('board');
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const ui = {
        status: document.getElementById('status'),
        moveCount: document.getElementById('moveCount'),
        blackCaptures: document.getElementById('blackCaptures'),
        whiteCaptures: document.getElementById('whiteCaptures'),
        currentPlayer: document.getElementById('currentPlayer'),
        lastMove: document.getElementById('lastMove'),
        aiHint: document.getElementById('aiHint'),
        tipText: document.getElementById('tipText'),
        newGameBtn: document.getElementById('newGameBtn'),
        undoBtn: document.getElementById('undoBtn'),
        passBtn: document.getElementById('passBtn'),
        hintBtn: document.getElementById('hintBtn'),
        difficultyInputs: document.querySelectorAll('input[name="difficulty"]'),
        boardSizeInputs: document.querySelectorAll('input[name="boardSize"]'),
        scoringMethodInputs: document.querySelectorAll('input[name="scoringMethod"]')
    };

    const config = {
        size: 9,
        komi: 6.5,
        scoringMethod: 'territory'
    };

    const state = {
        board: [],
        current: 1,
        human: 1,
        ai: 2,
        captures: { 1: 0, 2: 0 },
        koPoint: null,
        passCount: 0,
        moveCount: 0,
        lastMove: null,
        difficulty: 'easy',
        busy: false,
        gameOver: false,
        turnId: 0,
        history: [],
        hintUsed: 0,
        hintLimit: 3
    };

    const difficultyLabel = {
        easy: '简单',
        medium: '中等',
        hard: '困难'
    };

    let render = {
        size: 0,
        pad: 0,
        cell: 0
    };

    function init() {
        bindEvents();
        updateDifficultyUI();
        startNewGame();
        resizeCanvas();
        setupResizeListener();
    }

    function bindEvents() {
        canvas.addEventListener('click', onBoardClick);
        ui.newGameBtn.addEventListener('click', startNewGame);
        ui.undoBtn.addEventListener('click', undoMove);
        ui.passBtn.addEventListener('click', () => handlePass(state.human));
        ui.hintBtn.addEventListener('click', getHint);
        ui.difficultyInputs.forEach(input => {
            input.addEventListener('change', () => {
                state.difficulty = input.value;
                updateDifficultyUI();
            });
        });
        ui.boardSizeInputs.forEach(input => {
            input.addEventListener('change', () => {
                const size = Number.parseInt(input.value, 10);
                if (Number.isNaN(size)) {
                    return;
                }
                config.size = size;
                startNewGame();
                resizeCanvas();
                setStatus(`棋盘已切换为 ${size} 路，新对局开始。`, 'success');
            });
        });
        ui.scoringMethodInputs.forEach(input => {
            input.addEventListener('change', () => {
                config.scoringMethod = input.value;
                if (state.gameOver) {
                    const score = calculateScore();
                    const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
                    setStatus(`计分方式已切换，重新结算：黑 ${score.black.toFixed(1)} / 白 ${score.white.toFixed(1)}，${winner}。`, 'success');
                    ui.tipText.textContent = `${config.scoringMethod === 'territory' ? '数目法' : '数子法'}：黑领地 ${score.territory[1]}，白领地 ${score.territory[2]}，黑提子 ${state.captures[1]}，白提子 ${state.captures[2]}。`;
                } else {
                    const method = config.scoringMethod === 'territory' ? '数目法' : '数子法';
                    setStatus(`计分方式已切换为 ${method}。`, 'success');
                }
            });
        });
    }

    function setupResizeListener() {
        let timer = null;
        window.addEventListener('resize', () => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                resizeCanvas();
            }, 150);
        });
    }

    function updateDifficultyUI() {
        const label = difficultyLabel[state.difficulty] || '简单';
        ui.aiHint.textContent = `AI 难度：${label}`;
    }

    function startNewGame() {
        state.turnId += 1;
        state.board = createBoard(config.size);
        state.current = state.human;
        state.captures = { 1: 0, 2: 0 };
        state.koPoint = null;
        state.passCount = 0;
        state.moveCount = 0;
        state.lastMove = null;
        state.gameOver = false;
        state.busy = false;
        state.history = [];
        state.hintUsed = 0;
        setStatus('新对局开始，玩家执黑先行。', 'success');
        ui.tipText.textContent = '开局建议先占角，再向边与中央扩展。AI 会根据难度进行不同强度的落子选择。';
        updateUI();
        draw();
    }

    function createBoard(size) {
        return Array.from({ length: size }, () => Array(size).fill(0));
    }

    function cloneBoard(board) {
        return board.map(row => row.slice());
    }

    function onBoardClick(event) {
        if (state.gameOver || state.busy || state.current !== state.human) {
            return;
        }
        const point = getPointFromEvent(event);
        if (!point) {
            return;
        }
        const move = simulateMove(state.board, point.x, point.y, state.human, state.koPoint);
        if (!move) {
            setStatus('该位置无法落子，请尝试其他位置。', 'error');
            return;
        }
        applyMove(move, state.human);
        setStatus('AI 思考中...', 'success');
        scheduleAiMove();
    }

    function scheduleAiMove() {
        state.busy = true;
        const turnId = state.turnId;
        setTimeout(() => {
            if (state.turnId !== turnId || state.gameOver) {
                state.busy = false;
                return;
            }
            aiMove();
            state.busy = false;
        }, 420);
    }

    function handlePass(color) {
        if (state.gameOver || state.current !== color) {
            return;
        }
        if (state.busy && color === state.human) {
            return;
        }
        saveSnapshot();
        state.passCount += 1;
        state.moveCount += 1;
        state.lastMove = { pass: true, color };
        state.koPoint = null;
        const playerName = color === state.human ? '玩家' : 'AI';
        setStatus(`${playerName} 停一手。`, 'success');
        updateUI();
        draw();
        if (state.passCount >= 2) {
            endGame();
            return;
        }
        switchPlayer();
        if (state.current === state.ai) {
            setStatus('AI 思考中...', 'success');
            scheduleAiMove();
        } else {
            setStatus('轮到玩家落子。', 'success');
        }
    }

    function applyMove(move, color) {
        saveSnapshot();
        state.board = move.board;
        state.captures[color] += move.captured.length;
        state.koPoint = move.koPoint;
        state.lastMove = { x: move.x, y: move.y, color };
        state.moveCount += 1;
        state.passCount = 0;
        updateUI();
        draw();
        switchPlayer();
    }

    function switchPlayer() {
        state.current = state.current === 1 ? 2 : 1;
        updateUI();
    }

    function aiMove() {
        if (state.gameOver || state.current !== state.ai) {
            return;
        }
        const moves = getLegalMoves(state.board, state.ai, state.koPoint);
        if (moves.length === 0) {
            handlePass(state.ai);
            return;
        }
        const move = chooseAiMove(moves);
        if (!move) {
            handlePass(state.ai);
            return;
        }
        applyMove(move, state.ai);
        setStatus('轮到玩家落子。', 'success');
    }

    function chooseAiMove(moves) {
        if (state.difficulty === 'easy') {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        if (state.difficulty === 'medium') {
            return pickBestMove(moves, state.ai);
        }

        let bestMove = null;
        let bestScore = -Infinity;
        moves.forEach(move => {
            const baseScore = scoreMove(move, state.ai);
            const opponentMoves = getLegalMoves(move.board, state.human, move.koPoint);
            let opponentBest = 0;
            if (opponentMoves.length > 0) {
                opponentBest = pickBestMove(opponentMoves, state.human).score;
            }
            const totalScore = baseScore - opponentBest * 0.7;
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestMove = move;
            }
        });
        return bestMove || moves[Math.floor(Math.random() * moves.length)];
    }

    function pickBestMove(moves, color) {
        let bestScore = -Infinity;
        let bestMoves = [];
        moves.forEach(move => {
            const score = scoreMove(move, color);
            move.score = score;
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (score === bestScore) {
                bestMoves.push(move);
            }
        });
        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    function scoreMove(move, color) {
        const opponent = color === 1 ? 2 : 1;
        const group = getGroup(move.board, move.x, move.y);
        const liberties = group.liberties.size;
        const oppAtari = countGroupsInAtari(move.board, opponent);
        const adjacent = countAdjacent(move.board, move.x, move.y, color);
        const centerScore = centerBias(move.x, move.y);
        const selfAtariPenalty = liberties === 1 ? 4 : 0;
        return move.captured.length * 8
            + oppAtari * 2
            + adjacent * 0.6
            + liberties * 0.2
            - selfAtariPenalty
            + centerScore;
    }

    function centerBias(x, y) {
        const center = (config.size - 1) / 2;
        const dist = Math.abs(x - center) + Math.abs(y - center);
        return (config.size - dist) * 0.15;
    }

    function countAdjacent(board, x, y, color) {
        return getNeighbors(x, y, config.size)
            .filter(p => board[p.y][p.x] === color).length;
    }

    function getLegalMoves(board, color, koPoint) {
        const moves = [];
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                if (board[y][x] !== 0) {
                    continue;
                }
                const move = simulateMove(board, x, y, color, koPoint);
                if (move) {
                    moves.push(move);
                }
            }
        }
        return moves;
    }

    function simulateMove(board, x, y, color, koPoint) {
        if (board[y][x] !== 0) {
            return null;
        }
        if (koPoint && koPoint.x === x && koPoint.y === y) {
            return null;
        }
        const next = cloneBoard(board);
        next[y][x] = color;
        const opponent = color === 1 ? 2 : 1;
        const captured = [];
        const seen = new Set();

        getNeighbors(x, y, config.size).forEach(p => {
            if (next[p.y][p.x] !== opponent) {
                return;
            }
            const key = `${p.x},${p.y}`;
            if (seen.has(key)) {
                return;
            }
            const group = getGroup(next, p.x, p.y);
            group.stones.forEach(stone => seen.add(`${stone.x},${stone.y}`));
            if (group.liberties.size === 0) {
                group.stones.forEach(stone => {
                    next[stone.y][stone.x] = 0;
                    captured.push(stone);
                });
            }
        });

        const selfGroup = getGroup(next, x, y);
        if (selfGroup.liberties.size === 0) {
            return null;
        }

        let newKo = null;
        if (captured.length === 1 && selfGroup.liberties.size === 1) {
            newKo = { x: captured[0].x, y: captured[0].y };
        }

        return {
            x,
            y,
            board: next,
            captured,
            koPoint: newKo
        };
    }

    function getNeighbors(x, y, size) {
        const neighbors = [];
        if (x > 0) neighbors.push({ x: x - 1, y });
        if (x < size - 1) neighbors.push({ x: x + 1, y });
        if (y > 0) neighbors.push({ x, y: y - 1 });
        if (y < size - 1) neighbors.push({ x, y: y + 1 });
        return neighbors;
    }

    function getGroup(board, x, y) {
        const color = board[y][x];
        const stack = [{ x, y }];
        const visited = new Set([`${x},${y}`]);
        const stones = [];
        const liberties = new Set();

        while (stack.length) {
            const point = stack.pop();
            stones.push(point);
            getNeighbors(point.x, point.y, config.size).forEach(n => {
                const value = board[n.y][n.x];
                if (value === 0) {
                    liberties.add(`${n.x},${n.y}`);
                    return;
                }
                if (value === color) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        stack.push(n);
                    }
                }
            });
        }

        return { stones, liberties };
    }

    function countGroupsInAtari(board, color) {
        const visited = new Set();
        let count = 0;
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                if (board[y][x] !== color) {
                    continue;
                }
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }
                const group = getGroup(board, x, y);
                group.stones.forEach(stone => visited.add(`${stone.x},${stone.y}`));
                if (group.liberties.size === 1) {
                    count += 1;
                }
            }
        }
        return count;
    }

    function updateUI() {
        ui.blackCaptures.textContent = state.captures[1];
        ui.whiteCaptures.textContent = state.captures[2];
        ui.currentPlayer.textContent = state.current === 1 ? '黑' : '白';
        ui.moveCount.textContent = `步数 ${state.moveCount}`;
        if (!state.lastMove) {
            ui.lastMove.textContent = '-';
        } else if (state.lastMove.pass) {
            ui.lastMove.textContent = `${state.lastMove.color === 1 ? '黑' : '白'} 停一手`;
        } else {
            ui.lastMove.textContent = formatCoord(state.lastMove.x, state.lastMove.y);
        }
    }

    function setStatus(text, type) {
        ui.status.textContent = text;
        ui.status.classList.remove('success', 'error');
        ui.status.classList.add(type);
    }

    function formatCoord(x, y) {
        const letters = 'ABCDEFGHJKLMNOPQRST';
        const col = letters[x] || `${x + 1}`;
        const row = config.size - y;
        return `${col}${row}`;
    }

    function endGame() {
        state.gameOver = true;
        const score = calculateScore();
        const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
        setStatus(`终局：黑 ${score.black.toFixed(1)} / 白 ${score.white.toFixed(1)}，${winner}。`, 'success');
        ui.tipText.textContent = `终局统计：黑领地 ${score.territory[1]}，白领地 ${score.territory[2]}，黑提子 ${state.captures[1]}，白提子 ${state.captures[2]}。`;
        updateUI();
    }

    function getHint() {
        if (state.gameOver) {
            setStatus('对局已结束，无法获取提示。', 'error');
            return;
        }
        if (state.current !== state.human) {
            setStatus('轮到 AI 落子，暂不需要提示。', 'error');
            return;
        }
        if (state.hintUsed >= state.hintLimit) {
            setStatus(`提示次数已用完，本局限制 ${state.hintLimit} 次。`, 'error');
            return;
        }
        const moves = getLegalMoves(state.board, state.human, state.koPoint);
        if (moves.length === 0) {
            setStatus('没有可落的位置，请停一手。', 'error');
            return;
        }
        const bestMove = pickBestMove(moves, state.human);
        state.hintUsed += 1;
        const coord = formatCoord(bestMove.x, bestMove.y);
        ui.tipText.textContent = `推荐落子位置：${coord}（已用 ${state.hintUsed}/${state.hintLimit} 次提示）`;
        setStatus(`获得提示：建议在 ${coord} 位落子。`, 'success');
        highlightHintPosition(bestMove.x, bestMove.y);
        setTimeout(() => {
            clearHintHighlight();
            draw();
        }, 2000);
    }

    function highlightHintPosition(x, y) {
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.4;
        const cx = pad + x * cell;
        const cy = pad + y * cell;
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    function clearHintHighlight() {
        draw();
    }

    function saveSnapshot() {
        state.history.push({
            board: cloneBoard(state.board),
            current: state.current,
            captures: { 1: state.captures[1], 2: state.captures[2] },
            koPoint: state.koPoint ? { x: state.koPoint.x, y: state.koPoint.y } : null,
            passCount: state.passCount,
            moveCount: state.moveCount,
            lastMove: state.lastMove ? { ...state.lastMove } : null,
            gameOver: state.gameOver
        });
    }

    function restoreSnapshot(snapshot) {
        state.board = cloneBoard(snapshot.board);
        state.current = snapshot.current;
        state.captures = { 1: snapshot.captures[1], 2: snapshot.captures[2] };
        state.koPoint = snapshot.koPoint ? { x: snapshot.koPoint.x, y: snapshot.koPoint.y } : null;
        state.passCount = snapshot.passCount;
        state.moveCount = snapshot.moveCount;
        state.lastMove = snapshot.lastMove ? { ...snapshot.lastMove } : null;
        state.gameOver = snapshot.gameOver;
    }

    function undoMove() {
        if (!state.history.length) {
            setStatus('暂无可回退的步。', 'error');
            return;
        }
        state.turnId += 1;
        state.busy = false;
        let steps = 1;
        if (state.lastMove && state.lastMove.color === state.ai && state.history.length >= 2) {
            steps = 2;
        }
        let snapshot = null;
        for (let i = 0; i < steps; i += 1) {
            snapshot = state.history.pop();
            if (!snapshot) {
                break;
            }
        }
        if (!snapshot) {
            setStatus('暂无可回退的步。', 'error');
            return;
        }
        restoreSnapshot(snapshot);
        updateUI();
        draw();
        if (state.current === state.human) {
            setStatus('已回退，轮到玩家落子。', 'success');
        } else {
            setStatus('已回退，轮到 AI 落子。', 'success');
        }
    }

    function calculateScore() {
        const visited = new Set();
        const territory = { 1: 0, 2: 0 };
        const stones = { 1: 0, 2: 0 };

        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (value === 1) stones[1] += 1;
                if (value === 2) stones[2] += 1;
                if (value !== 0) {
                    continue;
                }
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }
                const region = floodFillEmpty(state.board, x, y);
                region.cells.forEach(cell => visited.add(`${cell.x},${cell.y}`));
                if (region.borders.size === 1) {
                    const owner = [...region.borders][0];
                    territory[owner] += region.cells.length;
                }
            }
        }

        let blackScore, whiteScore;
        if (config.scoringMethod === 'territory') {
            blackScore = territory[1] + state.captures[1];
            whiteScore = territory[2] + state.captures[2] + config.komi;
        } else {
            blackScore = stones[1] + state.captures[1];
            whiteScore = stones[2] + state.captures[2] + config.komi;
        }

        return {
            territory,
            stones,
            black: blackScore,
            white: whiteScore
        };
    }

    function floodFillEmpty(board, startX, startY) {
        const queue = [{ x: startX, y: startY }];
        const cells = [];
        const borders = new Set();
        const visited = new Set([`${startX},${startY}`]);

        while (queue.length) {
            const point = queue.pop();
            cells.push(point);
            getNeighbors(point.x, point.y, config.size).forEach(n => {
                const value = board[n.y][n.x];
                if (value === 0) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push(n);
                    }
                } else {
                    borders.add(value);
                }
            });
        }
        return { cells, borders };
    }

    function resizeCanvas() {
        const container = canvas.parentElement;
        const maxSize = 560;
        const available = container ? container.clientWidth - 16 : maxSize;
        const cssSize = Math.max(260, Math.min(maxSize, available));
        const dpr = window.devicePixelRatio || 1;

        canvas.style.width = `${cssSize}px`;
        canvas.style.height = `${cssSize}px`;
        canvas.width = Math.floor(cssSize * dpr);
        canvas.height = Math.floor(cssSize * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const pad = Math.round(cssSize * 0.08);
        render = {
            size: cssSize,
            pad,
            cell: (cssSize - pad * 2) / (config.size - 1)
        };

        draw();
    }

    function getPointFromEvent(event) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const col = Math.round((x - render.pad) / render.cell);
        const row = Math.round((y - render.pad) / render.cell);
        if (col < 0 || col >= config.size || row < 0 || row >= config.size) {
            return null;
        }
        const ix = render.pad + col * render.cell;
        const iy = render.pad + row * render.cell;
        const dist = Math.hypot(ix - x, iy - y);
        if (dist > render.cell * 0.45) {
            return null;
        }
        return { x: col, y: row };
    }

    function draw() {
        if (!render.size) {
            return;
        }
        drawBoard();
        drawStones();
        drawLastMove();
    }

    function drawBoard() {
        const size = render.size;
        const pad = render.pad;
        const cell = render.cell;

        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, '#d9b47d');
        gradient.addColorStop(1, '#caa06a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = 'rgba(20, 20, 20, 0.6)';
        ctx.lineWidth = 1;

        for (let i = 0; i < config.size; i += 1) {
            const pos = pad + i * cell;
            ctx.beginPath();
            ctx.moveTo(pad, pos);
            ctx.lineTo(size - pad, pos);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(pos, pad);
            ctx.lineTo(pos, size - pad);
            ctx.stroke();
        }

        const starPoints = getStarPoints(config.size);
        ctx.fillStyle = 'rgba(20, 20, 20, 0.8)';
        starPoints.forEach(point => {
            const cx = pad + point.x * cell;
            const cy = pad + point.y * cell;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(2.5, cell * 0.12), 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawStones() {
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.45;

        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (!value) {
                    continue;
                }
                const cx = pad + x * cell;
                const cy = pad + y * cell;
                const gradient = ctx.createRadialGradient(
                    cx - radius * 0.35,
                    cy - radius * 0.35,
                    radius * 0.2,
                    cx,
                    cy,
                    radius
                );
                if (value === 1) {
                    gradient.addColorStop(0, '#555');
                    gradient.addColorStop(1, '#0b0b0b');
                } else {
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(1, '#d6d6d6');
                }
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    function drawLastMove() {
        if (!state.lastMove || state.lastMove.pass) {
            return;
        }
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.18;
        const cx = pad + state.lastMove.x * cell;
        const cy = pad + state.lastMove.y * cell;
        ctx.strokeStyle = state.lastMove.color === 1 ? '#f2f2f2' : '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    function getStarPoints(size) {
        if (size === 9) {
            return [
                { x: 2, y: 2 },
                { x: 2, y: 6 },
                { x: 6, y: 2 },
                { x: 6, y: 6 },
                { x: 4, y: 4 }
            ];
        }
        if (size === 13) {
            return [
                { x: 3, y: 3 },
                { x: 3, y: 9 },
                { x: 9, y: 3 },
                { x: 9, y: 9 },
                { x: 6, y: 6 }
            ];
        }
        return [
            { x: 3, y: 3 },
            { x: 3, y: 9 },
            { x: 3, y: 15 },
            { x: 9, y: 3 },
            { x: 9, y: 9 },
            { x: 9, y: 15 },
            { x: 15, y: 3 },
            { x: 15, y: 9 },
            { x: 15, y: 15 }
        ];
    }

    init();
})();
