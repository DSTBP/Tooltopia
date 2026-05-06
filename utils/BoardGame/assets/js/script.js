(() => {
    const refs = {
        board: document.getElementById('board'),
        gameList: document.getElementById('gameList'),
        gameTitle: document.getElementById('gameTitle'),
        gameSummary: document.getElementById('gameSummary'),
        currentPlayer: document.getElementById('currentPlayer'),
        legalCount: document.getElementById('legalCount'),
        moveCount: document.getElementById('moveCount'),
        gameStatus: document.getElementById('gameStatus'),
        hintBox: document.getElementById('hintBox'),
        resetBtn: document.getElementById('resetBtn'),
        undoBtn: document.getElementById('undoBtn'),
        hintBtn: document.getElementById('hintBtn'),
        boardSizeInput: document.getElementById('boardSizeInput'),
        applySizeBtn: document.getElementById('applySizeBtn'),
        modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
        aiPlayerSelect: document.getElementById('aiPlayerSelect'),
        aiDifficultySelect: document.getElementById('aiDifficultySelect'),
        aiStatus: document.getElementById('aiStatus'),
        gameMeta: document.getElementById('gameMeta'),
        analysisPanel: document.getElementById('analysisPanel'),
        moveLog: document.getElementById('moveLog'),
        logCount: document.getElementById('logCount')
    };

    const app = {
        game: null,
        state: null,
        history: [],
        hintIndex: null,
        hintText: '',
        mode: 'multi',
        aiPlayer: null,
        aiDifficulty: 'medium',
        aiTimer: null,
        aiThinking: false,
        qawaleDraft: null,
        reversiFlipAnimation: null,
        reversiFlipTimer: null
    };

    const GOMOKU_DIRECTIONS = [
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];

    const REVERSI_DIRECTIONS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    const QAWALE_DIRECTIONS = [
        [-1, 0], [1, 0], [0, -1], [0, 1]
    ];

    function cloneState(state) {
        return {
            board: state.board.slice(),
            current: state.current,
            winner: state.winner,
            ended: state.ended,
            moveCount: state.moveCount,
            moves: state.moves.map(move => ({ ...move })),
            winLine: state.winLine ? state.winLine.slice() : [],
            passMessage: state.passMessage || '',
            scores: state.scores ? { ...state.scores } : undefined,
            players: state.players
                ? Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, { ...player }]))
                : undefined,
            hWalls: state.hWalls ? state.hWalls.slice() : undefined,
            vWalls: state.vWalls ? state.vWalls.slice() : undefined,
            qawaleStacks: state.qawaleStacks ? state.qawaleStacks.map(stack => stack.slice()) : undefined,
            piecesLeft: state.piecesLeft ? { ...state.piecesLeft } : undefined
        };
    }

    function otherPlayer(game, player) {
        const next = game.players.find(item => item.id !== player);
        return next ? next.id : player;
    }

    function playerInfo(game, player) {
        return game.players.find(item => item.id === player) || game.players[0];
    }

    function formatPosition(index, columns) {
        const row = Math.floor(index / columns) + 1;
        const col = (index % columns) + 1;
        return `R${row} C${col}`;
    }

    function moveIndex(move) {
        return typeof move === 'number' ? move : move.index;
    }

    function createBaseState(total, firstPlayer) {
        return {
            board: Array(total).fill(null),
            current: firstPlayer,
            winner: null,
            ended: false,
            moveCount: 0,
            moves: [],
            winLine: [],
            passMessage: ''
        };
    }

    function boardTotal(game) {
        return game.rows * game.columns;
    }

    function setGameSize(game, size) {
        game.rows = size;
        game.columns = size;
        game.tag = `${size} x ${size}`;
    }

    function normalizeBoardSize(game, value) {
        const min = game.minSize || game.rows;
        const max = game.maxSize || game.rows;
        let size = Number.parseInt(value, 10);
        if (!Number.isFinite(size)) size = game.rows;
        size = Math.max(min, Math.min(max, size));
        if (game.sizeStep === 2 && size % 2 !== 0) {
            size = size >= max ? size - 1 : size + 1;
        }
        return size;
    }

    function syncSizeControl() {
        refs.boardSizeInput.min = app.game.minSize;
        refs.boardSizeInput.max = app.game.maxSize;
        refs.boardSizeInput.step = app.game.sizeStep || 1;
        refs.boardSizeInput.value = app.game.rows;
    }

    function isSinglePlayer() {
        return app.mode === 'single';
    }

    function isAiTurn() {
        return isSinglePlayer() && app.state && !app.state.ended && app.state.current === app.aiPlayer;
    }

    function clearAiTimer() {
        if (app.aiTimer) {
            window.clearTimeout(app.aiTimer);
            app.aiTimer = null;
        }
    }

    function clearReversiFlipAnimation() {
        if (app.reversiFlipTimer) {
            window.clearTimeout(app.reversiFlipTimer);
            app.reversiFlipTimer = null;
        }
        app.reversiFlipAnimation = null;
    }

    function setReversiFlipAnimation(flips) {
        clearReversiFlipAnimation();
        if (!flips.length) return;
        const key = Date.now();
        app.reversiFlipAnimation = { key, flips };
        app.reversiFlipTimer = window.setTimeout(() => {
            if (app.reversiFlipAnimation && app.reversiFlipAnimation.key === key) {
                app.reversiFlipAnimation = null;
                app.reversiFlipTimer = null;
                if (app.game && app.game.id === 'reversi') renderBoard();
            }
        }, 680);
    }

    function setMode(mode) {
        app.mode = mode === 'single' ? 'single' : 'multi';
        refs.modeButtons.forEach(button => {
            const active = button.dataset.mode === app.mode;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        refs.aiPlayerSelect.disabled = !isSinglePlayer();
        refs.aiDifficultySelect.disabled = !isSinglePlayer();
        app.hintIndex = null;
        app.hintText = '';
        app.aiThinking = false;
        app.qawaleDraft = null;
        clearReversiFlipAnimation();
        clearAiTimer();
        refresh();
        scheduleAiMove();
    }

    function syncAiPlayerOptions() {
        refs.aiPlayerSelect.innerHTML = '';
        app.game.players.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.label;
            refs.aiPlayerSelect.appendChild(option);
        });
        const fallback = app.game.players[1] || app.game.players[0];
        if (!app.aiPlayer || !app.game.players.some(player => player.id === app.aiPlayer)) {
            app.aiPlayer = fallback.id;
        }
        refs.aiPlayerSelect.value = app.aiPlayer;
        refs.aiPlayerSelect.disabled = !isSinglePlayer();
        refs.aiDifficultySelect.value = app.aiDifficulty;
        refs.aiDifficultySelect.disabled = !isSinglePlayer();
    }

    function aiLabel() {
        return playerInfo(app.game, app.aiPlayer).label;
    }

    function aiDifficultyLabel() {
        const labels = {
            beginner: '入门',
            easy: '简单',
            medium: '中等',
            hard: '困难'
        };
        return labels[app.aiDifficulty] || labels.medium;
    }

    function getEmptyMoves(state) {
        if (state.ended) return [];
        return state.board.reduce((moves, value, index) => {
            if (!value) moves.push(index);
            return moves;
        }, []);
    }

    function findSquareWinLine(board, player, size, target) {
        for (let index = 0; index < board.length; index += 1) {
            if (board[index] !== player) continue;
            const line = findGomokuLine(board, index, player, size, target);
            if (line.length) return line;
        }
        return [];
    }

    function getTicTacToeHint(game, state) {
        const legalMoves = getEmptyMoves(state);
        const current = state.current;
        const opponent = current === 'x' ? 'o' : 'x';
        const size = game.rows;
        const target = game.winLength;

        for (const index of legalMoves) {
            const board = state.board.slice();
            board[index] = current;
            if (findSquareWinLine(board, current, size, target).length) {
                return { index, text: `建议落在 ${formatPosition(index, size)}，可立即完成三连。` };
            }
        }

        for (const index of legalMoves) {
            const board = state.board.slice();
            board[index] = opponent;
            if (findSquareWinLine(board, opponent, size, target).length) {
                return { index, text: `建议落在 ${formatPosition(index, size)}，阻止对手下一手获胜。` };
            }
        }

        const center = (size - 1) / 2;
        const index = legalMoves.slice().sort((a, b) => {
            const rowA = Math.floor(a / size);
            const colA = a % size;
            const rowB = Math.floor(b / size);
            const colB = b % size;
            return Math.abs(rowA - center) + Math.abs(colA - center) - Math.abs(rowB - center) - Math.abs(colB - center);
        })[0];
        return index === undefined ? null : { index, text: `建议落在 ${formatPosition(index, size)}，优先控制中心区域。` };
    }

    function collectLine(board, size, row, col, player, dr, dc) {
        const cells = [];
        let nextRow = row + dr;
        let nextCol = col + dc;
        while (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
            const index = nextRow * size + nextCol;
            if (board[index] !== player) break;
            cells.push(index);
            nextRow += dr;
            nextCol += dc;
        }
        return cells;
    }

    function findGomokuLine(board, index, player, size, target) {
        const row = Math.floor(index / size);
        const col = index % size;
        for (const [dr, dc] of GOMOKU_DIRECTIONS) {
            const before = collectLine(board, size, row, col, player, -dr, -dc).reverse();
            const after = collectLine(board, size, row, col, player, dr, dc);
            const line = before.concat(index, after);
            if (line.length >= target) return line;
        }
        return [];
    }

    function scanGomokuPattern(board, index, player, size, dr, dc) {
        const row = Math.floor(index / size);
        const col = index % size;
        let count = 1;
        let openEnds = 0;

        let nextRow = row + dr;
        let nextCol = col + dc;
        while (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size && board[nextRow * size + nextCol] === player) {
            count += 1;
            nextRow += dr;
            nextCol += dc;
        }
        if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size && !board[nextRow * size + nextCol]) {
            openEnds += 1;
        }

        nextRow = row - dr;
        nextCol = col - dc;
        while (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size && board[nextRow * size + nextCol] === player) {
            count += 1;
            nextRow -= dr;
            nextCol -= dc;
        }
        if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size && !board[nextRow * size + nextCol]) {
            openEnds += 1;
        }

        return { count, openEnds };
    }

    function scoreGomokuPattern(pattern) {
        if (pattern.count >= 5) return 1000000;
        if (pattern.count === 4 && pattern.openEnds === 2) return 130000;
        if (pattern.count === 4 && pattern.openEnds === 1) return 32000;
        if (pattern.count === 3 && pattern.openEnds === 2) return 9000;
        if (pattern.count === 3 && pattern.openEnds === 1) return 1700;
        if (pattern.count === 2 && pattern.openEnds === 2) return 700;
        if (pattern.count === 2 && pattern.openEnds === 1) return 160;
        return pattern.openEnds * 20 + pattern.count * 10;
    }

    function scoreGomokuMove(state, index, player, size) {
        if (state.board[index]) return -Infinity;
        const row = Math.floor(index / size);
        const col = index % size;
        const center = (size - 1) / 2;
        const centerBonus = Math.max(0, size - Math.abs(row - center) - Math.abs(col - center));
        return GOMOKU_DIRECTIONS.reduce((score, [dr, dc]) => {
            return score + scoreGomokuPattern(scanGomokuPattern(state.board, index, player, size, dr, dc));
        }, centerBonus);
    }

    function getGomokuHint(game, state) {
        const legalMoves = getEmptyMoves(state);
        if (!legalMoves.length) return null;

        const current = state.current;
        const opponent = otherPlayer(game, current);
        let best = null;

        for (const index of legalMoves) {
            const attack = scoreGomokuMove(state, index, current, game.rows);
            const defense = scoreGomokuMove(state, index, opponent, game.rows) * 0.96;
            const score = Math.max(attack, defense);
            if (!best || score > best.score) {
                best = { index, score, attack, defense };
            }
        }

        const reason = best.attack >= 1000000
            ? '可直接连成五子。'
            : best.defense >= 960000
                ? '需要立即封堵对手五连。'
                : best.attack >= best.defense
                    ? '该点能提升己方连续棋形。'
                    : '该点能压制对手最强方向。';

        return { index: best.index, text: `建议落在 ${formatPosition(best.index, game.columns)}，${reason}` };
    }

    function collectReversiFlips(board, index, player, size) {
        if (board[index]) return [];
        const opponent = player === 'black' ? 'white' : 'black';
        const flips = [];
        const row = Math.floor(index / size);
        const col = index % size;

        for (const [dr, dc] of REVERSI_DIRECTIONS) {
            const line = [];
            let nextRow = row + dr;
            let nextCol = col + dc;
            while (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
                const nextIndex = nextRow * size + nextCol;
                if (board[nextIndex] === opponent) {
                    line.push(nextIndex);
                    nextRow += dr;
                    nextCol += dc;
                    continue;
                }
                if (board[nextIndex] === player && line.length) {
                    flips.push(...line);
                }
                break;
            }
        }

        return flips;
    }

    function getReversiMovesFromBoard(board, player, size) {
        const moves = [];
        for (let index = 0; index < board.length; index += 1) {
            if (board[index]) continue;
            const flips = collectReversiFlips(board, index, player, size);
            if (flips.length) moves.push({ index, flips });
        }
        return moves;
    }

    function countReversi(board) {
        return board.reduce((scores, value) => {
            if (value === 'black') scores.black += 1;
            if (value === 'white') scores.white += 1;
            return scores;
        }, { black: 0, white: 0 });
    }

    function getReversiHint(game, state) {
        const size = game.rows;
        const legalMoves = getReversiMovesFromBoard(state.board, state.current, size);
        if (!legalMoves.length) return null;
        const corners = new Set([0, size - 1, size * (size - 1), size * size - 1]);
        const danger = new Set([size + 1, size * 2 - 2, size * (size - 2) + 1, size * (size - 1) - 2]);
        const edge = index => {
            const row = Math.floor(index / size);
            const col = index % size;
            return row === 0 || row === size - 1 || col === 0 || col === size - 1;
        };
        const opponent = state.current === 'black' ? 'white' : 'black';
        let best = null;

        for (const move of legalMoves) {
            const nextBoard = state.board.slice();
            nextBoard[move.index] = state.current;
            move.flips.forEach(index => { nextBoard[index] = state.current; });
            const opponentMobility = getReversiMovesFromBoard(nextBoard, opponent, size).length;
            let score = move.flips.length * 8 - opponentMobility * 1.4;
            if (corners.has(move.index)) score += 120;
            if (edge(move.index)) score += 16;
            if (danger.has(move.index)) score -= 45;
            if (!best || score > best.score) best = { ...move, score, opponentMobility };
        }

        const reason = corners.has(best.index)
            ? '角位稳定性最高。'
            : best.flips.length >= 4
                ? `可以翻转 ${best.flips.length} 子并压缩对手选择。`
                : `对手后续合法点约 ${best.opponentMobility} 个，局面较稳。`;
        return { index: best.index, text: `建议落在 ${formatPosition(best.index, size)}，${reason}` };
    }

    function qawaleTop(stack) {
        return stack.length ? stack[stack.length - 1] : null;
    }

    function qawaleSyncBoard(state) {
        state.board = state.qawaleStacks.map(qawaleTop);
        return state;
    }

    function qawaleInitialStacks() {
        return Array.from({ length: 16 }, (_, index) => [0, 3, 12, 15].includes(index) ? ['neutral', 'neutral'] : []);
    }

    function qawaleMoveKey(placeIndex, path) {
        return `qawale:${placeIndex}:${path.join('-')}`;
    }

    function qawaleMoveText(game, move) {
        return `${formatPosition(move.placeIndex, game.columns)} → ${move.path.map(index => formatPosition(index, game.columns)).join(' → ')}`;
    }

    function getQawalePlacements(state) {
        if (state.ended || !state.piecesLeft[state.current]) return [];
        return state.qawaleStacks.reduce((moves, stack, index) => {
            if (stack.length) moves.push({ type: 'qawale-place', index, placeIndex: index });
            return moves;
        }, []);
    }

    function getQawaleNextSteps(game, currentIndex, previousIndex) {
        const row = Math.floor(currentIndex / game.columns);
        const col = currentIndex % game.columns;
        const moves = [];
        for (const [dr, dc] of QAWALE_DIRECTIONS) {
            const nextRow = row + dr;
            const nextCol = col + dc;
            if (nextRow < 0 || nextRow >= game.rows || nextCol < 0 || nextCol >= game.columns) continue;
            const index = nextRow * game.columns + nextCol;
            if (previousIndex !== null && index === previousIndex) continue;
            moves.push(index);
        }
        return moves;
    }

    function buildQawaleMove(placeIndex, path) {
        return { type: 'qawale', index: qawaleMoveKey(placeIndex, path), placeIndex, path: path.slice() };
    }

    function enumerateQawalePaths(game, length, currentIndex, previousIndex, path, output, limit) {
        if (output.length >= limit) return;
        if (path.length === length) {
            output.push(path.slice());
            return;
        }
        getQawaleNextSteps(game, currentIndex, previousIndex).forEach(index => {
            path.push(index);
            enumerateQawalePaths(game, length, index, currentIndex, path, output, limit);
            path.pop();
        });
    }

    function getQawaleAiMoves(game, state, options = {}) {
        const limit = options.limit || 5000;
        const moves = [];
        for (const placement of getQawalePlacements(state)) {
            const length = state.qawaleStacks[placement.placeIndex].length + 1;
            const paths = [];
            enumerateQawalePaths(game, length, placement.placeIndex, null, [], paths, Math.max(1, limit - moves.length));
            paths.forEach(path => moves.push(buildQawaleMove(placement.placeIndex, path)));
            if (moves.length >= limit) break;
        }
        return moves;
    }

    function isLegalQawaleMove(game, state, move) {
        if (!move || move.type !== 'qawale' || state.ended || !state.piecesLeft[state.current]) return false;
        const stack = state.qawaleStacks[move.placeIndex];
        if (!stack || !stack.length) return false;
        if (!Array.isArray(move.path) || move.path.length !== stack.length + 1) return false;
        let currentIndex = move.placeIndex;
        let previousIndex = null;
        for (const index of move.path) {
            if (!getQawaleNextSteps(game, currentIndex, previousIndex).includes(index)) return false;
            previousIndex = currentIndex;
            currentIndex = index;
        }
        return true;
    }

    function findQawaleWinLine(board, player, size) {
        for (const [dr, dc] of GOMOKU_DIRECTIONS) {
            for (let row = 0; row < size; row += 1) {
                for (let col = 0; col < size; col += 1) {
                    const endRow = row + dr * 3;
                    const endCol = col + dc * 3;
                    if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
                    const line = [];
                    for (let step = 0; step < 4; step += 1) {
                        line.push((row + dr * step) * size + col + dc * step);
                    }
                    if (line.every(index => board[index] === player)) return line;
                }
            }
        }
        return [];
    }

    function applyQawaleMove(game, state, move) {
        const player = state.current;
        const next = cloneState(state);
        const movingStack = next.qawaleStacks[move.placeIndex].slice();
        movingStack.push(player);
        next.qawaleStacks[move.placeIndex] = [];
        move.path.forEach(index => {
            const stone = movingStack.shift();
            next.qawaleStacks[index].push(stone);
        });
        next.piecesLeft[player] -= 1;
        next.moveCount += 1;
        next.passMessage = '';
        qawaleSyncBoard(next);
        const opponent = otherPlayer(game, player);
        const line = findQawaleWinLine(next.board, player, game.rows);
        const opponentLine = line.length ? [] : findQawaleWinLine(next.board, opponent, game.rows);
        next.moves.push({ player, index: move.index, text: `${playerInfo(game, player).label} ${qawaleMoveText(game, move)}` });
        if (line.length) {
            next.ended = true;
            next.winner = player;
            next.winLine = line;
        } else if (opponentLine.length) {
            next.ended = true;
            next.winner = opponent;
            next.winLine = opponentLine;
        } else if (!next.piecesLeft.red && !next.piecesLeft.blue) {
            next.ended = true;
            next.winner = 'draw';
            next.winLine = [];
        } else {
            next.current = otherPlayer(game, player);
            next.winLine = [];
        }
        return next;
    }

    function getQawaleHint(game, state) {
        const immediate = getQawaleAiMoves(game, state, { limit: 3000 }).find(move => {
            const next = applyQawaleMove(game, state, move);
            return next.ended && next.winner === state.current;
        });
        if (immediate) {
            return { index: immediate.placeIndex, text: `建议选择 ${formatPosition(immediate.placeIndex, game.columns)}，沿 ${immediate.path.map(index => formatPosition(index, game.columns)).join(' → ')} 移动可形成顶层四连。` };
        }
        const placements = getQawalePlacements(state)
            .map(move => {
                const stack = state.qawaleStacks[move.placeIndex];
                return {
                    ...move,
                    score: stack.filter(stone => stone === state.current).length * 2 + stack.length
                };
            })
            .sort((a, b) => b.score - a.score || a.index - b.index);
        const best = placements[0];
        return best ? { index: best.index, text: `建议选择 ${formatPosition(best.index, game.columns)}，该堆叠更有利于调度己方石子。` } : null;
    }

    function quoridorWallKey(size, row, col) {
        return row * (size - 1) + col;
    }

    function quoridorWallIndex(game, type, row, col) {
        const wallArea = (game.rows - 1) * (game.columns - 1);
        return boardTotal(game) + (type === 'h' ? 0 : wallArea) + quoridorWallKey(game.rows, row, col);
    }

    function quoridorWallLabel(type, row, col) {
        return `${type === 'h' ? '横墙' : '竖墙'} R${row + 1} C${col + 1}`;
    }

    function quoridorInBoard(size, row, col) {
        return row >= 0 && row < size && col >= 0 && col < size;
    }

    function quoridorHasWall(state, type, row, col, size) {
        if (row < 0 || row >= size - 1 || col < 0 || col >= size - 1) return false;
        const list = type === 'h' ? state.hWalls : state.vWalls;
        return Boolean(list[quoridorWallKey(size, row, col)]);
    }

    function quoridorPlayerAt(state, row, col) {
        return Object.entries(state.players).find(([, player]) => player.row === row && player.col === col)?.[0] || null;
    }

    function quoridorReachedGoal(game, player, row, col) {
        const goal = playerInfo(game, player).goalEdge;
        if (goal === 'top') return row === 0;
        if (goal === 'bottom') return row === game.rows - 1;
        if (goal === 'left') return col === 0;
        if (goal === 'right') return col === game.columns - 1;
        return false;
    }

    function quoridorBlocksStep(state, size, fromRow, fromCol, toRow, toCol) {
        if (!quoridorInBoard(size, toRow, toCol)) return true;
        if (toCol === fromCol + 1) return quoridorHasWall(state, 'v', fromRow, fromCol, size) || quoridorHasWall(state, 'v', fromRow - 1, fromCol, size);
        if (toCol === fromCol - 1) return quoridorHasWall(state, 'v', fromRow, toCol, size) || quoridorHasWall(state, 'v', fromRow - 1, toCol, size);
        if (toRow === fromRow + 1) return quoridorHasWall(state, 'h', fromRow, fromCol, size) || quoridorHasWall(state, 'h', fromRow, fromCol - 1, size);
        if (toRow === fromRow - 1) return quoridorHasWall(state, 'h', toRow, fromCol, size) || quoridorHasWall(state, 'h', toRow, fromCol - 1, size);
        return true;
    }

    function quoridorCanStep(state, size, fromRow, fromCol, toRow, toCol) {
        return quoridorInBoard(size, toRow, toCol) && !quoridorBlocksStep(state, size, fromRow, fromCol, toRow, toCol);
    }

    function quoridorMoveText(game, move) {
        if (move.type === 'move') return formatPosition(move.index, game.columns);
        return quoridorWallLabel(move.wall, move.row, move.col);
    }

    function getQuoridorPawnMoves(game, state, player = state.current) {
        const size = game.rows;
        const pawn = state.players[player];
        const moves = [];
        const seen = new Set();
        const addMove = (row, col) => {
            const index = row * size + col;
            if (seen.has(index)) return;
            seen.add(index);
            moves.push({ type: 'move', index, row, col });
        };
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1]
        ];

        for (const [dr, dc] of directions) {
            const nextRow = pawn.row + dr;
            const nextCol = pawn.col + dc;
            if (!quoridorCanStep(state, size, pawn.row, pawn.col, nextRow, nextCol)) continue;
            const occupant = quoridorPlayerAt(state, nextRow, nextCol);
            if (!occupant) {
                addMove(nextRow, nextCol);
                continue;
            }

            const jumpRow = nextRow + dr;
            const jumpCol = nextCol + dc;
            if (quoridorCanStep(state, size, nextRow, nextCol, jumpRow, jumpCol) && !quoridorPlayerAt(state, jumpRow, jumpCol)) {
                addMove(jumpRow, jumpCol);
                continue;
            }

            const sideSteps = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
            for (const [sideRow, sideCol] of sideSteps) {
                const diagRow = nextRow + sideRow;
                const diagCol = nextCol + sideCol;
                if (quoridorCanStep(state, size, nextRow, nextCol, diagRow, diagCol) && !quoridorPlayerAt(state, diagRow, diagCol)) {
                    addMove(diagRow, diagCol);
                }
            }
        }

        return moves;
    }

    function quoridorShortestPathLength(game, state, player) {
        const size = game.rows;
        const start = state.players[player];
        const queue = [{ row: start.row, col: start.col, distance: 0 }];
        const visited = new Set([`${start.row},${start.col}`]);
        let cursor = 0;

        while (cursor < queue.length) {
            const current = queue[cursor];
            cursor += 1;
            if (quoridorReachedGoal(game, player, current.row, current.col)) return current.distance;

            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const row = current.row + dr;
                const col = current.col + dc;
                const key = `${row},${col}`;
                if (visited.has(key) || !quoridorCanStep(state, size, current.row, current.col, row, col)) continue;
                visited.add(key);
                queue.push({ row, col, distance: current.distance + 1 });
            }
        }

        return Infinity;
    }

    function quoridorAllPlayersHavePath(game, state) {
        return game.players.every(player => Number.isFinite(quoridorShortestPathLength(game, state, player.id)));
    }

    function isValidQuoridorWall(game, state, type, row, col) {
        const size = game.rows;
        const player = state.players[state.current];
        if (!player.walls) return false;
        if (row < 0 || row >= size - 1 || col < 0 || col >= size - 1) return false;
        if (quoridorHasWall(state, type, row, col, size)) return false;
        if (quoridorHasWall(state, type === 'h' ? 'v' : 'h', row, col, size)) return false;
        if (type === 'h' && (quoridorHasWall(state, 'h', row, col - 1, size) || quoridorHasWall(state, 'h', row, col + 1, size))) return false;
        if (type === 'v' && (quoridorHasWall(state, 'v', row - 1, col, size) || quoridorHasWall(state, 'v', row + 1, col, size))) return false;

        const next = cloneState(state);
        next[type === 'h' ? 'hWalls' : 'vWalls'][quoridorWallKey(size, row, col)] = state.current;
        return quoridorAllPlayersHavePath(game, next);
    }

    function getQuoridorWallMoves(game, state) {
        const size = game.rows;
        const moves = [];
        if (!state.players[state.current].walls) return moves;

        for (const type of ['h', 'v']) {
            for (let row = 0; row < size - 1; row += 1) {
                for (let col = 0; col < size - 1; col += 1) {
                    if (!isValidQuoridorWall(game, state, type, row, col)) continue;
                    moves.push({
                        type: 'wall',
                        wall: type,
                        row,
                        col,
                        index: quoridorWallIndex(game, type, row, col)
                    });
                }
            }
        }

        return moves;
    }

    function getQuoridorMoves(game, state) {
        if (state.ended) return [];
        return getQuoridorPawnMoves(game, state).concat(getQuoridorWallMoves(game, state));
    }

    function getQuoridorHint(game, state) {
        const moves = getQuoridorMoves(game, state);
        if (!moves.length) return null;
        const currentDistance = quoridorShortestPathLength(game, state, state.current);
        const move = moves
            .filter(item => item.type === 'move')
            .map(item => {
                const next = game.applyMove(state, item);
                return { move: item, distance: quoridorShortestPathLength(game, next, state.current) };
            })
            .sort((a, b) => a.distance - b.distance || moveIndex(a.move) - moveIndex(b.move))[0];

        if (move && move.distance <= currentDistance) {
            return { index: move.move.index, text: `建议移动到 ${formatPosition(move.move.index, game.columns)}，缩短通往目标边的路线。` };
        }

        const wall = moves.find(item => item.type === 'wall');
        return wall ? { index: wall.index, wall: wall.wall, text: `建议尝试放置${quoridorWallLabel(wall.wall, wall.row, wall.col)}，干扰对手路线。` } : null;
    }

    const games = [
        {
            id: 'gomoku',
            name: '五子棋',
            tag: '15 x 15',
            color: '#f59e0b',
            rows: 15,
            columns: 15,
            minSize: 9,
            maxSize: 25,
            sizeStep: 1,
            goal: '任意方向五子连线',
            hintLabel: '攻防评分',
            summary: '经典连珠对弈，适合练习攻防节奏、封堵和连续棋形判断。',
            rules: ['黑棋先手。', '横向、纵向或任意斜向连续五子即胜。', '棋盘满且无人五连时判定为平局。'],
            players: [
                { id: 'black', label: '黑棋', className: 'black' },
                { id: 'white', label: '白棋', className: 'white' }
            ],
            initialState() {
                return createBaseState(boardTotal(this), 'black');
            },
            getLegalMoves: getEmptyMoves,
            applyMove(state, move) {
                const index = moveIndex(move);
                const next = cloneState(state);
                const player = state.current;
                next.board[index] = player;
                next.moveCount += 1;
                next.moves.push({ player, index, text: `${playerInfo(this, player).label} ${formatPosition(index, this.columns)}` });
                next.passMessage = '';
                const line = findGomokuLine(next.board, index, player, this.rows, 5);
                if (line.length) {
                    next.ended = true;
                    next.winner = player;
                    next.winLine = line;
                } else if (next.board.every(Boolean)) {
                    next.ended = true;
                    next.winner = 'draw';
                } else {
                    next.current = otherPlayer(this, player);
                }
                return next;
            },
            getHint(state) {
                return getGomokuHint(this, state);
            },
            analyze(state) {
                const black = state.board.filter(value => value === 'black').length;
                const white = state.board.filter(value => value === 'white').length;
                const legal = this.getLegalMoves(state).length;
                const total = boardTotal(this);
                return [
                    { label: '黑棋', value: black, total },
                    { label: '白棋', value: white, total },
                    { label: '可落点', value: legal, total }
                ];
            }
        },
        {
            id: 'reversi',
            name: '黑白棋',
            tag: '8 x 8',
            color: '#34d399',
            rows: 8,
            columns: 8,
            minSize: 6,
            maxSize: 16,
            sizeStep: 2,
            goal: '终局棋子更多者获胜',
            hintLabel: '稳定性与行动力',
            summary: '严格按夹击翻转规则校验落点，自动处理无合法落点时的跳过回合。',
            rules: ['黑棋先手。', '落子必须在至少一个方向夹住对方棋子。', '对方无合法落点时自动跳过，双方均无合法落点时终局。'],
            players: [
                { id: 'black', label: '黑棋', className: 'black' },
                { id: 'white', label: '白棋', className: 'white' }
            ],
            initialState() {
                const size = this.rows;
                const state = createBaseState(boardTotal(this), 'black');
                const mid = size / 2;
                state.board[(mid - 1) * size + (mid - 1)] = 'white';
                state.board[(mid - 1) * size + mid] = 'black';
                state.board[mid * size + (mid - 1)] = 'black';
                state.board[mid * size + mid] = 'white';
                state.scores = countReversi(state.board);
                return state;
            },
            getLegalMoves(state) {
                if (state.ended) return [];
                return getReversiMovesFromBoard(state.board, state.current, this.rows);
            },
            applyMove(state, move) {
                const index = moveIndex(move);
                const player = state.current;
                const opponent = otherPlayer(this, player);
                const flips = move.flips && move.flips.length ? move.flips : collectReversiFlips(state.board, index, player, this.rows);
                const next = cloneState(state);
                next.board[index] = player;
                flips.forEach(item => { next.board[item] = player; });
                next.moveCount += 1;
                next.moves.push({ player, index, text: `${playerInfo(this, player).label} ${formatPosition(index, this.columns)}，翻转 ${flips.length} 子` });
                next.passMessage = '';
                next.winLine = [];
                next.scores = countReversi(next.board);

                const opponentMoves = getReversiMovesFromBoard(next.board, opponent, this.rows);
                const currentMoves = getReversiMovesFromBoard(next.board, player, this.rows);
                if (opponentMoves.length) {
                    next.current = opponent;
                } else if (currentMoves.length) {
                    next.current = player;
                    next.passMessage = `${playerInfo(this, opponent).label} 无合法落点，已自动跳过。`;
                } else {
                    next.ended = true;
                    next.winner = next.scores.black === next.scores.white
                        ? 'draw'
                        : next.scores.black > next.scores.white ? 'black' : 'white';
                }
                return next;
            },
            getHint(state) {
                return getReversiHint(this, state);
            },
            analyze(state) {
                const scores = state.scores || countReversi(state.board);
                const legal = this.getLegalMoves(state).length;
                const total = boardTotal(this);
                return [
                    { label: '黑棋', value: scores.black, total },
                    { label: '白棋', value: scores.white, total },
                    { label: '合法点', value: legal, total }
                ];
            }
        },
        {
            id: 'tictactoe',
            name: '井字棋',
            tag: '3 x 3',
            color: '#38bdf8',
            rows: 3,
            columns: 3,
            minSize: 3,
            maxSize: 9,
            sizeStep: 1,
            winLength: 3,
            goal: '率先三连',
            hintLabel: '必胜与阻挡优先',
            summary: '轻量快速的三连对局，适合短时间本地对弈和基础策略练习。',
            rules: ['X 先手。', '任意横、竖、斜三连获胜。', '优先提示必胜点，其次提示阻挡点。'],
            players: [
                { id: 'x', label: 'X', className: 'x', symbol: '×' },
                { id: 'o', label: 'O', className: 'o', symbol: '○' }
            ],
            initialState() {
                return createBaseState(boardTotal(this), 'x');
            },
            getLegalMoves: getEmptyMoves,
            applyMove(state, move) {
                const index = moveIndex(move);
                const next = cloneState(state);
                const player = state.current;
                next.board[index] = player;
                next.moveCount += 1;
                next.moves.push({ player, index, text: `${playerInfo(this, player).label} ${formatPosition(index, this.columns)}` });
                next.passMessage = '';
                const line = findSquareWinLine(next.board, player, this.rows, this.winLength);
                if (line.length) {
                    next.ended = true;
                    next.winner = player;
                    next.winLine = line;
                } else if (next.board.every(Boolean)) {
                    next.ended = true;
                    next.winner = 'draw';
                } else {
                    next.current = otherPlayer(this, player);
                }
                return next;
            },
            getHint(state) {
                return getTicTacToeHint(this, state);
            },
            analyze(state) {
                const x = state.board.filter(value => value === 'x').length;
                const o = state.board.filter(value => value === 'o').length;
                const total = boardTotal(this);
                return [
                    { label: 'X', value: x, total },
                    { label: 'O', value: o, total },
                    { label: '空位', value: this.getLegalMoves(state).length, total }
                ];
            }
        },
        {
            id: 'qawale',
            name: '石连一线',
            tag: '4 x 4',
            color: '#f97316',
            rows: 4,
            columns: 4,
            minSize: 4,
            maxSize: 4,
            sizeStep: 1,
            goal: '顶层率先四石连线',
            hintLabel: '堆叠调度与顶层连线',
            summary: 'Qawale 石连一线：在已有堆上加石，拿起整堆逐格播撒底部石，争夺顶层四连。',
            rules: ['棋盘为 4 × 4，四角各有 2 枚中立石。', '每方各 8 枚石子，每回合必须选择一个非空堆叠加己方石。', '拿起该堆后沿正交相邻格逐步移动，每步落下底部石，不能立即回到上一步位置。', '只按每格顶层石判断横、竖或斜向四连；双方石子用完且无人四连时平局。'],
            players: [
                { id: 'red', label: '红石', className: 'qawale-red' },
                { id: 'blue', label: '蓝石', className: 'qawale-blue' }
            ],
            initialState() {
                const state = createBaseState(boardTotal(this), 'red');
                state.qawaleStacks = qawaleInitialStacks();
                state.piecesLeft = { red: 8, blue: 8 };
                return qawaleSyncBoard(state);
            },
            getLegalMoves(state) {
                return getQawalePlacements(state);
            },
            getAiMoves(state, options) {
                return getQawaleAiMoves(this, state, options);
            },
            isLegalMove(state, move) {
                return isLegalQawaleMove(this, state, move);
            },
            applyMove(state, move) {
                return applyQawaleMove(this, state, move);
            },
            getHint(state) {
                return getQawaleHint(this, state);
            },
            analyze(state) {
                const occupied = state.qawaleStacks.filter(stack => stack.length).length;
                const maxHeight = state.qawaleStacks.reduce((max, stack) => Math.max(max, stack.length), 0);
                return [
                    { label: '红石剩余', value: state.piecesLeft.red, total: 8 },
                    { label: '蓝石剩余', value: state.piecesLeft.blue, total: 8 },
                    { label: '非空堆', value: occupied, total: boardTotal(this) },
                    { label: '最高堆', value: maxHeight, total: 24 }
                ];
            }
        },
        {
            id: 'quoridor',
            name: '步步为营',
            tag: '9 x 9',
            color: '#a78bfa',
            rows: 9,
            columns: 9,
            minSize: 9,
            maxSize: 9,
            sizeStep: 1,
            goal: '率先抵达对侧底线',
            hintLabel: '路径长度与墙体封锁',
            summary: '经典 Quoridor 对弈，移动棋子或放置墙体，既要前进也要延缓对手路线。',
            rules: ['双方各有 10 面墙。', '每回合选择移动一格、跳过相邻对手，或放置一面横墙/竖墙。', '墙不能重叠或交叉，且不能完全封死任意玩家通往目标边的路径。'],
            players: [
                { id: 'blue', label: '蓝方', className: 'blue', symbol: '▲', goalEdge: 'top' },
                { id: 'red', label: '红方', className: 'red', symbol: '▼', goalEdge: 'bottom' }
            ],
            initialState() {
                const state = createBaseState(boardTotal(this), 'blue');
                const center = Math.floor(this.columns / 2);
                state.players = {
                    blue: { row: this.rows - 1, col: center, walls: 10 },
                    red: { row: 0, col: center, walls: 10 }
                };
                state.board[state.players.blue.row * this.columns + state.players.blue.col] = 'blue';
                state.board[state.players.red.row * this.columns + state.players.red.col] = 'red';
                state.hWalls = Array((this.rows - 1) * (this.columns - 1)).fill(null);
                state.vWalls = Array((this.rows - 1) * (this.columns - 1)).fill(null);
                return state;
            },
            getLegalMoves(state) {
                return getQuoridorMoves(this, state);
            },
            applyMove(state, move) {
                const player = state.current;
                const next = cloneState(state);
                next.passMessage = '';
                next.winLine = [];
                if (move.type === 'wall') {
                    next[move.wall === 'h' ? 'hWalls' : 'vWalls'][quoridorWallKey(this.rows, move.row, move.col)] = player;
                    next.players[player].walls -= 1;
                    next.moves.push({ player, index: move.index, text: `${playerInfo(this, player).label} 放置${quoridorWallLabel(move.wall, move.row, move.col)}，剩余 ${next.players[player].walls} 面墙` });
                } else {
                    const from = next.players[player];
                    next.board[from.row * this.columns + from.col] = null;
                    from.row = move.row;
                    from.col = move.col;
                    next.board[move.index] = player;
                    next.moves.push({ player, index: move.index, text: `${playerInfo(this, player).label} 移动到 ${quoridorMoveText(this, move)}` });
                    if (quoridorReachedGoal(this, player, move.row, move.col)) {
                        next.ended = true;
                        next.winner = player;
                        next.winLine = [move.index];
                    }
                }
                next.moveCount += 1;
                if (!next.ended) next.current = otherPlayer(this, player);
                return next;
            },
            getHint(state) {
                return getQuoridorHint(this, state);
            },
            analyze(state) {
                const bluePath = quoridorShortestPathLength(this, state, 'blue');
                const redPath = quoridorShortestPathLength(this, state, 'red');
                return [
                    { label: '蓝方墙数', value: state.players.blue.walls, total: 10 },
                    { label: '红方墙数', value: state.players.red.walls, total: 10 },
                    { label: '蓝方路径', value: bluePath, total: this.rows },
                    { label: '红方路径', value: redPath, total: this.rows }
                ];
            }
        }
    ];

    function getLegalMap() {
        return new Map(app.game.getLegalMoves(app.state).map(move => [moveIndex(move), move]));
    }

    function renderGameList() {
        refs.gameList.innerHTML = '';
        games.forEach(game => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `game-card${app.game && app.game.id === game.id ? ' is-active' : ''}`;
            button.style.setProperty('--game-color', game.color);
            button.innerHTML = `<h3>${game.name}</h3><p>${game.summary}</p>`;
            button.addEventListener('click', () => switchGame(game.id));
            refs.gameList.appendChild(button);
        });
    }

    function qawaleDraftBoard() {
        return app.qawaleDraft ? app.qawaleDraft.board : app.state.qawaleStacks;
    }

    function qawaleDraftNextSteps(game) {
        if (!app.qawaleDraft) return [];
        return getQawaleNextSteps(game, app.qawaleDraft.currentIndex, app.qawaleDraft.previousIndex);
    }

    function startQawaleDraft(index) {
        if (app.state.ended || isAiTurn() || app.aiThinking) return;
        const stack = app.state.qawaleStacks[index];
        if (!stack || !stack.length || !app.state.piecesLeft[app.state.current]) return;
        const movingStack = stack.slice();
        movingStack.push(app.state.current);
        const board = app.state.qawaleStacks.map(item => item.slice());
        board[index] = [];
        app.qawaleDraft = {
            player: app.state.current,
            placeIndex: index,
            board,
            stack: movingStack,
            currentIndex: index,
            previousIndex: null,
            path: []
        };
        app.hintIndex = null;
        app.hintText = `已选择 ${formatPosition(index, app.game.columns)}，继续点击相邻格移动堆叠。`;
        refresh();
    }

    function stepQawaleDraft(index) {
        if (!app.qawaleDraft) return;
        const nextSteps = qawaleDraftNextSteps(app.game);
        if (!nextSteps.includes(index)) {
            app.hintText = '只能移动到正交相邻格，且不能立即回到上一步位置。';
            renderHint();
            return;
        }
        const stone = app.qawaleDraft.stack.shift();
        app.qawaleDraft.board[index].push(stone);
        app.qawaleDraft.path.push(index);
        app.qawaleDraft.previousIndex = app.qawaleDraft.currentIndex;
        app.qawaleDraft.currentIndex = index;
        if (!app.qawaleDraft.stack.length) {
            const move = buildQawaleMove(app.qawaleDraft.placeIndex, app.qawaleDraft.path);
            app.qawaleDraft = null;
            playMove(move);
            return;
        }
        app.hintText = `继续移动，还需落下 ${app.qawaleDraft.stack.length} 枚石子。`;
        refresh();
    }

    function cancelQawaleDraft() {
        if (!app.qawaleDraft) return;
        app.qawaleDraft = null;
        app.hintText = '';
        refresh();
    }

    function renderQawaleBoard(game, state) {
        const placements = new Map(game.getLegalMoves(state).map(move => [move.index, move]));
        const draftBoard = qawaleDraftBoard();
        const draftSteps = new Set(qawaleDraftNextSteps(game));
        refs.board.className = `board qawale${app.qawaleDraft ? ' is-drafting' : ''}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.style.setProperty('--cols', game.columns);
        refs.board.style.setProperty('--rows', game.rows);
        refs.board.innerHTML = '';

        const tools = document.createElement('div');
        tools.className = 'qawale-info';
        const info = document.createElement('span');
        info.textContent = app.qawaleDraft
            ? `${playerInfo(game, app.qawaleDraft.player).label} 移动中 · 手中 ${app.qawaleDraft.stack.length} 枚 · 点击高亮相邻格`
            : `${playerInfo(game, state.current).label} 行动中 · 红石 ${state.piecesLeft.red} / 蓝石 ${state.piecesLeft.blue} · 先选非空堆`;
        tools.appendChild(info);
        if (app.qawaleDraft) {
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'btn btn-secondary qawale-cancel';
            cancel.textContent = '取消选择';
            cancel.addEventListener('click', cancelQawaleDraft);
            tools.appendChild(cancel);
        }
        refs.board.appendChild(tools);

        const grid = document.createElement('div');
        grid.className = 'qawale-grid';

        draftBoard.forEach((stack, index) => {
            const placement = placements.get(index);
            const canPlace = !app.qawaleDraft && placement;
            const canStep = app.qawaleDraft && draftSteps.has(index);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell qawale-cell';
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${formatPosition(index, game.columns)} 堆高 ${stack.length}`);
            if (stack.length) cell.classList.add('occupied');
            if (canPlace || canStep) cell.classList.add('legal');
            if (app.qawaleDraft && app.qawaleDraft.currentIndex === index) cell.classList.add('current-stack');
            if (app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');

            const stackView = document.createElement('span');
            stackView.className = 'qawale-stack';
            stack.slice(-5).forEach(stone => {
                const stoneEl = document.createElement('span');
                stoneEl.className = `qawale-stone ${stone}`;
                stackView.appendChild(stoneEl);
            });
            cell.appendChild(stackView);

            const top = qawaleTop(stack);
            if (top) {
                const topLabel = document.createElement('span');
                topLabel.className = `qawale-top ${top}`;
                topLabel.textContent = stack.length;
                cell.appendChild(topLabel);
            }

            cell.disabled = state.ended || isAiTurn() || app.aiThinking || (!canPlace && !canStep);
            cell.addEventListener('click', () => {
                if (app.qawaleDraft) stepQawaleDraft(index);
                else startQawaleDraft(index);
            });
            grid.appendChild(cell);
        });

        refs.board.appendChild(grid);
    }

    function renderQuoridorBoard(game, state) {
        const legalMoves = game.getLegalMoves(state);
        const pawnMap = new Map(legalMoves.filter(move => move.type === 'move').map(move => [move.index, move]));
        const hWallMap = new Map(legalMoves.filter(move => move.type === 'wall' && move.wall === 'h').map(move => [quoridorWallKey(game.rows, move.row, move.col), move]));
        const vWallMap = new Map(legalMoves.filter(move => move.type === 'wall' && move.wall === 'v').map(move => [quoridorWallKey(game.rows, move.row, move.col), move]));
        const locked = state.ended || isAiTurn() || app.aiThinking;

        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.innerHTML = '';

        const tools = document.createElement('div');
        tools.className = 'quoridor-info';
        const wallInfo = document.createElement('span');
        wallInfo.className = 'quoridor-wall-info';
        wallInfo.textContent = `${playerInfo(game, state.current).label} 行动中 · 剩余墙：${state.players[state.current].walls} · 点击格子移动，点击墙位放墙`;
        tools.appendChild(wallInfo);
        refs.board.appendChild(tools);

        const grid = document.createElement('div');
        grid.className = 'quoridor-grid';
        const tracks = Array.from({ length: game.rows * 2 - 1 }, (_, index) => index % 2 === 0 ? 'var(--quoridor-cell)' : 'var(--quoridor-gap)').join(' ');
        grid.style.gridTemplateColumns = tracks;
        grid.style.gridTemplateRows = tracks;

        state.board.forEach((value, index) => {
            const row = Math.floor(index / game.columns);
            const col = index % game.columns;
            const legalMove = pawnMap.get(index);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell quoridor-cell';
            cell.style.gridRow = row * 2 + 1;
            cell.style.gridColumn = col * 2 + 1;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${formatPosition(index, game.columns)} ${value ? playerInfo(game, value).label : '空位'}`);
            if (value) cell.classList.add('occupied');
            if (legalMove) cell.classList.add('legal');
            if (app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');
            if (value) {
                const info = playerInfo(game, value);
                const piece = document.createElement('span');
                piece.className = `piece ${info.className}`;
                piece.textContent = info.symbol || '';
                cell.appendChild(piece);
            }
            cell.disabled = locked || !legalMove;
            cell.addEventListener('click', () => playMove(legalMove));
            grid.appendChild(cell);
        });

        for (let row = 0; row < game.rows - 1; row += 1) {
            for (let col = 0; col < game.columns - 1; col += 1) {
                const key = quoridorWallKey(game.rows, row, col);
                const hMove = hWallMap.get(key);
                const hOwner = state.hWalls[key];
                if (hOwner || hMove) {
                    const hWall = document.createElement('button');
                    hWall.type = 'button';
                    hWall.className = `quoridor-wall-slot horizontal${hOwner ? ` is-placed ${hOwner}` : ''}${hMove ? ' legal' : ''}${app.hintIndex === quoridorWallIndex(game, 'h', row, col) ? ' hint' : ''}`;
                    hWall.style.gridRow = row * 2 + 2;
                    hWall.style.gridColumn = `${col * 2 + 1} / ${col * 2 + 4}`;
                    hWall.setAttribute('aria-label', quoridorWallLabel('h', row, col));
                    hWall.disabled = locked || !hMove;
                    hWall.addEventListener('click', () => playMove(hMove));
                    grid.appendChild(hWall);
                }

                const vMove = vWallMap.get(key);
                const vOwner = state.vWalls[key];
                if (vOwner || vMove) {
                    const vWall = document.createElement('button');
                    vWall.type = 'button';
                    vWall.className = `quoridor-wall-slot vertical${vOwner ? ` is-placed ${vOwner}` : ''}${vMove ? ' legal' : ''}${app.hintIndex === quoridorWallIndex(game, 'v', row, col) ? ' hint' : ''}`;
                    vWall.style.gridRow = `${row * 2 + 1} / ${row * 2 + 4}`;
                    vWall.style.gridColumn = col * 2 + 2;
                    vWall.setAttribute('aria-label', quoridorWallLabel('v', row, col));
                    vWall.disabled = locked || !vMove;
                    vWall.addEventListener('click', () => playMove(vMove));
                    grid.appendChild(vWall);
                }
            }
        }

        refs.board.appendChild(grid);
    }

    function renderBoard() {
        const game = app.game;
        const state = app.state;
        if (game.id === 'qawale') {
            renderQawaleBoard(game, state);
            return;
        }
        if (game.id === 'quoridor') {
            renderQuoridorBoard(game, state);
            return;
        }
        const legalMap = getLegalMap();
        const reversiFlipMap = game.id === 'reversi' && app.reversiFlipAnimation
            ? new Map(app.reversiFlipAnimation.flips.map(item => [item.index, item]))
            : new Map();
        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.style.setProperty('--cols', game.columns);
        refs.board.style.setProperty('--rows', game.rows);
        refs.board.innerHTML = '';

        state.board.forEach((value, index) => {
            const cell = document.createElement('button');
            const legalMove = legalMap.get(index);
            const isLegal = legalMap.has(index);
            const isOccupied = Boolean(value);
            cell.type = 'button';
            cell.className = 'cell';
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${formatPosition(index, game.columns)} ${value ? playerInfo(game, value).label : '空位'}`);
            if (isOccupied) cell.classList.add('occupied');
            if (isLegal) cell.classList.add('legal');
            if (app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');
            if (game.id === 'reversi' && isLegal) cell.dataset.flips = legalMove.flips.length;

            if (value) {
                const info = playerInfo(game, value);
                const piece = document.createElement('span');
                piece.className = `piece ${info.className}`;
                const flip = reversiFlipMap.get(index);
                if (flip) piece.classList.add('reversi-flip', `from-${flip.from}`, `to-${flip.to}`);
                piece.textContent = info.symbol || '';
                cell.appendChild(piece);
            }

            cell.disabled = state.ended || !isLegal || isAiTurn() || app.aiThinking;
            cell.addEventListener('click', () => playMove(legalMove));
            refs.board.appendChild(cell);
        });
    }

    function renderStatus() {
        const game = app.game;
        const state = app.state;
        const legalMoves = game.getLegalMoves(state);
        refs.currentPlayer.textContent = state.ended ? '-' : playerInfo(game, state.current).label;
        refs.legalCount.textContent = legalMoves.length;
        refs.moveCount.textContent = state.moveCount;
        if (state.ended) {
            refs.gameStatus.textContent = state.winner === 'draw' ? '平局' : `${playerInfo(game, state.winner).label} 胜利`;
        } else if (app.aiThinking) {
            refs.gameStatus.textContent = 'AI 思考中';
        } else {
            refs.gameStatus.textContent = state.passMessage || '进行中';
        }
        refs.undoBtn.disabled = app.history.length === 0 || app.aiThinking || Boolean(app.qawaleDraft);
        refs.hintBtn.disabled = state.ended || legalMoves.length === 0 || isAiTurn() || app.aiThinking || Boolean(app.qawaleDraft);
        refs.aiStatus.textContent = app.aiThinking ? 'AI 思考中' : isSinglePlayer() ? `AI：${aiLabel()} · ${aiDifficultyLabel()}` : '本地多人';
    }

    function renderMeta() {
        const game = app.game;
        const sizeRange = game.minSize === game.maxSize
            ? `${game.rows} × ${game.columns}`
            : `${game.minSize} × ${game.minSize} 至 ${game.maxSize} × ${game.maxSize}`;
        const firstPlayer = playerInfo(game, game.players[0].id).label;
        const rows = [
            ['当前棋盘', `${game.rows} × ${game.columns}，共 ${boardTotal(game)} 个格点。`],
            ['可选大小', game.sizeStep === 2 ? `${sizeRange}，仅支持偶数棋盘。` : sizeRange],
            ['参与玩家', `${game.players.map(player => player.label).join(' / ')}，${firstPlayer} 先手。`],
            ['胜利目标', game.goal],
            ['局势提示', game.hintLabel],
            ['当前状态', app.state.ended ? refs.gameStatus.textContent : `${playerInfo(game, app.state.current).label} 行动中。`]
        ];
        refs.gameMeta.innerHTML = '';
        rows.forEach(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'meta-item';
            item.innerHTML = `<span>${label}</span><p class="meta-value">${value}</p>`;
            refs.gameMeta.appendChild(item);
        });

        const ruleBlock = document.createElement('div');
        ruleBlock.className = 'meta-item meta-item-wide';
        ruleBlock.innerHTML = `<span>规则</span><p class="meta-value">${game.rules.join(' ')}</p>`;
        refs.gameMeta.appendChild(ruleBlock);
    }

    function renderAnalysis() {
        const rows = app.game.analyze(app.state);
        refs.analysisPanel.innerHTML = '';
        rows.forEach(row => {
            const percent = row.total ? Math.round((row.value / row.total) * 100) : 0;
            const item = document.createElement('div');
            item.className = 'analysis-row';
            item.innerHTML = `<header><span>${row.label}</span><strong>${row.value}</strong></header><div class="bar"><span style="width:${Math.min(100, percent)}%"></span></div>`;
            refs.analysisPanel.appendChild(item);
        });
    }

    function renderMoveLog() {
        const moves = app.state.moves.slice(-80);
        refs.moveLog.innerHTML = '';
        refs.logCount.textContent = app.state.moves.length;
        if (!moves.length) {
            const empty = document.createElement('li');
            empty.textContent = '暂无落子。';
            refs.moveLog.appendChild(empty);
            return;
        }
        moves.forEach((move, visibleIndex) => {
            const item = document.createElement('li');
            const index = app.state.moves.length - moves.length + visibleIndex + 1;
            item.textContent = `${index}. ${move.text}`;
            refs.moveLog.appendChild(item);
        });
    }

    function renderHint() {
        if (app.hintText) {
            refs.hintBox.textContent = app.hintText;
            return;
        }
        if (app.state.ended) {
            refs.hintBox.textContent = app.state.winner === 'draw'
                ? '棋局结束：双方平局。'
                : `棋局结束：${playerInfo(app.game, app.state.winner).label} 获胜。`;
            return;
        }
        refs.hintBox.textContent = app.state.passMessage || `轮到 ${playerInfo(app.game, app.state.current).label}。点击高亮合法点完成落子。`;
    }

    function renderHeader() {
        refs.gameTitle.textContent = app.game.name;
        refs.gameSummary.textContent = app.game.summary;
    }

    function refresh() {
        renderGameList();
        renderHeader();
        renderBoard();
        renderStatus();
        renderMeta();
        renderAnalysis();
        renderMoveLog();
        renderHint();
    }

    function performAiMove() {
        if (!isAiTurn() || !window.BoardGameAI) {
            app.aiThinking = false;
            refresh();
            return;
        }

        const move = window.BoardGameAI.chooseMove(app.game, app.state, { player: app.aiPlayer, difficulty: app.aiDifficulty });
        app.aiThinking = false;

        if (move !== null && move !== undefined) {
            playMove(move, { ai: true });
        } else {
            refresh();
        }
    }

    function scheduleAiMove() {
        clearAiTimer();
        if (!isAiTurn() || app.aiThinking) return;

        const delay = app.game && app.game.id === 'reversi' && app.reversiFlipAnimation ? 760 : app.aiDifficulty === 'hard' ? 500 : 420;
        app.aiThinking = true;
        refresh();
        app.aiTimer = window.setTimeout(() => {
            app.aiTimer = null;
            performAiMove();
        }, delay);
    }

    function switchGame(id) {
        const game = games.find(item => item.id === id) || games[0];
        app.game = game;
        syncSizeControl();
        syncAiPlayerOptions();
        app.state = game.initialState();
        app.history = [];
        app.hintIndex = null;
        app.hintText = '';
        app.aiThinking = false;
        app.qawaleDraft = null;
        clearReversiFlipAnimation();
        clearAiTimer();
        refresh();
        scheduleAiMove();
    }

    function playMove(move, options = {}) {
        if (move === null || move === undefined || app.state.ended || app.aiThinking) return;
        if (!options.ai && isAiTurn()) return;
        if (app.game.id === 'qawale' && move.type === 'qawale') {
            if (!app.game.isLegalMove(app.state, move)) {
                app.hintIndex = null;
                app.hintText = '该移动路径不符合石连一线规则。';
                renderHint();
                return;
            }
            app.history.push(cloneState(app.state));
            if (app.history.length > 120) app.history.shift();
            app.state = app.game.applyMove(app.state, move);
            app.qawaleDraft = null;
            clearReversiFlipAnimation();
            app.hintIndex = null;
            app.hintText = '';
            refresh();
            scheduleAiMove();
            return;
        }
        const legalMap = getLegalMap();
        const index = moveIndex(move);
        const legalMove = legalMap.get(index);
        if (!legalMove && !legalMap.has(index)) {
            app.hintIndex = null;
            app.hintText = '该位置不是当前规则下的合法落点。';
            renderHint();
            return;
        }
        const reversiFlips = app.game.id === 'reversi'
            ? (legalMove.flips || []).map(item => ({ index: item, from: app.state.board[item], to: app.state.current })).filter(item => item.from && item.from !== item.to)
            : [];
        app.history.push(cloneState(app.state));
        if (app.history.length > 120) app.history.shift();
        app.state = app.game.applyMove(app.state, legalMove || move);
        if (app.game.id === 'reversi') setReversiFlipAnimation(reversiFlips);
        else clearReversiFlipAnimation();
        app.hintIndex = null;
        app.hintText = '';
        refresh();
        scheduleAiMove();
    }

    function resetGame() {
        clearAiTimer();
        app.aiThinking = false;
        app.state = app.game.initialState();
        app.history = [];
        app.hintIndex = null;
        app.hintText = '';
        app.qawaleDraft = null;
        clearReversiFlipAnimation();
        refresh();
        scheduleAiMove();
    }

    function applyBoardSize() {
        const size = normalizeBoardSize(app.game, refs.boardSizeInput.value);
        setGameSize(app.game, size);
        syncSizeControl();
        resetGame();
    }

    function undoMove() {
        if (!app.history.length || app.aiThinking) return;
        clearAiTimer();
        const lastMove = app.state.moves[app.state.moves.length - 1];
        const steps = isSinglePlayer() && lastMove && lastMove.player === app.aiPlayer && app.history.length > 1 ? 2 : 1;
        for (let count = 0; count < steps; count += 1) {
            app.state = app.history.pop();
        }
        app.hintIndex = null;
        app.hintText = '';
        app.qawaleDraft = null;
        clearReversiFlipAnimation();
        refresh();
        scheduleAiMove();
    }

    function showHint() {
        if (app.state.ended || isAiTurn() || app.aiThinking || app.qawaleDraft) return;
        const hint = app.game.getHint(app.state);
        if (!hint) {
            app.hintIndex = null;
            app.hintText = '当前没有可推荐的合法落点。';
        } else {
            app.hintIndex = hint.index;
            app.hintText = hint.text;
        }
        renderBoard();
        renderHint();
    }

    refs.resetBtn.addEventListener('click', resetGame);
    refs.undoBtn.addEventListener('click', undoMove);
    refs.hintBtn.addEventListener('click', showHint);
    refs.applySizeBtn.addEventListener('click', applyBoardSize);
    refs.modeButtons.forEach(button => {
        button.addEventListener('click', () => setMode(button.dataset.mode));
    });
    refs.aiPlayerSelect.addEventListener('change', () => {
        app.aiPlayer = refs.aiPlayerSelect.value;
        resetGame();
    });
    refs.aiDifficultySelect.addEventListener('change', () => {
        app.aiDifficulty = refs.aiDifficultySelect.value;
        resetGame();
    });
    refs.boardSizeInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            applyBoardSize();
        }
    });

    switchGame('gomoku');
})();
