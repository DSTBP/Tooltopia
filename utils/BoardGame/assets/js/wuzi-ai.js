(() => {
    const DIRECTIONS = [
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];

    const SHAPE_SCORES = {
        five: 10000000,
        openFour: 1000000,
        doubleFour: 820000,
        fourThree: 720000,
        blockFour: 120000,
        doubleThree: 68000,
        openThree: 16000,
        blockThree: 1800,
        openTwo: 360,
        blockTwo: 80
    };

    const WINDOW_SCORES = [
        { score: 50, pattern: '01100' },
        { score: 50, pattern: '00110' },
        { score: 200, pattern: '11010' },
        { score: 500, pattern: '00111' },
        { score: 500, pattern: '11100' },
        { score: 5000, pattern: '01110' },
        { score: 5000, pattern: '010110' },
        { score: 5000, pattern: '011010' },
        { score: 5000, pattern: '11101' },
        { score: 5000, pattern: '11011' },
        { score: 5000, pattern: '10111' },
        { score: 5000, pattern: '11110' },
        { score: 5000, pattern: '01111' },
        { score: 50000, pattern: '011110' },
        { score: 99999999, pattern: '11111' }
    ];

    const DIFFICULTY = {
        beginner: {
            depth: 0,
            range: 1,
            candidateLimit: 8,
            rootLimit: 10,
            defenseRatio: 0.72,
            attackRatio: 1,
            centerWeight: 1.4,
            neighborWeight: 8
        },
        easy: {
            depth: 1,
            range: 2,
            candidateLimit: 10,
            rootLimit: 12,
            defenseRatio: 0.95,
            attackRatio: 1.06,
            centerWeight: 1.8,
            neighborWeight: 12
        },
        medium: {
            depth: 2,
            range: 2,
            candidateLimit: 10,
            rootLimit: 14,
            defenseRatio: 1.08,
            attackRatio: 1.16,
            centerWeight: 2.2,
            neighborWeight: 16
        },
        hard: {
            depth: 2,
            range: 2,
            candidateLimit: 12,
            rootLimit: 16,
            defenseRatio: 1.22,
            attackRatio: 1.24,
            centerWeight: 2.6,
            neighborWeight: 20
        }
    };

    function isEmpty(value) {
        return value === null || value === undefined || value === 0 || value === '' || value === 'None';
    }

    function normalizeBoard(board, size) {
        if (Array.isArray(board[0])) {
            return {
                board: board.flat(),
                size: size || board.length
            };
        }
        return {
            board: board.slice(),
            size: size || Math.sqrt(board.length)
        };
    }

    function inferOpponent(board, player, options = {}) {
        if (options.opponent !== undefined) return options.opponent;
        if (Array.isArray(options.players)) {
            const next = options.players.find(item => item !== player && item && item.id !== player);
            if (next && typeof next === 'object') return next.id;
            if (next !== undefined) return next;
        }
        if (player === 1) return -1;
        if (player === -1) return 1;
        if (player === 'black') return 'white';
        if (player === 'white') return 'black';
        const used = Array.from(new Set(board.filter(value => !isEmpty(value))));
        return used.find(value => value !== player) || 'opponent';
    }

    function indexOf(row, col, size) {
        return row * size + col;
    }

    function inBoard(row, col, size) {
        return row >= 0 && row < size && col >= 0 && col < size;
    }

    function moveIndex(move) {
        return typeof move === 'number' ? move : move.index;
    }

    function moveByIndex(moves, index) {
        return moves.find(move => moveIndex(move) === index) || null;
    }

    function allLegalIndexes(board) {
        const result = [];
        board.forEach((value, index) => {
            if (isEmpty(value)) result.push(index);
        });
        return result;
    }

    function occupiedIndexes(board) {
        const result = [];
        board.forEach((value, index) => {
            if (!isEmpty(value)) result.push(index);
        });
        return result;
    }

    function centerIndex(size) {
        return Math.floor(size / 2) * size + Math.floor(size / 2);
    }

    function centerScore(size, index) {
        const row = Math.floor(index / size);
        const col = index % size;
        const center = (size - 1) / 2;
        return size * 2 - Math.abs(row - center) - Math.abs(col - center);
    }

    function neighborScore(board, size, index) {
        const row = Math.floor(index / size);
        const col = index % size;
        let score = 0;
        for (let dr = -2; dr <= 2; dr += 1) {
            for (let dc = -2; dc <= 2; dc += 1) {
                if (dr === 0 && dc === 0) continue;
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (!inBoard(nextRow, nextCol, size)) continue;
                if (!isEmpty(board[indexOf(nextRow, nextCol, size)])) {
                    score += 3 - Math.max(Math.abs(dr), Math.abs(dc));
                }
            }
        }
        return score;
    }

    function lineString(board, size, index, player, opponent, dr, dc) {
        const row = Math.floor(index / size);
        const col = index % size;
        let value = '';
        for (let step = -5; step <= 5; step += 1) {
            const nextRow = row + dr * step;
            const nextCol = col + dc * step;
            if (!inBoard(nextRow, nextCol, size)) {
                value += '2';
                continue;
            }
            const nextIndex = indexOf(nextRow, nextCol, size);
            const stone = nextIndex === index ? player : board[nextIndex];
            if (stone === player) value += '1';
            else if (stone === opponent || !isEmpty(stone)) value += '2';
            else value += '0';
        }
        return value;
    }

    function classifyLine(line) {
        if (/11111/.test(line)) return 'five';
        if (/011110/.test(line)) return 'openFour';
        if (/10111|11011|11101|211110|211101|211011|210111|011112|101112|110112|111012/.test(line)) return 'blockFour';
        if (/011100|001110|011010|010110/.test(line)) return 'openThree';
        if (/211100|211010|210110|001112|010112|011012/.test(line)) return 'blockThree';
        if (/001100|011000|000110|010100|001010/.test(line)) return 'openTwo';
        if (/211000|000112|210100|001012/.test(line)) return 'blockTwo';
        return 'none';
    }

    function shapeStats(board, size, index, player, opponent) {
        const stats = {
            five: 0,
            openFour: 0,
            blockFour: 0,
            openThree: 0,
            blockThree: 0,
            openTwo: 0,
            blockTwo: 0
        };
        for (const [dr, dc] of DIRECTIONS) {
            const shape = classifyLine(lineString(board, size, index, player, opponent, dr, dc));
            if (stats[shape] !== undefined) stats[shape] += 1;
        }
        return stats;
    }

    function shapeScore(stats) {
        if (stats.five) return SHAPE_SCORES.five;
        let score = 0;
        score += stats.openFour * SHAPE_SCORES.openFour;
        if (stats.blockFour >= 2) score += SHAPE_SCORES.doubleFour;
        if (stats.blockFour && stats.openThree) score += SHAPE_SCORES.fourThree;
        if (stats.openThree >= 2) score += SHAPE_SCORES.doubleThree;
        score += stats.blockFour * SHAPE_SCORES.blockFour;
        score += stats.openThree * SHAPE_SCORES.openThree;
        score += stats.blockThree * SHAPE_SCORES.blockThree;
        score += stats.openTwo * SHAPE_SCORES.openTwo;
        score += stats.blockTwo * SHAPE_SCORES.blockTwo;
        return score;
    }

    function windowPatternScore(board, size, index, player, opponent) {
        const records = [];
        let total = 0;
        for (const [dr, dc] of DIRECTIONS) {
            const row = Math.floor(index / size);
            const col = index % size;
            let best = { score: 0, points: [], direction: [dr, dc] };
            for (let offset = -5; offset <= 0; offset += 1) {
                const values = [];
                const points = [];
                for (let step = 0; step < 6; step += 1) {
                    const nextRow = row + (step + offset) * dr;
                    const nextCol = col + (step + offset) * dc;
                    points.push([nextRow, nextCol]);
                    if (!inBoard(nextRow, nextCol, size)) values.push(2);
                    else {
                        const nextIndex = indexOf(nextRow, nextCol, size);
                        const stone = nextIndex === index ? player : board[nextIndex];
                        if (stone === player) values.push(1);
                        else if (stone === opponent || !isEmpty(stone)) values.push(2);
                        else values.push(0);
                    }
                }
                const pattern5 = values.slice(0, 5).join('');
                const pattern6 = values.join('');
                for (const item of WINDOW_SCORES) {
                    if ((item.pattern === pattern5 || item.pattern === pattern6) && item.score > best.score) {
                        best = {
                            score: item.score,
                            points: points.slice(0, 5),
                            direction: [dr, dc]
                        };
                    }
                }
            }
            if (!best.score) continue;
            let extra = 0;
            for (const record of records) {
                if (record.score <= 10 || best.score <= 10) continue;
                if (record.points.some(point => best.points.some(next => next[0] === point[0] && next[1] === point[1]))) {
                    extra += record.score + best.score;
                }
            }
            records.push(best);
            total += best.score + extra;
        }
        return total;
    }

    function movePotential(board, size, index, player, opponent) {
        if (!isEmpty(board[index])) return -Infinity;
        return shapeScore(shapeStats(board, size, index, player, opponent)) + windowPatternScore(board, size, index, player, opponent);
    }

    function candidateIndexes(board, size, legalIndexes, player, opponent, profile) {
        const occupied = occupiedIndexes(board);
        if (!occupied.length) {
            const center = centerIndex(size);
            return legalIndexes.includes(center) ? [center] : legalIndexes.slice(0, 1);
        }
        const legal = new Set(legalIndexes);
        const result = new Set();
        occupied.forEach(index => {
            const row = Math.floor(index / size);
            const col = index % size;
            for (let dr = -profile.range; dr <= profile.range; dr += 1) {
                for (let dc = -profile.range; dc <= profile.range; dc += 1) {
                    if (dr === 0 && dc === 0) continue;
                    const nextRow = row + dr;
                    const nextCol = col + dc;
                    if (!inBoard(nextRow, nextCol, size)) continue;
                    const nextIndex = indexOf(nextRow, nextCol, size);
                    if (legal.has(nextIndex)) result.add(nextIndex);
                }
            }
        });
        const source = result.size ? Array.from(result) : legalIndexes;
        return source.map(index => ({
            index,
            score: movePotential(board, size, index, player, opponent) * profile.attackRatio
                + movePotential(board, size, index, opponent, player) * profile.defenseRatio
                + centerScore(size, index) * profile.centerWeight
                + neighborScore(board, size, index) * profile.neighborWeight
        })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, profile.candidateLimit).map(item => item.index);
    }

    function hasFive(board, size, index, player) {
        const row = Math.floor(index / size);
        const col = index % size;
        for (const [dr, dc] of DIRECTIONS) {
            let count = 1;
            for (const sign of [1, -1]) {
                for (let step = 1; step < 5; step += 1) {
                    const nextRow = row + dr * step * sign;
                    const nextCol = col + dc * step * sign;
                    if (!inBoard(nextRow, nextCol, size) || board[indexOf(nextRow, nextCol, size)] !== player) break;
                    count += 1;
                }
            }
            if (count >= 5) return true;
        }
        return false;
    }

    function winningMove(board, size, legalIndexes, player) {
        for (const index of legalIndexes) {
            board[index] = player;
            const win = hasFive(board, size, index, player);
            board[index] = null;
            if (win) return index;
        }
        return null;
    }

    function evaluateBoard(board, size, player, opponent, profile) {
        const legal = allLegalIndexes(board);
        const candidates = candidateIndexes(board, size, legal, player, opponent, profile);
        let score = 0;
        for (const index of candidates) {
            score += movePotential(board, size, index, player, opponent) * profile.attackRatio;
            score -= movePotential(board, size, index, opponent, player) * profile.defenseRatio;
        }
        board.forEach((value, index) => {
            if (value === player) score += centerScore(size, index) * 4;
            else if (value === opponent) score -= centerScore(size, index) * 4;
        });
        return score;
    }

    function minimax(board, size, current, player, opponent, depth, profile, alpha, beta) {
        if (depth <= 0) return evaluateBoard(board, size, player, opponent, profile);
        const legal = allLegalIndexes(board);
        if (!legal.length) return 0;
        const activeOpponent = current === player ? opponent : player;
        const candidates = candidateIndexes(board, size, legal, current, activeOpponent, profile);
        const maximizing = current === player;
        if (maximizing) {
            let value = -Infinity;
            for (const index of candidates) {
                board[index] = current;
                const score = hasFive(board, size, index, current)
                    ? SHAPE_SCORES.five * 10
                    : minimax(board, size, opponent, player, opponent, depth - 1, profile, alpha, beta);
                board[index] = null;
                value = Math.max(value, score);
                alpha = Math.max(alpha, value);
                if (beta <= alpha) break;
            }
            return value;
        }
        let value = Infinity;
        for (const index of candidates) {
            board[index] = current;
            const score = hasFive(board, size, index, current)
                ? -SHAPE_SCORES.five * 10
                : minimax(board, size, player, player, opponent, depth - 1, profile, alpha, beta);
            board[index] = null;
            value = Math.min(value, score);
            beta = Math.min(beta, value);
            if (beta <= alpha) break;
        }
        return value;
    }

    function chooseIndex(inputBoard, inputSize, player, options = {}) {
        const normalized = normalizeBoard(inputBoard, inputSize);
        const board = normalized.board;
        const size = normalized.size;
        const opponent = inferOpponent(board, player, options);
        const profile = DIFFICULTY[options.difficulty] || DIFFICULTY.medium;
        const legal = options.legalIndexes ? options.legalIndexes.slice() : allLegalIndexes(board);
        if (!legal.length) return null;
        const occupiedCount = board.length - legal.length;
        const center = centerIndex(size);
        if (occupiedCount <= 2 && legal.includes(center)) return center;
        const rootCandidates = candidateIndexes(board, size, legal, player, opponent, { ...profile, candidateLimit: profile.rootLimit });
        const win = winningMove(board, size, rootCandidates, player);
        if (win !== null) return win;
        const block = winningMove(board, size, rootCandidates, opponent);
        if (block !== null) return block;
        let best = null;
        let bestScore = -Infinity;
        for (const index of rootCandidates) {
            const orderScore = movePotential(board, size, index, player, opponent) * 0.08
                + centerScore(size, index) * profile.centerWeight;
            board[index] = player;
            const searchScore = hasFive(board, size, index, player)
                ? SHAPE_SCORES.five * 10
                : minimax(board, size, opponent, player, opponent, profile.depth, profile, -Infinity, Infinity);
            board[index] = null;
            const score = searchScore + orderScore;
            if (score > bestScore || (score === bestScore && (best === null || index < best))) {
                best = index;
                bestScore = score;
            }
        }
        return best;
    }

    function chooseMove(game, state, options = {}) {
        const player = options.player || state.current;
        const moves = game.getLegalMoves(state);
        const legalIndexes = moves.map(moveIndex);
        const index = chooseIndex(state.board, game.rows || game.size, player, {
            difficulty: options.difficulty,
            opponent: options.opponent,
            players: game.players,
            legalIndexes
        });
        return index === null ? null : moveByIndex(moves, index) || index;
    }

    window.WuziAI = {
        chooseIndex,
        chooseMove,
        evaluateBoard,
        candidateIndexes,
        movePotential,
        profiles: DIFFICULTY
    };
})();
