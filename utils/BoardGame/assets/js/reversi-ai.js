(() => {
    const DIRECTIONS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    const PROFILES = {
        beginner: {
            depth: 0,
            rootLimit: 6,
            candidateLimit: 6,
            maxNodes: 500,
            positionalWeight: 1.8,
            materialWeight: 1.2,
            mobilityWeight: 4,
            potentialMobilityWeight: 1.5,
            cornerWeight: 80,
            stabilityWeight: 12,
            frontierWeight: 2,
            dangerWeight: 30,
            flipWeight: 7,
            variety: 22,
            endgameDepth: 2
        },
        easy: {
            depth: 1,
            rootLimit: 9,
            candidateLimit: 8,
            maxNodes: 2500,
            positionalWeight: 2.4,
            materialWeight: 1.5,
            mobilityWeight: 10,
            potentialMobilityWeight: 3,
            cornerWeight: 180,
            stabilityWeight: 28,
            frontierWeight: 5,
            dangerWeight: 95,
            flipWeight: 4,
            variety: 10,
            endgameDepth: 4
        },
        medium: {
            depth: 3,
            rootLimit: 14,
            candidateLimit: 11,
            maxNodes: 14000,
            positionalWeight: 3.2,
            materialWeight: 2.2,
            mobilityWeight: 22,
            potentialMobilityWeight: 6,
            cornerWeight: 360,
            stabilityWeight: 54,
            frontierWeight: 12,
            dangerWeight: 180,
            flipWeight: 2,
            variety: 0,
            endgameDepth: 7
        },
        hard: {
            depth: 4,
            rootLimit: 18,
            candidateLimit: 13,
            maxNodes: 52000,
            positionalWeight: 4.1,
            materialWeight: 3.1,
            mobilityWeight: 34,
            potentialMobilityWeight: 9,
            cornerWeight: 560,
            stabilityWeight: 84,
            frontierWeight: 18,
            dangerWeight: 280,
            flipWeight: 1,
            variety: 0,
            endgameDepth: 10
        }
    };

    function moveIndex(move) {
        return typeof move === 'number' ? move : move.index;
    }

    function isEmpty(value) {
        return value === null || value === undefined || value === '' || value === 0 || value === 'none';
    }

    function otherPlayer(player) {
        return player === 'black' ? 'white' : 'black';
    }

    function inferOpponent(game, player, options = {}) {
        if (options.opponent) return options.opponent;
        if (game && Array.isArray(game.players)) {
            const next = game.players.find(item => item.id !== player);
            if (next) return next.id;
        }
        return otherPlayer(player);
    }

    function indexOf(row, col, size) {
        return row * size + col;
    }

    function inBoard(row, col, size) {
        return row >= 0 && row < size && col >= 0 && col < size;
    }

    function flipsForMove(board, size, index, player, opponent) {
        if (!isEmpty(board[index])) return [];
        const row = Math.floor(index / size);
        const col = index % size;
        const flips = [];
        for (const [dr, dc] of DIRECTIONS) {
            const line = [];
            let nextRow = row + dr;
            let nextCol = col + dc;
            while (inBoard(nextRow, nextCol, size)) {
                const nextIndex = indexOf(nextRow, nextCol, size);
                const value = board[nextIndex];
                if (value === opponent) {
                    line.push(nextIndex);
                    nextRow += dr;
                    nextCol += dc;
                    continue;
                }
                if (value === player && line.length) flips.push(...line);
                break;
            }
        }
        return flips;
    }

    function legalMoves(board, size, player, opponent) {
        const moves = [];
        for (let index = 0; index < board.length; index += 1) {
            const flips = flipsForMove(board, size, index, player, opponent);
            if (flips.length) moves.push({ index, flips });
        }
        return moves;
    }

    function applyMove(board, move, player) {
        const next = board.slice();
        next[move.index] = player;
        move.flips.forEach(index => { next[index] = player; });
        return next;
    }

    function corners(size) {
        return [0, size - 1, size * (size - 1), size * size - 1];
    }

    function cornerGroups(size) {
        const last = size - 1;
        return [
            { corner: 0, adjacent: [1, size, size + 1] },
            { corner: last, adjacent: [last - 1, size + last, size + last - 1] },
            { corner: size * last, adjacent: [size * (last - 1), size * last + 1, size * (last - 1) + 1] },
            { corner: size * size - 1, adjacent: [size * size - 2, size * (last - 1) + last, size * (last - 1) + last - 1] }
        ];
    }

    function positionCategoryScore(size, index) {
        const row = Math.floor(index / size);
        const col = index % size;
        const last = size - 1;
        const nearLast = size - 2;
        if ((row === 0 || row === last) && (col === 0 || col === last)) return 120;
        if ((row === 1 || row === nearLast) && (col === 1 || col === nearLast)) return -45;
        if ((row === 0 || row === last) && (col === 1 || col === nearLast)) return -18;
        if ((col === 0 || col === last) && (row === 1 || row === nearLast)) return -18;
        if (row === 0 || row === last || col === 0 || col === last) return 28;
        if (row === 1 || row === nearLast || col === 1 || col === nearLast) return -6;
        const center = (size - 1) / 2;
        return Math.max(0, size / 2 - Math.abs(row - center) - Math.abs(col - center)) * 0.8;
    }

    function cornerDangerScore(board, size, player, opponent) {
        let score = 0;
        for (const group of cornerGroups(size)) {
            const corner = board[group.corner];
            group.adjacent.forEach(index => {
                if (index < 0 || index >= board.length) return;
                if (corner === player && board[index] === player) score += 12;
                else if (corner === opponent && board[index] === opponent) score -= 12;
                else if (isEmpty(corner) && board[index] === player) score -= 1;
                else if (isEmpty(corner) && board[index] === opponent) score += 1;
            });
        }
        return score;
    }

    function frontierCount(board, size, player) {
        let count = 0;
        for (let index = 0; index < board.length; index += 1) {
            if (board[index] !== player) continue;
            const row = Math.floor(index / size);
            const col = index % size;
            for (const [dr, dc] of DIRECTIONS) {
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (inBoard(nextRow, nextCol, size) && isEmpty(board[indexOf(nextRow, nextCol, size)])) {
                    count += 1;
                    break;
                }
            }
        }
        return count;
    }

    function potentialMobility(board, size, player, opponent) {
        const values = new Set();
        for (let index = 0; index < board.length; index += 1) {
            if (board[index] !== opponent) continue;
            const row = Math.floor(index / size);
            const col = index % size;
            for (const [dr, dc] of DIRECTIONS) {
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (!inBoard(nextRow, nextCol, size)) continue;
                const nextIndex = indexOf(nextRow, nextCol, size);
                if (isEmpty(board[nextIndex])) values.add(nextIndex);
            }
        }
        return values.size;
    }

    function stableEdgeSet(board, size, player) {
        const stable = new Set();
        const last = size - 1;
        const starts = [
            { index: 0, rowStep: 0, colStep: 1 },
            { index: 0, rowStep: 1, colStep: 0 },
            { index: last, rowStep: 0, colStep: -1 },
            { index: last, rowStep: 1, colStep: 0 },
            { index: size * last, rowStep: 0, colStep: 1 },
            { index: size * last, rowStep: -1, colStep: 0 },
            { index: size * size - 1, rowStep: 0, colStep: -1 },
            { index: size * size - 1, rowStep: -1, colStep: 0 }
        ];
        for (const start of starts) {
            if (board[start.index] !== player) continue;
            let row = Math.floor(start.index / size);
            let col = start.index % size;
            while (inBoard(row, col, size)) {
                const index = indexOf(row, col, size);
                if (board[index] !== player) break;
                stable.add(index);
                row += start.rowStep;
                col += start.colStep;
            }
        }
        return stable;
    }

    function countPieces(board, player, opponent) {
        let own = 0;
        let other = 0;
        let empty = 0;
        board.forEach(value => {
            if (value === player) own += 1;
            else if (value === opponent) other += 1;
            else empty += 1;
        });
        return { own, other, empty };
    }

    function boardKey(board, current) {
        return `${current}:${board.map(value => value === 'black' ? 'b' : value === 'white' ? 'w' : '.').join('')}`;
    }

    function evaluateBoard(board, size, player, opponent, profile) {
        const counts = countPieces(board, player, opponent);
        const total = board.length;
        const phase = 1 - counts.empty / total;
        const ownMoves = legalMoves(board, size, player, opponent).length;
        const opponentMoves = legalMoves(board, size, opponent, player).length;
        const ownStable = stableEdgeSet(board, size, player).size;
        const opponentStable = stableEdgeSet(board, size, opponent).size;
        const ownFrontier = frontierCount(board, size, player);
        const opponentFrontier = frontierCount(board, size, opponent);
        const ownPotential = potentialMobility(board, size, player, opponent);
        const opponentPotential = potentialMobility(board, size, opponent, player);
        let position = 0;
        let cornerScore = 0;

        board.forEach((value, index) => {
            if (value !== player && value !== opponent) return;
            const sign = value === player ? 1 : -1;
            position += positionCategoryScore(size, index) * sign;
        });

        corners(size).forEach(index => {
            if (board[index] === player) cornerScore += 1;
            else if (board[index] === opponent) cornerScore -= 1;
        });

        if (!counts.empty) {
            if (counts.own > counts.other) return 10000000 + (counts.own - counts.other) * 10000;
            if (counts.own < counts.other) return -10000000 - (counts.other - counts.own) * 10000;
            return 0;
        }

        return position * profile.positionalWeight
            + (counts.own - counts.other) * profile.materialWeight * (0.25 + phase * 2.5)
            + (ownMoves - opponentMoves) * profile.mobilityWeight
            + (ownPotential - opponentPotential) * profile.potentialMobilityWeight
            + cornerScore * profile.cornerWeight
            + cornerDangerScore(board, size, player, opponent) * profile.dangerWeight
            + (ownStable - opponentStable) * profile.stabilityWeight
            - (ownFrontier - opponentFrontier) * profile.frontierWeight;
    }

    function deterministicVariety(index) {
        const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
        return value - Math.floor(value) - 0.5;
    }

    function moveOrderScore(board, size, move, player, opponent, profile) {
        const next = applyMove(board, move, player);
        const opponentMoves = legalMoves(next, size, opponent, player).length;
        return evaluateBoard(next, size, player, opponent, profile) * 0.08
            + move.flips.length * profile.flipWeight
            - opponentMoves * profile.mobilityWeight * 0.25
            + deterministicVariety(move.index) * profile.variety;
    }

    function orderedMoves(board, size, moves, player, opponent, profile, limit) {
        return moves.map(move => ({
            move,
            score: moveOrderScore(board, size, move, player, opponent, profile)
        })).sort((a, b) => b.score - a.score || a.move.index - b.move.index).slice(0, limit).map(item => item.move);
    }

    function effectiveDepth(profile, size, empty) {
        let depth = profile.depth;
        if (size >= 12) depth = Math.min(depth, profile.depth >= 4 ? 3 : 2);
        if (empty <= profile.endgameDepth) depth = Math.max(depth, Math.min(empty, profile.endgameDepth));
        return depth;
    }

    function minimax(board, size, current, player, opponent, depth, profile, alpha, beta, context) {
        context.nodes += 1;
        if (context.nodes > profile.maxNodes || depth <= 0) return evaluateBoard(board, size, player, opponent, profile);

        const currentOpponent = current === player ? opponent : player;
        const key = `${boardKey(board, current)}:${depth}`;
        if (context.cache.has(key)) return context.cache.get(key);

        const moves = legalMoves(board, size, current, currentOpponent);
        if (!moves.length) {
            const opponentMoves = legalMoves(board, size, currentOpponent, current);
            if (!opponentMoves.length) return evaluateBoard(board, size, player, opponent, profile);
            return minimax(board, size, currentOpponent, player, opponent, depth - 1, profile, alpha, beta, context);
        }

        const maximizing = current === player;
        const candidates = orderedMoves(board, size, moves, current, currentOpponent, profile, profile.candidateLimit);
        let value = maximizing ? -Infinity : Infinity;
        let completed = true;

        for (const move of candidates) {
            const next = applyMove(board, move, current);
            const score = minimax(next, size, currentOpponent, player, opponent, depth - 1, profile, alpha, beta, context);
            if (maximizing) {
                value = Math.max(value, score);
                alpha = Math.max(alpha, value);
            } else {
                value = Math.min(value, score);
                beta = Math.min(beta, value);
            }
            if (beta <= alpha || context.nodes > profile.maxNodes) {
                completed = false;
                break;
            }
        }

        if (completed) context.cache.set(key, value);
        return value;
    }

    function chooseIndex(board, size, player, options = {}) {
        const opponent = options.opponent || otherPlayer(player);
        const profile = PROFILES[options.difficulty] || PROFILES.medium;
        const moves = options.moves && options.moves.length
            ? options.moves.map(move => ({ index: move.index, flips: move.flips ? move.flips.slice() : flipsForMove(board, size, move.index, player, opponent) }))
            : legalMoves(board, size, player, opponent);
        if (!moves.length) return null;

        const counts = countPieces(board, player, opponent);
        const depth = effectiveDepth(profile, size, counts.empty);
        const rootMoves = orderedMoves(board, size, moves, player, opponent, profile, profile.rootLimit);
        const context = { nodes: 0, cache: new Map() };
        let best = null;
        let bestScore = -Infinity;

        for (const move of rootMoves) {
            const next = applyMove(board, move, player);
            const score = depth > 0
                ? minimax(next, size, opponent, player, opponent, depth, profile, -Infinity, Infinity, context)
                : evaluateBoard(next, size, player, opponent, profile);
            const total = score + moveOrderScore(board, size, move, player, opponent, profile) * 0.18;
            if (total > bestScore || (total === bestScore && (!best || move.index < best.index))) {
                best = move;
                bestScore = total;
            }
        }

        return best ? best.index : rootMoves[0].index;
    }

    function chooseMove(game, state, options = {}) {
        const player = options.player || state.current;
        const opponent = inferOpponent(game, player, options);
        const size = game.rows || game.columns || Math.sqrt(state.board.length);
        const moves = game.getLegalMoves(state);
        if (!moves.length) return null;
        const normalizedMoves = moves.map(move => ({
            original: move,
            index: moveIndex(move),
            flips: move.flips ? move.flips.slice() : flipsForMove(state.board, size, moveIndex(move), player, opponent)
        }));
        const index = chooseIndex(state.board, size, player, {
            difficulty: options.difficulty,
            opponent,
            moves: normalizedMoves
        });
        const match = normalizedMoves.find(move => move.index === index);
        return match ? match.original : moves[0];
    }

    window.ReversiAI = {
        chooseIndex,
        chooseMove,
        evaluateBoard,
        legalMoves,
        flipsForMove,
        profiles: PROFILES
    };
})();
