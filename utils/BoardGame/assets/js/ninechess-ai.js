(() => {
    const POINTS = 24;
    const MILLS = [
        [7, 0, 1], [1, 2, 3], [3, 4, 5], [5, 6, 7],
        [15, 8, 9], [9, 10, 11], [11, 12, 13], [13, 14, 15],
        [23, 16, 17], [17, 18, 19], [19, 20, 21], [21, 22, 23],
        [0, 8, 16], [2, 10, 18], [4, 12, 20], [6, 14, 22]
    ];
    const ADJACENT = Array.from({ length: POINTS }, (_, index) => {
        const ring = Math.floor(index / 8);
        const seat = index % 8;
        const neighbors = [ring * 8 + ((seat + 7) % 8), ring * 8 + ((seat + 1) % 8)];
        if (seat % 2 === 0) {
            if (ring > 0) neighbors.push((ring - 1) * 8 + seat);
            if (ring < 2) neighbors.push((ring + 1) * 8 + seat);
        }
        return neighbors;
    });
    const PROFILES = {
        beginner: { depth: 0, candidateLimit: 8, nodeBudget: 450, variety: 0.32, material: 130, inHand: 46, mill: 92, openMill: 28, mobility: 6, capture: 170 },
        easy: { depth: 1, candidateLimit: 10, nodeBudget: 1800, variety: 0.14, material: 150, inHand: 48, mill: 112, openMill: 34, mobility: 8, capture: 210 },
        medium: { depth: 3, candidateLimit: 14, nodeBudget: 9000, variety: 0.03, material: 180, inHand: 52, mill: 132, openMill: 42, mobility: 12, capture: 260 },
        hard: { depth: 4, candidateLimit: 18, nodeBudget: 26000, variety: 0, material: 210, inHand: 56, mill: 156, openMill: 52, mobility: 16, capture: 320 }
    };

    function other(player) {
        return player === 'white' ? 'black' : 'white';
    }

    function cloneState(state) {
        return {
            board: state.board.slice(),
            current: state.current,
            winner: state.winner,
            ended: state.ended,
            moveCount: state.moveCount || 0,
            moves: state.moves ? state.moves.slice() : [],
            winLine: state.winLine ? state.winLine.slice() : [],
            passMessage: state.passMessage || '',
            piecesLeft: state.piecesLeft ? { ...state.piecesLeft } : { white: 0, black: 0 },
            phase: state.phase,
            action: state.action,
            pendingCapture: state.pendingCapture,
            selectedIndex: state.selectedIndex
        };
    }

    function count(board, player) {
        return board.filter(piece => piece === player).length;
    }

    function totalAvailable(state, player) {
        return count(state.board, player) + (state.piecesLeft && state.piecesLeft[player] ? state.piecesLeft[player] : 0);
    }

    function emptyIndexes(board) {
        return board.map((piece, index) => piece ? -1 : index).filter(index => index >= 0);
    }

    function millsAt(index) {
        return MILLS.filter(line => line.includes(index));
    }

    function isMill(board, player, line) {
        return line.every(index => board[index] === player);
    }

    function millAt(board, player, index) {
        return millsAt(index).find(line => isMill(board, player, line)) || null;
    }

    function isPieceInMill(board, index) {
        const player = board[index];
        return Boolean(player && millAt(board, player, index));
    }

    function allPiecesInMills(board, player) {
        const pieces = board.map((piece, index) => piece === player ? index : -1).filter(index => index >= 0);
        return pieces.length > 0 && pieces.every(index => isPieceInMill(board, index));
    }

    function canFly(state, player) {
        return state.phase === 'moving' && count(state.board, player) <= 3;
    }

    function captureTargets(state, player) {
        const opponent = other(player);
        const occupied = state.board.map((piece, index) => piece === opponent ? index : -1).filter(index => index >= 0);
        if (allPiecesInMills(state.board, opponent)) return occupied;
        return occupied.filter(index => !isPieceInMill(state.board, index));
    }

    function moveObject(type, values) {
        if (type === 'place') return { type: 'ninechess-place', index: `ninechess:place:${values.to}`, to: values.to };
        if (type === 'shift') return { type: 'ninechess-shift', index: `ninechess:shift:${values.from}-${values.to}`, from: values.from, to: values.to };
        return { type: 'ninechess-capture', index: `ninechess:capture:${values.capture}`, capture: values.capture };
    }

    function legalMovesForPlayer(state, player) {
        if (state.phase !== 'moving') return [];
        return state.board.reduce((moves, piece, from) => {
            if (piece !== player) return moves;
            const targets = canFly(state, player) ? emptyIndexes(state.board) : ADJACENT[from].filter(index => !state.board[index]);
            targets.forEach(to => moves.push(moveObject('shift', { from, to })));
            return moves;
        }, []);
    }

    function legalMoves(state) {
        if (state.ended) return [];
        if (state.action === 'capture') return captureTargets(state, state.current).map(capture => moveObject('capture', { capture }));
        if (state.phase === 'placing') {
            if (!state.piecesLeft || state.piecesLeft[state.current] <= 0) return [];
            return emptyIndexes(state.board).map(to => moveObject('place', { to }));
        }
        return legalMovesForPlayer(state, state.current);
    }

    function checkMaterialWinner(state) {
        for (const player of ['white', 'black']) {
            if (totalAvailable(state, player) < 3) {
                state.ended = true;
                state.winner = other(player);
                return true;
            }
        }
        return false;
    }

    function checkBlockedWinner(state) {
        if (state.phase === 'moving' && state.action !== 'capture' && !legalMovesForPlayer(state, state.current).length) {
            state.ended = true;
            state.winner = other(state.current);
            return true;
        }
        return false;
    }

    function checkWinner(state) {
        return checkMaterialWinner(state) || checkBlockedWinner(state);
    }

    function enterNextTurn(state) {
        state.pendingCapture = false;
        state.selectedIndex = null;
        if (state.phase === 'placing' && state.piecesLeft.white === 0 && state.piecesLeft.black === 0) {
            state.phase = 'moving';
            state.current = 'white';
            state.action = 'move';
            checkWinner(state);
            return state;
        }
        state.current = other(state.current);
        state.action = state.phase === 'placing' ? 'place' : 'move';
        checkWinner(state);
        return state;
    }

    function applyMove(state, move) {
        const next = cloneState(state);
        const player = state.current;
        next.winLine = [];
        if (move.type === 'ninechess-capture') {
            next.board[move.capture] = null;
            next.action = state.phase === 'placing' ? 'place' : 'move';
            next.pendingCapture = false;
            if (!checkMaterialWinner(next)) enterNextTurn(next);
            return next;
        }
        if (move.type === 'ninechess-place') {
            next.board[move.to] = player;
            next.piecesLeft[player] -= 1;
            const line = millAt(next.board, player, move.to);
            if (line) {
                next.action = 'capture';
                next.pendingCapture = true;
                next.winLine = line.slice();
                return next;
            }
            return enterNextTurn(next);
        }
        next.board[move.from] = null;
        next.board[move.to] = player;
        const line = millAt(next.board, player, move.to);
        if (line) {
            next.action = 'capture';
            next.pendingCapture = true;
            next.winLine = line.slice();
            return next;
        }
        return enterNextTurn(next);
    }

    function openMills(board, player) {
        return MILLS.reduce((countValue, line) => {
            const own = line.filter(index => board[index] === player).length;
            const empty = line.filter(index => !board[index]).length;
            return countValue + (own === 2 && empty === 1 ? 1 : 0);
        }, 0);
    }

    function allMills(board, player) {
        return MILLS.reduce((countValue, line) => countValue + (isMill(board, player, line) ? 1 : 0), 0);
    }

    function mobility(state, player) {
        return legalMovesForPlayer({ ...state, current: player }, player).length;
    }

    function evaluateState(state, player, profile = PROFILES.medium, ply = 0) {
        if (state.ended) {
            if (state.winner === player) return 1000000 - ply;
            if (state.winner === other(player)) return -1000000 + ply;
            return 0;
        }
        const opponent = other(player);
        const material = (count(state.board, player) - count(state.board, opponent)) * profile.material;
        const hand = ((state.piecesLeft?.[player] || 0) - (state.piecesLeft?.[opponent] || 0)) * profile.inHand;
        const mills = (allMills(state.board, player) - allMills(state.board, opponent)) * profile.mill;
        const open = (openMills(state.board, player) - openMills(state.board, opponent)) * profile.openMill;
        const moveScore = state.phase === 'moving' ? (mobility(state, player) - mobility(state, opponent)) * profile.mobility : 0;
        const capture = state.action === 'capture' ? (state.current === player ? profile.capture : -profile.capture) : 0;
        return material + hand + mills + open + moveScore + capture;
    }

    function deterministicVariety(move) {
        let hash = 0;
        for (let i = 0; i < move.index.length; i += 1) hash = (hash * 31 + move.index.charCodeAt(i)) % 997;
        return hash / 997;
    }

    function moveScore(state, move, profile) {
        if (move.type === 'ninechess-capture') return 3000 + millsAt(move.capture).length * 140 + ADJACENT[move.capture].length * 26;
        const nextBoard = state.board.slice();
        if (move.type === 'ninechess-place') nextBoard[move.to] = state.current;
        if (move.type === 'ninechess-shift') {
            nextBoard[move.from] = null;
            nextBoard[move.to] = state.current;
        }
        const opponent = other(state.current);
        return (millAt(nextBoard, state.current, move.to) ? 5200 : 0)
            + openMills(nextBoard, state.current) * 220
            - openMills(nextBoard, opponent) * 160
            + ADJACENT[move.to].length * 22
            + deterministicVariety(move) * profile.variety * 100;
    }

    function orderedMoves(state, profile) {
        return legalMoves(state)
            .map(move => ({ move, score: moveScore(state, move, profile) }))
            .sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))
            .slice(0, profile.candidateLimit)
            .map(item => item.move);
    }

    function key(state, depth) {
        return `${depth}:${state.current}:${state.phase}:${state.action}:${state.board.map(piece => piece || '-').join('')}:${state.piecesLeft.white},${state.piecesLeft.black}`;
    }

    function minimax(state, depth, player, profile, alpha, beta, cache, budget, ply) {
        budget.nodes += 1;
        if (budget.nodes >= profile.nodeBudget || depth <= 0 || state.ended) return evaluateState(state, player, profile, ply);
        const cacheKey = key(state, depth);
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const moves = orderedMoves(state, profile);
        if (!moves.length) return evaluateState(state, player, profile, ply);
        const maximizing = state.current === player;
        let value = maximizing ? -Infinity : Infinity;
        for (const move of moves) {
            const next = applyMove(state, move);
            const child = minimax(next, depth - 1, player, profile, alpha, beta, cache, budget, ply + 1);
            if (maximizing) {
                value = Math.max(value, child);
                alpha = Math.max(alpha, value);
            } else {
                value = Math.min(value, child);
                beta = Math.min(beta, value);
            }
            if (beta <= alpha || budget.nodes >= profile.nodeBudget) break;
        }
        cache.set(cacheKey, value);
        return value;
    }

    function chooseMove(game, state, options = {}) {
        const profile = PROFILES[options.difficulty] || PROFILES.medium;
        const player = options.player || state.current;
        const legal = typeof game.getLegalMoves === 'function' ? game.getLegalMoves(state) : legalMoves(state);
        if (!legal.length) return null;
        const cache = new Map();
        const budget = { nodes: 0 };
        const ordered = orderedMoves(state, { ...profile, candidateLimit: Math.max(profile.candidateLimit, legal.length) })
            .filter(move => legal.some(item => item.index === move.index));
        const scored = ordered.map(move => {
            const next = applyMove(state, move);
            const search = profile.depth > 0
                ? minimax(next, profile.depth - 1, player, profile, -Infinity, Infinity, cache, budget, 1)
                : evaluateState(next, player, profile, 1);
            return { move, score: search + moveScore(state, move, profile) * 0.24 };
        });
        return scored.sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))[0].move;
    }

    window.NineChessAI = {
        chooseMove,
        legalMoves,
        applyMove,
        evaluateState,
        profiles: PROFILES
    };
})();
