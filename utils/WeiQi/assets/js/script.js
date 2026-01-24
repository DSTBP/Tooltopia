(() => {
    const $ = id => document.getElementById(id);
    const canvas = $('board');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // UI 元素引用
    const ui = [
        'status', 'moveCount', 'blackScore', 'whiteScore', 'currentPlayer', 'lastMove', 
        'aiHint', 'tipText', 'blackDetail', 'whiteDetail', 'newGameBtn', 'undoBtn', 
        'passBtn', 'hintBtn', 'resignBtn', 'difficultySelect', 'boardSizeSelect', 
        'boardDimensionInput', 'boardDimensionUp', 'boardDimensionDown', 'boardStyleSelect', 
        'scoringMethodSelect', 'komiSelect', 'koRuleSelect', 'playerColorSelect', 
        'showLibertiesCheck', 'showConnectionsCheck', 'showInfluenceCheck', 'showEyesCheck', 
        'showHandAnimationCheck', 'blackLabel', 'whiteLabel', 'peerIdInput', 'selfIdInput', 
        'createRoomBtn', 'joinRoomBtn', 'leaveRoomBtn', 'roomStatus'
    ].reduce((acc, id) => ({ ...acc, [id]: $(id) }), {});

    // 配置与状态
    const config = { size: 9, komi: 5.5, scoringMethod: 'japanese', boardStyle: 'hiba', boardCssSize: 560, koRule: 'simple', playerColor: 'black' };
    const state = {
        board: [], current: 1, human: 1, ai: 2, captures: { 1: 0, 2: 0 }, koPoint: null,
        passCount: 0, moveCount: 0, lastMove: null, difficulty: 'easy', busy: false,
        aiWorker: null, gameOver: false, turnId: 0, history: [], positionKeys: new Set(),
        hintUsed: 0, hintLimit: 3,
        showLiberties: false, showConnections: false, showInfluence: false, showEyes: false, 
        showHandAnimation: true, handAnimation: null, nextHandAnimation: null,
        mode: 'solo', role: 'player', roomId: '', selfId: '', peer: null, connections: new Map(),
        hostConnection: null, isHost: false, guestId: null, clientId: getClientId(), lastGameUpdate: 0,
        devicePerf: 'unknown'
    };
    
    let render = { size: 0, pad: 0, cell: 0, handImage: new Image() };
    render.handImage.src = './assets/data/hand.svg';

    const labels = {
        diff: { easy: '简单 (随机)', medium: '中等 (贪心)', hard: '困难 (MCTS)' },
        style: { hiba: '桧木棋盘', bamboo: '竹制棋盘', whitePorcelain: '白釉瓷棋盘', celadon: '青瓷', marble: '大理石', brocade: '织锦棋盘', acrylic: '亚克力棋盘' },
        rule: { japanese: '日韩规则', chinese: '中国规则', aga: 'AGA 规则' }
    };

    // --- 初始化与事件 ---
    function init() {
        checkDevicePerformance();
        initAIWorker();
        bindEvents();
        syncUI();
        loadSettings();
        startNewGame();
        resizeCanvas();
        setupResizeListener();
    }

    function checkDevicePerformance() {
        const mem = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 2;
        state.devicePerf = (mem >= 8 && cores >= 4) ? 'high' : 'low';
        console.log(`Device Performance: ${state.devicePerf} (Mem: ${mem}GB, Cores: ${cores})`);
    }

    // 核心修改：初始化 Web Worker AI 引擎
    // 核心修改：使用 WGo 库实现蒙特卡洛模拟 (MCTS) 以提升困难模式智商
    function initAIWorker() {
        if (state.aiWorker) state.aiWorker.terminate();

        // 1. 获取本地 wgo.min.js 的完整绝对路径
        const wgoUrl = new URL('./assets/js/wgo.min.js', document.baseURI).href;

        const workerScript = `
            // --- 1. 环境伪造 (Mock) ---
            // WGo.js 是为浏览器设计的，直接在 Worker 运行会报错。
            // 我们需要伪造 window, document 等对象来"欺骗"库文件。
            self.window = self;
            
            self.document = {
                readyState: 'complete',
                // 关键：防止访问 currentScript.src 报错
                currentScript: { src: '${wgoUrl}' },
                // 欺骗 getElementsByTagName 查找 script 标签
                getElementsByTagName: function(tag) { 
                    return (tag === 'script') ? [{ src: '${wgoUrl}' }] : []; 
                },
                // 欺骗元素创建
                createElement: function() { 
                    return { 
                        style: {}, 
                        appendChild: function(){}, 
                        setAttribute: function(){} 
                    }; 
                },
                body: { appendChild: function(){} },
                documentElement: { style: {} },
                head: { appendChild: function(){} },
                getElementById: function() { return null; }
            };

            self.navigator = { userAgent: 'Worker' };

            // --- 2. 加载 WGo 库 ---
            try {
                importScripts('${wgoUrl}');
            } catch (e) {
                console.error("WGo script load failed:", e);
            }

            // --- 3. 消息处理 ---
            self.onmessage = function(e) {
                const { type, board, size, color, difficulty, koPoint } = e.data;
                if (type === 'think') {
                    const start = Date.now();
                    let move = null;
                    try {
                        move = calculateMove(board, size, color, difficulty, koPoint);
                    } catch (err) {
                        console.error("AI Calc Error:", err);
                    }
                    const time = Date.now() - start;
                    self.postMessage({ type: 'move', move, time });
                }
            };

            // --- 4. AI 核心逻辑 ---
            function calculateMove(board, size, color, difficulty, koPoint) {
                const WGoLib = self.WGo || self.window.WGo;
                if (!WGoLib) return null;

                // 初始化当前局面的 Game 对象
                const game = new WGoLib.Game(size, "simple");
                
                // 同步主线程传来的棋盘状态到 WGo 对象
                // 主线程: 1=黑, 2=白; WGo: B(1)=黑, W(-1)=白
                for(let y = 0; y < size; y++) {
                    for(let x = 0; x < size; x++) {
                        if (board[y][x] === 1) game.setStone(x, y, WGoLib.B);
                        else if (board[y][x] === 2) game.setStone(x, y, WGoLib.W);
                    }
                }
                game.turn = (color === 1 ? WGoLib.B : WGoLib.W);

                // 获取所有合法落子点
                const candidates = [];
                for(let x = 0; x < size; x++) {
                    for(let y = 0; y < size; y++) {
                        if (game.isValid(x, y)) {
                            // 过滤打劫禁着点
                            if (koPoint && koPoint.x === x && koPoint.y === y) continue;
                            candidates.push({ x, y });
                        }
                    }
                }

                if (candidates.length === 0) return null;

                // --- 难度分级 ---
                
                // [简单]: 纯随机
                if (difficulty === 'easy') {
                    return candidates[Math.floor(Math.random() * candidates.length)];
                } 
                
                // [中等/困难]: 蒙特卡洛模拟 (Random Playouts)
                // 困难模式模拟更多次，更聪明但思考时间稍长
                const roundsPerMove = difficulty === 'hard' ? 20 : 5; 
                const timeLimit = difficulty === 'hard' ? 2500 : 1000; // 毫秒超时限制

                return runMCTS(WGoLib, game, candidates, size, color, roundsPerMove, timeLimit);
            }

            // 简易蒙特卡洛搜索：让 WGo 自己左右互搏，模拟出胜率最高的点
            function runMCTS(WGoLib, originalGame, candidates, size, myColor, rounds, timeLimit) {
                const startTime = Date.now();
                let bestMove = candidates[0];
                let bestScore = -Infinity;

                // 随机打乱候选点，避免相同分数时总是选左上角
                candidates.sort(() => Math.random() - 0.5);

                for (let move of candidates) {
                    let totalWinPoints = 0; // 累计胜负分

                    // 对每个候选点进行 N 轮模拟
                    for (let r = 0; r < rounds; r++) {
                        // 1. 克隆局面 (通过新建 Game 并复制棋子，这是最稳妥的方式)
                        const simGame = new WGoLib.Game(size, "simple");
                        const rawBoard = originalGame.getPosition(); // 获取当前棋盘数据
                        
                        // 快速复制棋盘 (仅复制非空点)
                        for(let i=0; i < size*size; i++) {
                            const val = rawBoard.schema[i]; // WGo 内部直接访问 schema 数组最快
                            if(val) {
                                // 将一维索引转回二维
                                const sx = i % size;
                                const sy = Math.floor(i / size);
                                simGame.setStone(sx, sy, val);
                            }
                        }
                        simGame.turn = originalGame.turn; // 继承轮次

                        // 2. 尝试走这一步
                        simGame.play(move.x, move.y);

                        // 3. 快速随机模拟直到终局 (Rollout)
                        let passCount = 0;
                        let steps = 0;
                        const maxSteps = size * size * 1.5; // 防止死循环

                        while (passCount < 2 && steps < maxSteps) {
                            // 随机找一个合法点落子
                            // 为了性能，采用"拒绝采样"：随机生成坐标，直到合法或尝试次数耗尽
                            let found = false;
                            for(let k=0; k<15; k++) {
                                const rx = Math.floor(Math.random() * size);
                                const ry = Math.floor(Math.random() * size);
                                if(simGame.isValid(rx, ry)) {
                                    simGame.play(rx, ry);
                                    passCount = 0;
                                    found = true;
                                    break;
                                }
                            }
                            
                            if (!found) {
                                simGame.pass();
                                passCount++;
                            }
                            steps++;
                        }

                        // 4. 结算当前模拟盘的胜负 (简单子数统计)
                        let balance = 0;
                        const finalBoard = simGame.getPosition().schema;
                        for(let i=0; i<finalBoard.length; i++) {
                            balance += finalBoard[i]; // 黑+1, 白-1
                        }
                        // 减去贴目 (5.5)
                        balance -= 5.5;

                        // 转换为视角得分 (如果是黑棋，balance>0是好事；白棋反之)
                        // WGo: 黑=1, 白=-1. 我们的 color: 黑=1, 白=2
                        const amIBlack = (myColor === 1);
                        if (amIBlack) totalWinPoints += balance;
                        else totalWinPoints -= balance;
                    }

                    // 计算该点的平均表现
                    const avgScore = totalWinPoints / rounds;
                    
                    // 加上一点位置权重 (鼓励占角和边，避免开局全填天元)
                    // 9路盘中心是 4,4
                    const center = (size - 1) / 2;
                    const distToCenter = Math.abs(move.x - center) + Math.abs(move.y - center);
                    const heuristic = avgScore - (distToCenter * 0.1); // 距离惩罚很小，主要看胜率

                    if (heuristic > bestScore) {
                        bestScore = heuristic;
                        bestMove = move;
                    }

                    // 超时保护
                    if (Date.now() - startTime > timeLimit) break;
                }

                return bestMove;
            }
        `;

        const blob = new Blob([workerScript], { type: 'application/javascript' });
        state.aiWorker = new Worker(URL.createObjectURL(blob));
        
        state.aiWorker.onmessage = (e) => {
            const { type, move } = e.data;
            if (type === 'move') {
                state.busy = false;
                if (move) {
                    // Worker 返回的是决策坐标，主线程负责验证和生成完整数据
                    const fullMove = simulateMove(state.board, move.x, move.y, state.ai, state.koPoint);
                    if (fullMove) {
                        applyMove(fullMove, state.ai);
                    } else {
                        // 理论上 WGo 的 isValid 已经过滤了，防止万一
                        handlePassAction();
                    }
                } else {
                    handlePassAction();
                }
            }
        };
        
        state.aiWorker.onerror = (e) => {
            console.error("Worker Error:", e.message);
            state.busy = false;
        };
    }

    function syncUI() {
        ui.boardSizeSelect.value = config.size;
        ui.boardDimensionInput.value = config.boardCssSize;
        ui.boardStyleSelect.value = config.boardStyle;
        ui.scoringMethodSelect.value = config.scoringMethod;
        ui.komiSelect.value = config.komi;
        ui.koRuleSelect.value = config.koRule;
        ui.playerColorSelect.value = config.playerColor;
        ui.selfIdInput.value = state.selfId;
        updateControlState();
    }

    function loadSettings() {
        applyPlayerColor();
        updateDifficultyUI();
        updateRoomStatus('未加入联机');
    }

    function bindEvents() {
        canvas.addEventListener('click', onBoardClick);
        ui.newGameBtn.onclick = handleNewGameClick;
        ui.undoBtn.onclick = undoMove;
        ui.passBtn.onclick = handlePassAction;
        ui.hintBtn.onclick = getHint;
        ui.resignBtn.onclick = resignGame;
        
        // 修改联机按钮绑定
        if (ui.createRoomBtn) ui.createRoomBtn.onclick = createRoom; // 生成房间 (做主机)
        if (ui.joinRoomBtn) ui.joinRoomBtn.onclick = joinRoomAction; // 加入房间 (做客机)
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.onclick = () => leaveRoom();
        
        window.onbeforeunload = () => leaveRoom(true);
        
        ui.selfIdInput.onclick = () => {
            if (!ui.selfIdInput.value) return;
            const copySuccess = () => {
                ui.selfIdInput.style.borderColor = '#80ff80';
                ui.selfIdInput.style.boxShadow = '0 0 10px rgba(0, 200, 0, 0.5), inset 0 0 4px rgba(0, 200, 0, 0.15)';
                ui.selfIdInput.style.backgroundColor = 'rgba(0, 200, 0, 0.05)';
                setStatus('ID 已复制到剪贴板 ✓', 'success');
                setTimeout(() => {
                    ui.selfIdInput.style.borderColor = '';
                    ui.selfIdInput.style.boxShadow = '';
                    ui.selfIdInput.style.backgroundColor = '';
                }, 2000);
            };
            navigator.clipboard.writeText(ui.selfIdInput.value).then(copySuccess)
                .catch(() => { ui.selfIdInput.select(); document.execCommand('copy'); copySuccess(); });
        };

        const checkOnline = (msg) => {
            if (state.mode === 'online') { setStatus(msg || '联机模式下不可用', 'error'); return true; }
            return false;
        };

        ui.difficultySelect.onchange = e => { 
            if(!checkOnline()) { 
                state.difficulty = e.target.value; 
                updateDifficultyUI(); 
            } else e.target.value = state.difficulty; 
        };
        
        ui.boardSizeSelect.onchange = e => {
            if (checkOnline()) { e.target.value = config.size; return; }
            const size = parseInt(e.target.value) || config.size;
            if (size === config.size) return;
            config.size = size;
            state.handAnimation = null;
            startNewGame();
            resizeCanvas();
            setStatus(`切换为 ${size} 路`, 'success');
        };

        const setSize = val => {
            const size = Math.min(900, Math.max(240, parseInt(val) || config.boardCssSize));
            if (size === config.boardCssSize) return;
            ui.boardDimensionInput.value = config.boardCssSize = size;
            resizeCanvas();
        };
        ui.boardDimensionInput.onkeydown = e => { 
            if(e.key==='ArrowUp') { e.preventDefault(); setSize(config.boardCssSize+10); }
            if(e.key==='ArrowDown') { e.preventDefault(); setSize(config.boardCssSize-10); }
        };
        ui.boardDimensionInput.onwheel = e => e.preventDefault();
        
        ui.boardDimensionUp.onclick = () => setSize(config.boardCssSize + 10);
        ui.boardDimensionDown.onclick = () => setSize(config.boardCssSize - 10);

        ui.boardStyleSelect.onchange = e => { config.boardStyle = e.target.value; draw(); setStatus(`样式: ${labels.style[config.boardStyle]}`, 'success'); };
        
        ui.scoringMethodSelect.onchange = e => {
            if (checkOnline()) { e.target.value = config.scoringMethod; return; }
            config.scoringMethod = e.target.value;
            updateGameInfo();
        };

        ui.komiSelect.onchange = e => {
            if (checkOnline()) { e.target.value = config.komi; return; }
            config.komi = parseFloat(e.target.value);
            updateGameInfo();
        };

        ui.koRuleSelect.onchange = e => {
            if (checkOnline()) { e.target.value = config.koRule; return; }
            config.koRule = e.target.value;
            setStatus(`劫规则: ${config.koRule === 'super' ? '超级劫' : '简单劫'}`, 'success');
        };

        ui.playerColorSelect.onchange = e => {
            if (checkOnline()) { e.target.value = config.playerColor; return; }
            if (e.target.value !== config.playerColor) {
                config.playerColor = e.target.value;
                applyPlayerColor();
                startNewGame();
            }
        };

        const toggles = { showLiberties: ui.showLibertiesCheck, showConnections: ui.showConnectionsCheck, showInfluence: ui.showInfluenceCheck, showEyes: ui.showEyesCheck, showHandAnimation: ui.showHandAnimationCheck };
        Object.entries(toggles).forEach(([k, el]) => el.onchange = e => {
            state[k] = e.target.checked;
            if (k === 'showHandAnimation' && !state[k]) state.handAnimation = null;
            draw();
        });
    }

    function handleNewGameClick() {
        if (state.mode === 'online') {
            if (state.role !== 'player' || !state.isHost) {
                setStatus('仅房主可发起新对局', 'error');
                return;
            }
            resetGameState();
            broadcastGameState();
            setStatus('联机对局已重置', 'success');
            updateUI();
            draw();
        } else {
            startNewGame();
        }
    }

    function startNewGame() {
        if (state.mode === 'online') return;
        resetGameState();
        setStatus(`新对局，玩家执${state.human===1?'黑':'白'}`, 'success');
        updateGameInfo();
        if (state.current === state.ai) scheduleAiMove();
        updateUI();
        draw();
    }

    function resetGameState() {
        state.turnId++;
        // 终止旧的计算
        if(state.aiWorker) state.aiWorker.terminate();
        initAIWorker(); // 重启 Worker
        
        state.board = Array.from({ length: config.size }, () => Array(config.size).fill(0));
        state.positionKeys = new Set([boardKey(state.board)]);
        Object.assign(state, { current: 1, captures: {1:0, 2:0}, koPoint: null, passCount: 0, moveCount: 0, lastMove: null, gameOver: false, busy: false, history: [], hintUsed: 0, handAnimation: null, nextHandAnimation: null });
    }

    function onBoardClick(e) {
        if (state.gameOver || state.busy) return;

        // 检查是否有权限落子
        if (state.mode === 'online') {
            // 联机模式：检查是否为玩家角色，且轮到自己
            if (state.role !== 'player' || state.current !== state.human) return;
        } else {
            // 单机模式：检查轮到人类玩家
            if (state.current !== state.human) return;
        }

        const pt = getPoint(e);
        if (!pt) return;
        if (state.board[pt.y][pt.x] !== 0) return setStatus('此处已有子', 'error');
        if (state.koPoint && state.koPoint.x === pt.x && state.koPoint.y === pt.y) return setStatus('劫争禁着', 'error');

        const move = simulateMove(state.board, pt.x, pt.y, state.human, state.koPoint);
        if (!move) return setStatus(isSuicide(state.board, pt.x, pt.y, state.human) ? '禁止自杀' : '禁着点', 'error');

        applyMove(move, state.human);
        if (state.mode === 'online') broadcastGameState();
        else scheduleAiMove();
    }

    function applyMove(move, color) {
        saveSnapshot();
        state.board = move.board;
        state.positionKeys.add(boardKey(state.board));
        state.captures[color] += move.captured.length;
        state.koPoint = move.koPoint;
        state.moveCount++;
        state.passCount = 0;
        state.lastMove = { x: move.x, y: move.y, color, captured: move.captured.length };
        
        if (!startHandAnimation(move.x, move.y, color)) draw();
        
        // 修复：始终更新状态，覆盖"AI 思考中"
        if (move.captured.length) {
            setStatus(`${color===1?'黑':'白'} 提 ${move.captured.length} 子`, 'success');
        } else {
            // 如果是 AI 落子且没有提子，也显示落子位置，确保覆盖"思考中"
            if (color === state.ai) {
                setStatus(`AI 落子于 ${formatCoord(move.x, move.y)}`, 'success');
            }
        }
        
        state.current = 3 - state.current;
        updateUI();
        if (state.current === state.human && !state.gameOver) checkDanger();
    }
    
    function handlePassAction() {
        if (state.gameOver || (state.mode === 'online' && (state.role !== 'player' || state.current !== state.human))) return;
        saveSnapshot();
        state.passCount++;
        state.moveCount++;
        state.lastMove = { pass: true, color: state.current, captured: 0 };
        state.koPoint = null;
        setStatus(`${state.current===1?'黑':'白'} 停手`, 'success');
        updateUI();
        draw();
        
        if (state.passCount >= 2) {
            endGame();
            if (state.mode === 'online') broadcastGameState();
        } else {
            state.current = 3 - state.current;
            if (state.mode === 'online') broadcastGameState();
            else if (state.current === state.ai) scheduleAiMove();
        }
    }

    function scheduleAiMove() {
        state.busy = true;
        
        // 核心修改：发送消息给 Worker
        // 根据设备性能决定难度细节 (Memory Check)
        // 如果是困难模式但设备弱，Worker 内部会根据 difficulty 参数执行 MCTS，
        // 我们这里不再需要做太复杂的降级，Worker 是不阻塞的。
        state.aiWorker.postMessage({
            type: 'think',
            board: state.board,
            size: config.size,
            color: state.ai,
            lastMove: state.lastMove,
            difficulty: state.difficulty,
            koPoint: state.koPoint
        });
        
        setStatus('AI 思考中...', 'success');
    }

    // --- 逻辑辅助 (保留用于UI交互的验证) ---
    // 注意：Worker 内部有一套独立的逻辑副本，这里保留是为了响应玩家的点击验证
    function simulateMove(board, x, y, color, koPoint) {
        if (board[y][x] || (koPoint && koPoint.x === x && koPoint.y === y)) return null;
        const next = board.map(r => [...r]);
        next[y][x] = color;
        const opp = 3 - color, captured = [];
        
        getNeighbors(x, y).forEach(p => {
            if (next[p.y][p.x] === opp) {
                const g = getGroup(next, p.x, p.y);
                if (!g.liberties.size) g.stones.forEach(s => { next[s.y][s.x] = 0; captured.push(s); });
            }
        });

        if (!getGroup(next, x, y).liberties.size || (config.koRule === 'super' && state.positionKeys.has(boardKey(next)))) return null;
        return { x, y, board: next, captured, koPoint: (captured.length === 1 && getGroup(next, x, y).liberties.size === 1) ? captured[0] : null };
    }

    function getNeighbors(x, y) {
        const res = [];
        if (x > 0) res.push({ x: x - 1, y });
        if (x < config.size - 1) res.push({ x: x + 1, y });
        if (y > 0) res.push({ x, y: y - 1 });
        if (y < config.size - 1) res.push({ x, y: y + 1 });
        return res;
    }

    function getGroup(board, x, y) {
        const c = board[y][x], stones = [], liberties = new Set(), visited = new Set([`${x},${y}`]), stack = [{ x, y }];
        while (stack.length) {
            const p = stack.pop();
            stones.push(p);
            getNeighbors(p.x, p.y).forEach(n => {
                const v = board[n.y][n.x];
                if (v === 0) liberties.add(`${n.x},${n.y}`);
                else if (v === c && !visited.has(`${n.x},${n.y}`)) { visited.add(`${n.x},${n.y}`); stack.push(n); }
            });
        }
        return { stones, liberties };
    }

    function countAtari(board, color) {
        let cnt = 0, v = new Set();
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) {
            if (board[y][x] === color && !v.has(`${x},${y}`)) {
                const g = getGroup(board, x, y);
                g.stones.forEach(s => v.add(`${s.x},${s.y}`));
                if (g.liberties.size === 1) cnt++;
            }
        }
        return cnt;
    }

    function isSuicide(board, x, y, color) {
        const next = board.map(r => [...r]); next[y][x] = color;
        const opp = 3 - color;
        if (getNeighbors(x, y).some(n => next[n.y][n.x] === opp && getGroup(next, n.x, n.y).liberties.size === 0)) return false;
        return getGroup(next, x, y).liberties.size === 0;
    }

    function getLegalMoves(board, color, ko) {
        const m = [];
        for(let y=0; y<config.size; y++) for(let x=0; x<config.size; x++) 
            if (!board[y][x]) { const res = simulateMove(board, x, y, color, ko); if(res) m.push(res); }
        return m;
    }

    // --- 辅助功能 ---
    function undoMove() {
        if (state.mode === 'online' || !state.history.length) return setStatus('无法悔棋', 'error');
        state.turnId++; 
        // 重置 Worker 状态
        if(state.aiWorker) { state.aiWorker.terminate(); initAIWorker(); }
        state.busy = false; state.handAnimation = null; state.nextHandAnimation = null;

        const steps = (state.lastMove && state.lastMove.color === state.ai) ? 2 : 1;
        let snap;
        for(let i=0; i<steps && state.history.length; i++) snap = state.history.pop();
        if(snap) {
            Object.assign(state, snap);
            state.positionKeys = new Set([boardKey(state.board), ...state.history.map(h => boardKey(h.board))]);
            updateUI(); draw(); setStatus('已悔棋', 'success');
        }
    }

    function getHint() {
        if (state.gameOver || (state.mode === 'online' && state.role !== 'player') || state.current !== state.human) return;
        if (state.hintUsed >= state.hintLimit) return setStatus('提示次数已尽', 'error');
        
        // 提示功能也使用简单的贪心搜索（因为要即时反馈），不调用重型 Worker
        const moves = getLegalMoves(state.board, state.human, state.koPoint);
        const best = moves.map(m => {
            const libs = getGroup(m.board, m.x, m.y).liberties.size;
            const score = m.captured.length * 8 + countAtari(m.board, 3 - state.human) * 2 + 
               getNeighbors(m.x, m.y).filter(p => m.board[p.y][p.x] === state.human).length * 0.6 +
               libs * 0.2;
            return { ...m, score };
        }).sort((a, b) => b.score - a.score)[0];

        if (!best) return setStatus('无处可下', 'error');
        state.hintUsed++;
        setStatus(`建议落子: ${formatCoord(best.x, best.y)}`, 'success');
        highlightHint(best.x, best.y);
    }

    function highlightHint(x, y) {
        const { pad, cell } = render, cx = pad + x * cell, cy = pad + y * cell;
        ctx.save(); ctx.strokeStyle = 'rgba(255,200,0,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, cell * 0.4, 0, Math.PI*2); ctx.stroke(); ctx.restore();
        setTimeout(draw, 2000);
    }

    function resignGame() {
        if (state.gameOver) return;
        if (state.mode === 'online' && state.role !== 'player') return setStatus('观战不可认输', 'error');
        state.gameOver = true;
        state.lastMove = { resign: true, color: state.human };
        setStatus(state.mode === 'online' ? '你认输了' : '玩家认输', 'success');
        updateUI(); draw();
        if (state.mode === 'online') broadcastGameState();
    }

    function endGame() {
        state.gameOver = true;
        const s = calcScore();
        const diff = Math.abs(s.black - s.white).toFixed(1);
        setStatus(`终局: 黑${s.black.toFixed(1)} / 白${s.white.toFixed(1)}，${s.black > s.white ? '黑胜' : '白胜'} (${diff})`, 'success');
        updateUI();
    }

    function calcScore() {
        const terr = {1:0, 2:0}, stones = {1:0, 2:0}, v = new Set();
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) {
            if(state.board[y][x]) stones[state.board[y][x]]++;
            else if(!v.has(`${x},${y}`)) {
                const reg = floodFill(x, y);
                reg.cells.forEach(c => v.add(`${c.x},${c.y}`));
                if(reg.borders.size === 1) terr[[...reg.borders][0]] += reg.cells.length;
            }
        }
        let b = terr[1], w = terr[2] + config.komi;
        if(config.scoringMethod === 'chinese') { b += stones[1]; w += stones[2]; }
        else if(config.scoringMethod === 'aga') { b += stones[1] + state.captures[1]; w += stones[2] + state.captures[2]; }
        else { b += state.captures[1]; w += state.captures[2]; }
        return { territory: terr, stones, black: b, white: w };
    }

    function floodFill(sx, sy) {
        const q = [{x:sx, y:sy}], cells = [], borders = new Set(), v = new Set([`${sx},${sy}`]);
        while(q.length) {
            const p = q.pop(); cells.push(p);
            getNeighbors(p.x, p.y).forEach(n => {
                const val = state.board[n.y][n.x];
                if(val === 0 && !v.has(`${n.x},${n.y}`)) { v.add(`${n.x},${n.y}`); q.push(n); }
                else if(val !== 0) borders.add(val);
            });
        }
        return { cells, borders };
    }

    // --- 渲染逻辑 ---
    function resizeCanvas() {
        const p = canvas.parentElement, w = p ? p.clientWidth : config.boardCssSize;
        const size = (window.innerWidth <= 768) ? Math.max(220, w - 32) : config.boardCssSize;
        const dpr = window.devicePixelRatio || 1;
        p.style.width = p.style.height = `${size}px`;
        canvas.width = canvas.height = Math.floor(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pad = Math.round(size * 0.08);
        render = { size, pad, cell: (size - pad * 2) / (config.size - 1), handImage: render.handImage };
        draw();
    }

    function draw() {
        if (!render.size) return;
        drawBg();
        drawGrid();
        if (state.showInfluence) drawInfl();
        if (state.showConnections) drawConn();
        drawStones();
        if (state.showEyes) drawEyes();
        if (state.showLiberties) drawLibs();
        drawLast();
        if (state.handAnimation) drawHand();
    }

    function drawBg() {
        const s = config.boardStyle, size = render.size, g = ctx.createLinearGradient(0,0,size,size);
        const colors = {
            bamboo: ['#e8c44a','#b89548'], whitePorcelain: ['#fef9f3','#ebe5dd'], celadon: ['#d9ead8','#a5bfa5'],
            marble: ['#f8f8f8','#d5d5d5'], brocade: ['#d8a86f','#a67930'], acrylic: ['#e8f4ff','#b8d0db'], hiba: ['#d8a873','#a87a40']
        };
        const c = colors[s] || colors.hiba;
        g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
        ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
        if(s==='hiba'||s==='bamboo') { ctx.strokeStyle='rgba(100,60,30,0.1)'; ctx.beginPath(); for(let i=0;i<size;i+=4) { ctx.moveTo(0,i); ctx.lineTo(size,i+Math.sin(i)*5); } ctx.stroke(); }
    }

    function drawGrid() {
        const {size, pad, cell} = render;
        ctx.strokeStyle = 'rgba(20,20,20,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for(let i=0; i<config.size; i++) {
            const p = pad + i * cell;
            ctx.moveTo(pad, p); ctx.lineTo(size-pad, p);
            ctx.moveTo(p, pad); ctx.lineTo(p, size-pad);
        }
        ctx.stroke();
        const stars = getStars();
        if (stars.length) {
            ctx.fillStyle = '#111';
            stars.forEach(s => { ctx.beginPath(); ctx.arc(pad+s.x*cell, pad+s.y*cell, cell*0.12, 0, Math.PI*2); ctx.fill(); });
        }
    }

    function drawStones() {
        const {pad, cell} = render;
        const danger = new Set();
        if (state.showConnections) { 
             const v = new Set();
             for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) if(state.board[y][x] && !v.has(`${x},${y}`)) {
                 const g = getGroup(state.board, x, y); g.stones.forEach(s=>v.add(`${s.x},${s.y}`));
                 if(g.liberties.size===1) g.stones.forEach(s=>danger.add(`${s.x},${s.y}`));
             }
        }

        for(let y=0; y<config.size; y++) for(let x=0; x<config.size; x++) {
            const val = state.board[y][x];
            
            const isAnimating = state.handAnimation && state.handAnimation.gridX === x && state.handAnimation.gridY === y && state.handAnimation.progress < 0.4;
            const isPending = state.nextHandAnimation && state.nextHandAnimation.x === x && state.nextHandAnimation.y === y;

            if(!val || isAnimating || isPending) continue;

            const cx = pad+x*cell, cy = pad+y*cell, r = cell*0.45;
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx+2, cy+2, r, 0, Math.PI*2); ctx.fill();
            const g = ctx.createRadialGradient(cx-r*0.4, cy-r*0.4, r*0.1, cx, cy, r);
            if(val===1) { g.addColorStop(0,'#666'); g.addColorStop(1,'#000'); }
            else { g.addColorStop(0,'#fff'); g.addColorStop(1,'#d0d0d0'); }
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
            if(danger.has(`${x},${y}`)) { ctx.strokeStyle='red'; ctx.lineWidth=2; ctx.stroke(); }
        }
    }

    function drawInfl() {
        const {pad, cell} = render, infl = Array.from({length:config.size},()=>Array(config.size).fill(0));
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) {
            const v = state.board[y][x];
            if(v) for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++) {
                const nx=x+dx, ny=y+dy;
                if(nx>=0&&nx<config.size&&ny>=0&&ny<config.size) infl[ny][nx] += (v===1?1:-1) / (Math.abs(dx)+Math.abs(dy)+1);
            }
        }
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) {
            const v = infl[y][x];
            if(Math.abs(v)>0.2) {
                ctx.fillStyle = v>0 ? `rgba(0,0,0,${Math.min(v*0.3,0.5)})` : `rgba(255,255,255,${Math.min(-v*0.3,0.5)})`;
                const s = cell*0.8; ctx.fillRect(pad+x*cell-s/2, pad+y*cell-s/2, s, s);
            }
        }
    }

    function drawConn() {
        const {pad, cell} = render;
        ctx.lineCap = 'round';
        const types = [
            { dx: 1, dy: 0, s: 1.0, type: 'solid' }, { dx: 0, dy: 1, s: 1.0, type: 'solid' },
            { dx: 1, dy: 1, s: 0.85, type: 'kosumi' }, { dx: 1, dy: -1, s: 0.85, type: 'kosumi' },
            { dx: 2, dy: 0, s: 0.6, type: 'jump', mid:[1,0], checks: [[1,0]] },
            { dx: 0, dy: 2, s: 0.6, type: 'jump', mid:[0,1], checks: [[0,1]] },
            { dx: 2, dy: 1, s: 0.5, type: 'knight', mid:[1,0], checks: [[1,0], [1,1]] },
            { dx: 1, dy: 2, s: 0.5, type: 'knight', mid:[0,1], checks: [[0,1], [1,1]] },
            { dx: 2, dy: -1, s: 0.5, type: 'knight', mid:[1,0], checks: [[1,0], [1,-1]] },
            { dx: 1, dy: -2, s: 0.5, type: 'knight', mid:[0,-1], checks: [[0,-1], [1,-1]] },
            { dx: 3, dy: 0, s: 0.3, type: 'large_jump', mid:[1,0], checks: [[1,0], [2,0]] },
            { dx: 0, dy: 3, s: 0.3, type: 'large_jump', mid:[0,1], checks: [[0,1], [0,2]] },
            { dx: 3, dy: 1, s: 0.25, type: 'large_knight', mid:[1,0], checks: [[1,0], [2,0], [1,1], [2,1]] },
            { dx: 1, dy: 3, s: 0.25, type: 'large_knight', mid:[0,1], checks: [[0,1], [0,2], [1,1], [1,2]] },
            { dx: 3, dy: -1, s: 0.25, type: 'large_knight', mid:[1,0], checks: [[1,0], [2,0], [1,-1], [2,-1]] },
            { dx: 1, dy: -3, s: 0.25, type: 'large_knight', mid:[0,-1], checks: [[0,-1], [0,-2], [1,-1], [1,-2]] }
        ];

        const isTerritory = (tx, ty, color) => {
            if(tx<0||tx>=config.size||ty<0||ty>=config.size) return false;
            if(state.board[ty][tx] !== 0) return false;
            let count = 0;
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => {
                const nx=tx+dx, ny=ty+dy;
                if(nx>=0&&nx<config.size&&ny>=0&&ny<config.size && state.board[ny][nx]===color) count++;
            });
            return count >= 3;
        };

        const isInternalSolid = (x, y, nx, ny, color) => {
            if(x === nx) { 
                const left = (x>0 && state.board[y][x-1]===color && state.board[ny][x-1]===color);
                const right = (x<config.size-1 && state.board[y][x+1]===color && state.board[ny][x+1]===color);
                return left && right; 
            }
            if(y === ny) {
                const top = (y>0 && state.board[y-1][x]===color && state.board[y-1][nx]===color);
                const bottom = (y<config.size-1 && state.board[y+1][x]===color && state.board[y+1][nx]===color);
                return top && bottom;
            }
            return false;
        };

        const solidAdj = Array.from({length: config.size}, () => Array.from({length: config.size}, () => []));
        for(let y=0; y<config.size; y++) for(let x=0; x<config.size; x++) {
            const v = state.board[y][x];
            if(!v) continue;
            [[1,0], [0,1], [-1,0], [0,-1]].forEach(([dx, dy]) => {
                const nx=x+dx, ny=y+dy;
                if(nx>=0 && nx<config.size && ny>=0 && ny<config.size && state.board[ny][nx]===v) {
                    solidAdj[y][x].push({x:nx, y:ny});
                }
            });
        }
        const drawnMap = new Set();
        const addDrawn = (x1, y1, x2, y2) => drawnMap.add(x1<x2||(x1===x2&&y1<y2) ? `${x1},${y1}-${x2},${y2}` : `${x2},${y2}-${x1},${y1}`);
        const hasDrawn = (x1, y1, x2, y2) => drawnMap.has(x1<x2||(x1===x2&&y1<y2) ? `${x1},${y1}-${x2},${y2}` : `${x2},${y2}-${x1},${y1}`);
        const hasSolidPath = (x1, y1, x2, y2) => {
            const q = [{x: x1, y: y1, d: 0}], visited = new Set([`${x1},${y1}`]);
            while(q.length) {
                const cur = q.shift();
                if(cur.x===x2 && cur.y===y2) return true;
                if(cur.d >= 3) continue;
                for(const n of solidAdj[cur.y][cur.x]) {
                    const k = `${n.x},${n.y}`;
                    if(!visited.has(k)) { visited.add(k); q.push({x:n.x, y:n.y, d:cur.d+1}); }
                }
            }
            return false;
        };

        types.forEach(({dx, dy, s, type, checks, mid}) => {
            for(let y=0; y<config.size; y++) for(let x=0; x<config.size; x++) {
                const v = state.board[y][x];
                if(!v) continue;
                const nx = x + dx, ny = y + dy;
                if(nx < 0 || nx >= config.size || ny < 0 || ny >= config.size) continue;
                if(state.board[ny][nx] !== v) continue;

                let blocked = false;
                if(checks) { for(const [cx, cy] of checks) if(state.board[y+cy][x+cx] !== 0) { blocked = true; break; } }
                if(blocked) continue;
                if(type === 'solid' && isInternalSolid(x, y, nx, ny, v)) continue;
                if(mid && isTerritory(x+mid[0], y+mid[1], v)) continue;
                if(type !== 'solid' && hasSolidPath(x, y, nx, ny)) continue;
                let redundant = false;
                if(type !== 'solid') {
                    for(const n of solidAdj[ny][nx]) if(hasDrawn(x, y, n.x, n.y)) { redundant = true; break; }
                    if(!redundant) for(const n of solidAdj[y][x]) if(hasDrawn(n.x, n.y, nx, ny)) { redundant = true; break; }
                }
                if(redundant) continue;
                drawLine(pad+x*cell, pad+y*cell, pad+nx*cell, pad+ny*cell, v, s);
                addDrawn(x, y, nx, ny);
            }
        });
    }

    function drawLine(x1, y1, x2, y2, c, strength) {
        const alpha = 0.1 + strength * 0.4; 
        const w = render.cell * (0.06 + strength * 0.14);
        ctx.strokeStyle = c === 1 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    function drawLibs() {
        const {pad, cell} = render, r = cell*0.15;
        const libs = new Map();
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) if(state.board[y][x]) 
            getGroup(state.board, x, y).liberties.forEach(l => { if(!libs.has(l)) libs.set(l, new Set()); libs.get(l).add(state.board[y][x]); });
        
        libs.forEach((cs, k) => {
            const [x,y] = k.split(',').map(Number), cx=pad+x*cell, cy=pad+y*cell;
            if(cs.size===2) { 
                ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(cx,cy,r, Math.PI/2, Math.PI*1.5); ctx.fill();
                ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx,cy,r, Math.PI*1.5, Math.PI/2); ctx.fill();
            } else {
                ctx.fillStyle = cs.has(1) ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
                ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
            }
        });
    }

    function drawEyes() {
        const {pad, cell} = render;
        for(let y=0;y<config.size;y++) for(let x=0;x<config.size;x++) if(!state.board[y][x]) {
            const ns = getNeighbors(x,y);
            if(ns.length && ns.every(n => state.board[n.y][n.x] === state.board[ns[0].y][ns[0].x] && state.board[ns[0].y][ns[0].x]!==0)) {
                const c = state.board[ns[0].y][ns[0].x], diags = [], cx=pad+x*cell, cy=pad+y*cell;
                [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy]) => { if(x+dx>=0&&x+dx<config.size&&y+dy>=0&&y+dy<config.size) diags.push(state.board[y+dy][x+dx]); });
                const bad = diags.filter(d => d === (3-c)).length;
                const isReal = bad === 0 || (diags.length > 2 && bad <= 1) || (diags.length === 4 && bad <= 1);
                ctx.strokeStyle = isReal ? '#0f0' : '#f00'; ctx.lineWidth=2;
                ctx.beginPath(); ctx.arc(cx,cy,cell*0.2,0,Math.PI*2); ctx.stroke();
                if(!isReal) { const s = cell*0.1; ctx.beginPath(); ctx.moveTo(cx-s,cy-s); ctx.lineTo(cx+s,cy+s); ctx.moveTo(cx+s,cy-s); ctx.lineTo(cx-s,cy+s); ctx.stroke(); }
            }
        }
    }

    function drawLast() {
        if(!state.lastMove || state.lastMove.pass) return;
        const {pad, cell} = render, cx=pad+state.lastMove.x*cell, cy=pad+state.lastMove.y*cell;
        ctx.strokeStyle = state.lastMove.color===1 ? '#fff' : '#000'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(cx, cy, cell*0.2, 0, Math.PI*2); ctx.stroke();
    }

    function drawHand() {
        if(!state.handAnimation) return;
        
        const now = performance.now();
        const elapsed = now - state.handAnimation.startTime;
        let progress = elapsed / state.handAnimation.duration;

        if(progress >= 1) { 
            state.handAnimation = null; 
            if (state.nextHandAnimation) {
                const next = state.nextHandAnimation;
                state.nextHandAnimation = null;
                startHandAnimation(next.x, next.y, next.color);
            } else { 
                draw(); 
            }
            return; 
        }
        
        // 从 state 中获取我们刚才存入的 isFromBottom
        const { targetX, targetY, isFromBottom } = state.handAnimation;
        let x = targetX, y = targetY, s = 1, a = 1;
        
        // 边缘坐标取决于方向
        const edge = isFromBottom ? render.size : 0;
        
        if(progress < 0.4) { 
            const t = progress / 0.4; 
            const easeT = t * (2 - t); 
            y = edge + (targetY - edge) * easeT; 
            s = 0.8 + 0.2 * easeT; 
        } else if(progress > 0.6) { 
            const t = (progress - 0.6) / 0.4; 
            y = targetY + (edge - targetY) * t; 
            a = 1 - t; 
            s = 1 - 0.2 * t; 
        }
        
        ctx.save(); 
        ctx.globalAlpha = a; 
        ctx.translate(x, y); 
        ctx.scale(s, s);
        
        // --- 核心修改：旋转逻辑 ---
        // 如果是从上面伸出来的 (!isFromBottom)，需要旋转 180度 让手指向下
        // 如果是从下面伸出来的 (isFromBottom)，默认手指向上，无需旋转
        if(!isFromBottom) ctx.rotate(Math.PI);
        
        const img = render.handImage;
        if (img.complete && img.naturalWidth > 0) {
            const ratio = img.naturalWidth / img.naturalHeight;
            const baseSize = render.cell * 1.5; 
            const w = ratio >= 1 ? baseSize : baseSize * ratio;
            const h = ratio >= 1 ? baseSize / ratio : baseSize;
            ctx.drawImage(img, -w/2, -h/2, w, h);
        }
        ctx.restore();
        
        requestAnimationFrame(draw);
    }
    
    function startHandAnimation(x, y, color) {
        // 1. 本地开关检查
        if (!state.showHandAnimation) return false;

        // 防抖
        if (state.handAnimation && 
            state.handAnimation.gridX === x && 
            state.handAnimation.gridY === y && 
            state.handAnimation.color === color) {
            return true;
        }

        // 队列处理
        if (state.handAnimation) { 
            state.nextHandAnimation = { x, y, color }; 
            return true; 
        }

        const { pad, cell, size } = render;
        const targetX = pad + x * cell;
        const targetY = pad + y * cell;

        // --- 核心修改：判断手从哪个方向伸出 ---
        let isFromBottom;
        
        if (state.mode === 'online') {
            // 【联机模式】：如果是“我”落子，从下面伸出；如果是“对手”，从上面伸出
            // state.human 存储的是当前玩家的执子颜色 (1或2)
            isFromBottom = (color === state.human);
        } else {
            // 【单机模式】：保持默认习惯，黑棋在下，白棋在上
            isFromBottom = (color === 1);
        }
        // ------------------------------------

        // 根据方向确定起点 (下面是 size, 上面是 0)
        const startY = isFromBottom ? size : 0;
        
        // 计算距离与时间 (固定配速逻辑)
        const distance = Math.abs(targetY - startY);
        const msPerPixel = 6; 
        let calcDuration = distance * msPerPixel;
        const finalDuration = Math.max(250, calcDuration); 

        state.handAnimation = {
            gridX: x, 
            gridY: y, 
            targetX, 
            targetY,
            color, 
            isFromBottom, // 【重要】记录方向，供绘制时使用
            startTime: performance.now(),
            duration: finalDuration
        };
        
        draw(); 
        return true; 
    }

    function getStars() {
        if(config.size<7 || config.size%2===0) return [];
        const c = (config.size-1)/2, d = config.size>=13?3:2, pts = [{x:c,y:c}, {x:d,y:d}, {x:config.size-1-d,y:config.size-1-d}, {x:d,y:config.size-1-d}, {x:config.size-1-d,y:d}];
        if(config.size>=15) pts.push({x:d,y:c},{x:config.size-1-d,y:c},{x:c,y:d},{x:c,y:config.size-1-d});
        return pts;
    }

    // --- 联机逻辑核心优化 (包含所有必要函数) ---
    function createRoom() {
        if (!window.Peer) return setStatus('PeerJS 未加载', 'error');
        leaveRoom();
        state.mode = 'online'; 
        state.role = 'player'; 
        state.isHost = true;
        state.selfId = '';
        
        updateUI();
        setStatus('正在创建房间...', 'success');

        initPeer(null); // null ID 表示请求新 ID
    }

    // 新增：加入房间 (客机)
    function joinRoomAction() {
        const pid = ui.peerIdInput.value.trim();
        if (!pid) return setStatus('请输入对手 ID', 'error');
        if (!window.Peer) return setStatus('PeerJS 未加载', 'error');
        
        leaveRoom();
        state.mode = 'online';
        state.role = 'player';
        state.isHost = false;
        state.roomId = pid;
        
        updateUI();
        setStatus('正在连接...', 'success');
        
        initPeer(pid); // 传入目标 ID 以便连接
    }

    function initPeer(targetId) {
        // --- 1. 定义庞大的公共 STUN 服务器列表 ---
        const rawStunList = [
            "stun.l.google.com:19302",
            "stun1.l.google.com:19302",
            "stun2.l.google.com:19302",
            "stun.voip.blackberry.com:3478"
        ];

        // 格式化为 PeerJS 需要的对象结构 { urls: "stun:..." }
        // Set 用于去重，防止列表中有重复项
        const iceServers = [...new Set(rawStunList)].map(url => ({ urls: 'stun:' + url }));

        // --- 2. 配置 Peer ---
        const peerConfig = {
            config: {
                iceServers: iceServers, // 使用上面生成的大列表
                iceTransportPolicy: 'all', // 允许所有传输方式
                iceCandidatePoolSize: 10   // 候选池大小，越大连接越快但越耗资源
            },
            debug: 3 // 如果连接有问题，取消注释这行看控制台报错
        };

        try {
            state.peer = new window.Peer(peerConfig);
        } catch (err) {
            setStatus('Peer 初始化失败', 'error');
            return;
        }

        // --- 3. 绑定事件 ---
        state.peer.on('open', id => {
            state.selfId = id; 
            ui.selfIdInput.value = id;
            
            if (targetId) {
                // 作为客机：连接主机
                connectToHost(targetId);
            } else {
                // 作为主机：等待连接
                setupHost();
            }
        });

        state.peer.on('connection', c => {
            // 有人连入
            if (state.isHost) {
                handleIncomingConnection(c);
            } else {
                // 如果不是主机却收到了连接（异常情况），关闭它
                c.close();
            }
        });

        state.peer.on('error', e => { 
            console.error("PeerJS Error Type:", e.type);
            if (e.type === 'peer-unavailable') {
                setStatus('连接失败：找不到对手 ID，请确认 ID 输入正确且对方在线', 'error');
            } else if (e.type === 'network') {
                setStatus('连接失败：网络连接异常，请检查是否被防火墙拦截', 'error');
            } else {
                setStatus(`连接错误: ${e.type}`, 'error');
            }
            leaveRoom(); 
        });
    }

    function setupHost() {
        state.human = 1; state.ai = 2; // 主机执黑
        config.playerColor = 'black';
        resetGameState();
        state.lastGameUpdate = Date.now();
        setStatus('房间已创建！你执黑子，对手执白子，等待对手加入...', 'success');
        updateRoomStatus(`我的ID: ${state.selfId}`);
        applyPlayerColor();
        updateUI();
        draw();
    }

    function connectToHost(pid) {
        const conn = state.peer.connect(pid, {
            reliable: true 
        });
        conn.on('open', () => {
            state.hostConnection = conn;
            // 发送握手
            conn.send({ type: 'hello', role: 'player', clientId: state.clientId });
            setStatus('已连接主机，等待确认...', 'success');
        });
        setupConn(conn);
    }

    function handleIncomingConnection(conn) {
        setupConn(conn, { role: 'spectator' }); // 默认为观众，握手后升级为玩家
    }

    // 复用原有的 setupConn (稍作调整)
    function setupConn(conn, meta={}) {
        conn.on('data', d => {
            if(d.type === 'hello' && state.isHost) {
                if(d.role === 'player' && !state.guestId) {
                    state.guestId = conn.peer;
                    meta.role = 'player';
                    // 确认玩家加入，发送当前游戏状态
                    conn.send({ type: 'hello-ack', ok: true, role: 'player', color: 2, game: serializeGame() });
                    setStatus('✓ 对手已加入！你执黑子，对方执白子，开始对局...', 'success');
                    updateRoomStatus('对战中');
                    applyPlayerColor();
                    updateUI();
                } else {
                    conn.send({ type: 'hello-ack', ok: true, role: 'spectator', game: serializeGame() });
                }
                state.connections.set(conn.peer, {conn, ...meta});
            } else if(d.type === 'hello-ack') {
                if(!d.ok) return leaveRoom();
                state.role = d.role;
                if(state.role === 'player') {
                    // 客机执白
                    state.human = d.color;
                    state.ai = 3-d.color;
                    config.playerColor = d.color===1?'black':'white';
                    applyPlayerColor();
                    const colorText = d.color===1 ? '黑子' : '白子';
                    const opponentColorText = d.color===1 ? '白子' : '黑子';
                    setStatus(`✓ 已加入对局！你执${colorText}，对手执${opponentColorText}，准备开始...`, 'success');
                } else {
                    setStatus('✓ 已作为观战者加入', 'success');
                }
                if(d.game) applyRemoteGame(d.game);
                updateUI();
                draw();
                updateRoomStatus(state.role==='player' ? '对战中' : '观战中');
            } else if(d.type === 'game') {
                if(state.isHost && state.connections.get(conn.peer)?.role === 'player') { 
                    applyRemoteGame(d.game); 
                    // 主机收到后，要广播给其他可能的观战者
                    broadcastGameState(conn.peer); 
                }
                // 如果是客机接收到主机的同步
                else if(!state.isHost) {
                    applyRemoteGame(d.game);
                }
            }
        });
        
        conn.on('close', () => {
            state.connections.delete(conn.peer);
            if(state.isHost && conn.peer === state.guestId) { 
                state.guestId = null; 
                setStatus('对手已断开', 'error'); 
            } else if(!state.isHost && conn === state.hostConnection) { 
                setStatus('主机已断开', 'error'); 
                leaveRoom(); 
            }
        });
    }
    
    function broadcastGameState(skipId) {
        // 统一将消息类型改为 'game'
        const msg = { type: 'game', game: serializeGame() }; 
        
        if (state.isHost) {
            // 主机逻辑：转发给所有连接的人（除了跳过的那个）
            state.connections.forEach((v, k) => {
                if (k !== skipId && v.conn.open) v.conn.send(msg);
            });
        } else if (state.hostConnection && state.hostConnection.open) {
            // 客机逻辑：必须将自己的落子状态发送给主机
            state.hostConnection.send(msg);
        }
    }

    function leaveRoom(silent) {
        if(state.mode !== 'online') return;
        if(state.peer) state.peer.destroy();
        Object.assign(state, { 
            mode: 'solo', 
            role: 'player', 
            roomId: '', 
            selfId: '', 
            isHost: false, 
            guestId: null, 
            connections: new Map(),
            hostConnection: null
        });
        config.playerColor = 'black'; 
        applyPlayerColor();
        if(!silent) { setStatus('已断开', 'success'); startNewGame(); }
        updateUI(); 
        updateRoomStatus('未加入联机');
    }

    function serializeGame() {
        return {
            size: config.size, komi: config.komi, scoringMethod: config.scoringMethod, koRule: config.koRule,
            board: state.board, current: state.current, captures: state.captures, koPoint: state.koPoint,
            passCount: state.passCount, moveCount: state.moveCount, lastMove: state.lastMove, gameOver: state.gameOver, updatedAt: Date.now(),
            lastMoveColor: state.lastMove ? (state.moveCount % 2 === 0 ? 2 : 1) : null
        };
    }

    function applyRemoteGame(g) {
        // 1. 只有步数更新时才处理（防止旧数据覆盖）
        if(g.moveCount < state.moveCount) return;
        
        const sizeChanged = config.size !== g.size;
        
        // 2. 同步基础配置
        config.size = g.size; 
        config.komi = g.komi; 
        config.scoringMethod = g.scoringMethod; 
        config.koRule = g.koRule;
        
        // 3. 立即同步游戏核心数据（逻辑状态瞬间同步，不受动画影响）
        Object.assign(state, { 
            board: g.board, 
            current: g.current, 
            captures: g.captures, 
            koPoint: g.koPoint, 
            passCount: g.passCount, 
            moveCount: g.moveCount, 
            lastMove: g.lastMove, 
            gameOver: g.gameOver 
        });
        
        state.positionKeys = new Set([boardKey(state.board)]);
        
        // 4. 更新界面文字
        updateUI(); 
        if (sizeChanged) resizeCanvas();

        // --- 核心修复开始 ---
        let animationStarted = false;

        // 判断是否有新落子需要表现
        if(g.lastMove && !g.lastMove.pass && !g.lastMove.resign && g.lastMove.x !== undefined) {
            // 获取颜色：优先用记录的，没有则推算
            const moveColor = g.lastMove.color || (g.moveCount % 2 === 0 ? 2 : 1);
            
            // 尝试启动动画
            // startHandAnimation 会根据 state.showHandAnimation 决定是否真的启动
            // 如果本地关闭了动画，这里会返回 false
            animationStarted = startHandAnimation(g.lastMove.x, g.lastMove.y, moveColor);
        }

        // 【关键修复】：如果动画没有启动（比如开关没开，或者只是悔棋同步），
        // 必须强制重绘一次！否则不开动画的一方屏幕不会更新。
        if (!animationStarted) {
            draw();
        }
        // --- 核心修复结束 ---

        if(state.gameOver) endGame();
    }

    function updateUI() {
        ui.currentPlayer.textContent = state.current===1 ? '黑' : '白';
        ui.moveCount.textContent = `步数 ${state.moveCount}`;
        ui.lastMove.textContent = state.lastMove ? (state.lastMove.pass ? '停手' : state.lastMove.resign ? '认输' : formatCoord(state.lastMove.x, state.lastMove.y)) : '-';
        const s = calcScore();
        ui.blackScore.textContent = s.black.toFixed(1); ui.whiteScore.textContent = s.white.toFixed(1);
        ui.blackDetail.textContent = `领地${s.territory[1]}|提${state.captures[1]}`;
        ui.whiteDetail.textContent = `领地${s.territory[2]}|提${state.captures[2]}|贴${config.komi}`;
        updateControlState();
    }
    
    function updateControlState() {
        const on = state.mode === 'online';
        ui.difficultySelect.disabled = ui.boardSizeSelect.disabled = ui.playerColorSelect.disabled = ui.scoringMethodSelect.disabled = ui.komiSelect.disabled = ui.koRuleSelect.disabled = ui.undoBtn.disabled = on;
        ui.newGameBtn.disabled = on && !state.isHost;
        ui.passBtn.disabled = ui.resignBtn.disabled = ui.hintBtn.disabled = false;
        ui.createRoomBtn.disabled = ui.joinRoomBtn.disabled = ui.peerIdInput.disabled = on;
        ui.leaveRoomBtn.disabled = !on;
    }

    function updateGameInfo() {
        const rule = labels.rule[config.scoringMethod];
        ui.tipText.textContent = `当前: ${rule}, 贴目 ${config.komi}。${state.mode==='online' ? `ID: ${state.selfId}` : '单机模式'}`;
    }

    function applyPlayerColor() {
        if(state.mode !== 'online') { state.human = config.playerColor==='black'?1:2; state.ai = 3-state.human; }
        ui.blackLabel.textContent = `黑方 (${getActorName(1)})`;
        ui.whiteLabel.textContent = `白方 (${getActorName(2)})`;
        updateDifficultyUI();
    }
    
    function getActorName(c) {
        if(state.mode === 'online') {
            return c === state.human ? '你' : '对手';
        }
        return c === state.human ? '玩家' : 'AI';
    }

    function updateRoomStatus(t) { if(ui.roomStatus) ui.roomStatus.textContent = t; }
    function setStatus(t, type) { ui.status.textContent = t; ui.status.className = `result-header ${type}`; }
    function formatCoord(x, y) { return `${"ABCDEFGHJKLMNOPQRST"[x]}${config.size-y}`; }
    function boardKey(b) { return b.map(r => r.join('')).join('|'); }
    function saveSnapshot() { state.history.push({ board: state.board.map(r=>[...r]), current: state.current, captures: {...state.captures}, koPoint: state.koPoint, passCount: state.passCount, moveCount: state.moveCount, lastMove: state.lastMove }); }
    function checkDanger() { if(countAtari(state.board, state.human) > 0) ui.tipText.textContent = "警告：有棋子被叫吃！"; }
    function updateDifficultyUI() {
        if(state.mode==='online') {
            ui.aiHint.textContent = state.isHost ? '你: 黑子 | 对手: 白子' : '你: 白子 | 对手: 黑子';
        } else {
            ui.aiHint.textContent = `AI难度: ${labels.diff[state.difficulty]}`;
        }
    }
    function getPoint(e) {
        const r = canvas.getBoundingClientRect(), s = render.size/r.width, x = (e.clientX-r.left)*s, y = (e.clientY-r.top)*s;
        const col = Math.round((x-render.pad)/render.cell), row = Math.round((y-render.pad)/render.cell);
        return (col>=0 && col<config.size && row>=0 && row<config.size && Math.hypot(render.pad+col*render.cell-x, render.pad+row*render.cell-y) < render.cell*0.45) ? {x:col, y:row} : null;
    }
    function setupResizeListener() {
        let t, mobile = window.innerWidth<=768;
        window.onresize = () => {
            const m = window.innerWidth<=768;
            if(m !== mobile || m) { mobile = m; clearTimeout(t); t = setTimeout(resizeCanvas, 150); }
        };
    }
    function getClientId() {
        let id = localStorage.getItem('weiqi-cid');
        if(!id) { id = Math.random().toString(36).slice(2); localStorage.setItem('weiqi-cid', id); }
        return id;
    }

    init();
})();