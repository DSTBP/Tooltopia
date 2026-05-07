(() => {
    const ROWS = 9;
    const COLS = 7;
    const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const RANKS = { R: 1, C: 2, D: 3, W: 4, P: 5, T: 6, L: 7, E: 8 };
    const VALUES = { R: 100, C: 50, D: 70, W: 60, P: 80, T: 110, L: 120, E: 120 };
    const DENS = { black: 3, red: 59 };
    const TRAPS = {
        black: new Set([2, 4, 10]),
        red: new Set([52, 58, 60])
    };
    const RIVERS = new Set([22, 23, 25, 26, 29, 30, 32, 33, 36, 37, 39, 40]);

    const PROFILES = {
        beginner: { depth: 0, candidateLimit: 8, nodeBudget: 180, variety: 0.38, material: 1, mobility: 0.7, den: 4.4, capture: 1.05, trap: 0.8, safety: 0.45 },
        easy: { depth: 1, candidateLimit: 10, nodeBudget: 1200, variety: 0.18, material: 1.05, mobility: 0.9, den: 5.2, capture: 1.25, trap: 1.0, safety: 0.7 },
        medium: { depth: 3, candidateLimit: 14, nodeBudget: 6500, variety: 0.04, material: 1.15, mobility: 1.2, den: 6.2, capture: 1.55, trap: 1.25, safety: 0.95 },
        hard: { depth: 4, candidateLimit: 18, nodeBudget: 18000, variety: 0, material: 1.25, mobility: 1.5, den: 7.2, capture: 1.9, trap: 1.5, safety: 1.2 }
    };

    function other(player) {
        return player === 'red' ? 'black' : 'red';
    }

    function index(row, col) {
        return row * COLS + col;
    }

    function position(indexValue) {
        return { row: Math.floor(indexValue / COLS), col: indexValue % COLS };
    }

    function inBounds(row, col) {
        return row >= 0 && row < ROWS && col >= 0 && col < COLS;
    }

    function owner(piece) {
        if (!piece) return null;
        return piece[0] === 'r' ? 'red' : 'black';
    }

    function kind(piece) {
        return piece ? piece[1] : null;
    }

    function trapOwner(indexValue) {
        if (TRAPS.black.has(indexValue)) return 'black';
        if (TRAPS.red.has(indexValue)) return 'red';
        return null;
    }

    function canCapture(board, from, to) {
        const attacker = board[from];
        const target = board[to];
        if (!attacker || !target || owner(attacker) === owner(target)) return false;
        const attackerOwner = owner(attacker);
        const attackerKind = kind(attacker);
        const targetKind = kind(target);
        if (trapOwner(to) === attackerOwner) return true;
        const fromRiver = RIVERS.has(from);
        const toRiver = RIVERS.has(to);
        if (attackerKind === 'E' && targetKind === 'R') return false;
        if (attackerKind === 'R') {
            if (fromRiver || toRiver) return targetKind === 'R' && fromRiver && toRiver;
            if (targetKind === 'E') return true;
        }
        if (fromRiver || toRiver) return false;
        return RANKS[attackerKind] >= RANKS[targetKind];
    }

    function canLand(board, player, from, to) {
        if (DENS[player] === to) return false;
        const piece = board[from];
        if (!piece) return false;
        if (RIVERS.has(to) && kind(piece) !== 'R') return false;
        const target = board[to];
        if (!target) return true;
        return canCapture(board, from, to);
    }

    function moveObject(board, from, to) {
        return {
            type: 'animalchess',
            index: `animalchess:${from}-${to}`,
            from,
            to,
            piece: board[from],
            capture: board[to] || null
        };
    }

    function jumpTarget(board, player, from, dr, dc) {
        const pos = position(from);
        let row = pos.row + dr;
        let col = pos.col + dc;
        if (!inBounds(row, col) || !RIVERS.has(index(row, col))) return null;
        while (inBounds(row, col) && RIVERS.has(index(row, col))) {
            const riverIndex = index(row, col);
            if (kind(board[riverIndex]) === 'R') return null;
            row += dr;
            col += dc;
        }
        if (!inBounds(row, col)) return null;
        const to = index(row, col);
        return canLand(board, player, from, to) ? to : null;
    }

    function movesFrom(board, player, from) {
        const piece = board[from];
        if (owner(piece) !== player) return [];
        const pieceKind = kind(piece);
        const pos = position(from);
        const moves = [];
        for (const [dr, dc] of DIRECTIONS) {
            const row = pos.row + dr;
            const col = pos.col + dc;
            if (!inBounds(row, col)) continue;
            const to = index(row, col);
            if ((pieceKind === 'L' || pieceKind === 'T') && RIVERS.has(to)) {
                const jump = jumpTarget(board, player, from, dr, dc);
                if (jump !== null) moves.push(moveObject(board, from, jump));
                continue;
            }
            if (canLand(board, player, from, to)) moves.push(moveObject(board, from, to));
        }
        return moves;
    }

    function legalMovesFromBoard(board, player) {
        return board.reduce((moves, piece, indexValue) => {
            if (owner(piece) === player) moves.push(...movesFrom(board, player, indexValue));
            return moves;
        }, []);
    }

    function legalMoves(stateOrBoard, player) {
        const board = Array.isArray(stateOrBoard) ? stateOrBoard : stateOrBoard.board;
        const side = player || stateOrBoard.current;
        return legalMovesFromBoard(board, side);
    }

    function applyMoveToBoard(board, move) {
        const next = board.slice();
        next[move.to] = next[move.from];
        next[move.from] = null;
        return next;
    }

    function applyMove(state, move) {
        const player = state.current;
        const opponent = other(player);
        const board = applyMoveToBoard(state.board, move);
        const next = { board, current: opponent, ended: false, winner: null };
        if (move.to === DENS[opponent] || !board.some(piece => owner(piece) === opponent)) {
            next.ended = true;
            next.winner = player;
            return next;
        }
        if (!legalMovesFromBoard(board, opponent).length) {
            next.ended = true;
            next.winner = player;
        }
        return next;
    }

    function distanceToEnemyDen(player, indexValue) {
        const target = position(DENS[other(player)]);
        const pos = position(indexValue);
        return Math.abs(pos.row - target.row) + Math.abs(pos.col - target.col);
    }

    function strongestCaptureValue(board, player) {
        return legalMovesFromBoard(board, player).reduce((best, move) => {
            return Math.max(best, move.capture ? VALUES[kind(move.capture)] : 0);
        }, 0);
    }

    function materialScore(board, player, profile) {
        let score = 0;
        board.forEach((piece, indexValue) => {
            if (!piece) return;
            const side = owner(piece);
            const sign = side === player ? 1 : -1;
            const pieceKind = kind(piece);
            const distance = distanceToEnemyDen(side, indexValue);
            const progress = (14 - distance) * profile.den;
            const trapPressure = trapOwner(indexValue) === other(side) ? 18 * profile.trap : 0;
            const riverControl = pieceKind === 'R' && RIVERS.has(indexValue) ? 12 : 0;
            score += sign * (VALUES[pieceKind] * profile.material + progress + trapPressure + riverControl);
        });
        return score;
    }

    function evaluateBoard(board, player, profile = PROFILES.medium) {
        if (board[DENS.black] && owner(board[DENS.black]) === 'red') return player === 'red' ? 1000000 : -1000000;
        if (board[DENS.red] && owner(board[DENS.red]) === 'black') return player === 'black' ? 1000000 : -1000000;
        const opponent = other(player);
        const ownPieces = board.filter(piece => owner(piece) === player).length;
        const oppPieces = board.filter(piece => owner(piece) === opponent).length;
        if (!ownPieces) return -1000000;
        if (!oppPieces) return 1000000;
        const ownMoves = legalMovesFromBoard(board, player);
        const oppMoves = legalMovesFromBoard(board, opponent);
        if (!ownMoves.length) return -1000000;
        if (!oppMoves.length) return 1000000;
        return materialScore(board, player, profile)
            + (ownMoves.length - oppMoves.length) * profile.mobility
            + (strongestCaptureValue(board, player) - strongestCaptureValue(board, opponent)) * profile.capture
            - Math.max(0, 5 - Math.min(...ownMoves.map(move => distanceToEnemyDen(player, move.to)))) * profile.safety;
    }

    function boardKey(board, player, depth) {
        return `${player}:${depth}:${board.map(piece => piece || '--').join(',')}`;
    }

    function deterministicVariety(move) {
        let hash = 0;
        for (let i = 0; i < move.index.length; i += 1) {
            hash = (hash * 31 + move.index.charCodeAt(i)) % 997;
        }
        return hash / 997;
    }

    function moveScore(board, move, player, profile) {
        const opponent = other(player);
        if (move.to === DENS[opponent]) return 10000000;
        const capture = move.capture ? VALUES[kind(move.capture)] * 12 : 0;
        const progress = (distanceToEnemyDen(player, move.from) - distanceToEnemyDen(player, move.to)) * 42;
        const trap = trapOwner(move.to) === opponent ? 90 : 0;
        const piece = board[move.from];
        return capture + progress + trap + VALUES[kind(piece)] * 0.08 + deterministicVariety(move) * profile.variety * 100;
    }

    function orderedMoves(board, player, profile) {
        return legalMovesFromBoard(board, player)
            .map(move => ({ move, score: moveScore(board, move, player, profile) }))
            .sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))
            .slice(0, profile.candidateLimit)
            .map(item => item.move);
    }

    function minimax(board, playerToMove, depth, aiPlayer, profile, alpha, beta, cache, budget) {
        budget.nodes += 1;
        if (budget.nodes >= profile.nodeBudget || depth <= 0) return evaluateBoard(board, aiPlayer, profile);
        const key = boardKey(board, playerToMove, depth);
        if (cache.has(key)) return cache.get(key);
        const moves = orderedMoves(board, playerToMove, profile);
        if (!moves.length) return playerToMove === aiPlayer ? -1000000 : 1000000;
        const maximizing = playerToMove === aiPlayer;
        let value = maximizing ? -Infinity : Infinity;
        for (const move of moves) {
            const next = applyMoveToBoard(board, move);
            const child = minimax(next, other(playerToMove), depth - 1, aiPlayer, profile, alpha, beta, cache, budget);
            if (maximizing) {
                value = Math.max(value, child);
                alpha = Math.max(alpha, value);
            } else {
                value = Math.min(value, child);
                beta = Math.min(beta, value);
            }
            if (beta <= alpha || budget.nodes >= profile.nodeBudget) break;
        }
        cache.set(key, value);
        return value;
    }

    function chooseMove(game, state, options = {}) {
        const player = options.player || state.current;
        const profile = PROFILES[options.difficulty] || PROFILES.medium;
        const legal = typeof game.getLegalMoves === 'function' ? game.getLegalMoves(state) : legalMovesFromBoard(state.board, player);
        if (!legal.length) return null;
        const cache = new Map();
        const budget = { nodes: 0 };
        const ordered = orderedMoves(state.board, player, { ...profile, candidateLimit: Math.max(profile.candidateLimit, legal.length) })
            .filter(move => legal.some(item => item.index === move.index));
        const scored = ordered.map(move => {
            const next = applyMoveToBoard(state.board, move);
            const search = profile.depth > 0
                ? minimax(next, other(player), profile.depth - 1, player, profile, -Infinity, Infinity, cache, budget)
                : evaluateBoard(next, player, profile);
            return { move, score: search + moveScore(state.board, move, player, profile) * 0.24 };
        });
        return scored.sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))[0].move;
    }

    window.AnimalChessAI = {
        chooseMove,
        legalMoves,
        applyMove,
        evaluateBoard,
        profiles: PROFILES
    };
})();
