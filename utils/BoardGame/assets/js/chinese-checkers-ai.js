(() => {
    const ROW_COUNTS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
    const DIRECTIONS = [[0, -2], [0, 2], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    const OFFSETS = ROW_COUNTS.reduce((offsets, count, row) => {
        offsets.push(row === 0 ? 0 : offsets[row - 1] + ROW_COUNTS[row - 1]);
        return offsets;
    }, []);
    const POSITIONS = ROW_COUNTS.flatMap((count, row) => Array.from({ length: count }, (_, col) => ({ row, col, index: OFFSETS[row] + col })));
    const CAMPS = {
        red: [
            [16, 0], [15, 0], [15, 1], [14, 0], [14, 1], [14, 2], [13, 0], [13, 1], [13, 2], [13, 3]
        ],
        blue: [
            [0, 0], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [3, 2], [3, 3]
        ]
    };

    const PROFILES = {
        beginner: { depth: 0, candidateLimit: 8, rootLimit: 10, maxNodes: 400, progressWeight: 10, targetWeight: 28, jumpWeight: 5, centerWeight: 1.2, blockWeight: 0, variety: 14 },
        easy: { depth: 1, candidateLimit: 10, rootLimit: 12, maxNodes: 1800, progressWeight: 14, targetWeight: 44, jumpWeight: 7, centerWeight: 1.8, blockWeight: 3, variety: 6 },
        medium: { depth: 2, candidateLimit: 12, rootLimit: 16, maxNodes: 6500, progressWeight: 18, targetWeight: 70, jumpWeight: 9, centerWeight: 2.6, blockWeight: 7, variety: 0 },
        hard: { depth: 3, candidateLimit: 14, rootLimit: 18, maxNodes: 18000, progressWeight: 23, targetWeight: 100, jumpWeight: 12, centerWeight: 3.4, blockWeight: 12, variety: 0 }
    };

    function otherPlayer(player) {
        return player === 'red' ? 'blue' : 'red';
    }

    function index(row, col) {
        if (row < 0 || row >= ROW_COUNTS.length || col < 0 || col >= ROW_COUNTS[row]) return -1;
        return OFFSETS[row] + col;
    }

    function position(item) {
        return POSITIONS[item] || null;
    }

    function coordX(row, col) {
        return col * 2 - ROW_COUNTS[row] + 1;
    }

    function indexByCoord(row, x) {
        if (row < 0 || row >= ROW_COUNTS.length) return -1;
        const col = (x + ROW_COUNTS[row] - 1) / 2;
        if (!Number.isInteger(col)) return -1;
        return index(row, col);
    }

    function campIndexes(player) {
        return CAMPS[player].map(([row, col]) => index(row, col));
    }

    function targetIndexes(player) {
        return player === 'red' ? campIndexes('blue') : campIndexes('red');
    }

    function distance(indexValue, player) {
        const pos = position(indexValue);
        if (!pos) return 0;
        return player === 'red' ? pos.row : ROW_COUNTS.length - 1 - pos.row;
    }

    function centerPenalty(indexValue) {
        const pos = position(indexValue);
        if (!pos) return 0;
        return Math.abs(coordX(pos.row, pos.col)) * 0.45;
    }

    function moveKey(from, to) {
        return `cc:${from}:${to}`;
    }

    function stepTargets(indexValue) {
        const pos = position(indexValue);
        if (!pos) return [];
        const x = coordX(pos.row, pos.col);
        return DIRECTIONS.map(([dr, dx]) => indexByCoord(pos.row + dr, x + dx)).filter(item => item >= 0);
    }

    function jumpMoves(board, from, player) {
        const moves = [];
        const visited = new Set([from]);
        const queue = [{ index: from, path: [from] }];
        let cursor = 0;
        while (cursor < queue.length) {
            const current = queue[cursor];
            cursor += 1;
            const pos = position(current.index);
            const x = coordX(pos.row, pos.col);
            for (const [dr, dx] of DIRECTIONS) {
                const middle = indexByCoord(pos.row + dr, x + dx);
                const landing = indexByCoord(pos.row + dr * 2, x + dx * 2);
                if (middle < 0 || landing < 0 || !board[middle] || board[landing] || visited.has(landing)) continue;
                visited.add(landing);
                const path = current.path.concat(landing);
                moves.push({ type: 'chinese-checkers', index: moveKey(from, landing), from, to: landing, player, jump: true, jumpCount: path.length - 1, path });
                queue.push({ index: landing, path });
            }
        }
        return moves;
    }

    function movesFrom(board, from, player) {
        if (board[from] !== player) return [];
        const steps = stepTargets(from)
            .filter(to => !board[to])
            .map(to => ({ type: 'chinese-checkers', index: moveKey(from, to), from, to, player, jump: false, jumpCount: 0, path: [from, to] }));
        return steps.concat(jumpMoves(board, from, player));
    }

    function legalMoves(board, player) {
        return board.reduce((moves, value, indexValue) => {
            if (value === player) moves.push(...movesFrom(board, indexValue, player));
            return moves;
        }, []);
    }

    function applyMove(board, move, player) {
        const next = board.slice();
        next[move.from] = null;
        next[move.to] = player;
        return next;
    }

    function hasWon(board, player) {
        return targetIndexes(player).every(item => board[item] === player);
    }

    function boardKey(board, player) {
        return `${player}:${board.map(value => value === 'red' ? 'r' : value === 'blue' ? 'b' : '.').join('')}`;
    }

    function evaluateBoard(board, player, profile) {
        const opponent = otherPlayer(player);
        if (hasWon(board, player)) return 10000000;
        if (hasWon(board, opponent)) return -10000000;

        const ownTarget = new Set(targetIndexes(player));
        const opponentTarget = new Set(targetIndexes(opponent));
        let score = 0;

        board.forEach((value, indexValue) => {
            if (value !== player && value !== opponent) return;
            const sign = value === player ? 1 : -1;
            const target = value === player ? ownTarget : opponentTarget;
            const progress = distance(indexValue, value);
            score += sign * progress * profile.progressWeight;
            if (target.has(indexValue)) score += sign * profile.targetWeight;
            score -= sign * centerPenalty(indexValue) * profile.centerWeight;
        });

        score += (legalMoves(board, player).length - legalMoves(board, opponent).length) * 0.35;
        score += targetIndexes(opponent).filter(item => board[item] === player).length * profile.blockWeight;
        return score;
    }

    function deterministicVariety(indexValue) {
        const value = Math.sin((indexValue + 1) * 12.9898) * 43758.5453;
        return value - Math.floor(value) - 0.5;
    }

    function moveScore(board, move, player, profile) {
        const progress = distance(move.to, player) - distance(move.from, player);
        const targetBonus = targetIndexes(player).includes(move.to) ? profile.targetWeight : 0;
        const next = applyMove(board, move, player);
        return progress * profile.progressWeight
            + targetBonus
            + (move.jumpCount || 0) * profile.jumpWeight
            - centerPenalty(move.to) * profile.centerWeight
            + evaluateBoard(next, player, profile) * 0.05
            + deterministicVariety(move.to) * profile.variety;
    }

    function orderedMoves(board, moves, player, profile, limit) {
        return moves.map(move => ({ move, score: moveScore(board, move, player, profile) }))
            .sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))
            .slice(0, limit)
            .map(item => item.move);
    }

    function minimax(board, current, root, depth, profile, alpha, beta, context) {
        context.nodes += 1;
        if (context.nodes > profile.maxNodes || depth <= 0 || hasWon(board, root) || hasWon(board, otherPlayer(root))) {
            return evaluateBoard(board, root, profile);
        }
        const key = `${boardKey(board, current)}:${depth}:${root}`;
        if (context.cache.has(key)) return context.cache.get(key);
        const moves = legalMoves(board, current);
        if (!moves.length) return evaluateBoard(board, root, profile);
        const candidates = orderedMoves(board, moves, current, profile, profile.candidateLimit);
        const maximizing = current === root;
        let value = maximizing ? -Infinity : Infinity;
        for (const move of candidates) {
            const next = applyMove(board, move, current);
            const score = minimax(next, otherPlayer(current), root, depth - 1, profile, alpha, beta, context);
            if (maximizing) {
                value = Math.max(value, score);
                alpha = Math.max(alpha, value);
            } else {
                value = Math.min(value, score);
                beta = Math.min(beta, value);
            }
            if (beta <= alpha || context.nodes > profile.maxNodes) break;
        }
        context.cache.set(key, value);
        return value;
    }

    function chooseMove(game, state, options = {}) {
        const player = options.player || state.current;
        const profile = PROFILES[options.difficulty] || PROFILES.medium;
        const moves = game.getLegalMoves(state);
        if (!moves.length) return null;
        const candidates = orderedMoves(state.board, moves, player, profile, profile.rootLimit);
        const context = { nodes: 0, cache: new Map() };
        let best = candidates[0];
        let bestScore = -Infinity;
        for (const move of candidates) {
            const next = applyMove(state.board, move, player);
            const score = profile.depth > 0
                ? minimax(next, otherPlayer(player), player, profile.depth, profile, -Infinity, Infinity, context)
                : evaluateBoard(next, player, profile);
            const total = score + moveScore(state.board, move, player, profile) * 0.2;
            if (total > bestScore || (total === bestScore && String(move.index).localeCompare(String(best.index)) < 0)) {
                best = move;
                bestScore = total;
            }
        }
        return best;
    }

    window.ChineseCheckersAI = {
        chooseMove,
        evaluateBoard,
        legalMoves,
        movesFrom,
        profiles: PROFILES
    };
})();
