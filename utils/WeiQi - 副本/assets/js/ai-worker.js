/**
 * KataGo Web Worker (Heuristic Simulation v2)
 * 修复：现在难度设置会真正影响 AI 的棋力
 */

let isInitialized = false;
let boardSize = 19;

self.onmessage = async (event) => {
    const { command, args, id } = event.data;
    try {
        let result = null;
        if (command === 'init') {
            isInitialized = true;
            boardSize = args.size || 19;
            postMessage({ type: 'ready', model: 'simulation', backend: 'cpu' });
            return;
        }
        
        if (command === 'genmove') {
            // [修复] 真正使用 difficulty 参数
            const difficulty = args.options?.difficulty || 'medium';
            const timeLimit = args.options?.timeLimit || 1000;
            
            // 模拟思考时间
            await new Promise(r => setTimeout(r, Math.min(timeLimit, 2000)));

            const moveStr = selectBestMove(args.board, args.color, difficulty);
            
            result = {
                move: moveStr,
                winRate: 50, // 模拟值
                confidence: 50,
                visits: 100
            };
        }
        
        // ... (analyze 保持原样或简化返回) ... 
        if (command === 'analyze') {
            result = { winRate: 50, topMoves: [], ownership: [] };
        }

        postMessage({ type: 'result', command, id, result });
    } catch (error) {
        console.error('Worker Error:', error);
    }
};

// ------------------------------------------
// 核心 AI 逻辑
// ------------------------------------------

function selectBestMove(board, color, difficulty) {
    const moves = [];
    const size = board.length;

    // 1. 找出所有合法落子点
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if(board[y][x] === 0) {
                // 简单自杀检测
                if(!hasLibertiesAfterMove(board, x, y, color)) continue;
                moves.push({x, y});
            }
        }
    }

    if(moves.length === 0) return 'pass';

    // 2. 为每个点打分
    let bestMove = null;
    let bestScore = -Infinity;

    moves.forEach(move => {
        let score = evaluateMove(board, move.x, move.y, color, difficulty);
        
        // [核心修复] 根据难度注入随机噪声
        // Easy: 噪声极大 (0-60分)，足以掩盖正常逻辑，经常乱下
        // Medium: 噪声适中 (0-15分)，偶尔失误
        // Hard: 噪声极小 (0-2分)，主要靠逻辑
        let noiseFactor = 5;
        if (difficulty === 'easy') noiseFactor = 60;
        else if (difficulty === 'medium') noiseFactor = 15;
        else if (difficulty === 'hard') noiseFactor = 2;

        score += Math.random() * noiseFactor;

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    });

    return coordToSGF(bestMove.x, bestMove.y);
}

function evaluateMove(board, x, y, color, difficulty) {
    const size = board.length;
    let score = 0;
    const opponent = color === 1 ? 2 : 1;

    // A. 优先占角 (仅限开局)
    const stonesCount = countStones(board);
    if(stonesCount < 10) {
        if((x===2||x===size-3) && (y===2||y===size-3)) score += 30; // 3-3点
        if((x===3||x===size-4) && (y===3||y===size-4)) score += 40; // 星位
    }

    // B. 吃子检测 (进攻)
    const captured = checkCaptures(board, x, y, color);
    if (captured > 0) score += captured * 20;

    // C. 救子检测 (防守) - Easy 模式忽略防守
    if (difficulty !== 'easy') {
        const saved = checkSave(board, x, y, color);
        if (saved > 0) score += saved * 25; // 救子比吃子更重要
    }

    // D. 气数评估
    const libs = getLibertiesAfterMove(board, x, y, color);
    score += libs * 2;

    // E. 中央偏好 (天元方向)
    const center = (size-1)/2;
    const dist = Math.abs(x-center) + Math.abs(y-center);
    score -= dist * 0.5; // 越近中央分越高

    // F. 连接性 (Hard 模式特有)
    if (difficulty === 'hard') {
        const neighbors = getNeighbors(x, y, size);
        let connections = 0;
        neighbors.forEach(n => {
            if(board[n.y][n.x] === color) connections++;
        });
        score += connections * 5;
    }

    return score;
}

// --- 辅助函数 ---

function getNeighbors(x, y, size) {
    const n = [];
    if(x>0) n.push({x:x-1, y});
    if(x<size-1) n.push({x:x+1, y});
    if(y>0) n.push({x, y:y-1});
    if(y<size-1) n.push({x, y:y+1});
    return n;
}

function hasLibertiesAfterMove(board, x, y, color) {
    // 简化版：仅检查四周是否有气或是否有盟友有气
    // 完整逻辑太长，这里做近似检查
    const neighbors = getNeighbors(x, y, board.length);
    for(let n of neighbors) {
        if(board[n.y][n.x] === 0) return true; // 自带一口气
        if(board[n.y][n.x] === color) return true; // 连上盟友(假设盟友有气)
    }
    // 提子能产生气
    const captured = checkCaptures(board, x, y, color);
    return captured > 0;
}

function getLibertiesAfterMove(board, x, y, color) {
    let libs = 0;
    getNeighbors(x, y, board.length).forEach(n => {
        if(board[n.y][n.x] === 0) libs++;
    });
    return libs;
}

function checkCaptures(board, x, y, color) {
    const opponent = color===1?2:1;
    let captured = 0;
    const neighbors = getNeighbors(x, y, board.length);
    neighbors.forEach(n => {
        if(board[n.y][n.x] === opponent) {
            // 如果对手这块棋只有1口气（就是(x,y)），那下了就被提了
            if(countLiberties(board, n.x, n.y) === 1) {
                // 估算提子数量，简化处理设为1
                captured += 1; 
            }
        }
    });
    return captured;
}

function checkSave(board, x, y, color) {
    // 检查此步是否填补了己方被打吃的棋子
    let saved = 0;
    const neighbors = getNeighbors(x, y, board.length);
    neighbors.forEach(n => {
        if(board[n.y][n.x] === color) {
            if(countLiberties(board, n.x, n.y) === 1) {
                saved += 1;
            }
        }
    });
    return saved;
}

function countLiberties(board, x, y) {
    // 简单的泛洪填充算气
    const color = board[y][x];
    const visited = new Set();
    const stack = [{x, y}];
    visited.add(`${x},${y}`);
    let libs = 0;
    
    while(stack.length) {
        const p = stack.pop();
        const neighbors = getNeighbors(p.x, p.y, board.length);
        for(let n of neighbors) {
            const val = board[n.y][n.x];
            if(val === 0) {
                libs++; // 简化：不查重气，反正只是估值
            } else if(val === color && !visited.has(`${n.x},${n.y}`)) {
                visited.add(`${n.x},${n.y}`);
                stack.push(n);
            }
        }
    }
    return libs;
}

function countStones(board) {
    let c=0;
    board.forEach(row=>row.forEach(v=>{if(v!==0)c++}));
    return c;
}

function coordToSGF(x, y) {
    return String.fromCharCode(97+x, 97+y);
}