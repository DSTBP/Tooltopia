(() => {
    const SIZE = 10;
    const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    const PROFILES = {
        beginner: { depth: 0, candidateLimit: 8, nodeBudget: 120, variety: 0.38, material: 1, king: 2.35, mobility: 0.18, advancement: 0.16, center: 0.1, capture: 1.35 },
        easy: { depth: 1, candidateLimit: 10, nodeBudget: 900, variety: 0.16, material: 1, king: 2.55, mobility: 0.24, advancement: 0.2, center: 0.14, capture: 1.7 },
        medium: { depth: 3, candidateLimit: 14, nodeBudget: 4800, variety: 0.04, material: 1, king: 2.8, mobility: 0.34, advancement: 0.26, center: 0.18, capture: 2.1 },
        hard: { depth: 4, candidateLimit: 18, nodeBudget: 12000, variety: 0, material: 1, king: 3.05, mobility: 0.42, advancement: 0.32, center: 0.24, capture: 2.45 }
    };

    function other(player) {
        return player === 'white' ? 'black' : 'white';
    }

    function index(row, col) {
        return row * SIZE + col;
    }

    function position(indexValue) {
        return { row: Math.floor(indexValue / SIZE), col: indexValue % SIZE };
    }

    function inBounds(row, col) {
        return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
    }

    function owner(piece) {
        if (!piece) return null;
        return piece.startsWith('white') ? 'white' : 'black';
    }

    function isKing(piece) {
        return piece === 'whiteKing' || piece === 'blackKing';
    }

    function promote(piece, indexValue) {
        const row = position(indexValue).row;
        if (piece === 'white' && row === 0) return 'whiteKing';
        if (piece === 'black' && row === 9) return 'blackKing';
        return piece;
    }

    function moveKey(from, path, captures) {
        return `draughts:${from}:${path.join('-')}:${captures.join('-')}`;
    }

    function moveObject(from, path, captures) {
        return {
            type: 'draughts',
            index: moveKey(from, path, captures),
            from,
            to: path[path.length - 1],
            path: path.slice(),
            captures: captures.slice()
        };
    }

    function manCaptures(board, player, from, path, captures, output) {
        let found = false;
        const piece = board[from];
        const pos = position(from);
        const opponent = other(player);
        for (const [dr, dc] of DIRECTIONS) {
            const midRow = pos.row + dr;
            const midCol = pos.col + dc;
            const landRow = pos.row + dr * 2;
            const landCol = pos.col + dc * 2;
            if (!inBounds(landRow, landCol)) continue;
            const middle = index(midRow, midCol);
            const landing = index(landRow, landCol);
            if (owner(board[middle]) !== opponent || board[landing]) continue;
            found = true;
            const nextBoard = board.slice();
            nextBoard[from] = null;
            nextBoard[middle] = null;
            nextBoard[landing] = piece;
            manCaptures(nextBoard, player, landing, path.concat(landing), captures.concat(middle), output);
        }
        if (!found && captures.length) output.push(moveObject(path[0], path, captures));
    }

    function kingCaptures(board, player, from, path, captures, output) {
        let found = false;
        const piece = board[from];
        const pos = position(from);
        const opponent = other(player);
        for (const [dr, dc] of DIRECTIONS) {
            let row = pos.row + dr;
            let col = pos.col + dc;
            while (inBounds(row, col) && !board[index(row, col)]) {
                row += dr;
                col += dc;
            }
            if (!inBounds(row, col)) continue;
            const captured = index(row, col);
            if (owner(board[captured]) !== opponent) continue;
            row += dr;
            col += dc;
            while (inBounds(row, col) && !board[index(row, col)]) {
                found = true;
                const landing = index(row, col);
                const nextBoard = board.slice();
                nextBoard[from] = null;
                nextBoard[captured] = null;
                nextBoard[landing] = piece;
                kingCaptures(nextBoard, player, landing, path.concat(landing), captures.concat(captured), output);
                row += dr;
                col += dc;
            }
        }
        if (!found && captures.length) output.push(moveObject(path[0], path, captures));
    }

    function capturesFrom(board, player, from) {
        const piece = board[from];
        if (owner(piece) !== player) return [];
        const output = [];
        if (isKing(piece)) kingCaptures(board, player, from, [from], [], output);
        else manCaptures(board, player, from, [from], [], output);
        return output;
    }

    function quietFrom(board, player, from) {
        const piece = board[from];
        if (owner(piece) !== player) return [];
        const pos = position(from);
        const moves = [];
        if (isKing(piece)) {
            for (const [dr, dc] of DIRECTIONS) {
                let row = pos.row + dr;
                let col = pos.col + dc;
                while (inBounds(row, col) && !board[index(row, col)]) {
                    moves.push(moveObject(from, [from, index(row, col)], []));
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
            if (!inBounds(row, col)) continue;
            const to = index(row, col);
            if (!board[to]) moves.push(moveObject(from, [from, to], []));
        }
        return moves;
    }

    function legalMovesFromBoard(board, player) {
        const captures = [];
        const quiet = [];
        board.forEach((piece, indexValue) => {
            if (owner(piece) !== player) return;
            captures.push(...capturesFrom(board, player, indexValue));
            quiet.push(...quietFrom(board, player, indexValue));
        });
        if (captures.length) {
            const maxCaptures = captures.reduce((max, move) => Math.max(max, move.captures.length), 0);
            return captures.filter(move => move.captures.length === maxCaptures);
        }
        return quiet;
    }

    function legalMoves(stateOrBoard, player) {
        const board = Array.isArray(stateOrBoard) ? stateOrBoard : stateOrBoard.board;
        const side = player || stateOrBoard.current;
        return legalMovesFromBoard(board, side);
    }

    function applyMoveToBoard(board, move, player) {
        const next = board.slice();
        const piece = next[move.from];
        next[move.from] = null;
        move.captures.forEach(indexValue => { next[indexValue] = null; });
        next[move.to] = promote(piece, move.to);
        return {
            board: next,
            current: other(player),
            ended: false,
            winner: null
        };
    }

    function applyMove(state, move) {
        const player = state.current;
        const next = applyMoveToBoard(state.board, move, player);
        const opponent = other(player);
        const opponentPieces = next.board.filter(piece => owner(piece) === opponent).length;
        if (opponentPieces === 0 || legalMovesFromBoard(next.board, opponent).length === 0) {
            next.ended = true;
            next.winner = player;
        }
        return next;
    }

    function materialScore(board, player, profile) {
        let score = 0;
        board.forEach((piece, indexValue) => {
            if (!piece) return;
            const sign = owner(piece) === player ? 1 : -1;
            const pos = position(indexValue);
            const advancement = owner(piece) === 'white' ? 9 - pos.row : pos.row;
            const center = 9 - Math.abs(pos.row - 4.5) - Math.abs(pos.col - 4.5);
            const value = isKing(piece) ? 100 * profile.king : 100 * profile.material + advancement * profile.advancement + center * profile.center;
            score += sign * value;
        });
        return score;
    }

    function evaluateBoard(board, player, profile = PROFILES.medium) {
        const ownMoves = legalMovesFromBoard(board, player);
        const oppMoves = legalMovesFromBoard(board, other(player));
        const ownPieces = board.filter(piece => owner(piece) === player).length;
        const oppPieces = board.filter(piece => owner(piece) === other(player)).length;
        if (!ownPieces || !ownMoves.length) return -1000000;
        if (!oppPieces || !oppMoves.length) return 1000000;
        const ownCaptures = ownMoves.reduce((max, move) => Math.max(max, move.captures.length), 0);
        const oppCaptures = oppMoves.reduce((max, move) => Math.max(max, move.captures.length), 0);
        return materialScore(board, player, profile)
            + (ownMoves.length - oppMoves.length) * profile.mobility
            + (ownCaptures - oppCaptures) * 100 * profile.capture;
    }

    function boardKey(board, player, depth) {
        return `${player}:${depth}:${board.map(piece => piece || '.').join('')}`;
    }

    function deterministicVariety(move) {
        let hash = 0;
        const text = move.index;
        for (let indexValue = 0; indexValue < text.length; indexValue += 1) {
            hash = (hash * 31 + text.charCodeAt(indexValue)) % 997;
        }
        return hash / 997;
    }

    function moveScore(board, move, player, profile) {
        const piece = board[move.from];
        const promoted = !isKing(piece) && isKing(promote(piece, move.to));
        const row = position(move.to).row;
        const progress = player === 'white' ? 9 - row : row;
        return move.captures.length * 120
            + (promoted ? 90 : 0)
            + (isKing(piece) ? 20 : progress * 6)
            + deterministicVariety(move) * profile.variety * 100;
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
            const next = applyMoveToBoard(board, move, playerToMove).board;
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
        const moves = typeof game.getLegalMoves === 'function' ? game.getLegalMoves(state) : legalMovesFromBoard(state.board, player);
        if (!moves.length) return null;
        const cache = new Map();
        const budget = { nodes: 0 };
        const scored = orderedMoves(state.board, player, { ...profile, candidateLimit: Math.max(profile.candidateLimit, moves.length) })
            .filter(move => moves.some(item => item.index === move.index))
            .map(move => {
                const next = applyMoveToBoard(state.board, move, player).board;
                const search = profile.depth > 0
                    ? minimax(next, other(player), profile.depth - 1, player, profile, -Infinity, Infinity, cache, budget)
                    : evaluateBoard(next, player, profile);
                return { move, score: search + moveScore(state.board, move, player, profile) * 0.22 };
            });
        return scored.sort((a, b) => b.score - a.score || String(a.move.index).localeCompare(String(b.move.index)))[0].move;
    }

    window.DraughtsAI = {
        chooseMove,
        legalMoves,
        applyMove,
        evaluateBoard,
        profiles: PROFILES
    };
})();
