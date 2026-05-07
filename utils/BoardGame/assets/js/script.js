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
        draughtsSelection: null,
        animalChessSelection: null,
        nineChessSelection: null,
        chineseCheckersSelection: null,
        chineseCheckersAnimation: null,
        chineseCheckersAnimationTimer: null,
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

    const DRAUGHTS_DIRECTIONS = [
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    const ANIMAL_CHESS_DIRECTIONS = [
        [-1, 0], [1, 0], [0, -1], [0, 1]
    ];

    const ANIMAL_CHESS_RANKS = { R: 1, C: 2, D: 3, W: 4, P: 5, T: 6, L: 7, E: 8 };
    const ANIMAL_CHESS_VALUES = { R: 100, C: 50, D: 70, W: 60, P: 80, T: 110, L: 120, E: 120 };
    const ANIMAL_CHESS_NAMES = { R: '鼠', C: '猫', D: '狗', W: '狼', P: '豹', T: '虎', L: '狮', E: '象' };
    const ANIMAL_CHESS_DENS = { black: 3, red: 59 };
    const ANIMAL_CHESS_TRAPS = {
        black: new Set([2, 4, 10]),
        red: new Set([52, 58, 60])
    };
    const ANIMAL_CHESS_RIVERS = new Set([22, 23, 25, 26, 29, 30, 32, 33, 36, 37, 39, 40]);

    const NINE_CHESS_POINTS = [
        { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 50 }, { x: 0, y: 0 },
        { x: 50, y: 16.67 }, { x: 83.33, y: 16.67 }, { x: 83.33, y: 50 }, { x: 83.33, y: 83.33 }, { x: 50, y: 83.33 }, { x: 16.67, y: 83.33 }, { x: 16.67, y: 50 }, { x: 16.67, y: 16.67 },
        { x: 50, y: 33.33 }, { x: 66.67, y: 33.33 }, { x: 66.67, y: 50 }, { x: 66.67, y: 66.67 }, { x: 50, y: 66.67 }, { x: 33.33, y: 66.67 }, { x: 33.33, y: 50 }, { x: 33.33, y: 33.33 }
    ];

    const NINE_CHESS_MILLS = [
        [7, 0, 1], [1, 2, 3], [3, 4, 5], [5, 6, 7],
        [15, 8, 9], [9, 10, 11], [11, 12, 13], [13, 14, 15],
        [23, 16, 17], [17, 18, 19], [19, 20, 21], [21, 22, 23],
        [0, 8, 16], [2, 10, 18], [4, 12, 20], [6, 14, 22]
    ];

    const NINE_CHESS_ADJACENT = Array.from({ length: 24 }, (_, index) => {
        const ring = Math.floor(index / 8);
        const seat = index % 8;
        const neighbors = [
            ring * 8 + ((seat + 7) % 8),
            ring * 8 + ((seat + 1) % 8)
        ];
        if (seat % 2 === 0) {
            if (ring > 0) neighbors.push((ring - 1) * 8 + seat);
            if (ring < 2) neighbors.push((ring + 1) * 8 + seat);
        }
        return neighbors;
    });

    const NINE_CHESS_EDGES = NINE_CHESS_ADJACENT.reduce((edges, neighbors, from) => {
        neighbors.forEach(to => {
            if (from < to) edges.push([from, to]);
        });
        return edges;
    }, []);

    const CHINESE_CHECKERS_ROW_COUNTS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];

    const CHINESE_CHECKERS_DIRECTIONS = [
        [0, -2], [0, 2], [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    const CHINESE_CHECKERS_OFFSETS = CHINESE_CHECKERS_ROW_COUNTS.reduce((offsets, count, row) => {
        offsets.push(row === 0 ? 0 : offsets[row - 1] + CHINESE_CHECKERS_ROW_COUNTS[row - 1]);
        return offsets;
    }, []);

    const CHINESE_CHECKERS_POSITIONS = CHINESE_CHECKERS_ROW_COUNTS.flatMap((count, row) => {
        return Array.from({ length: count }, (_, col) => ({ row, col, index: CHINESE_CHECKERS_OFFSETS[row] + col }));
    });

    const CHINESE_CHECKERS_CAMPS = {
        red: [
            { row: 16, col: 0 }, { row: 15, col: 0 }, { row: 15, col: 1 }, { row: 14, col: 0 }, { row: 14, col: 1 }, { row: 14, col: 2 }, { row: 13, col: 0 }, { row: 13, col: 1 }, { row: 13, col: 2 }, { row: 13, col: 3 }
        ],
        blue: [
            { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 0 }, { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 }
        ]
    };

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
            piecesLeft: state.piecesLeft ? { ...state.piecesLeft } : undefined,
            phase: state.phase,
            action: state.action,
            pendingCapture: state.pendingCapture,
            selectedIndex: state.selectedIndex
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
        if (game.totalCells) return game.totalCells;
        return game.rows * game.columns;
    }

    function setGameSize(game, size) {
        if (game.id === 'chinese-checkers') {
            game.rows = 17;
            game.columns = 13;
            game.tag = '17 行星形棋盘';
            return;
        }
        if (game.id === 'animalchess') {
            game.rows = 9;
            game.columns = 7;
            game.tag = '9 x 7';
            return;
        }
        if (game.id === 'ninechess') {
            game.rows = 7;
            game.columns = 7;
            game.tag = '24 点';
            return;
        }
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

    function clearChineseCheckersAnimation() {
        if (app.chineseCheckersAnimationTimer) {
            window.clearTimeout(app.chineseCheckersAnimationTimer);
            app.chineseCheckersAnimationTimer = null;
        }
        app.chineseCheckersAnimation = null;
    }

    function setChineseCheckersAnimation(move, player) {
        clearChineseCheckersAnimation();
        const path = (move.path && move.path.length > 1 ? move.path : [move.from, move.to]).filter(index => index !== null && index !== undefined);
        if (path.length < 2) return;
        const key = Date.now();
        const duration = Math.max(360, (path.length - 1) * 360);
        app.chineseCheckersAnimation = { key, path, player, to: move.to, duration };
        app.chineseCheckersAnimationTimer = window.setTimeout(() => {
            if (app.chineseCheckersAnimation && app.chineseCheckersAnimation.key === key) {
                app.chineseCheckersAnimation = null;
                app.chineseCheckersAnimationTimer = null;
                if (app.game && app.game.id === 'chinese-checkers') renderBoard();
            }
        }, duration + 90);
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
        app.draughtsSelection = null;
        app.animalChessSelection = null;
        app.nineChessSelection = null;
        app.chineseCheckersSelection = null;
        clearChineseCheckersAnimation();
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

    function draughtsOwner(piece) {
        if (!piece) return null;
        return piece.startsWith('white') ? 'white' : 'black';
    }

    function draughtsIsKing(piece) {
        return piece === 'whiteKing' || piece === 'blackKing';
    }

    function draughtsPiece(player, king = false) {
        return king ? `${player}King` : player;
    }

    function draughtsIndex(row, col) {
        return row * 10 + col;
    }

    function draughtsPosition(index) {
        return { row: Math.floor(index / 10), col: index % 10 };
    }

    function draughtsInBounds(row, col) {
        return row >= 0 && row < 10 && col >= 0 && col < 10;
    }

    function draughtsIsPlayable(row, col) {
        return (row + col) % 2 === 1;
    }

    function draughtsLabel(index) {
        const pos = draughtsPosition(index);
        return `R${pos.row + 1} C${pos.col + 1}`;
    }

    function draughtsMoveKey(from, path, captures) {
        return `draughts:${from}:${path.join('-')}:${captures.join('-')}`;
    }

    function draughtsMoveText(move) {
        const route = move.path.map(draughtsLabel).join(' → ');
        return move.captures.length ? `${route}，吃 ${move.captures.length} 子` : route;
    }

    function draughtsInitialState(game) {
        const state = createBaseState(boardTotal(game), 'white');
        for (let row = 0; row < 10; row += 1) {
            for (let col = 0; col < 10; col += 1) {
                if (!draughtsIsPlayable(row, col)) continue;
                const index = draughtsIndex(row, col);
                if (row < 4) state.board[index] = 'black';
                if (row > 5) state.board[index] = 'white';
            }
        }
        return state;
    }

    function draughtsPromote(piece, index) {
        const owner = draughtsOwner(piece);
        const row = draughtsPosition(index).row;
        if (piece === 'white' && row === 0) return 'whiteKing';
        if (piece === 'black' && row === 9) return 'blackKing';
        return draughtsPiece(owner, draughtsIsKing(piece));
    }

    function draughtsMoveObject(from, path, captures) {
        const to = path[path.length - 1];
        return {
            type: 'draughts',
            index: draughtsMoveKey(from, path, captures),
            from,
            to,
            path: path.slice(),
            captures: captures.slice()
        };
    }

    function collectDraughtsManCaptures(board, player, from, path, captures, output) {
        let found = false;
        const piece = board[from];
        const pos = draughtsPosition(from);
        for (const [dr, dc] of DRAUGHTS_DIRECTIONS) {
            const midRow = pos.row + dr;
            const midCol = pos.col + dc;
            const landRow = pos.row + dr * 2;
            const landCol = pos.col + dc * 2;
            if (!draughtsInBounds(landRow, landCol)) continue;
            const middle = draughtsIndex(midRow, midCol);
            const landing = draughtsIndex(landRow, landCol);
            if (draughtsOwner(board[middle]) !== (player === 'white' ? 'black' : 'white') || board[landing]) continue;
            found = true;
            const nextBoard = board.slice();
            nextBoard[from] = null;
            nextBoard[middle] = null;
            nextBoard[landing] = piece;
            collectDraughtsManCaptures(nextBoard, player, landing, path.concat(landing), captures.concat(middle), output);
        }
        if (!found && captures.length) output.push(draughtsMoveObject(path[0], path, captures));
    }

    function collectDraughtsKingCaptures(board, player, from, path, captures, output) {
        let found = false;
        const piece = board[from];
        const pos = draughtsPosition(from);
        const opponent = player === 'white' ? 'black' : 'white';
        for (const [dr, dc] of DRAUGHTS_DIRECTIONS) {
            let row = pos.row + dr;
            let col = pos.col + dc;
            while (draughtsInBounds(row, col) && !board[draughtsIndex(row, col)]) {
                row += dr;
                col += dc;
            }
            if (!draughtsInBounds(row, col)) continue;
            const captured = draughtsIndex(row, col);
            if (draughtsOwner(board[captured]) !== opponent) continue;
            row += dr;
            col += dc;
            while (draughtsInBounds(row, col) && !board[draughtsIndex(row, col)]) {
                found = true;
                const landing = draughtsIndex(row, col);
                const nextBoard = board.slice();
                nextBoard[from] = null;
                nextBoard[captured] = null;
                nextBoard[landing] = piece;
                collectDraughtsKingCaptures(nextBoard, player, landing, path.concat(landing), captures.concat(captured), output);
                row += dr;
                col += dc;
            }
        }
        if (!found && captures.length) output.push(draughtsMoveObject(path[0], path, captures));
    }

    function draughtsCapturesFrom(board, player, from) {
        const piece = board[from];
        if (draughtsOwner(piece) !== player) return [];
        const output = [];
        if (draughtsIsKing(piece)) collectDraughtsKingCaptures(board, player, from, [from], [], output);
        else collectDraughtsManCaptures(board, player, from, [from], [], output);
        return output;
    }

    function draughtsSimpleMovesFrom(board, player, from) {
        const piece = board[from];
        if (draughtsOwner(piece) !== player) return [];
        const pos = draughtsPosition(from);
        const moves = [];
        if (draughtsIsKing(piece)) {
            for (const [dr, dc] of DRAUGHTS_DIRECTIONS) {
                let row = pos.row + dr;
                let col = pos.col + dc;
                while (draughtsInBounds(row, col) && !board[draughtsIndex(row, col)]) {
                    const to = draughtsIndex(row, col);
                    moves.push(draughtsMoveObject(from, [from, to], []));
                    row += dr;
                    col += dc;
                }
            }
            return moves;
        }
        const forward = player === 'white' ? -1 : 1;
        for (const dc of [-1, 1]) {
            const row = pos.row + forward;
            const col = pos.col + dc;
            if (!draughtsInBounds(row, col)) continue;
            const to = draughtsIndex(row, col);
            if (!board[to]) moves.push(draughtsMoveObject(from, [from, to], []));
        }
        return moves;
    }

    function getDraughtsMoves(game, state) {
        if (state.ended) return [];
        const captures = [];
        const quietMoves = [];
        state.board.forEach((piece, index) => {
            if (draughtsOwner(piece) !== state.current) return;
            captures.push(...draughtsCapturesFrom(state.board, state.current, index));
            quietMoves.push(...draughtsSimpleMovesFrom(state.board, state.current, index));
        });
        if (captures.length) {
            const maxCaptures = captures.reduce((max, move) => Math.max(max, move.captures.length), 0);
            return captures.filter(move => move.captures.length === maxCaptures);
        }
        return quietMoves;
    }

    function applyDraughtsMove(game, state, move) {
        const player = state.current;
        const opponent = otherPlayer(game, player);
        const next = cloneState(state);
        const piece = next.board[move.from];
        next.board[move.from] = null;
        move.captures.forEach(index => { next.board[index] = null; });
        next.board[move.to] = draughtsPromote(piece, move.to);
        next.moveCount += 1;
        next.moves.push({ player, index: move.index, text: `${playerInfo(game, player).label} ${draughtsMoveText(move)}` });
        next.passMessage = '';
        next.winLine = move.path.slice();
        const opponentPieces = next.board.filter(item => draughtsOwner(item) === opponent).length;
        if (opponentPieces === 0) {
            next.ended = true;
            next.winner = player;
            return next;
        }
        next.current = opponent;
        if (!getDraughtsMoves(game, next).length) {
            next.ended = true;
            next.winner = player;
            next.current = opponent;
        }
        return next;
    }

    function getDraughtsHint(game, state) {
        const moves = getDraughtsMoves(game, state);
        if (!moves.length) return null;
        const player = state.current;
        const best = moves.slice().sort((a, b) => {
            const captureDelta = b.captures.length - a.captures.length;
            if (captureDelta) return captureDelta;
            const pieceA = state.board[a.from];
            const pieceB = state.board[b.from];
            const promoteA = !draughtsIsKing(pieceA) && draughtsIsKing(draughtsPromote(pieceA, a.to)) ? 1 : 0;
            const promoteB = !draughtsIsKing(pieceB) && draughtsIsKing(draughtsPromote(pieceB, b.to)) ? 1 : 0;
            if (promoteA !== promoteB) return promoteB - promoteA;
            const rowA = draughtsPosition(a.to).row;
            const rowB = draughtsPosition(b.to).row;
            const progressA = player === 'white' ? 9 - rowA : rowA;
            const progressB = player === 'white' ? 9 - rowB : rowB;
            return progressB - progressA;
        })[0];
        const reason = best.captures.length
            ? `符合最长吃子规则，可连续吃 ${best.captures.length} 子。`
            : draughtsIsKing(draughtsPromote(state.board[best.from], best.to)) && !draughtsIsKing(state.board[best.from])
                ? '可以升为王棋。'
                : '有利于向升王线推进并保持中心活动力。';
        return { index: best.to, text: `建议 ${draughtsMoveText(best)}，${reason}` };
    }

    function countDraughtsPieces(board) {
        return board.reduce((counts, piece) => {
            if (piece === 'white') counts.white += 1;
            if (piece === 'black') counts.black += 1;
            if (piece === 'whiteKing') counts.whiteKing += 1;
            if (piece === 'blackKing') counts.blackKing += 1;
            return counts;
        }, { white: 0, black: 0, whiteKing: 0, blackKing: 0 });
    }

    function animalChessIndex(row, col) {
        return row * 7 + col;
    }

    function animalChessPosition(index) {
        return { row: Math.floor(index / 7), col: index % 7 };
    }

    function animalChessInBounds(row, col) {
        return row >= 0 && row < 9 && col >= 0 && col < 7;
    }

    function animalChessOwner(piece) {
        if (!piece) return null;
        return piece[0] === 'r' ? 'red' : 'black';
    }

    function animalChessKind(piece) {
        return piece ? piece[1] : null;
    }

    function animalChessPiece(player, kind) {
        return `${player === 'red' ? 'r' : 'b'}${kind}`;
    }

    function animalChessLabel(index) {
        const pos = animalChessPosition(index);
        return `R${pos.row + 1} C${pos.col + 1}`;
    }

    function animalChessPieceLabel(piece) {
        return piece ? `${animalChessOwner(piece) === 'red' ? '红' : '黑'}${ANIMAL_CHESS_NAMES[animalChessKind(piece)]}` : '空位';
    }

    function animalChessImage(piece) {
        return `./assets/img/animalchess-${piece.toLowerCase()}.png`;
    }

    function animalChessTrapOwner(index) {
        if (ANIMAL_CHESS_TRAPS.black.has(index)) return 'black';
        if (ANIMAL_CHESS_TRAPS.red.has(index)) return 'red';
        return null;
    }

    function animalChessDenOwner(index) {
        if (index === ANIMAL_CHESS_DENS.black) return 'black';
        if (index === ANIMAL_CHESS_DENS.red) return 'red';
        return null;
    }

    function animalChessTerrainName(index) {
        const den = animalChessDenOwner(index);
        const trap = animalChessTrapOwner(index);
        if (den) return `${den === 'red' ? '红方' : '黑方'}兽穴`;
        if (trap) return `${trap === 'red' ? '红方' : '黑方'}陷阱`;
        if (ANIMAL_CHESS_RIVERS.has(index)) return '河流';
        return '陆地';
    }

    function animalChessInitialState(game) {
        const state = createBaseState(boardTotal(game), 'red');
        const placements = {
            0: 'bL', 6: 'bT', 8: 'bD', 12: 'bC', 14: 'bR', 16: 'bP', 18: 'bW', 20: 'bE',
            42: 'rE', 44: 'rW', 46: 'rP', 48: 'rR', 50: 'rC', 54: 'rD', 56: 'rT', 62: 'rL'
        };
        Object.entries(placements).forEach(([index, piece]) => {
            state.board[Number(index)] = piece;
        });
        return state;
    }

    function canAnimalChessCapture(board, from, to) {
        const attacker = board[from];
        const target = board[to];
        if (!attacker || !target || animalChessOwner(attacker) === animalChessOwner(target)) return false;
        const attackerOwner = animalChessOwner(attacker);
        const attackerKind = animalChessKind(attacker);
        const targetKind = animalChessKind(target);
        if (animalChessTrapOwner(to) === attackerOwner) return true;
        const fromRiver = ANIMAL_CHESS_RIVERS.has(from);
        const toRiver = ANIMAL_CHESS_RIVERS.has(to);
        if (attackerKind === 'E' && targetKind === 'R') return false;
        if (attackerKind === 'R') {
            if (fromRiver || toRiver) return targetKind === 'R' && fromRiver && toRiver;
            if (targetKind === 'E') return true;
        }
        if (fromRiver || toRiver) return false;
        return ANIMAL_CHESS_RANKS[attackerKind] >= ANIMAL_CHESS_RANKS[targetKind];
    }

    function canAnimalChessLand(board, player, from, to) {
        if (ANIMAL_CHESS_DENS[player] === to) return false;
        const piece = board[from];
        if (!piece) return false;
        if (ANIMAL_CHESS_RIVERS.has(to) && animalChessKind(piece) !== 'R') return false;
        const target = board[to];
        if (!target) return true;
        return canAnimalChessCapture(board, from, to);
    }

    function animalChessMoveObject(board, from, to) {
        return {
            type: 'animalchess',
            index: `animalchess:${from}-${to}`,
            from,
            to,
            piece: board[from],
            capture: board[to] || null
        };
    }

    function animalChessJumpTarget(board, player, from, dr, dc) {
        let pos = animalChessPosition(from);
        let row = pos.row + dr;
        let col = pos.col + dc;
        if (!animalChessInBounds(row, col) || !ANIMAL_CHESS_RIVERS.has(animalChessIndex(row, col))) return null;
        while (animalChessInBounds(row, col) && ANIMAL_CHESS_RIVERS.has(animalChessIndex(row, col))) {
            const riverIndex = animalChessIndex(row, col);
            if (animalChessKind(board[riverIndex]) === 'R') return null;
            row += dr;
            col += dc;
        }
        if (!animalChessInBounds(row, col)) return null;
        const to = animalChessIndex(row, col);
        return canAnimalChessLand(board, player, from, to) ? to : null;
    }

    function animalChessMovesFrom(board, player, from) {
        const piece = board[from];
        if (animalChessOwner(piece) !== player) return [];
        const kind = animalChessKind(piece);
        const pos = animalChessPosition(from);
        const moves = [];
        for (const [dr, dc] of ANIMAL_CHESS_DIRECTIONS) {
            const row = pos.row + dr;
            const col = pos.col + dc;
            if (!animalChessInBounds(row, col)) continue;
            const to = animalChessIndex(row, col);
            if ((kind === 'L' || kind === 'T') && ANIMAL_CHESS_RIVERS.has(to)) {
                const jump = animalChessJumpTarget(board, player, from, dr, dc);
                if (jump !== null) moves.push(animalChessMoveObject(board, from, jump));
                continue;
            }
            if (canAnimalChessLand(board, player, from, to)) moves.push(animalChessMoveObject(board, from, to));
        }
        return moves;
    }

    function getAnimalChessMoves(game, state) {
        if (state.ended) return [];
        return state.board.reduce((moves, piece, index) => {
            if (animalChessOwner(piece) === state.current) moves.push(...animalChessMovesFrom(state.board, state.current, index));
            return moves;
        }, []);
    }

    function animalChessMoveText(move) {
        const capture = move.capture ? `，吃 ${animalChessPieceLabel(move.capture)}` : '';
        return `${animalChessPieceLabel(move.piece)} ${animalChessLabel(move.from)} → ${animalChessLabel(move.to)}${capture}`;
    }

    function applyAnimalChessMove(game, state, move) {
        const player = state.current;
        const opponent = otherPlayer(game, player);
        const next = cloneState(state);
        const piece = next.board[move.from];
        const captured = next.board[move.to];
        next.board[move.from] = null;
        next.board[move.to] = piece;
        next.moveCount += 1;
        next.moves.push({ player, index: move.index, text: `${playerInfo(game, player).label} ${animalChessMoveText({ ...move, piece, capture: captured })}` });
        next.passMessage = '';
        next.winLine = [move.from, move.to];
        if (move.to === ANIMAL_CHESS_DENS[opponent]) {
            next.ended = true;
            next.winner = player;
            next.winLine = [move.to];
            return next;
        }
        if (!next.board.some(item => animalChessOwner(item) === opponent)) {
            next.ended = true;
            next.winner = player;
            return next;
        }
        next.current = opponent;
        if (!getAnimalChessMoves(game, next).length) {
            next.ended = true;
            next.winner = player;
        }
        return next;
    }

    function animalChessDistanceToDen(player, index) {
        const target = animalChessPosition(ANIMAL_CHESS_DENS[player === 'red' ? 'black' : 'red']);
        const pos = animalChessPosition(index);
        return Math.abs(pos.row - target.row) + Math.abs(pos.col - target.col);
    }

    function animalChessMoveScore(board, move, player) {
        const opponent = player === 'red' ? 'black' : 'red';
        if (move.to === ANIMAL_CHESS_DENS[opponent]) return 1000000;
        const piece = board[move.from];
        const captureScore = board[move.to] ? ANIMAL_CHESS_VALUES[animalChessKind(board[move.to])] * 12 : 0;
        const progress = (animalChessDistanceToDen(player, move.from) - animalChessDistanceToDen(player, move.to)) * 24;
        const trap = animalChessTrapOwner(move.to) === opponent ? 38 : 0;
        const strength = ANIMAL_CHESS_VALUES[animalChessKind(piece)] * 0.12;
        return captureScore + progress + trap + strength;
    }

    function getAnimalChessHint(game, state) {
        const moves = getAnimalChessMoves(game, state);
        if (!moves.length) return null;
        const best = moves.slice().sort((a, b) => animalChessMoveScore(state.board, b, state.current) - animalChessMoveScore(state.board, a, state.current) || String(a.index).localeCompare(String(b.index)))[0];
        const opponent = otherPlayer(game, state.current);
        const reason = best.to === ANIMAL_CHESS_DENS[opponent]
            ? '可直接进入对方兽穴获胜。'
            : best.capture
                ? `可以吃掉 ${animalChessPieceLabel(best.capture)}。`
                : animalChessTrapOwner(best.to) === opponent
                    ? '靠近对方兽穴，准备借助陷阱突破。'
                    : '能向对方兽穴推进并保持行动力。';
        return { index: best.index, text: `建议 ${animalChessMoveText(best)}，${reason}` };
    }

    function countAnimalChessPieces(board) {
        return board.reduce((counts, piece) => {
            const owner = animalChessOwner(piece);
            if (owner) {
                counts[owner] += 1;
                counts.total += 1;
            }
            return counts;
        }, { red: 0, black: 0, total: 0 });
    }

    function nineChessLabel(index) {
        const rings = ['外圈', '中圈', '内圈'];
        const seats = ['上中', '右上', '右中', '右下', '下中', '左下', '左中', '左上'];
        return `${rings[Math.floor(index / 8)]}${seats[index % 8]}`;
    }

    function nineChessBoardPoint(index) {
        const point = NINE_CHESS_POINTS[index];
        return { x: 8 + point.x * 0.84, y: 8 + point.y * 0.84 };
    }

    function nineChessInitialState(game) {
        const state = createBaseState(boardTotal(game), 'white');
        state.piecesLeft = { white: 9, black: 9 };
        state.phase = 'placing';
        state.action = 'place';
        state.pendingCapture = false;
        state.selectedIndex = null;
        return state;
    }

    function nineChessCounts(board) {
        return board.reduce((counts, piece) => {
            if (piece === 'white') counts.white += 1;
            if (piece === 'black') counts.black += 1;
            return counts;
        }, { white: 0, black: 0 });
    }

    function nineChessPlayerCount(board, player) {
        return board.filter(piece => piece === player).length;
    }

    function nineChessTotalAvailable(state, player) {
        return nineChessPlayerCount(state.board, player) + (state.piecesLeft && state.piecesLeft[player] ? state.piecesLeft[player] : 0);
    }

    function nineChessMillsAt(index) {
        return NINE_CHESS_MILLS.filter(line => line.includes(index));
    }

    function nineChessIsMill(board, player, line) {
        return line.every(index => board[index] === player);
    }

    function nineChessMillAt(board, player, index) {
        return nineChessMillsAt(index).find(line => nineChessIsMill(board, player, line)) || null;
    }

    function nineChessIsPieceInMill(board, index) {
        const player = board[index];
        return Boolean(player && nineChessMillAt(board, player, index));
    }

    function nineChessAllPiecesInMills(board, player) {
        const pieces = board.map((piece, index) => piece === player ? index : -1).filter(index => index >= 0);
        return pieces.length > 0 && pieces.every(index => nineChessIsPieceInMill(board, index));
    }

    function nineChessCanFly(state, player) {
        return state.phase === 'moving' && nineChessPlayerCount(state.board, player) <= 3;
    }

    function nineChessEmptyIndexes(board) {
        return board.map((piece, index) => piece ? -1 : index).filter(index => index >= 0);
    }

    function nineChessCaptureTargets(game, state) {
        const opponent = otherPlayer(game, state.current);
        const occupied = state.board.map((piece, index) => piece === opponent ? index : -1).filter(index => index >= 0);
        if (nineChessAllPiecesInMills(state.board, opponent)) return occupied;
        return occupied.filter(index => !nineChessIsPieceInMill(state.board, index));
    }

    function nineChessShiftTargets(state, from) {
        if (nineChessCanFly(state, state.current)) return nineChessEmptyIndexes(state.board);
        return NINE_CHESS_ADJACENT[from].filter(index => !state.board[index]);
    }

    function nineChessMoveObject(type, values) {
        if (type === 'place') return { type: 'ninechess-place', index: `ninechess:place:${values.to}`, to: values.to };
        if (type === 'shift') return { type: 'ninechess-shift', index: `ninechess:shift:${values.from}-${values.to}`, from: values.from, to: values.to };
        return { type: 'ninechess-capture', index: `ninechess:capture:${values.capture}`, capture: values.capture };
    }

    function getNineChessMovesForPlayer(state, player) {
        if (state.phase !== 'moving') return [];
        return state.board.reduce((moves, piece, from) => {
            if (piece !== player) return moves;
            const targets = nineChessCanFly({ ...state, current: player }, player)
                ? nineChessEmptyIndexes(state.board)
                : NINE_CHESS_ADJACENT[from].filter(index => !state.board[index]);
            targets.forEach(to => moves.push(nineChessMoveObject('shift', { from, to })));
            return moves;
        }, []);
    }

    function getNineChessMoves(game, state) {
        if (state.ended) return [];
        if (state.action === 'capture') {
            return nineChessCaptureTargets(game, state).map(capture => nineChessMoveObject('capture', { capture }));
        }
        if (state.phase === 'placing') {
            if (!state.piecesLeft || state.piecesLeft[state.current] <= 0) return [];
            return nineChessEmptyIndexes(state.board).map(to => nineChessMoveObject('place', { to }));
        }
        return state.board.reduce((moves, piece, from) => {
            if (piece === state.current) {
                nineChessShiftTargets(state, from).forEach(to => moves.push(nineChessMoveObject('shift', { from, to })));
            }
            return moves;
        }, []);
    }

    function nineChessCheckMaterialWinner(game, state) {
        for (const player of game.players.map(item => item.id)) {
            if (nineChessTotalAvailable(state, player) < 3) {
                state.ended = true;
                state.winner = otherPlayer(game, player);
                return true;
            }
        }
        return false;
    }

    function nineChessCheckBlockedWinner(game, state) {
        if (state.phase === 'moving' && state.action !== 'capture' && !getNineChessMovesForPlayer(state, state.current).length) {
            state.ended = true;
            state.winner = otherPlayer(game, state.current);
            return true;
        }
        return false;
    }

    function nineChessCheckWinner(game, state) {
        return nineChessCheckMaterialWinner(game, state) || nineChessCheckBlockedWinner(game, state);
    }

    function nineChessEnterNextTurn(game, state) {
        state.pendingCapture = false;
        state.selectedIndex = null;
        if (state.phase === 'placing' && state.piecesLeft.white === 0 && state.piecesLeft.black === 0) {
            state.phase = 'moving';
            state.current = game.players[0].id;
            state.action = 'move';
            nineChessCheckWinner(game, state);
            return state;
        }
        state.current = otherPlayer(game, state.current);
        state.action = state.phase === 'placing' ? 'place' : 'move';
        nineChessCheckWinner(game, state);
        return state;
    }

    function nineChessLineAfterMove(board, player, index) {
        return nineChessMillAt(board, player, index);
    }

    function nineChessMoveText(game, state, move, player) {
        if (move.type === 'ninechess-place') return `${playerInfo(game, player).label} 落于 ${nineChessLabel(move.to)}`;
        if (move.type === 'ninechess-shift') return `${playerInfo(game, player).label} ${nineChessLabel(move.from)} → ${nineChessLabel(move.to)}`;
        return `${playerInfo(game, player).label} 提掉 ${playerInfo(game, otherPlayer(game, player)).label} ${nineChessLabel(move.capture)}`;
    }

    function applyNineChessMove(game, state, move) {
        const player = state.current;
        const next = cloneState(state);
        next.passMessage = '';
        next.winLine = [];
        next.selectedIndex = null;
        if (move.type === 'ninechess-capture') {
            next.board[move.capture] = null;
            next.moveCount += 1;
            next.moves.push({ player, index: move.index, text: nineChessMoveText(game, state, move, player) });
            next.action = state.phase === 'placing' ? 'place' : 'move';
            next.pendingCapture = false;
            if (!nineChessCheckMaterialWinner(game, next)) nineChessEnterNextTurn(game, next);
            return next;
        }
        if (move.type === 'ninechess-place') {
            next.board[move.to] = player;
            next.piecesLeft[player] -= 1;
            next.moveCount += 1;
            next.moves.push({ player, index: move.index, text: nineChessMoveText(game, state, move, player) });
            const line = nineChessLineAfterMove(next.board, player, move.to);
            if (line) {
                next.action = 'capture';
                next.pendingCapture = true;
                next.winLine = line.slice();
                return next;
            }
            return nineChessEnterNextTurn(game, next);
        }
        next.board[move.from] = null;
        next.board[move.to] = player;
        next.moveCount += 1;
        next.moves.push({ player, index: move.index, text: nineChessMoveText(game, state, move, player) });
        const line = nineChessLineAfterMove(next.board, player, move.to);
        if (line) {
            next.action = 'capture';
            next.pendingCapture = true;
            next.winLine = line.slice();
            return next;
        }
        return nineChessEnterNextTurn(game, next);
    }

    function nineChessPreviewBoard(state, move) {
        const board = state.board.slice();
        if (move.type === 'ninechess-place') board[move.to] = state.current;
        if (move.type === 'ninechess-shift') {
            board[move.from] = null;
            board[move.to] = state.current;
        }
        if (move.type === 'ninechess-capture') board[move.capture] = null;
        return board;
    }

    function nineChessOpenMillCount(board, player) {
        return NINE_CHESS_MILLS.reduce((count, line) => {
            const own = line.filter(index => board[index] === player).length;
            const empty = line.filter(index => !board[index]).length;
            return count + (own === 2 && empty === 1 ? 1 : 0);
        }, 0);
    }

    function nineChessMoveScore(game, state, move) {
        if (move.type === 'ninechess-capture') {
            const opponent = otherPlayer(game, state.current);
            return 3000 + nineChessMillsAt(move.capture).length * 120 + (nineChessIsPieceInMill(state.board, move.capture) ? 30 : 0) + NINE_CHESS_ADJACENT[move.capture].filter(index => state.board[index] === opponent).length * 35;
        }
        const board = nineChessPreviewBoard(state, move);
        const to = move.to;
        const mill = nineChessLineAfterMove(board, state.current, to);
        const opponent = otherPlayer(game, state.current);
        const openOwn = nineChessOpenMillCount(board, state.current);
        const openOpponentBefore = nineChessOpenMillCount(state.board, opponent);
        const openOpponentAfter = nineChessOpenMillCount(board, opponent);
        return (mill ? 5000 : 0)
            + openOwn * 220
            + (openOpponentBefore - openOpponentAfter) * 180
            + NINE_CHESS_ADJACENT[to].length * 18
            + (move.type === 'ninechess-shift' && nineChessCanFly(state, state.current) ? 40 : 0);
    }

    function getNineChessHint(game, state) {
        const moves = getNineChessMoves(game, state);
        if (!moves.length) return null;
        const best = moves.slice().sort((a, b) => nineChessMoveScore(game, state, b) - nineChessMoveScore(game, state, a) || String(a.index).localeCompare(String(b.index)))[0];
        if (best.type === 'ninechess-capture') {
            return { index: best.index, text: `建议提掉 ${playerInfo(game, otherPlayer(game, state.current)).label} ${nineChessLabel(best.capture)}，削弱对手成三潜力。` };
        }
        const board = nineChessPreviewBoard(state, best);
        const reason = nineChessLineAfterMove(board, state.current, best.to)
            ? '这一步可以立即形成三连并获得提子机会。'
            : '这一步能增加活二或阻断对手威胁。';
        return { index: best.index, text: `建议 ${nineChessMoveText(game, state, best, state.current)}，${reason}` };
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

    function chineseCheckersIndex(row, col) {
        if (row < 0 || row >= CHINESE_CHECKERS_ROW_COUNTS.length || col < 0 || col >= CHINESE_CHECKERS_ROW_COUNTS[row]) return -1;
        return CHINESE_CHECKERS_OFFSETS[row] + col;
    }

    function chineseCheckersPosition(index) {
        return CHINESE_CHECKERS_POSITIONS[index] || null;
    }

    function chineseCheckersCoordX(row, col) {
        return col * 2 - CHINESE_CHECKERS_ROW_COUNTS[row] + 1;
    }

    function chineseCheckersIndexByCoord(row, x) {
        if (row < 0 || row >= CHINESE_CHECKERS_ROW_COUNTS.length) return -1;
        const count = CHINESE_CHECKERS_ROW_COUNTS[row];
        const col = (x + count - 1) / 2;
        if (!Number.isInteger(col)) return -1;
        return chineseCheckersIndex(row, col);
    }

    function chineseCheckersLabel(index) {
        const pos = chineseCheckersPosition(index);
        return pos ? `R${pos.row + 1} C${pos.col + 1}` : '-';
    }

    function chineseCheckersBoardPoint(index) {
        const pos = chineseCheckersPosition(index);
        if (!pos) return { x: 50, y: 50 };
        const x = chineseCheckersCoordX(pos.row, pos.col);
        return {
            x: 50 + (x / 24) * 88,
            y: 12 + (pos.row / 16) * 80
        };
    }

    function chineseCheckersAnimationCss(animation) {
        const points = animation.path.map(chineseCheckersBoardPoint);
        const segments = Math.max(1, points.length - 1);
        const frames = [];
        for (let index = 0; index < segments; index += 1) {
            const from = points[index];
            const to = points[index + 1];
            const start = (index / segments) * 100;
            const mid = ((index + 0.5) / segments) * 100;
            const end = ((index + 1) / segments) * 100;
            frames.push(`${start}%{left:${from.x}%;top:${from.y}%;transform:translate(-50%,-50%) scale(1);}`);
            frames.push(`${mid}%{left:${(from.x + to.x) / 2}%;top:${Math.min(from.y, to.y) - 3.8}%;transform:translate(-50%,-50%) scale(1.18);}`);
            frames.push(`${end}%{left:${to.x}%;top:${to.y}%;transform:translate(-50%,-50%) scale(1);}`);
        }
        return `@keyframes cc-jump-${animation.key}{${frames.join('')}}`;
    }

    function chineseCheckersCampIndexes(player) {
        return CHINESE_CHECKERS_CAMPS[player].map(pos => chineseCheckersIndex(pos.row, pos.col));
    }

    function chineseCheckersTarget(player) {
        return player === 'red' ? chineseCheckersCampIndexes('blue') : chineseCheckersCampIndexes('red');
    }

    function chineseCheckersDistance(index, player) {
        const pos = chineseCheckersPosition(index);
        if (!pos) return 0;
        return player === 'red' ? CHINESE_CHECKERS_ROW_COUNTS.length - 1 - pos.row : pos.row;
    }

    function chineseCheckersMoveKey(from, to) {
        return `cc:${from}:${to}`;
    }

    function chineseCheckersMoveText(move) {
        return `${chineseCheckersLabel(move.from)} → ${chineseCheckersLabel(move.to)}${move.jump ? `，跳跃 ${move.jumpCount || 1} 次` : ''}`;
    }

    function chineseCheckersInitialState(game) {
        const state = createBaseState(boardTotal(game), 'red');
        chineseCheckersCampIndexes('red').forEach(index => { state.board[index] = 'red'; });
        chineseCheckersCampIndexes('blue').forEach(index => { state.board[index] = 'blue'; });
        return state;
    }

    function chineseCheckersStepTargets(index) {
        const pos = chineseCheckersPosition(index);
        if (!pos) return [];
        const x = chineseCheckersCoordX(pos.row, pos.col);
        return CHINESE_CHECKERS_DIRECTIONS
            .map(([dr, dx]) => chineseCheckersIndexByCoord(pos.row + dr, x + dx))
            .filter(item => item >= 0);
    }

    function chineseCheckersJumpMoves(board, from, player) {
        const output = [];
        const visited = new Set([from]);
        const queue = [{ index: from, path: [from] }];
        let cursor = 0;
        while (cursor < queue.length) {
            const current = queue[cursor];
            cursor += 1;
            const pos = chineseCheckersPosition(current.index);
            const x = chineseCheckersCoordX(pos.row, pos.col);
            for (const [dr, dx] of CHINESE_CHECKERS_DIRECTIONS) {
                const middle = chineseCheckersIndexByCoord(pos.row + dr, x + dx);
                const landing = chineseCheckersIndexByCoord(pos.row + dr * 2, x + dx * 2);
                if (middle < 0 || landing < 0 || !board[middle] || board[landing] || visited.has(landing)) continue;
                visited.add(landing);
                const path = current.path.concat(landing);
                output.push({
                    type: 'chinese-checkers',
                    index: chineseCheckersMoveKey(from, landing),
                    from,
                    to: landing,
                    player,
                    jump: true,
                    jumpCount: path.length - 1,
                    path
                });
                queue.push({ index: landing, path });
            }
        }
        return output;
    }

    function getChineseCheckersMovesFrom(game, state, from) {
        if (state.board[from] !== state.current) return [];
        const stepMoves = chineseCheckersStepTargets(from)
            .filter(index => !state.board[index])
            .map(to => ({
                type: 'chinese-checkers',
                index: chineseCheckersMoveKey(from, to),
                from,
                to,
                player: state.current,
                jump: false,
                jumpCount: 0,
                path: [from, to]
            }));
        return stepMoves.concat(chineseCheckersJumpMoves(state.board, from, state.current));
    }

    function getChineseCheckersMoves(game, state) {
        if (state.ended) return [];
        return state.board.reduce((moves, value, index) => {
            if (value === state.current) moves.push(...getChineseCheckersMovesFrom(game, state, index));
            return moves;
        }, []);
    }

    function chineseCheckersHasWon(state, player) {
        const target = chineseCheckersTarget(player);
        return target.every(index => state.board[index] === player);
    }

    function applyChineseCheckersMove(game, state, move) {
        const player = state.current;
        const next = cloneState(state);
        next.board[move.from] = null;
        next.board[move.to] = player;
        next.moveCount += 1;
        next.passMessage = '';
        next.moves.push({ player, index: move.index, text: `${playerInfo(game, player).label} ${chineseCheckersMoveText(move)}` });
        if (chineseCheckersHasWon(next, player)) {
            next.ended = true;
            next.winner = player;
            next.winLine = chineseCheckersTarget(player);
        } else {
            next.current = otherPlayer(game, player);
            next.winLine = [];
        }
        return next;
    }

    function getChineseCheckersHint(game, state) {
        const moves = getChineseCheckersMoves(game, state);
        if (!moves.length) return null;
        const scored = moves.map(move => {
            const gain = chineseCheckersDistance(move.to, state.current) - chineseCheckersDistance(move.from, state.current);
            return { move, score: gain * 10 + (move.jumpCount || 0) * 4 - Math.abs((chineseCheckersPosition(move.to)?.col || 0) - 4) };
        }).sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)));
        const best = scored[0].move;
        return { index: best.to, text: `建议 ${chineseCheckersMoveText(best)}，优先向目标营地推进。` };
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
            id: 'draughts',
            name: '国际跳棋',
            tag: '10 x 10',
            color: '#92400e',
            rows: 10,
            columns: 10,
            minSize: 10,
            maxSize: 10,
            sizeStep: 1,
            goal: '吃光或困住对方棋子',
            hintLabel: '最长吃子与升王推进',
            summary: '10 × 10 国际跳棋：只在暗格行棋，强制吃子且必须选择最长连吃路线，王棋可沿斜线长距离飞行。',
            rules: ['白棋先手。', '兵普通移动只能向前斜走一格，吃子时可向四个斜向跳吃并继续连吃。', '王棋可沿任意斜线移动任意距离，吃子后可落在被吃棋后方任意空格并继续连吃。', '存在吃子时必须吃子；多条吃子路线中必须选择吃子数量最多的路线。', '兵到达对方底线后升为王棋；对手无棋或无合法行动时获胜。'],
            players: [
                { id: 'white', label: '白棋', className: 'draughts-white', symbol: '●' },
                { id: 'black', label: '黑棋', className: 'draughts-black', symbol: '●' }
            ],
            initialState() {
                return draughtsInitialState(this);
            },
            getLegalMoves(state) {
                return getDraughtsMoves(this, state);
            },
            applyMove(state, move) {
                return applyDraughtsMove(this, state, move);
            },
            getHint(state) {
                return getDraughtsHint(this, state);
            },
            analyze(state) {
                const counts = countDraughtsPieces(state.board);
                return [
                    { label: '白兵', value: counts.white, total: 20 },
                    { label: '白王', value: counts.whiteKing, total: 20 },
                    { label: '黑兵', value: counts.black, total: 20 },
                    { label: '黑王', value: counts.blackKing, total: 20 }
                ];
            }
        },
        {
            id: 'animalchess',
            name: '斗兽棋',
            tag: '9 x 7',
            color: '#16a34a',
            rows: 9,
            columns: 7,
            minSize: 9,
            maxSize: 9,
            sizeStep: 1,
            goal: '率先进入对方兽穴',
            hintLabel: '兽阶克制、陷阱与跳河',
            summary: '经典斗兽棋：红黑双方以八种动物争夺兽穴，利用河流、陷阱和鼠克象等特殊规则突破防线。',
            rules: ['红方先手。', '棋子每回合沿上下左右移动一格，不能进入己方兽穴；任意棋子进入对方兽穴即胜。', '除鼠外不能进入河流；狮、虎可沿直线跳过无鼠阻挡的河流。', '高阶动物可吃同阶或低阶动物，鼠可在陆地吃象，象不能吃鼠。', '进入对方陷阱的棋子失去兽阶保护，可被任意敌方棋子吃掉。'],
            players: [
                { id: 'red', label: '红方', className: 'animal-red' },
                { id: 'black', label: '黑方', className: 'animal-black' }
            ],
            initialState() {
                return animalChessInitialState(this);
            },
            getLegalMoves(state) {
                return getAnimalChessMoves(this, state);
            },
            applyMove(state, move) {
                return applyAnimalChessMove(this, state, move);
            },
            getHint(state) {
                return getAnimalChessHint(this, state);
            },
            analyze(state) {
                const counts = countAnimalChessPieces(state.board);
                const legal = this.getLegalMoves(state).length;
                return [
                    { label: '红方棋子', value: counts.red, total: 8 },
                    { label: '黑方棋子', value: counts.black, total: 8 },
                    { label: '已占格', value: counts.total, total: 16 },
                    { label: '合法行动', value: legal, total: 32 }
                ];
            }
        },
        {
            id: 'ninechess',
            name: '九子棋',
            tag: '24 点',
            color: '#a16207',
            rows: 7,
            columns: 7,
            totalCells: 24,
            minSize: 7,
            maxSize: 7,
            sizeStep: 1,
            goal: '成三提子并困住对手',
            hintLabel: '成三、活二与飞子',
            summary: '莫里斯九子棋：双方各 9 子，先摆子再沿线走子，成三即可提子；只剩 3 子时可飞到任意空点。',
            rules: ['白棋先手，双方轮流把手中 9 枚棋子摆到 24 个交叉点。', '任意一方在一条合法线段上形成三子相连后，立即提掉对手一子。', '提子时不能提对手已在三连中的棋，除非对手所有棋子都在三连中。', '摆子完成后进入走子阶段，通常只能沿线移动到相邻空点。', '当一方仅剩 3 枚棋子时，可以飞到任意空点；少于 3 子或无合法移动时判负。'],
            players: [
                { id: 'white', label: '白棋', className: 'nine-white', symbol: '●' },
                { id: 'black', label: '黑棋', className: 'nine-black', symbol: '●' }
            ],
            initialState() {
                return nineChessInitialState(this);
            },
            getLegalMoves(state) {
                return getNineChessMoves(this, state);
            },
            applyMove(state, move) {
                return applyNineChessMove(this, state, move);
            },
            getHint(state) {
                return getNineChessHint(this, state);
            },
            analyze(state) {
                const counts = nineChessCounts(state.board);
                const legal = this.getLegalMoves(state).length;
                return [
                    { label: '白棋在盘', value: counts.white, total: 9 },
                    { label: '黑棋在盘', value: counts.black, total: 9 },
                    { label: '白棋手中', value: state.piecesLeft.white, total: 9 },
                    { label: '黑棋手中', value: state.piecesLeft.black, total: 9 },
                    { label: '合法行动', value: legal, total: 24 }
                ];
            }
        },
        {
            id: 'chinese-checkers',
            name: '中国跳棋',
            tag: '17 行星形棋盘',
            color: '#ec4899',
            rows: 17,
            columns: 13,
            totalCells: 121,
            minSize: 17,
            maxSize: 17,
            sizeStep: 1,
            goal: '率先占满对侧营地',
            hintLabel: '推进距离与连续跳跃',
            summary: '二人中国跳棋：红蓝从对角营地出发，通过相邻一步或连续跳跃抢占对侧三角营地。',
            rules: ['红方先手。', '每回合选择己方棋子后，可移动到相邻空洞，或连续跳过任意相邻棋子到后方空洞。', '先让己方 10 枚棋子全部进入对侧营地即胜。'],
            players: [
                { id: 'red', label: '红方', className: 'cc-red', symbol: '●' },
                { id: 'blue', label: '蓝方', className: 'cc-blue', symbol: '●' }
            ],
            initialState() {
                return chineseCheckersInitialState(this);
            },
            getLegalMoves(state) {
                return getChineseCheckersMoves(this, state);
            },
            applyMove(state, move) {
                return applyChineseCheckersMove(this, state, move);
            },
            getHint(state) {
                return getChineseCheckersHint(this, state);
            },
            analyze(state) {
                const redTarget = chineseCheckersTarget('red').filter(index => state.board[index] === 'red').length;
                const blueTarget = chineseCheckersTarget('blue').filter(index => state.board[index] === 'blue').length;
                return [
                    { label: '红方入营', value: redTarget, total: 10 },
                    { label: '蓝方入营', value: blueTarget, total: 10 },
                    { label: '红方棋子', value: state.board.filter(value => value === 'red').length, total: 10 },
                    { label: '蓝方棋子', value: state.board.filter(value => value === 'blue').length, total: 10 }
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

    function selectChineseCheckersPiece(index) {
        if (app.state.ended || isAiTurn() || app.aiThinking || app.state.board[index] !== app.state.current) return;
        const moves = getChineseCheckersMovesFrom(app.game, app.state, index);
        app.chineseCheckersSelection = { index, moves };
        app.hintIndex = null;
        app.hintText = moves.length
            ? `已选择 ${chineseCheckersLabel(index)}，可移动到 ${moves.length} 个位置。`
            : '该棋子当前没有可移动位置。';
        renderBoard();
        renderHint();
    }

    function selectDraughtsPiece(index) {
        if (app.state.ended || isAiTurn() || app.aiThinking || draughtsOwner(app.state.board[index]) !== app.state.current) return;
        const moves = app.game.getLegalMoves(app.state).filter(move => move.from === index);
        app.draughtsSelection = { index, moves };
        app.hintIndex = null;
        app.hintText = moves.length
            ? `已选择 ${draughtsLabel(index)}，可移动到 ${moves.length} 个位置。`
            : '该棋子当前没有符合最长吃子规则的移动。';
        renderBoard();
        renderHint();
    }

    function selectAnimalChessPiece(index) {
        if (app.state.ended || isAiTurn() || app.aiThinking || animalChessOwner(app.state.board[index]) !== app.state.current) return;
        const moves = animalChessMovesFrom(app.state.board, app.state.current, index);
        app.animalChessSelection = { index, moves };
        app.hintIndex = null;
        app.hintText = moves.length
            ? `已选择 ${animalChessPieceLabel(app.state.board[index])} ${animalChessLabel(index)}，可移动到 ${moves.length} 个位置。`
            : '该棋子当前没有可移动位置。';
        renderBoard();
        renderHint();
    }

    function selectNineChessPiece(index) {
        if (app.state.ended || isAiTurn() || app.aiThinking || app.state.action !== 'move' || app.state.board[index] !== app.state.current) return;
        const moves = getNineChessMoves(app.game, app.state).filter(move => move.from === index);
        app.nineChessSelection = { index, moves };
        app.hintIndex = null;
        app.hintText = moves.length
            ? `已选择 ${nineChessLabel(index)}，可移动到 ${moves.length} 个位置。`
            : '该棋子当前没有可移动位置。';
        renderBoard();
        renderHint();
    }

    function renderDraughtsBoard(game, state) {
        const selected = app.draughtsSelection && draughtsOwner(state.board[app.draughtsSelection.index]) === state.current
            ? app.draughtsSelection
            : null;
        const selectedMoves = selected ? new Map(selected.moves.map(move => [move.to, move])) : new Map();
        const movable = new Set(game.getLegalMoves(state).map(move => move.from));
        const locked = state.ended || isAiTurn() || app.aiThinking;

        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.style.setProperty('--cols', game.columns);
        refs.board.style.setProperty('--rows', game.rows);
        refs.board.innerHTML = '';

        state.board.forEach((pieceValue, index) => {
            const pos = draughtsPosition(index);
            const playable = draughtsIsPlayable(pos.row, pos.col);
            const move = selectedMoves.get(index);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = `draughts-cell ${playable ? 'dark' : 'light'}`;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${draughtsLabel(index)} ${pieceValue ? playerInfo(game, draughtsOwner(pieceValue)).label : playable ? '空暗格' : '浅格'}`);
            if (pieceValue) cell.classList.add('occupied');
            if (selected && selected.index === index) cell.classList.add('selected');
            if (movable.has(index)) cell.classList.add('movable');
            if (move) cell.classList.add('legal', move.captures.length ? 'capture' : 'quiet');
            if (app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');

            if (pieceValue) {
                const owner = draughtsOwner(pieceValue);
                const piece = document.createElement('span');
                piece.className = `draughts-piece ${playerInfo(game, owner).className}${draughtsIsKing(pieceValue) ? ' king' : ''}`;
                piece.textContent = draughtsIsKing(pieceValue) ? '♛' : '';
                cell.appendChild(piece);
            }

            cell.disabled = locked || !playable || (!move && !movable.has(index));
            cell.addEventListener('click', () => {
                if (move) {
                    playMove(move);
                    return;
                }
                selectDraughtsPiece(index);
            });
            refs.board.appendChild(cell);
        });
    }

    function renderAnimalChessBoard(game, state) {
        const selected = app.animalChessSelection && animalChessOwner(state.board[app.animalChessSelection.index]) === state.current
            ? app.animalChessSelection
            : null;
        const legalMoves = game.getLegalMoves(state);
        const selectedMoves = selected ? new Map(selected.moves.map(move => [move.to, move])) : new Map();
        const movable = new Set(legalMoves.map(move => move.from));
        const hintMove = legalMoves.find(move => move.index === app.hintIndex);
        const locked = state.ended || isAiTurn() || app.aiThinking;

        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.style.setProperty('--cols', game.columns);
        refs.board.style.setProperty('--rows', game.rows);
        refs.board.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'animalchess-info';
        info.textContent = selected
            ? `${playerInfo(game, state.current).label} 已选择 ${animalChessPieceLabel(state.board[selected.index])} · 点击高亮格完成移动`
            : `${playerInfo(game, state.current).label} 行动中 · 先选择己方可移动动物`;
        refs.board.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'animalchess-grid';

        state.board.forEach((pieceValue, index) => {
            const move = selectedMoves.get(index);
            const owner = animalChessOwner(pieceValue);
            const canSelect = !locked && owner === state.current && movable.has(index);
            const cell = document.createElement('button');
            const den = animalChessDenOwner(index);
            const trap = animalChessTrapOwner(index);
            cell.type = 'button';
            cell.className = 'cell animalchess-cell';
            if (ANIMAL_CHESS_RIVERS.has(index)) cell.classList.add('river');
            if (den) cell.classList.add('den', `${den}-den`);
            if (trap) cell.classList.add('trap', `${trap}-trap`);
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${animalChessLabel(index)} ${animalChessTerrainName(index)} ${pieceValue ? animalChessPieceLabel(pieceValue) : '空位'}`);
            if (pieceValue) cell.classList.add('occupied', owner);
            if (selected && selected.index === index) cell.classList.add('selected');
            if (canSelect) cell.classList.add('movable');
            if (move) cell.classList.add('legal', move.capture ? 'capture' : 'quiet');
            if (hintMove && hintMove.to === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');

            if (pieceValue) {
                const piece = document.createElement('img');
                piece.className = `animalchess-piece ${owner}`;
                piece.src = animalChessImage(pieceValue);
                piece.alt = animalChessPieceLabel(pieceValue);
                piece.draggable = false;
                cell.appendChild(piece);
            }

            cell.disabled = locked || (!move && !canSelect);
            cell.addEventListener('click', () => {
                if (move) {
                    playMove(move);
                    return;
                }
                selectAnimalChessPiece(index);
            });
            grid.appendChild(cell);
        });

        refs.board.appendChild(grid);
    }

    function renderNineChessBoard(game, state) {
        const selected = app.nineChessSelection && state.board[app.nineChessSelection.index] === state.current
            ? app.nineChessSelection
            : null;
        const legalMoves = game.getLegalMoves(state);
        const selectedMoves = selected ? new Map(selected.moves.map(move => [move.to, move])) : new Map();
        const legalByIndex = new Map(legalMoves.filter(move => move.type !== 'ninechess-shift').map(move => [move.type === 'ninechess-capture' ? move.capture : move.to, move]));
        const hintMove = legalMoves.find(move => move.index === app.hintIndex);
        const movable = new Set(legalMoves.filter(move => move.type === 'ninechess-shift').map(move => move.from));
        const locked = state.ended || isAiTurn() || app.aiThinking;

        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'ninechess-info';
        if (state.action === 'capture') {
            info.textContent = `${playerInfo(game, state.current).label} 已成三 · 请选择一枚对方棋子提掉`;
        } else if (state.phase === 'placing') {
            info.textContent = `${playerInfo(game, state.current).label} 摆子中 · 手中剩余 ${state.piecesLeft[state.current]} 枚`;
        } else if (selected) {
            info.textContent = `${playerInfo(game, state.current).label} 已选择 ${nineChessLabel(selected.index)} · 点击高亮点移动`;
        } else {
            info.textContent = `${playerInfo(game, state.current).label} 走子中${nineChessCanFly(state, state.current) ? ' · 剩三子可飞任意空点' : ' · 先选择己方可移动棋子'}`;
        }
        refs.board.appendChild(info);

        const board = document.createElement('div');
        board.className = 'ninechess-board';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('ninechess-lines');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('aria-hidden', 'true');
        NINE_CHESS_EDGES.forEach(([from, to]) => {
            const a = nineChessBoardPoint(from);
            const b = nineChessBoardPoint(to);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x);
            line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x);
            line.setAttribute('y2', b.y);
            svg.appendChild(line);
        });
        board.appendChild(svg);

        NINE_CHESS_POINTS.forEach((_, index) => {
            const value = state.board[index];
            const selectedMove = selectedMoves.get(index);
            const legalMove = selectedMove || legalByIndex.get(index);
            const point = nineChessBoardPoint(index);
            const canSelect = !locked && state.action === 'move' && value === state.current && movable.has(index);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'ninechess-point';
            cell.style.left = `${point.x}%`;
            cell.style.top = `${point.y}%`;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${nineChessLabel(index)} ${value ? playerInfo(game, value).label : '空点'}`);
            if (value) cell.classList.add('occupied', value);
            if (selected && selected.index === index) cell.classList.add('selected');
            if (canSelect) cell.classList.add('movable');
            if (legalMove) cell.classList.add('legal', legalMove.type === 'ninechess-capture' ? 'capture' : 'quiet');
            if ((hintMove && (hintMove.to === index || hintMove.capture === index)) || app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');
            if (value) {
                const piece = document.createElement('span');
                piece.className = `ninechess-piece ${playerInfo(game, value).className}`;
                piece.textContent = playerInfo(game, value).symbol || '';
                cell.appendChild(piece);
            }
            cell.disabled = locked || (!legalMove && !canSelect);
            cell.addEventListener('click', () => {
                if (selectedMove || legalMove) {
                    playMove(selectedMove || legalMove);
                    return;
                }
                if (state.action === 'move') {
                    selectNineChessPiece(index);
                }
            });
            board.appendChild(cell);
        });

        refs.board.appendChild(board);
    }

    function renderChineseCheckersBoard(game, state) {
        const selected = app.chineseCheckersSelection && state.board[app.chineseCheckersSelection.index] === state.current
            ? app.chineseCheckersSelection
            : null;
        const selectedMoves = selected ? new Map(selected.moves.map(move => [move.to, move])) : new Map();
        const animation = app.chineseCheckersAnimation;
        const locked = state.ended || isAiTurn() || app.aiThinking || Boolean(animation);

        refs.board.className = `board ${game.id}`;
        refs.board.classList.toggle('is-ai-turn', isAiTurn() || app.aiThinking);
        refs.board.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'chinese-checkers-info';
        info.textContent = animation
            ? `${playerInfo(game, animation.player).label} 正在移动 · 逐段跳跃中`
            : selected
                ? `${playerInfo(game, state.current).label} 已选择 ${chineseCheckersLabel(selected.index)} · 点击高亮洞位完成移动`
                : `${playerInfo(game, state.current).label} 行动中 · 先选择己方棋子`;
        refs.board.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'chinese-checkers-grid';

        CHINESE_CHECKERS_POSITIONS.forEach(pos => {
            const index = pos.index;
            const value = state.board[index];
            const move = selectedMoves.get(index);
            const point = chineseCheckersBoardPoint(index);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'chinese-checkers-hole';
            cell.style.left = `${point.x}%`;
            cell.style.top = `${point.y}%`;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `${chineseCheckersLabel(index)} ${value ? playerInfo(game, value).label : '空洞'}`);
            if (value) cell.classList.add('occupied', value);
            if (selected && selected.index === index) cell.classList.add('selected');
            if (move) cell.classList.add('legal', move.jump ? 'jump-move' : 'step-move');
            if (animation && animation.path.includes(index)) cell.classList.add('move-path');
            if (animation && animation.to === index) cell.classList.add('animating-target');
            if (app.hintIndex === index) cell.classList.add('hint');
            if (state.winLine && state.winLine.includes(index)) cell.classList.add('win');

            if (value && (!animation || animation.to !== index)) {
                const piece = document.createElement('span');
                piece.className = `chinese-checkers-piece ${playerInfo(game, value).className}`;
                piece.textContent = playerInfo(game, value).symbol || '';
                cell.appendChild(piece);
            }

            cell.disabled = locked || (!value && !move) || (value && value !== state.current && !move);
            cell.addEventListener('click', () => {
                if (move) {
                    playMove(move);
                    return;
                }
                selectChineseCheckersPiece(index);
            });
            grid.appendChild(cell);
        });

        if (animation) {
            const style = document.createElement('style');
            style.textContent = chineseCheckersAnimationCss(animation);
            const start = chineseCheckersBoardPoint(animation.path[0]);
            const movingPiece = document.createElement('span');
            movingPiece.className = `chinese-checkers-jump-piece ${playerInfo(game, animation.player).className}`;
            movingPiece.textContent = playerInfo(game, animation.player).symbol || '';
            movingPiece.style.left = `${start.x}%`;
            movingPiece.style.top = `${start.y}%`;
            movingPiece.style.transform = 'translate(-50%, -50%)';
            movingPiece.style.animation = `cc-jump-${animation.key} ${animation.duration}ms ease-in-out forwards`;
            grid.appendChild(style);
            grid.appendChild(movingPiece);
        }

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
        if (game.id === 'chinese-checkers') {
            renderChineseCheckersBoard(game, state);
            return;
        }
        if (game.id === 'draughts') {
            renderDraughtsBoard(game, state);
            return;
        }
        if (game.id === 'animalchess') {
            renderAnimalChessBoard(game, state);
            return;
        }
        if (game.id === 'ninechess') {
            renderNineChessBoard(game, state);
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
        refs.undoBtn.disabled = app.history.length === 0 || app.aiThinking || Boolean(app.qawaleDraft) || Boolean(app.chineseCheckersAnimation);
        refs.hintBtn.disabled = state.ended || legalMoves.length === 0 || isAiTurn() || app.aiThinking || Boolean(app.qawaleDraft) || Boolean(app.chineseCheckersAnimation);
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

        const delay = app.game && app.game.id === 'chinese-checkers' && app.chineseCheckersAnimation
            ? app.chineseCheckersAnimation.duration + 160
            : app.game && app.game.id === 'reversi' && app.reversiFlipAnimation ? 760 : app.aiDifficulty === 'hard' ? 500 : 420;
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
        app.draughtsSelection = null;
        app.animalChessSelection = null;
        app.nineChessSelection = null;
        app.chineseCheckersSelection = null;
        clearChineseCheckersAnimation();
        clearReversiFlipAnimation();
        clearAiTimer();
        refresh();
        scheduleAiMove();
    }

    function playMove(move, options = {}) {
        if (move === null || move === undefined || app.state.ended || app.aiThinking || app.chineseCheckersAnimation) return;
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
        const appliedMove = legalMove || move;
        const movingPlayer = app.state.current;
        const reversiFlips = app.game.id === 'reversi'
            ? (legalMove.flips || []).map(item => ({ index: item, from: app.state.board[item], to: app.state.current })).filter(item => item.from && item.from !== item.to)
            : [];
        app.history.push(cloneState(app.state));
        if (app.history.length > 120) app.history.shift();
        app.state = app.game.applyMove(app.state, appliedMove);
        if (app.game.id === 'reversi') setReversiFlipAnimation(reversiFlips);
        else clearReversiFlipAnimation();
        if (app.game.id === 'chinese-checkers') {
            app.chineseCheckersSelection = null;
            setChineseCheckersAnimation(appliedMove, movingPlayer);
        } else {
            clearChineseCheckersAnimation();
        }
        if (app.game.id === 'draughts') app.draughtsSelection = null;
        if (app.game.id === 'animalchess') app.animalChessSelection = null;
        if (app.game.id === 'ninechess') app.nineChessSelection = null;
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
        app.draughtsSelection = null;
        app.animalChessSelection = null;
        app.nineChessSelection = null;
        app.chineseCheckersSelection = null;
        clearChineseCheckersAnimation();
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
        app.draughtsSelection = null;
        app.animalChessSelection = null;
        app.nineChessSelection = null;
        app.chineseCheckersSelection = null;
        clearChineseCheckersAnimation();
        clearReversiFlipAnimation();
        refresh();
        scheduleAiMove();
    }

    function showHint() {
        if (app.state.ended || isAiTurn() || app.aiThinking || app.qawaleDraft || app.chineseCheckersAnimation) return;
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
