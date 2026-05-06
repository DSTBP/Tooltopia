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
        aiThinking: false
    };

    const GOMOKU_DIRECTIONS = [
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];

    const REVERSI_DIRECTIONS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
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
            vWalls: state.vWalls ? state.vWalls.slice() : undefined
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
        if (game.id === 'quoridor') {
            renderQuoridorBoard(game, state);
            return;
        }
        const legalMap = getLegalMap();
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
        refs.undoBtn.disabled = app.history.length === 0 || app.aiThinking;
        refs.hintBtn.disabled = state.ended || legalMoves.length === 0 || isAiTurn() || app.aiThinking;
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

        app.aiThinking = true;
        refresh();
        app.aiTimer = window.setTimeout(() => {
            app.aiTimer = null;
            performAiMove();
        }, 420);
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
        clearAiTimer();
        refresh();
        scheduleAiMove();
    }

    function playMove(move, options = {}) {
        if (move === null || move === undefined || app.state.ended || app.aiThinking) return;
        if (!options.ai && isAiTurn()) return;
        const legalMap = getLegalMap();
        const index = moveIndex(move);
        const legalMove = legalMap.get(index);
        if (!legalMove && !legalMap.has(index)) {
            app.hintIndex = null;
            app.hintText = '该位置不是当前规则下的合法落点。';
            renderHint();
            return;
        }
        app.history.push(cloneState(app.state));
        if (app.history.length > 120) app.history.shift();
        app.state = app.game.applyMove(app.state, legalMove || move);
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
        refresh();
        scheduleAiMove();
    }

    function showHint() {
        if (app.state.ended || isAiTurn() || app.aiThinking) return;
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
