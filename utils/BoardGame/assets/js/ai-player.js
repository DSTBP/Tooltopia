(() => {
    const LINE_DIRECTIONS = [
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];

    function moveIndex(move) {
        return typeof move === 'number' ? move : move.index;
    }

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

    function legalMoves(game, state) {
        if (!game || !state || state.ended) return [];
        return game.getLegalMoves(state);
    }

    function otherPlayer(game, player) {
        const next = game.players.find(item => item.id !== player);
        return next ? next.id : player;
    }

    function applyMove(game, state, move) {
        return game.applyMove(cloneState(state), move);
    }

    function terminalScore(state, aiPlayer) {
        if (!state.ended) return 0;
        if (state.winner === 'draw') return 0;
        return state.winner === aiPlayer ? 1000000 : -1000000;
    }

    function centerScore(game, index) {
        const row = Math.floor(index / game.columns);
        const col = index % game.columns;
        const rowCenter = (game.rows - 1) / 2;
        const colCenter = (game.columns - 1) / 2;
        return game.rows + game.columns - Math.abs(row - rowCenter) - Math.abs(col - colCenter);
    }

    function sortedByScore(items) {
        return items.sort((a, b) => b.score - a.score || moveIndex(a.move) - moveIndex(b.move));
    }

    function scoreLineWindow(own, opponent, empty, profile) {
        if (own && opponent) return 0;
        if (own) return Math.pow(9, own) * (empty + 1) * profile.lineWeight;
        if (opponent) return -Math.pow(9, opponent) * (empty + 1) * profile.defenseWeight;
        return 0;
    }

    function evaluateLineGame(game, state, aiPlayer, profile) {
        const opponent = otherPlayer(game, aiPlayer);
        const target = game.winLength || 5;
        let score = 0;

        for (let row = 0; row < game.rows; row += 1) {
            for (let col = 0; col < game.columns; col += 1) {
                for (const [dr, dc] of LINE_DIRECTIONS) {
                    const endRow = row + (target - 1) * dr;
                    const endCol = col + (target - 1) * dc;
                    if (endRow < 0 || endRow >= game.rows || endCol < 0 || endCol >= game.columns) continue;

                    let own = 0;
                    let opp = 0;
                    let empty = 0;
                    for (let step = 0; step < target; step += 1) {
                        const value = state.board[(row + step * dr) * game.columns + col + step * dc];
                        if (value === aiPlayer) own += 1;
                        else if (value === opponent) opp += 1;
                        else empty += 1;
                    }
                    score += scoreLineWindow(own, opp, empty, profile);
                }
            }
        }

        return score;
    }

    function evaluateReversi(game, state, aiPlayer, profile) {
        const opponent = otherPlayer(game, aiPlayer);
        const scores = state.scores || state.board.reduce((acc, value) => {
            if (value === aiPlayer) acc.ai += 1;
            if (value === opponent) acc.opponent += 1;
            return acc;
        }, { ai: 0, opponent: 0 });
        const aiCount = scores[aiPlayer] || scores.ai || 0;
        const opponentCount = scores[opponent] || scores.opponent || 0;
        const corners = [0, game.columns - 1, game.columns * (game.rows - 1), game.rows * game.columns - 1];
        const cornerScore = corners.reduce((total, index) => {
            if (state.board[index] === aiPlayer) return total + 1;
            if (state.board[index] === opponent) return total - 1;
            return total;
        }, 0);
        const danger = [game.columns + 1, game.columns * 2 - 2, game.columns * (game.rows - 2) + 1, game.columns * (game.rows - 1) - 2];
        const dangerScore = danger.reduce((total, index) => {
            if (state.board[index] === aiPlayer) return total - 1;
            if (state.board[index] === opponent) return total + 1;
            return total;
        }, 0);
        const currentMoves = state.current === aiPlayer ? legalMoves(game, state).length : 0;
        const opponentState = cloneState(state);
        opponentState.current = opponent;
        const opponentMoves = legalMoves(game, opponentState).length;

        return (aiCount - opponentCount) * profile.materialWeight
            + cornerScore * profile.cornerWeight
            + dangerScore * profile.dangerWeight
            + (currentMoves - opponentMoves) * profile.mobilityWeight;
    }

    function evaluateState(game, state, aiPlayer, profile) {
        const result = terminalScore(state, aiPlayer);
        if (result) return result;
        if (game.id === 'reversi') return evaluateReversi(game, state, aiPlayer, profile);
        return evaluateLineGame(game, state, aiPlayer, profile);
    }

    function immediateWinningMove(game, state, player, candidates = null) {
        const testState = cloneState(state);
        testState.current = player;
        const moves = candidates || legalMoves(game, testState);
        return moves.find(move => {
            const next = applyMove(game, testState, move);
            return next.ended && next.winner === player;
        }) || null;
    }

    function immediateBlockMove(game, state, aiPlayer, moves) {
        const opponent = otherPlayer(game, aiPlayer);
        const opponentWin = immediateWinningMove(game, state, opponent);
        if (!opponentWin) return null;
        const target = moveIndex(opponentWin);
        return moves.find(move => moveIndex(move) === target) || null;
    }

    function createMatrix(rows, columns, value) {
        return Array.from({ length: rows }, () => Array(columns).fill(value));
    }

    function quoridorAiWallKey(row, col) {
        return row * 8 + col;
    }

    function resetQuoridorAiBoard(aiGame) {
        aiGame.board.walls = {
            horizontal: createMatrix(8, 8, false),
            vertical: createMatrix(8, 8, false)
        };
        aiGame.validNextWalls = {
            horizontal: createMatrix(8, 8, true),
            vertical: createMatrix(8, 8, true)
        };
        aiGame._probableNextWalls = {
            horizontal: createMatrix(8, 8, false),
            vertical: createMatrix(8, 8, false)
        };
        aiGame.openWays = {
            upDown: createMatrix(8, 9, true),
            leftRight: createMatrix(9, 8, true)
        };
    }

    function applyQuoridorAiHorizontalWall(aiGame, row, col) {
        aiGame.openWays.upDown[row][col] = false;
        aiGame.openWays.upDown[row][col + 1] = false;
        aiGame.validNextWalls.vertical[row][col] = false;
        aiGame.validNextWalls.horizontal[row][col] = false;
        if (col > 0) aiGame.validNextWalls.horizontal[row][col - 1] = false;
        if (col < 7) aiGame.validNextWalls.horizontal[row][col + 1] = false;
        aiGame.board.walls.horizontal[row][col] = true;
        aiGame.adjustProbableValidNextWallForAfterPlaceHorizontalWall(row, col);
    }

    function applyQuoridorAiVerticalWall(aiGame, row, col) {
        aiGame.openWays.leftRight[row][col] = false;
        aiGame.openWays.leftRight[row + 1][col] = false;
        aiGame.validNextWalls.horizontal[row][col] = false;
        aiGame.validNextWalls.vertical[row][col] = false;
        if (row > 0) aiGame.validNextWalls.vertical[row - 1][col] = false;
        if (row < 7) aiGame.validNextWalls.vertical[row + 1][col] = false;
        aiGame.board.walls.vertical[row][col] = true;
        aiGame.adjustProbableValidNextWallForAfterPlaceVerticalWall(row, col);
    }

    function createQuoridorAiGame(state) {
        const aiGame = new Game(true);
        resetQuoridorAiBoard(aiGame);

        aiGame.pawn0.position.row = state.players.blue.row;
        aiGame.pawn0.position.col = state.players.blue.col;
        aiGame.pawn0.numberOfLeftWalls = state.players.blue.walls;
        aiGame.pawn1.position.row = state.players.red.row;
        aiGame.pawn1.position.col = state.players.red.col;
        aiGame.pawn1.numberOfLeftWalls = state.players.red.walls;

        state.hWalls.forEach((owner, index) => {
            if (!owner) return;
            const row = Math.floor(index / 8);
            const col = index % 8;
            applyQuoridorAiHorizontalWall(aiGame, row, col);
        });

        state.vWalls.forEach((owner, index) => {
            if (!owner) return;
            const row = Math.floor(index / 8);
            const col = index % 8;
            applyQuoridorAiVerticalWall(aiGame, row, col);
        });

        let turn = state.moveCount || state.moves.length || 0;
        if (state.current === 'blue' && turn % 2 !== 0) turn += 1;
        if (state.current === 'red' && turn % 2 !== 1) turn += 1;
        aiGame.turn = turn;
        aiGame.winner = null;
        aiGame._validNextPositionsUpdated = false;
        aiGame._probableValidNextWallsUpdated = false;
        return aiGame;
    }

    function quoridorMoveFromAiMove(aiMove, moves) {
        if (!Array.isArray(aiMove)) return null;
        if (aiMove[0]) {
            return moves.find(move => move.type === 'move' && move.row === aiMove[0][0] && move.col === aiMove[0][1]) || null;
        }
        if (aiMove[1]) {
            return moves.find(move => move.type === 'wall' && move.wall === 'h' && move.row === aiMove[1][0] && move.col === aiMove[1][1]) || null;
        }
        if (aiMove[2]) {
            return moves.find(move => move.type === 'wall' && move.wall === 'v' && move.row === aiMove[2][0] && move.col === aiMove[2][1]) || null;
        }
        return null;
    }

    function quoridorAiProfile(difficulty) {
        const simulations = {
            beginner: 2500,
            easy: 7500,
            medium: 20000,
            hard: 60000
        };
        return {
            numOfMCTSSimulations: simulations[difficulty] || simulations.medium,
            uctConst: 0.2
        };
    }

    function chooseQuoridorAiMainMove(state, moves, difficulty) {
        if (typeof Game !== 'function' || typeof AI !== 'function') return moves[0];
        try {
            const aiGame = createQuoridorAiGame(state);
            const profile = quoridorAiProfile(difficulty);
            const ai = new AI(profile.numOfMCTSSimulations, profile.uctConst, false, false);
            return quoridorMoveFromAiMove(ai.chooseNextMove(aiGame), moves) || moves[0];
        } catch (error) {
            console.error('Quoridor AI failed:', error);
            return moves[0];
        }
    }

    function moveScore(game, state, move, aiPlayer, profile, hint) {
        const next = applyMove(game, state, move);
        const index = moveIndex(move);
        const hintBonus = hint && hint.index === index ? profile.hintWeight : 0;
        const flipBonus = game.id === 'reversi' && move.flips ? move.flips.length * profile.flipWeight : 0;
        return evaluateState(game, next, aiPlayer, profile)
            + centerScore(game, index) * profile.centerWeight
            + hintBonus
            + flipBonus;
    }

    function candidateMoves(game, state, aiPlayer, profile) {
        const moves = legalMoves(game, state);
        const hint = profile.useHint && game.getHint ? game.getHint(state) : null;
        const scored = moves.map(move => ({
            move,
            score: moveScore(game, state, move, aiPlayer, profile, hint)
        }));
        return sortedByScore(scored).slice(0, profile.candidateLimit).map(item => item.move);
    }

    function minimax(game, state, depth, aiPlayer, profile, alpha, beta) {
        if (depth <= 0 || state.ended) return evaluateState(game, state, aiPlayer, profile);
        const moves = candidateMoves(game, state, aiPlayer, profile);
        if (!moves.length) return evaluateState(game, state, aiPlayer, profile);
        const maximizing = state.current === aiPlayer;

        if (maximizing) {
            let value = -Infinity;
            for (const move of moves) {
                value = Math.max(value, minimax(game, applyMove(game, state, move), depth - 1, aiPlayer, profile, alpha, beta));
                alpha = Math.max(alpha, value);
                if (beta <= alpha) break;
            }
            return value;
        }

        let value = Infinity;
        for (const move of moves) {
            value = Math.min(value, minimax(game, applyMove(game, state, move), depth - 1, aiPlayer, profile, alpha, beta));
            beta = Math.min(beta, value);
            if (beta <= alpha) break;
        }
        return value;
    }

    function difficultyProfile(difficulty) {
        const profiles = {
            beginner: {
                depth: 0,
                candidateLimit: 5,
                useHint: false,
                centerWeight: 1.8,
                lineWeight: 0.45,
                defenseWeight: 0.55,
                materialWeight: 0.5,
                mobilityWeight: 0.25,
                cornerWeight: 18,
                dangerWeight: 8,
                flipWeight: 2
            },
            easy: {
                depth: 0,
                candidateLimit: 8,
                useHint: true,
                hintWeight: 120,
                centerWeight: 2.4,
                lineWeight: 0.75,
                defenseWeight: 0.9,
                materialWeight: 0.8,
                mobilityWeight: 0.8,
                cornerWeight: 36,
                dangerWeight: 16,
                flipWeight: 5
            },
            medium: {
                depth: 1,
                candidateLimit: 10,
                useHint: true,
                hintWeight: 420,
                centerWeight: 2.8,
                lineWeight: 1.15,
                defenseWeight: 1.25,
                materialWeight: 1.1,
                mobilityWeight: 1.6,
                cornerWeight: 72,
                dangerWeight: 36,
                flipWeight: 8
            },
            hard: {
                depth: 2,
                candidateLimit: 12,
                useHint: true,
                hintWeight: 760,
                centerWeight: 3.2,
                lineWeight: 1.55,
                defenseWeight: 1.8,
                materialWeight: 1.3,
                mobilityWeight: 2.4,
                cornerWeight: 120,
                dangerWeight: 72,
                flipWeight: 10
            }
        };
        return profiles[difficulty] || profiles.medium;
    }

    function chooseMove(game, state, options = {}) {
        const moves = legalMoves(game, state);
        if (!moves.length) return null;
        if (game.id === 'quoridor') return chooseQuoridorAiMainMove(state, moves, options.difficulty);

        const aiPlayer = options.player || state.current;
        const profile = difficultyProfile(options.difficulty);
        const winMove = immediateWinningMove(game, state, aiPlayer, moves);
        if (winMove) return winMove;
        const blockMove = immediateBlockMove(game, state, aiPlayer, moves);
        if (blockMove) return blockMove;

        const hint = profile.useHint && game.getHint ? game.getHint(state) : null;
        const scoredMoves = moves.map(move => {
            const next = applyMove(game, state, move);
            const searchScore = profile.depth > 0
                ? minimax(game, next, profile.depth, aiPlayer, profile, -Infinity, Infinity)
                : evaluateState(game, next, aiPlayer, profile);
            return {
                move,
                score: searchScore + moveScore(game, state, move, aiPlayer, profile, hint) * 0.35
            };
        });

        return sortedByScore(scoredMoves)[0].move;
    }

    window.BoardGameAI = {
        chooseMove
    };
})();
