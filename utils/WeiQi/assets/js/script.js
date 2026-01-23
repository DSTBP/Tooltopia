(() => {
    const canvas = document.getElementById('board');
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const ui = {
        status: document.getElementById('status'),
        moveCount: document.getElementById('moveCount'),
        blackCaptures: document.getElementById('blackCaptures'),
        whiteCaptures: document.getElementById('whiteCaptures'),
        currentPlayer: document.getElementById('currentPlayer'),
        lastMove: document.getElementById('lastMove'),
        aiHint: document.getElementById('aiHint'),
        tipText: document.getElementById('tipText'),
        blackScore: document.getElementById('blackScore'),
        whiteScore: document.getElementById('whiteScore'),
        blackDetail: document.getElementById('blackDetail'),
        whiteDetail: document.getElementById('whiteDetail'),
        newGameBtn: document.getElementById('newGameBtn'),
        undoBtn: document.getElementById('undoBtn'),
        passBtn: document.getElementById('passBtn'),
        hintBtn: document.getElementById('hintBtn'),
        resignBtn: document.getElementById('resignBtn'),
        difficultySelect: document.getElementById('difficultySelect'),
        boardSizeSelect: document.getElementById('boardSizeSelect'),
        boardDimensionInput: document.getElementById('boardDimensionInput'),
        boardDimensionUp: document.getElementById('boardDimensionUp'),
        boardDimensionDown: document.getElementById('boardDimensionDown'),
        boardStyleSelect: document.getElementById('boardStyleSelect'),
        scoringMethodSelect: document.getElementById('scoringMethodSelect'),
        komiSelect: document.getElementById('komiSelect'),
        koRuleSelect: document.getElementById('koRuleSelect'),
        playerColorSelect: document.getElementById('playerColorSelect'),
        showLibertiesCheck: document.getElementById('showLibertiesCheck'),
        showConnectionsCheck: document.getElementById('showConnectionsCheck'),
        showInfluenceCheck: document.getElementById('showInfluenceCheck'),
        showEyesCheck: document.getElementById('showEyesCheck'),
        showHandAnimationCheck: document.getElementById('showHandAnimationCheck'),
        blackLabel: document.getElementById('blackLabel'),
        whiteLabel: document.getElementById('whiteLabel'),
        peerIdInput: document.getElementById('peerIdInput'),
        selfIdInput: document.getElementById('selfIdInput'),
        joinRoomBtn: document.getElementById('joinRoomBtn'),
        watchRoomBtn: document.getElementById('watchRoomBtn'),
        leaveRoomBtn: document.getElementById('leaveRoomBtn'),
        roomStatus: document.getElementById('roomStatus')
    };

    const config = {
        size: 9,
        komi: 5.5,
        scoringMethod: 'japanese',
        boardStyle: 'hiba',
        boardCssSize: 560,
        koRule: 'simple',
        playerColor: 'black'
    };

    const peerDefaults = {
        secure: window.location.protocol === 'https:'
    };

    const state = {
        board: [],
        current: 1,
        human: 1,
        ai: 2,
        captures: { 1: 0, 2: 0 },
        koPoint: null,
        passCount: 0,
        moveCount: 0,
        lastMove: null,
        difficulty: 'easy',
        busy: false,
        aiTimer: null,
        gameOver: false,
        turnId: 0,
        history: [],
        positionKeys: new Set(),
        hintUsed: 0,
        hintLimit: 3,
        showLiberties: false,
        showConnections: false,
        showInfluence: false,
        showEyes: false,
        showHandAnimation: true,
        handAnimation: null,
        pendingMove: null,  // 待命的落子信息，等待动画到达时更新
        mode: 'solo',
        role: 'player',
        roomId: '',
        selfId: '',
        peer: null,
        connections: new Map(),
        hostConnection: null,
        isHost: false,
        pendingJoin: null,
        peerServer: null,
        guestId: null,
        clientId: getClientId(),
        lastGameUpdate: 0
    };

    const difficultyLabel = {
        easy: '简单',
        medium: '中等',
        hard: '困难'
    };

    const boardStyleLabel = {
        hiba: '桧木棋盘',
        bamboo: '竹制棋盘',
        whitePorcelain: '白釉瓷棋盘',
        celadon: '青瓷',
        marble: '大理石',
        brocade: '织锦棋盘',
        acrylic: '亚克力棋盘'
    };

    const scoringLabel = {
        japanese: '日韩规则',
        chinese: '中国规则',
        aga: 'AGA 规则'
    };

    let render = {
        size: 0,
        pad: 0,
        cell: 0,
        handImage: null // 用于存储加载的SVG手部图像
    };

    function init() {
        bindEvents();
        ui.boardSizeSelect.value = config.size;
        ui.boardDimensionInput.value = config.boardCssSize;
        ui.boardStyleSelect.value = config.boardStyle;
        ui.scoringMethodSelect.value = config.scoringMethod;
        ui.komiSelect.value = config.komi;
        ui.koRuleSelect.value = config.koRule;
        ui.playerColorSelect.value = config.playerColor;
        applyPlayerColor();
        updateDifficultyUI();
        updateRoomStatus('未加入联机');
        updateSelfIdDisplay();
        updateControlAvailability();
        loadHandImage();
        startNewGame();
        resizeCanvas();
        setupResizeListener();
    }

    function loadHandImage() {
        const img = new Image();
        img.onload = () => {
            render.handImage = img;
        };
        img.onerror = () => {
            console.warn('Failed to load hand.svg');
        };
        img.src = './assets/data/hand.svg';
    }

    function bindEvents() {
        canvas.addEventListener('click', onBoardClick);
        ui.newGameBtn.addEventListener('click', handleNewGameClick);
        ui.undoBtn.addEventListener('click', undoMove);
        ui.passBtn.addEventListener('click', handlePassAction);
        ui.hintBtn.addEventListener('click', getHint);
        ui.resignBtn.addEventListener('click', resignGame);
        ui.joinRoomBtn.addEventListener('click', () => joinRoom(false));
        ui.watchRoomBtn.addEventListener('click', () => joinRoom(true));
        ui.leaveRoomBtn.addEventListener('click', leaveRoom);
        window.addEventListener('beforeunload', () => leaveRoom(true));

        ui.difficultySelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = state.difficulty;
                setStatus('联机模式下无法调整 AI 难度。', 'error');
                return;
            }
            state.difficulty = e.target.value;
            updateDifficultyUI();
        });

        ui.boardSizeSelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = config.size;
                setStatus('联机模式下无法调整棋盘大小。', 'error');
                return;
            }
            const size = Number.parseInt(e.target.value, 10);
            if (Number.isNaN(size)) {
                e.target.value = config.size;
                return;
            }
            if (size === config.size) {
                return;
            }
            config.size = size;
            // 清除正在进行的手部动画和待命落子，避免位置错乱
            state.handAnimation = null;
            state.pendingMove = null;
            startNewGame();
            resizeCanvas();
            let sizeDesc = '';
            if (size === 9) {
                sizeDesc = '9 路棋盘适合快速对局和初学者练习，一般 15-30 分钟完成';
            } else if (size === 13) {
                sizeDesc = '13 路棋盘适合中级练习，对局时长约 30-60 分钟';
            } else {
                sizeDesc = '19 路棋盘是正式比赛标准，对局时长通常超过 1 小时';
            }
            setStatus(`棋盘已切换为 ${size} 路，新对局开始。`, 'success');
            ui.tipText.textContent = sizeDesc;
        });

        const applyBoardDimension = (input) => {
            const size = Number.parseInt(input.value, 10);
            if (Number.isNaN(size)) {
                input.value = config.boardCssSize;
                return;
            }
            const nextSize = Math.min(900, Math.max(240, size));
            if (nextSize !== size) {
                input.value = nextSize;
            }
            if (nextSize === config.boardCssSize) {
                return;
            }
            config.boardCssSize = nextSize;
            resizeCanvas();
            setStatus(`棋盘尺寸已调整为 ${nextSize}px。`, 'success');
        };

        // 监听键盘事件，只允许上下箭头键调整尺寸
        ui.boardDimensionInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const currentSize = Number.parseInt(e.target.value, 10) || config.boardCssSize;
                const step = 10;
                let newSize;

                if (e.key === 'ArrowUp') {
                    newSize = Math.min(900, currentSize + step);
                } else {
                    newSize = Math.max(240, currentSize - step);
                }

                if (newSize !== currentSize) {
                    e.target.value = newSize;
                    applyBoardDimension(e.target);
                }
            }
        });

        // 监听上下按钮点击
        ui.boardDimensionUp.addEventListener('click', () => {
            const currentSize = Number.parseInt(ui.boardDimensionInput.value, 10) || config.boardCssSize;
            const step = 10;
            const newSize = Math.min(900, currentSize + step);
            if (newSize !== currentSize) {
                ui.boardDimensionInput.value = newSize;
                applyBoardDimension(ui.boardDimensionInput);
            }
        });

        ui.boardDimensionDown.addEventListener('click', () => {
            const currentSize = Number.parseInt(ui.boardDimensionInput.value, 10) || config.boardCssSize;
            const step = 10;
            const newSize = Math.max(240, currentSize - step);
            if (newSize !== currentSize) {
                ui.boardDimensionInput.value = newSize;
                applyBoardDimension(ui.boardDimensionInput);
            }
        });

        ui.boardStyleSelect.addEventListener('change', (e) => {
            const style = e.target.value;
            if (!boardStyleLabel[style]) {
                return;
            }
            config.boardStyle = style;
            draw();
            setStatus(`棋盘样式已切换为 ${boardStyleLabel[style]}。`, 'success');
        });

        ui.scoringMethodSelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = config.scoringMethod;
                setStatus('联机模式下无法调整计分方式。', 'error');
                return;
            }
            const method = e.target.value;
            if (!scoringLabel[method]) {
                e.target.value = config.scoringMethod;
                return;
            }
            config.scoringMethod = method;

            // 更新提示信息
            let ruleDesc = '';
            if (method === 'chinese') {
                ruleDesc = '中国规则计算：领地 + 棋盘上的棋子 + 贴目';
            } else if (method === 'aga') {
                ruleDesc = 'AGA 规则计算：领地 + 提子 + 棋盘上的棋子 + 贴目';
            } else {
                ruleDesc = '日韩规则计算：领地 + 提子 + 贴目';
            }

            if (state.gameOver) {
                const score = calculateScore();
                const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
                setStatus(`计分方式已切换为 ${getRuleLabel(method)}，重新结算：黑 ${score.black.toFixed(1)} / 白 ${score.white.toFixed(1)}，${winner}。`, 'success');
                ui.tipText.textContent = getScoreSummary(score);
            } else {
                setStatus(`计分方式已切换为 ${getRuleLabel(method)}。`, 'success');
                ui.tipText.textContent = `${ruleDesc}，当前贴目为 ${config.komi.toFixed(1)} 目。`;
            }
        });

        ui.komiSelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = config.komi;
                setStatus('联机模式下无法调整贴目。', 'error');
                return;
            }
            const komi = Number.parseFloat(e.target.value);
            if (Number.isNaN(komi)) {
                e.target.value = config.komi;
                return;
            }
            config.komi = komi;

            // 根据规则提供相应的说明
            let ruleDesc = '';
            if (config.scoringMethod === 'chinese') {
                ruleDesc = '中国规则计算：领地 + 棋盘上的棋子 + 贴目';
            } else if (config.scoringMethod === 'aga') {
                ruleDesc = 'AGA 规则计算：领地 + 提子 + 棋盘上的棋子 + 贴目';
            } else {
                ruleDesc = '日韩规则计算：领地 + 提子 + 贴目';
            }

            if (state.gameOver) {
                const score = calculateScore();
                const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
                setStatus(`贴目已调整为 ${komi.toFixed(1)} 目，重新结算：黑 ${score.black.toFixed(1)} / 白 ${score.white.toFixed(1)}，${winner}。`, 'success');
                ui.tipText.textContent = getScoreSummary(score);
            } else {
                setStatus(`贴目已调整为 ${komi.toFixed(1)} 目。`, 'success');
                ui.tipText.textContent = `${ruleDesc}，当前贴目为 ${komi.toFixed(1)} 目，用于补偿黑方先手优势。`;
            }
        });

        ui.koRuleSelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = config.koRule;
                setStatus('联机模式下无法调整劫规则。', 'error');
                return;
            }
            const rule = e.target.value;
            if (rule !== 'simple' && rule !== 'super') {
                e.target.value = config.koRule;
                return;
            }
            config.koRule = rule;
            if (rule === 'super') {
                setStatus('劫规则已切换为超级劫：禁止重现任何先前的棋盘局面。', 'success');
                ui.tipText.textContent = '超级劫规则更严格，防止所有类型的循环局面，适合正式比赛。';
            } else {
                setStatus('劫规则已切换为简单劫：禁止立即重新提回刚被提的棋子。', 'success');
                ui.tipText.textContent = '简单劫规则允许复杂的劫争，是最常用的劫规则。';
            }
        });

        ui.playerColorSelect.addEventListener('change', (e) => {
            if (state.mode === 'online') {
                e.target.value = config.playerColor;
                setStatus('联机模式下由连接顺序决定执子颜色。', 'error');
                return;
            }
            const color = e.target.value;
            if (color !== 'black' && color !== 'white') {
                e.target.value = config.playerColor;
                return;
            }
            if (color === config.playerColor) {
                return;
            }
            config.playerColor = color;
            applyPlayerColor();
            startNewGame();
        });

        [
            { element: ui.showLibertiesCheck, key: 'showLiberties' },
            { element: ui.showConnectionsCheck, key: 'showConnections' },
            { element: ui.showInfluenceCheck, key: 'showInfluence' },
            { element: ui.showEyesCheck, key: 'showEyes' },
            { element: ui.showHandAnimationCheck, key: 'showHandAnimation' }
        ].forEach(({ element, key }) => {
            element.addEventListener('change', (e) => {
                state[key] = e.target.checked;
                const isHandToggle = key === 'showHandAnimation';
                if (key === 'showHandAnimation' && !state.showHandAnimation) {
                    state.handAnimation = null;
                    state.pendingMove = null;
                    if (state.current === state.ai && !state.gameOver) {
                        scheduleAiMove();
                    }
                }
                draw();
                if (isHandToggle) {
                    setStatus(`手部动画已${state.showHandAnimation ? '开启' : '关闭'}。`, 'success');
                } else {
                    updateBeginnerOptionsStatus();
                }
            });
        });
    }

    function updateBeginnerOptionsStatus() {
        const features = [];
        if (state.showLiberties) features.push('展示气');
        if (state.showConnections) features.push('展示连接');
        if (state.showInfluence) features.push('局势分析');
        if (state.showEyes) features.push('展示眼位');

        if (features.length === 0) {
            setStatus('新手辅助功能已全部关闭。', 'success');
        } else {
            setStatus(`已开启：${features.join('、')}。`, 'success');
        }
    }

    function setupResizeListener() {
        let timer = null;
        let lastIsMobile = window.innerWidth <= 768;

        const scheduleResize = () => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(resizeCanvas, 150);
        };

        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 768;

            // 只在跨越移动端/桌面端阈值时才重新渲染
            if (isMobile !== lastIsMobile) {
                lastIsMobile = isMobile;
                scheduleResize();
            } else if (isMobile) {
                // 移动端仍然响应窗口变化
                scheduleResize();
            }
        });
    }

    function getClientId() {
        const key = 'weiqi-client-id';
        let id = localStorage.getItem(key);
        if (!id) {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                id = window.crypto.randomUUID();
            } else {
                id = `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
            }
            localStorage.setItem(key, id);
        }
        return id;
    }

    function normalizePeerId(peerId) {
        return peerId.trim();
    }

    function parsePeerServer(raw) {
        const trimmed = (raw || '').trim();
        const isHttps = window.location.protocol === 'https:';
        if (!trimmed) {
            return {
                host: '',
                port: null,
                path: '',
                secure: isHttps
            };
        }

        let urlText = trimmed;
        let secure = isHttps;
        if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
            secure = trimmed.startsWith('wss://');
            urlText = trimmed.replace(/^ws/, 'http');
        } else if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
            secure = trimmed.startsWith('https://');
        } else {
            urlText = `${secure ? 'https' : 'http'}://${trimmed}`;
        }

        let url;
        try {
            url = new URL(urlText);
        } catch (error) {
            return {
                host: '',
                port: null,
                path: '',
                secure: isHttps
            };
        }

        let path = url.pathname || '/';
        if (!path.endsWith('/')) {
            path += '/';
        }

        return {
            host: url.hostname,
            port: url.port ? Number.parseInt(url.port, 10) : (secure ? 443 : 80),
            path: path,
            secure: secure
        };
    }

    function buildPeerOptions(serverConfig) {
        const options = {
            secure: peerDefaults.secure
        };
        if (serverConfig && serverConfig.host) {
            options.host = serverConfig.host;
            options.port = serverConfig.port;
            options.path = serverConfig.path || '/';
            options.secure = serverConfig.secure;
        }
        return options;
    }

    function createPeerInstance(peerId, serverConfig) {
        if (!window.Peer) {
            return null;
        }
        const options = buildPeerOptions(serverConfig);
        if (peerId) {
            return new window.Peer(peerId, options);
        }
        return new window.Peer(options);
    }

    function resetConnections() {
        state.connections.forEach(entry => {
            if (entry.conn && entry.conn.open) {
                entry.conn.close();
            }
        });
        state.connections.clear();
        state.hostConnection = null;
        state.guestId = null;
    }

    function registerConnection(conn, meta) {
        const existing = state.connections.get(conn.peer);
        if (existing) {
            existing.role = meta.role || existing.role;
            existing.color = meta.color || existing.color;
            return;
        }
        state.connections.set(conn.peer, {
            conn,
            role: meta.role || 'spectator',
            color: meta.color || null
        });

        conn.on('data', data => {
            handlePeerData(conn, data);
        });
        conn.on('close', () => {
            handlePeerClose(conn);
        });
        conn.on('error', () => {
            handlePeerClose(conn);
        });
    }

    function handlePeerClose(conn) {
        const entry = state.connections.get(conn.peer);
        if (entry && entry.role === 'player' && state.isHost) {
            if (state.guestId === conn.peer) {
                state.guestId = null;
                setStatus('对手已断开连接。', 'error');
                updateRoomStatus(`我的 ID：${state.selfId || state.roomId} · 等待对手加入`);
            }
        } else if (!state.isHost && conn === state.hostConnection) {
            setStatus('对方已断开连接。', 'error');
            leaveRoom(true);
        }
        state.connections.delete(conn.peer);
    }

    function sendPeerMessage(conn, payload) {
        if (conn && conn.open) {
            conn.send(payload);
        }
    }

    function handlePeerData(conn, rawData) {
        // 【修复】增加数据解析的健壮性
        let data = rawData;
        if (typeof rawData === 'string') {
            try {
                data = JSON.parse(rawData);
            } catch (e) {
                console.error('无法解析 Peer 数据:', rawData);
                return;
            }
        }

        if (!data || typeof data !== 'object') {
            return;
        }

        // 调试日志：看看收到了什么
        console.log('收到 Peer 数据:', data.type, data);

        if (data.type === 'hello' && state.isHost) {
            // ... (保持原有逻辑) ...
            const incomingRole = data.role === 'spectator' ? 'spectator' : 'player';
            if (incomingRole === 'player') {
                if (state.guestId && state.guestId !== conn.peer) {
                    sendPeerMessage(conn, { type: 'hello-ack', ok: false, reason: '当前对局已满，可观战。' });
                    conn.close();
                    return;
                }
                state.guestId = conn.peer;
                registerConnection(conn, { role: 'player', color: 2 });
                sendPeerMessage(conn, {
                    type: 'hello-ack',
                    ok: true,
                    role: 'player',
                    color: 2,
                    game: serializeGameState()
                });
                setStatus('对手已加入联机。', 'success');
                updateRoomStatus(`我的 ID：${state.selfId || state.roomId} · 对战中`);
                return;
            }

            registerConnection(conn, { role: 'spectator' });
            sendPeerMessage(conn, {
                type: 'hello-ack',
                ok: true,
                role: 'spectator',
                game: serializeGameState()
            });
            return;
        }

        if (data.type === 'hello-ack' && !state.isHost) {
            // ... (保持原有逻辑) ...
            if (!data.ok) {
                setStatus(data.reason || '加入联机失败。', 'error');
                leaveRoom(true);
                return;
            }
            state.role = data.role === 'spectator' ? 'spectator' : 'player';
            state.isHost = false;
            if (state.role === 'player') {
                const assigned = data.color || 2;
                state.human = assigned;
                state.ai = assigned === 1 ? 2 : 1;
                config.playerColor = assigned === 1 ? 'black' : 'white';
                ui.playerColorSelect.value = config.playerColor;
            } else {
                state.human = 0;
                state.ai = 0;
            }
            updatePlayerLabels();
            updateMatchLabel();
            updateControlAvailability();
            if (data.game) {
                // 这里直接调用新的 applyRemoteGameState
                applyRemoteGameState(data.game);
            }
            setOnlineTurnStatus();
            updateRoomStatus(state.role === 'spectator'
                ? `对方 ID ${state.roomId} · 观战中`
                : `对方 ID ${state.roomId} · 你执${state.human === 1 ? '黑' : '白'}`);
            return;
        }

        if (data.type === 'game' && data.game) {
            if (state.isHost) {
                const entry = state.connections.get(conn.peer);
                // 房主只接收“玩家”发来的棋局，不接收“观众”的
                if (!entry || entry.role !== 'player') {
                    return;
                }
                applyRemoteGameState(data.game);
                // 房主收到后，广播给其他所有人（如果有观众）
                broadcastGameState(conn.peer);
            } else {
                // 客人直接应用状态
                applyRemoteGameState(data.game);
            }
        }
    }

    function connectToHost(role) {
        const conn = state.peer.connect(state.roomId, { reliable: true });
        state.hostConnection = conn;
        registerConnection(conn, { role: 'host' });

        conn.on('open', () => {
            sendPeerMessage(conn, {
                type: 'hello',
                role: role,
                clientId: state.clientId
            });
            updateRoomStatus(`已连接对方 ID ${state.roomId}，等待确认...`);
        });

        conn.on('error', err => {
            setStatus('对方 ID 不存在或连接失败。', 'error');
            leaveRoom(true);
        });
    }

    function becomeHost() {
        resetConnections();
        if (!state.peer) {
            setStatus('PeerJS 未加载，无法创建联机。', 'error');
            leaveRoom(true);
            return;
        }
        state.isHost = true;
        state.role = 'player';
        state.human = 1;
        state.ai = 2;
        state.guestId = null;
        config.playerColor = 'black';
        ui.playerColorSelect.value = config.playerColor;
        updatePlayerLabels();
        updateMatchLabel();
        updateControlAvailability();
        if (state.peer.id) {
            state.selfId = state.peer.id;
        }
        if (state.selfId) {
            state.roomId = state.selfId;
        }
        updateSelfIdDisplay();
        updateRoomStatus(`我的 ID：${state.selfId || '-'} · 等待对手加入`);
        const freshGame = createGameState();
        state.lastGameUpdate = freshGame.updatedAt;
        applyGameState(freshGame);
        setStatus('联机已创建，等待对手加入。', 'success');
    }

    function updateRoomStatus(text) {
        if (!ui.roomStatus) {
            return;
        }
        ui.roomStatus.textContent = text;
    }

    function updateSelfIdDisplay() {
        if (!ui.selfIdInput) {
            return;
        }
        ui.selfIdInput.value = state.selfId || '';
    }

    function updateControlAvailability() {
        const isOnline = state.mode === 'online';
        const isSpectator = isOnline && state.role === 'spectator';
        const inRoom = isOnline;
        ui.difficultySelect.disabled = isOnline;
        ui.boardSizeSelect.disabled = isOnline;
        ui.playerColorSelect.disabled = isOnline;
        ui.scoringMethodSelect.disabled = isOnline;
        ui.komiSelect.disabled = isOnline;
        ui.koRuleSelect.disabled = isOnline;
        ui.undoBtn.disabled = isOnline;
        ui.passBtn.disabled = isSpectator;
        ui.resignBtn.disabled = isSpectator;
        ui.hintBtn.disabled = isSpectator;
        ui.newGameBtn.disabled = isSpectator || (isOnline && !state.isHost);
        if (ui.peerIdInput) ui.peerIdInput.disabled = inRoom;
        if (ui.joinRoomBtn) ui.joinRoomBtn.disabled = inRoom;
        if (ui.watchRoomBtn) ui.watchRoomBtn.disabled = inRoom;
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = !inRoom;
    }

    function updateMatchLabel() {
        if (state.mode !== 'online') {
            updateDifficultyUI();
            return;
        }
        if (state.role === 'spectator') {
            ui.aiHint.textContent = '联机观战';
        } else {
            ui.aiHint.textContent = `联机对战：你执${state.human === 1 ? '黑' : '白'}`;
        }
    }

    function updatePlayerLabels() {
        if (!ui.blackLabel || !ui.whiteLabel) {
            return;
        }
        if (state.mode === 'online') {
            if (state.role === 'spectator') {
                ui.blackLabel.textContent = '黑方';
                ui.whiteLabel.textContent = '白方';
            } else {
                ui.blackLabel.textContent = state.human === 1 ? '黑方（你）' : '黑方（对手）';
                ui.whiteLabel.textContent = state.human === 2 ? '白方（你）' : '白方（对手）';
            }
            return;
        }
        ui.blackLabel.textContent = state.human === 1 ? '黑方（玩家）' : '黑方（AI）';
        ui.whiteLabel.textContent = state.human === 2 ? '白方（玩家）' : '白方（AI）';
    }

    function handleNewGameClick() {
        if (state.mode === 'online') {
            requestOnlineNewGame();
            return;
        }
        startNewGame();
    }

    function handlePassAction() {
        if (state.mode === 'online' && state.role !== 'player') {
            setStatus('观战中无法停手。', 'error');
            return;
        }
        if (state.mode === 'online' && state.isHost && !state.guestId) {
            setStatus('等待对手加入后才能停手。', 'error');
            return;
        }
        if (state.mode === 'online' && state.current !== state.human) {
            setStatus('等待对手落子...', 'error');
            return;
        }
        handlePass(state.human);
    }

    function joinRoom(asSpectator) {
        const rawPeerId = ui.peerIdInput.value;
        const peerId = normalizePeerId(rawPeerId);

        if (asSpectator && !peerId) {
            setStatus('观战需要输入对方 ID。', 'error');
            return;
        }
        if (!window.Peer) {
            setStatus('PeerJS 未加载，无法联机。', 'error');
            return;
        }
        ui.peerIdInput.value = peerId;

        if (state.mode === 'online' && state.roomId === peerId && state.role === (asSpectator ? 'spectator' : 'player')) {
            setStatus('已在联机中。', 'error');
            return;
        }

        leaveRoom(true);
        state.mode = 'online';
        state.role = asSpectator ? 'spectator' : 'player';
        state.roomId = peerId;
        state.selfId = '';
        state.lastGameUpdate = 0;
        state.human = 0;
        state.ai = 0;
        state.isHost = false;
        state.peerServer = null;
        updateSelfIdDisplay();
        updateControlAvailability();
        updateRoomStatus(peerId ? '正在连接对方 ID...' : '正在生成联机 ID...');
        setupPeerForJoin(state.role);
    }

    function setupPeerForJoin(role) {
        const peer = createPeerInstance(null, state.peerServer);
        if (!peer) {
            setStatus('PeerJS 未加载，无法联机。', 'error');
            leaveRoom(true);
            return;
        }
        state.peer = peer;

        peer.on('open', id => {
            state.selfId = id || '';
            updateSelfIdDisplay();
            if (state.roomId) {
                connectToHost(role);
                return;
            }
            if (role === 'spectator') {
                setStatus('观战需要输入对方 ID。', 'error');
                leaveRoom(true);
                return;
            }
            becomeHost();
        });

        peer.on('connection', conn => {
            if (state.isHost) {
                registerConnection(conn, { role: 'spectator' });
            } else {
                conn.close();
            }
        });

        peer.on('error', err => {
            setStatus(`PeerJS 连接失败：${err && err.type ? err.type : '未知错误'}`, 'error');
            leaveRoom(true);
        });
    }

    function leaveRoom(silent = false) {
        if (state.mode !== 'online') {
            if (!silent) {
                setStatus('当前未加入联机。', 'error');
            }
            return;
        }
        resetConnections();
        if (state.peer) {
            state.peer.destroy();
            state.peer = null;
        }

        state.mode = 'solo';
        state.role = 'player';
        state.roomId = '';
        state.selfId = '';
        state.pendingJoin = null;
        state.lastGameUpdate = 0;
        state.isHost = false;
        state.peerServer = null;
        state.guestId = null;
        updateSelfIdDisplay();
        applyPlayerColor();
        updateMatchLabel();
        updateControlAvailability();
        updateRoomStatus('未加入联机');

        if (!silent) {
            setStatus('已退出联机，回到单机模式。', 'success');
            startNewGame();
        }
    }

    function createGameState() {
        return {
            size: config.size,
            komi: config.komi,
            scoringMethod: config.scoringMethod,
            koRule: config.koRule,
            board: createBoard(config.size),
            current: 1,
            captures: { 1: 0, 2: 0 },
            koPoint: null,
            passCount: 0,
            moveCount: 0,
            lastMove: null,
            gameOver: false,
            updatedAt: Date.now()
        };
    }

    function serializeGameState() {
        return {
            size: config.size,
            komi: config.komi,
            scoringMethod: config.scoringMethod,
            koRule: config.koRule,
            board: cloneBoard(state.board),
            current: state.current,
            captures: { 1: state.captures[1], 2: state.captures[2] },
            koPoint: state.koPoint ? { x: state.koPoint.x, y: state.koPoint.y } : null,
            passCount: state.passCount,
            moveCount: state.moveCount,
            lastMove: state.lastMove ? { ...state.lastMove } : null,
            gameOver: state.gameOver,
            updatedAt: Date.now()
        };
    }

    function broadcastGameState(excludePeerId = null) {
        if (state.mode !== 'online') {
            return;
        }
        const game = serializeGameState();
        state.lastGameUpdate = game.updatedAt || state.lastGameUpdate;
        const payload = {
            type: 'game',
            game: game,
            source: state.clientId
        };
        if (state.isHost) {
            state.connections.forEach((entry, peerId) => {
                if (peerId && peerId !== excludePeerId) {
                    sendPeerMessage(entry.conn, payload);
                }
            });
        } else if (state.hostConnection) {
            sendPeerMessage(state.hostConnection, payload);
        }
    }

    function applyGameState(game) {
        if (!game || !Array.isArray(game.board)) {
            return;
        }
        const prevSize = config.size;
        if (game.size) {
            config.size = game.size;
            ui.boardSizeSelect.value = config.size;
        }
        if (typeof game.komi === 'number') {
            config.komi = game.komi;
            ui.komiSelect.value = config.komi;
        }
        if (game.scoringMethod && scoringLabel[game.scoringMethod]) {
            config.scoringMethod = game.scoringMethod;
            ui.scoringMethodSelect.value = config.scoringMethod;
        }
        if (game.koRule) {
            config.koRule = game.koRule;
            ui.koRuleSelect.value = config.koRule;
        }

        state.board = cloneBoard(game.board);
        state.positionKeys = new Set([boardKey(state.board)]);
        state.current = game.current || 1;
        state.captures = {
            1: game.captures && typeof game.captures[1] === 'number' ? game.captures[1] : 0,
            2: game.captures && typeof game.captures[2] === 'number' ? game.captures[2] : 0
        };
        state.koPoint = game.koPoint ? { x: game.koPoint.x, y: game.koPoint.y } : null;
        state.passCount = game.passCount || 0;
        state.moveCount = game.moveCount || 0;
        state.lastMove = game.lastMove ? { ...game.lastMove } : null;
        state.gameOver = !!game.gameOver;
        state.history = [];
        state.hintUsed = 0;
        state.busy = false;
        clearAiTimer();
        state.handAnimation = null;
        state.pendingMove = null;

        if (game.updatedAt) {
            state.lastGameUpdate = game.updatedAt;
        }

        if (config.size !== prevSize) {
            resizeCanvas();
        }
        updateUI();
        draw();
    }

    function applyRemoteGameState(game) {
        // 只要接收到的步数大于等于当前步数，就认为是有效更新
        if (game && typeof game.moveCount === 'number') {
            if (game.moveCount < state.moveCount) {
                console.warn('收到旧的步数，忽略', game.moveCount, state.moveCount);
                return;
            }
        }
        
        console.log('应用远程状态:', game); // 添加日志方便调试
        applyGameState(game);
        
        // 更新最后更新时间用于后续参考（可选）
        if (game && game.updatedAt) {
            state.lastGameUpdate = game.updatedAt;
        }
        
        if (state.mode === 'online') {
            setOnlineTurnStatus();
        }
    }

    function setOnlineTurnStatus() {
        if (state.gameOver) {
            if (state.lastMove && state.lastMove.resign) {
                const resignColor = state.lastMove.color;
                if (state.role === 'spectator') {
                    setStatus(`${resignColor === 1 ? '黑方' : '白方'} 认输，对局结束。`, 'success');
                } else if (resignColor === state.human) {
                    setStatus('你已认输，对局结束。', 'success');
                } else {
                    setStatus('对手认输，你获胜。', 'success');
                }
                return;
            }
            const score = calculateScore();
            const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
            const diff = Math.abs(score.black - score.white);
            setStatus(`终局：黑 ${score.black.toFixed(1)} 目 / 白 ${score.white.toFixed(1)} 目，${winner}（${diff.toFixed(1)} 目差距）。`, 'success');
            ui.tipText.textContent = getScoreSummary(score);
            return;
        }

        if (state.role === 'spectator') {
            setStatus('观战中...', 'success');
            return;
        }
        if (state.isHost && !state.guestId) {
            setStatus('等待对手加入...', 'success');
            return;
        }

        if (state.current === state.human) {
            setStatus('轮到你落子。', 'success');
        } else {
            setStatus('等待对手落子...', 'success');
        }
    }

    function updateDifficultyUI() {
        if (state.mode === 'online') {
            return;
        }
        const label = difficultyLabel[state.difficulty] || '简单';
        ui.aiHint.textContent = `AI 难度：${label}`;
    }

    function applyPlayerColor() {
        if (state.mode === 'online') {
            updatePlayerLabels();
            if (state.board.length === config.size) {
                updateUI();
            }
            return;
        }
        if (config.playerColor === 'white') {
            state.human = 2;
            state.ai = 1;
        } else {
            state.human = 1;
            state.ai = 2;
        }
        updatePlayerLabels();
        if (state.board.length === config.size) {
            updateUI();
        }
    }

    function getActorLabel(color) {
        if (state.mode === 'online') {
            if (state.role === 'spectator') {
                return color === 1 ? '黑方' : '白方';
            }
            return color === state.human ? '你' : '对手';
        }
        return color === state.human ? '玩家' : 'AI';
    }

    function getRuleLabel(method) {
        return scoringLabel[method] || '规则';
    }

    function usesAreaScoring(method) {
        return method === 'chinese' || method === 'aga';
    }

    function getScoreSummary(score) {
        const ruleLabel = getRuleLabel(config.scoringMethod);
        const komiText = config.komi.toFixed(1);

        if (config.scoringMethod === 'chinese') {
            // 中国规则：领地 + 棋盘上的棋子 + 贴目
            return `${ruleLabel}：黑领地 ${score.territory[1]} + 黑子 ${score.stones[1]} = ${score.black.toFixed(1)}，白领地 ${score.territory[2]} + 白子 ${score.stones[2]} + 贴目 ${komiText} = ${score.white.toFixed(1)}。`;
        } else if (config.scoringMethod === 'aga') {
            // AGA规则：领地 + 提子 + 棋盘上的棋子 + 贴目
            return `${ruleLabel}：黑领地 ${score.territory[1]} + 黑子 ${score.stones[1]} + 黑提子 ${state.captures[1]} = ${score.black.toFixed(1)}，白领地 ${score.territory[2]} + 白子 ${score.stones[2]} + 白提子 ${state.captures[2]} + 贴目 ${komiText} = ${score.white.toFixed(1)}。`;
        } else {
            // 日韩规则：领地 + 提子 + 贴目
            return `${ruleLabel}：黑领地 ${score.territory[1]} + 黑提子 ${state.captures[1]} = ${score.black.toFixed(1)}，白领地 ${score.territory[2]} + 白提子 ${state.captures[2]} + 贴目 ${komiText} = ${score.white.toFixed(1)}。`;
        }
    }

    function startNewGame() {
        if (state.mode === 'online') {
            return;
        }
        state.turnId += 1;
        clearAiTimer();
        state.board = createBoard(config.size);
        state.positionKeys = new Set([boardKey(state.board)]);
        state.current = 1;
        state.captures = { 1: 0, 2: 0 };
        state.koPoint = null;
        state.passCount = 0;
        state.moveCount = 0;
        state.lastMove = null;
        state.gameOver = false;
        state.busy = false;
        state.history = [];
        state.hintUsed = 0;
        state.handAnimation = null;
        state.pendingMove = null;
        setStatus(`新对局开始，黑方先行，玩家执${state.human === 1 ? '黑' : '白'}。`, 'success');

        // 根据规则提供相应的说明
        let ruleDesc = '';
        if (config.scoringMethod === 'chinese') {
            ruleDesc = '中国规则：领地 + 棋盘上的棋子 + 贴目';
        } else if (config.scoringMethod === 'aga') {
            ruleDesc = 'AGA 规则：领地 + 提子 + 棋盘上的棋子 + 贴目';
        } else {
            ruleDesc = '日韩规则：领地 + 提子 + 贴目';
        }
        ui.tipText.textContent = `开局建议先占角，再向边与中央扩展。AI 会根据难度进行不同强度的落子选择。当前采用${ruleDesc}，贴目 ${config.komi.toFixed(1)} 目。`;
        if (state.current === state.ai) {
            setStatus('AI 思考中...', 'success');
            scheduleAiMove();
        }

        updateUI();
        draw();
    }

    function requestOnlineNewGame() {
        if (state.mode !== 'online') {
            startNewGame();
            return;
        }
        if (state.role !== 'player') {
            setStatus('观战中无法新开局。', 'error');
            return;
        }
        if (!state.isHost) {
            setStatus('只有创建者可以发起新对局。', 'error');
            return;
        }
        state.turnId += 1;
        clearAiTimer();
        state.hintUsed = 0;
        const freshGame = createGameState();
        applyGameState(freshGame);
        broadcastGameState();
        ui.tipText.textContent = '联机对局已重置，等待对手落子。';
        setOnlineTurnStatus();
    }

    function createBoard(size) {
        return Array.from({ length: size }, () => Array(size).fill(0));
    }

    function cloneBoard(board) {
        return board.map(row => row.slice());
    }

    function boardKey(board) {
        return board.map(row => row.join('')).join('|');
    }

    function rebuildPositionKeys() {
        const keys = new Set();
        keys.add(boardKey(state.board));
        state.history.forEach(snapshot => {
            keys.add(boardKey(snapshot.board));
        });
        state.positionKeys = keys;
    }

    function isSuperkoViolation(board) {
        if (config.koRule !== 'super') {
            return false;
        }
        if (!state.positionKeys) {
            return false;
        }
        return state.positionKeys.has(boardKey(board));
    }

    function onBoardClick(event) {
        if (state.gameOver || state.busy) {
            return;
        }
        if (state.mode === 'online') {
            if (state.role !== 'player') {
                setStatus('观战中无法落子。', 'error');
                return;
            }
            if (state.isHost && !state.guestId) {
                setStatus('等待对手加入后才能落子。', 'error');
                return;
            }
            if (state.current !== state.human) {
                setStatus('等待对手落子...', 'error');
                return;
            }
        } else if (state.current !== state.human) {
            return;
        }
        const point = getPointFromEvent(event);
        if (!point) {
            return;
        }

        // 如果点击位置已有棋子，显示该棋子组的信息
        if (state.board[point.y][point.x] !== 0) {
            const color = state.board[point.y][point.x];
            const group = getGroup(state.board, point.x, point.y);
            const colorName = color === 1 ? '黑棋' : '白棋';
            const liberties = group.liberties.size;
            let statusDesc = '';
            if (liberties === 1) {
                statusDesc = '（叫吃状态，危险！）';
            } else if (liberties === 2) {
                statusDesc = '（气数较少，需要补强）';
            } else if (liberties >= 4) {
                statusDesc = '（气数充足，相对安全）';
            }
            setStatus(`该位置已有${colorName}，该组共 ${group.stones.length} 子，剩余 ${liberties} 气${statusDesc}`, 'error');
            return;
        }

        // 检查劫规则
        if (state.koPoint && state.koPoint.x === point.x && state.koPoint.y === point.y) {
            setStatus('劫规则限制：不能立即重新提回刚被提的棋子，请先在其他位置落子。', 'error');
            return;
        }

        // 模拟走法
        const move = simulateMove(state.board, point.x, point.y, state.human, state.koPoint);
        if (!move) {
            if (isSuicideMove(state.board, point.x, point.y, state.human)) {
                setStatus('禁止自杀性走法：该位置会导致己方棋子没有气，且无法提掉对方棋子。', 'error');
            } else if (config.koRule === 'super') {
                setStatus('超级劫规则限制：该走法会重现之前的棋盘局面，请选择其他位置。', 'error');
            } else {
                setStatus('该位置无法落子，请尝试其他位置。', 'error');
            }
            return;
        }

        applyMove(move, state.human);
        if (state.mode === 'online') {
            broadcastGameState();
            setOnlineTurnStatus();
        } else {
            setStatus('AI 思考中...', 'success');
            scheduleAiMove();
        }
    }

    function scheduleAiMove() {
        if (state.mode === 'online') {
            state.busy = false;
            return;
        }
        clearAiTimer();
        state.busy = true;
        const turnId = state.turnId;
        const baseDelay = 420;
        const remainingAnimation = state.handAnimation
            ? Math.max(state.handAnimation.duration - (Date.now() - state.handAnimation.startTime), 0)
            : 0;
        const delay = Math.max(baseDelay, remainingAnimation);
        const timerId = setTimeout(() => {
            if (state.aiTimer !== timerId) {
                return;
            }
            state.aiTimer = null;
            if (state.turnId !== turnId || state.gameOver) {
                state.busy = false;
                return;
            }
            aiMove();
            state.busy = false;
        }, delay);
        state.aiTimer = timerId;
    }

    function clearAiTimer() {
        if (state.aiTimer) {
            clearTimeout(state.aiTimer);
            state.aiTimer = null;
        }
    }

    function handlePass(color) {
        if (state.gameOver || state.current !== color) {
            return;
        }
        if (state.busy && color === state.human) {
            return;
        }
        saveSnapshot();
        state.passCount += 1;
        state.moveCount += 1;
        state.lastMove = {
            pass: true,
            color: color,
            captured: 0
        };
        state.koPoint = null;
        const playerName = getActorLabel(color);

        if (state.passCount === 1) {
            setStatus(`${playerName} 停一手。`, 'success');
            ui.tipText.textContent = `${playerName}选择停一手。如果对方也停一手，对局将自动结束并进行计分。`;
        } else {
            setStatus(`${playerName} 停一手，双方连续停一手。`, 'success');
        }

        updateUI();
        draw();

        if (state.passCount >= 2) {
            endGame();
            if (state.mode === 'online') {
                broadcastGameState();
            }
            return;
        }

        switchPlayer();
        if (state.mode === 'online') {
            broadcastGameState();
            setOnlineTurnStatus();
        } else if (state.current === state.ai) {
            setStatus('AI 思考中...', 'success');
            scheduleAiMove();
        } else {
            setStatus('轮到玩家落子。', 'success');
        }
    }

    function applyMove(move, color) {
        saveSnapshot();
        state.board = move.board;
        if (!state.positionKeys) {
            state.positionKeys = new Set();
        }
        state.positionKeys.add(boardKey(state.board));

        const capturedCount = move.captured.length;
        state.captures[color] += capturedCount;
        state.koPoint = move.koPoint;
        state.moveCount += 1;
        state.passCount = 0;

        // 保存落子信息，用于动画
        state.pendingMove = {
            x: move.x,
            y: move.y,
            color: color,
            startTime: Date.now()
        };

        // 立即设置最后一步信息，但延迟显示棋子
        state.lastMove = {
            x: move.x,
            y: move.y,
            color: color,
            captured: capturedCount
        };

        // 启动落子动画，无法播放时立即刷新棋盘
        if (!startHandAnimation(move.x, move.y, color)) {
            draw();
        }

        // 如果提了子，在状态栏显示提示
        if (capturedCount > 0) {
            const playerName = getActorLabel(color);
            const coord = formatCoord(move.x, move.y);
            setStatus(`${playerName} 在 ${coord} 落子，提掉 ${capturedCount} 子。`, 'success');
        }

        updateUI();
        switchPlayer();
    }

    function switchPlayer() {
        state.current = state.current === 1 ? 2 : 1;
        updateUI();

        // 如果切换到玩家回合，检查双方的危险状态
        if (state.current === state.human && !state.gameOver) {
            checkBoardStatus();
        }
    }

    function checkBoardStatus() {
        // 检查双方的叫吃状态
        const humanAtari = countGroupsInAtari(state.board, state.human);
        const aiAtari = countGroupsInAtari(state.board, state.ai);

        if (humanAtari > 0 && aiAtari > 0) {
            ui.tipText.textContent = `注意：您有 ${humanAtari} 组棋子处于叫吃状态（只剩 1 气），对方也有 ${aiAtari} 组处于叫吃状态。`;
        } else if (humanAtari > 0) {
            ui.tipText.textContent = `警告：您有 ${humanAtari} 组棋子处于叫吃状态（只剩 1 气），请立即补强或转移！`;
        } else if (aiAtari > 0) {
            ui.tipText.textContent = `机会：对方有 ${aiAtari} 组棋子处于叫吃状态（只剩 1 气），可以考虑提子。`;
        }
    }

    function aiMove() {
        if (state.mode === 'online') {
            return;
        }
        if (state.gameOver || state.current !== state.ai) {
            return;
        }
        const moves = getLegalMoves(state.board, state.ai, state.koPoint);
        if (moves.length === 0) {
            handlePass(state.ai);
            return;
        }
        const move = chooseAiMove(moves);
        if (!move) {
            handlePass(state.ai);
            return;
        }
        applyMove(move, state.ai);

        // AI 落子后的提示
        if (move.captured && move.captured.length > 0) {
            // AI 提了子，显示在状态栏
            setStatus('轮到玩家落子。', 'success');
        } else {
            setStatus('轮到玩家落子。', 'success');
        }
    }

    function chooseAiMove(moves) {
        if (state.difficulty === 'easy') {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        if (state.difficulty === 'medium') {
            return pickBestMove(moves, state.ai);
        }

        let bestMove = null;
        let bestScore = -Infinity;
        moves.forEach(move => {
            const baseScore = scoreMove(move, state.ai);
            const opponentMoves = getLegalMoves(move.board, state.human, move.koPoint);
            let opponentBest = 0;
            if (opponentMoves.length > 0) {
                opponentBest = pickBestMove(opponentMoves, state.human).score;
            }
            const totalScore = baseScore - opponentBest * 0.7;
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestMove = move;
            }
        });
        return bestMove || moves[Math.floor(Math.random() * moves.length)];
    }

    function pickBestMove(moves, color) {
        let bestScore = -Infinity;
        let bestMoves = [];
        moves.forEach(move => {
            const score = scoreMove(move, color);
            move.score = score;
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (score === bestScore) {
                bestMoves.push(move);
            }
        });
        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    function scoreMove(move, color) {
        const opponent = color === 1 ? 2 : 1;
        const group = getGroup(move.board, move.x, move.y);
        const liberties = group.liberties.size;
        const oppAtari = countGroupsInAtari(move.board, opponent);
        const adjacent = countAdjacent(move.board, move.x, move.y, color);
        const centerScore = centerBias(move.x, move.y);
        const selfAtariPenalty = liberties === 1 ? 4 : 0;
        return move.captured.length * 8
            + oppAtari * 2
            + adjacent * 0.6
            + liberties * 0.2
            - selfAtariPenalty
            + centerScore;
    }

    function centerBias(x, y) {
        const center = (config.size - 1) / 2;
        const dist = Math.abs(x - center) + Math.abs(y - center);
        return (config.size - dist) * 0.15;
    }

    function countAdjacent(board, x, y, color) {
        return getNeighbors(x, y, config.size)
            .filter(p => board[p.y][p.x] === color).length;
    }

    function getLegalMoves(board, color, koPoint) {
        const moves = [];
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                if (board[y][x] !== 0) {
                    continue;
                }
                const move = simulateMove(board, x, y, color, koPoint);
                if (move) {
                    moves.push(move);
                }
            }
        }
        return moves;
    }

    function isSuicideMove(board, x, y, color) {
        // 检查是否为自杀性走法
        if (board[y][x] !== 0) {
            return false;
        }
        const next = cloneBoard(board);
        next[y][x] = color;
        const opponent = color === 1 ? 2 : 1;

        // 先检查是否能提掉对方棋子
        const neighbors = getNeighbors(x, y, config.size);
        for (const n of neighbors) {
            if (next[n.y][n.x] === opponent) {
                const group = getGroup(next, n.x, n.y);
                if (group.liberties.size === 0) {
                    // 能提掉对方棋子，不是自杀
                    return false;
                }
            }
        }

        // 检查己方棋子是否有气
        const selfGroup = getGroup(next, x, y);
        return selfGroup.liberties.size === 0;
    }

    function simulateMove(board, x, y, color, koPoint) {
        if (board[y][x] !== 0) {
            return null;
        }
        if (koPoint && koPoint.x === x && koPoint.y === y) {
            return null;
        }
        const next = cloneBoard(board);
        next[y][x] = color;
        const opponent = color === 1 ? 2 : 1;
        const captured = [];
        const seen = new Set();

        getNeighbors(x, y, config.size).forEach(p => {
            if (next[p.y][p.x] !== opponent) {
                return;
            }
            const key = `${p.x},${p.y}`;
            if (seen.has(key)) {
                return;
            }
            const group = getGroup(next, p.x, p.y);
            group.stones.forEach(stone => seen.add(`${stone.x},${stone.y}`));
            if (group.liberties.size === 0) {
                group.stones.forEach(stone => {
                    next[stone.y][stone.x] = 0;
                    captured.push(stone);
                });
            }
        });

        const selfGroup = getGroup(next, x, y);
        if (selfGroup.liberties.size === 0) {
            return null;
        }

        if (isSuperkoViolation(next)) {
            return null;
        }

        let newKo = null;
        if (captured.length === 1 && selfGroup.liberties.size === 1) {
            newKo = { x: captured[0].x, y: captured[0].y };
        }

        return {
            x,
            y,
            board: next,
            captured,
            koPoint: newKo
        };
    }

    function getNeighbors(x, y, size) {
        const neighbors = [];
        if (x > 0) neighbors.push({ x: x - 1, y });
        if (x < size - 1) neighbors.push({ x: x + 1, y });
        if (y > 0) neighbors.push({ x, y: y - 1 });
        if (y < size - 1) neighbors.push({ x, y: y + 1 });
        return neighbors;
    }

    function getAllNeighbors(x, y, size) {
        const neighbors = [];
        // 上下左右
        if (x > 0) neighbors.push({ x: x - 1, y });
        if (x < size - 1) neighbors.push({ x: x + 1, y });
        if (y > 0) neighbors.push({ x, y: y - 1 });
        if (y < size - 1) neighbors.push({ x, y: y + 1 });
        // 斜向
        if (x > 0 && y > 0) neighbors.push({ x: x - 1, y: y - 1 });
        if (x < size - 1 && y > 0) neighbors.push({ x: x + 1, y: y - 1 });
        if (x > 0 && y < size - 1) neighbors.push({ x: x - 1, y: y + 1 });
        if (x < size - 1 && y < size - 1) neighbors.push({ x: x + 1, y: y + 1 });
        return neighbors;
    }

    function getGroup(board, x, y) {
        const color = board[y][x];
        const stack = [{ x, y }];
        const visited = new Set([`${x},${y}`]);
        const stones = [];
        const liberties = new Set();

        while (stack.length) {
            const point = stack.pop();
            stones.push(point);
            getNeighbors(point.x, point.y, config.size).forEach(n => {
                const value = board[n.y][n.x];
                if (value === 0) {
                    liberties.add(`${n.x},${n.y}`);
                    return;
                }
                if (value === color) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        stack.push(n);
                    }
                }
            });
        }

        return { stones, liberties };
    }

    function countGroupsInAtari(board, color) {
        const visited = new Set();
        let count = 0;
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                if (board[y][x] !== color) {
                    continue;
                }
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }
                const group = getGroup(board, x, y);
                group.stones.forEach(stone => visited.add(`${stone.x},${stone.y}`));
                if (group.liberties.size === 1) {
                    count += 1;
                }
            }
        }
        return count;
    }

    function updateUI() {
        ui.currentPlayer.textContent = state.current === 1 ? '黑' : '白';
        ui.moveCount.textContent = `步数 ${state.moveCount}`;
        if (!state.lastMove) {
            ui.lastMove.textContent = '-';
        } else if (state.lastMove.resign) {
            ui.lastMove.textContent = `${state.lastMove.color === 1 ? '黑' : '白'} 认输`;
        } else if (state.lastMove.pass) {
            ui.lastMove.textContent = `${state.lastMove.color === 1 ? '黑' : '白'} 停一手`;
        } else {
            const coord = formatCoord(state.lastMove.x, state.lastMove.y);
            if (state.lastMove.captured && state.lastMove.captured > 0) {
                ui.lastMove.textContent = `${coord} (提${state.lastMove.captured})`;
            } else {
                ui.lastMove.textContent = coord;
            }
        }

        // 更新实时记分牌
        updateScoreboard();
    }

    function updateScoreboard() {
        // 计算实时得分
        const score = calculateScore();

        // 更新黑方记分牌
        ui.blackScore.textContent = score.black.toFixed(1);

        // 更新白方记分牌
        ui.whiteScore.textContent = score.white.toFixed(1);

        // 根据规则显示详细信息
        let blackDetailText = '';
        let whiteDetailText = '';

        if (config.scoringMethod === 'chinese') {
            // 中国规则：领地 + 棋子
            blackDetailText = `领地 ${score.territory[1]} | 棋子 ${score.stones[1]}`;
            whiteDetailText = `领地 ${score.territory[2]} | 棋子 ${score.stones[2]} | 贴目 ${config.komi.toFixed(1)}`;
        } else if (config.scoringMethod === 'aga') {
            // AGA规则：领地 + 提子 + 棋子
            blackDetailText = `领地 ${score.territory[1]} | 提子 ${state.captures[1]} | 棋子 ${score.stones[1]}`;
            whiteDetailText = `领地 ${score.territory[2]} | 提子 ${state.captures[2]} | 棋子 ${score.stones[2]} | 贴目 ${config.komi.toFixed(1)}`;
        } else {
            // 日韩规则：领地 + 提子
            blackDetailText = `领地 ${score.territory[1]} | 提子 ${state.captures[1]}`;
            whiteDetailText = `领地 ${score.territory[2]} | 提子 ${state.captures[2]} | 贴目 ${config.komi.toFixed(1)}`;
        }

        ui.blackDetail.textContent = blackDetailText;
        ui.whiteDetail.textContent = whiteDetailText;
    }

    function setStatus(text, type) {
        ui.status.textContent = text;
        ui.status.classList.remove('success', 'error');
        ui.status.classList.add(type);
    }

    function formatCoord(x, y) {
        const letters = 'ABCDEFGHJKLMNOPQRST';
        const col = letters[x] || `${x + 1}`;
        const row = config.size - y;
        return `${col}${row}`;
    }

    function endGame() {
        state.gameOver = true;
        const score = calculateScore();
        const winner = score.black > score.white ? '黑胜' : score.black < score.white ? '白胜' : '平局';
        const diff = Math.abs(score.black - score.white);
        setStatus(`终局：黑 ${score.black.toFixed(1)} 目 / 白 ${score.white.toFixed(1)} 目，${winner}（${diff.toFixed(1)} 目差距）。`, 'success');

        // 生成详细的终局统计
        let summary = getScoreSummary(score);
        summary += `\n\n对局统计：总步数 ${state.moveCount} 步`;
        if (state.captures[1] > 0 || state.captures[2] > 0) {
            summary += `，黑方共提 ${state.captures[1]} 子，白方共提 ${state.captures[2]} 子`;
        }
        summary += '。';

        ui.tipText.textContent = summary;
        updateUI();
    }

    function resignGame() {
        if (state.gameOver) {
            return;
        }
        if (state.mode === 'online') {
            if (state.role !== 'player') {
                setStatus('观战中无法认输。', 'error');
                return;
            }
            state.turnId += 1;
            clearAiTimer();
            state.busy = false;
            state.handAnimation = null;
            state.pendingMove = null;
            state.gameOver = true;
            state.lastMove = {
                resign: true,
                color: state.human,
                captured: 0
            };
            setStatus('你已认输，对局结束。', 'success');
            ui.tipText.textContent = '联机对局已结束，可由黑方发起新开局。';
            updateUI();
            draw();
            broadcastGameState();
            return;
        }
        state.turnId += 1;
        clearAiTimer();
        state.busy = false;
        state.handAnimation = null;
        state.pendingMove = null;
        state.gameOver = true;
        state.lastMove = {
            resign: true,
            color: state.human,
            captured: 0
        };
        setStatus('玩家认输，AI 获胜。', 'success');
        ui.tipText.textContent = `对局已结束。玩家可以在明显落后或无法挽回的局面下选择认输。感谢对弈！`;
        updateUI();
        draw();
    }

    function getHint() {
        if (state.gameOver) {
            setStatus('对局已结束，无法获取提示。', 'error');
            return;
        }
        if (state.mode === 'online' && state.role !== 'player') {
            setStatus('观战中无法获取提示。', 'error');
            return;
        }
        if (state.current !== state.human) {
            setStatus(state.mode === 'online' ? '轮到对手落子，暂不需要提示。' : '轮到 AI 落子，暂不需要提示。', 'error');
            return;
        }
        if (state.hintUsed >= state.hintLimit) {
            setStatus(`提示次数已用完，本局限制 ${state.hintLimit} 次。`, 'error');
            return;
        }
        const moves = getLegalMoves(state.board, state.human, state.koPoint);
        if (moves.length === 0) {
            setStatus('没有可落的位置，请停一手。', 'error');
            return;
        }
        const bestMove = pickBestMove(moves, state.human);
        state.hintUsed += 1;
        const coord = formatCoord(bestMove.x, bestMove.y);

        // 分析该走法的特点
        let moveDesc = '';
        if (bestMove.captured && bestMove.captured.length > 0) {
            moveDesc = `可提掉对方 ${bestMove.captured.length} 子`;
        } else {
            const group = getGroup(bestMove.board, bestMove.x, bestMove.y);
            const liberties = group.liberties.size;
            if (liberties === 1) {
                moveDesc = `落子后只有 1 气，注意防守`;
            } else if (liberties >= 4) {
                moveDesc = `落子后有 ${liberties} 气，位置较安全`;
            } else {
                moveDesc = `落子后有 ${liberties} 气`;
            }

            // 检查是否能攻击对方
            const oppAtari = countGroupsInAtari(bestMove.board, state.ai);
            if (oppAtari > 0) {
                moveDesc += `，可威胁对方 ${oppAtari} 组`;
            }
        }

        ui.tipText.textContent = `推荐落子位置：${coord}（${moveDesc}）。已用 ${state.hintUsed}/${state.hintLimit} 次提示。`;
        setStatus(`获得提示：建议在 ${coord} 位落子。`, 'success');
        highlightHintPosition(bestMove.x, bestMove.y);
        setTimeout(() => {
            clearHintHighlight();
            draw();
        }, 2000);
    }

    function highlightHintPosition(x, y) {
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.4;
        const cx = pad + x * cell;
        const cy = pad + y * cell;
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    function clearHintHighlight() {
        draw();
    }

    function saveSnapshot() {
        state.history.push({
            board: cloneBoard(state.board),
            current: state.current,
            captures: { 1: state.captures[1], 2: state.captures[2] },
            koPoint: state.koPoint ? { x: state.koPoint.x, y: state.koPoint.y } : null,
            passCount: state.passCount,
            moveCount: state.moveCount,
            lastMove: state.lastMove ? {
                ...state.lastMove,
                captured: state.lastMove.captured || 0
            } : null,
            gameOver: state.gameOver
        });
    }

    function restoreSnapshot(snapshot) {
        state.board = cloneBoard(snapshot.board);
        state.current = snapshot.current;
        state.captures = { 1: snapshot.captures[1], 2: snapshot.captures[2] };
        state.koPoint = snapshot.koPoint ? { x: snapshot.koPoint.x, y: snapshot.koPoint.y } : null;
        state.passCount = snapshot.passCount;
        state.moveCount = snapshot.moveCount;
        state.lastMove = snapshot.lastMove ? {
            ...snapshot.lastMove,
            captured: snapshot.lastMove.captured || 0
        } : null;
        state.gameOver = snapshot.gameOver;
    }

    function undoMove() {
        if (state.mode === 'online') {
            setStatus('联机模式下无法悔棋。', 'error');
            return;
        }
        if (!state.history.length) {
            setStatus('暂无可回退的步。', 'error');
            return;
        }
        state.turnId += 1;
        clearAiTimer();
        state.busy = false;
        state.handAnimation = null;
        state.pendingMove = null;
        let steps = 1;
        if (state.lastMove && state.lastMove.color === state.ai && state.history.length >= 2) {
            steps = 2;
        }
        let snapshot = null;
        for (let i = 0; i < steps; i += 1) {
            snapshot = state.history.pop();
            if (!snapshot) {
                break;
            }
        }
        if (!snapshot) {
            setStatus('暂无可回退的步。', 'error');
            return;
        }
        restoreSnapshot(snapshot);
        rebuildPositionKeys();
        updateUI();
        draw();
        if (state.current === state.human) {
            setStatus('已回退，轮到玩家落子。', 'success');
        } else {
            setStatus('已回退，轮到 AI 落子。', 'success');
        }
    }

    function calculateScore() {
        const visited = new Set();
        const territory = { 1: 0, 2: 0 };
        const stones = { 1: 0, 2: 0 };

        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (value === 1) stones[1] += 1;
                if (value === 2) stones[2] += 1;
                if (value !== 0) {
                    continue;
                }
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }
                const region = floodFillEmpty(state.board, x, y);
                region.cells.forEach(cell => visited.add(`${cell.x},${cell.y}`));
                if (region.borders.size === 1) {
                    const owner = [...region.borders][0];
                    territory[owner] += region.cells.length;
                }
            }
        }

        let blackScore, whiteScore;
        if (config.scoringMethod === 'chinese') {
            // 中国规则：领地 + 棋盘上的棋子 + 贴目
            blackScore = territory[1] + stones[1];
            whiteScore = territory[2] + stones[2] + config.komi;
        } else if (config.scoringMethod === 'aga') {
            // AGA规则：领地 + 提子 + 棋盘上的棋子 + 贴目
            blackScore = territory[1] + stones[1] + state.captures[1];
            whiteScore = territory[2] + stones[2] + state.captures[2] + config.komi;
        } else {
            // 日韩规则：领地 + 提子 + 贴目
            blackScore = territory[1] + state.captures[1];
            whiteScore = territory[2] + state.captures[2] + config.komi;
        }

        return {
            territory,
            stones,
            black: blackScore,
            white: whiteScore
        };
    }

    function floodFillEmpty(board, startX, startY) {
        const queue = [{ x: startX, y: startY }];
        const cells = [];
        const borders = new Set();
        const visited = new Set([`${startX},${startY}`]);

        while (queue.length) {
            const point = queue.pop();
            cells.push(point);
            getNeighbors(point.x, point.y, config.size).forEach(n => {
                const value = board[n.y][n.x];
                if (value === 0) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push(n);
                    }
                } else {
                    borders.add(value);
                }
            });
        }
        return { cells, borders };
    }

    function resizeCanvas() {
        const container = canvas.parentElement;
        const targetSize = config.boardCssSize || 560;

        // 在移动设备上使用容器宽度，桌面端使用用户设置的尺寸
        let cssSize;
        if (window.innerWidth <= 768) {
            const frame = container ? container.parentElement : null;
            const frameWidth = frame ? frame.clientWidth : (container ? container.clientWidth : targetSize);
            const available = frameWidth ? frameWidth - 32 : targetSize;
            cssSize = Math.max(220, Math.min(targetSize, available));
        } else {
            // 桌面端直接使用用户设置的尺寸，不受容器宽度限制
            cssSize = targetSize;
        }

        const dpr = window.devicePixelRatio || 1;

        if (container) {
            container.style.width = `${cssSize}px`;
            container.style.height = `${cssSize}px`;
        }
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.width = Math.floor(cssSize * dpr);
        canvas.height = Math.floor(cssSize * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const pad = Math.round(cssSize * 0.08);
        render = {
            size: cssSize,
            pad,
            cell: (cssSize - pad * 2) / (config.size - 1),
            handImage: render.handImage  // 保留已加载的SVG手部图像
        };

        draw();
    }

    function getPointFromEvent(event) {
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width ? render.size / rect.width : 1;
        const x = (event.clientX - rect.left) * scale;
        const y = (event.clientY - rect.top) * scale;
        const col = Math.round((x - render.pad) / render.cell);
        const row = Math.round((y - render.pad) / render.cell);
        if (col < 0 || col >= config.size || row < 0 || row >= config.size) {
            return null;
        }
        const ix = render.pad + col * render.cell;
        const iy = render.pad + row * render.cell;
        const dist = Math.hypot(ix - x, iy - y);
        // 以交叉点中心为原点，半径为格子大小的 0.45
        if (dist > render.cell * 0.45) {
            return null;
        }
        return { x: col, y: row };
    }

    function draw() {
        if (!render.size) {
            return;
        }
        drawBoard();
        if (state.showInfluence) {
            drawInfluence();
        }
        if (state.showConnections) {
            drawConnections();
        }
        drawStones();
        if (state.showEyes) {
            drawEyes();
        }
        if (state.showLiberties) {
            drawLiberties();
        }
        drawLastMove();
        if (state.handAnimation) {
            drawHandAnimation();
        }
    }

    function drawBoard() {
        const size = render.size;
        const pad = render.pad;
        const cell = render.cell;

        drawBoardBackground(size);

        // 绘制网格线，添加阴影效果
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;

        for (let i = 0; i < config.size; i += 1) {
            const pos = pad + i * cell;
            ctx.beginPath();
            ctx.moveTo(pad, pos);
            ctx.lineTo(size - pad, pos);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(pos, pad);
            ctx.lineTo(pos, size - pad);
            ctx.stroke();
        }

        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // 绘制星位，添加立体感
        const starPoints = getStarPoints(config.size);
        starPoints.forEach(point => {
            const cx = pad + point.x * cell;
            const cy = pad + point.y * cell;
            const radius = Math.max(3, cell * 0.14);

            // 绘制星位阴影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(cx + 1, cy + 1, radius, 0, Math.PI * 2);
            ctx.fill();

            // 绘制星位主体
            const gradient = ctx.createRadialGradient(
                cx - radius * 0.3,
                cy - radius * 0.3,
                radius * 0.1,
                cx,
                cy,
                radius
            );
            gradient.addColorStop(0, 'rgba(40, 40, 40, 0.9)');
            gradient.addColorStop(1, 'rgba(10, 10, 10, 1)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawBoardBackground(size) {
        const style = boardStyleLabel[config.boardStyle] ? config.boardStyle : 'hiba';
        const gradient = ctx.createLinearGradient(0, 0, size, size);

        if (style === 'bamboo') {
            // 竹制棋盘 - 竹子特有的金黄色和绿色纹理
            gradient.addColorStop(0, '#e8c44a');
            gradient.addColorStop(0.3, '#dab850');
            gradient.addColorStop(0.6, '#c9a858');
            gradient.addColorStop(1, '#b89548');
        } else if (style === 'whitePorcelain') {
            // 白釉瓷棋盘 - 瓷器的纯净白色和米白色
            gradient.addColorStop(0, '#fef9f3');
            gradient.addColorStop(0.5, '#f5f0e8');
            gradient.addColorStop(1, '#ebe5dd');
        } else if (style === 'celadon') {
            // 青瓷 - 古典青绿色，带有柔和的灰绿色调
            gradient.addColorStop(0, '#d9ead8');
            gradient.addColorStop(0.4, '#c4dcc4');
            gradient.addColorStop(0.7, '#b5cdb5');
            gradient.addColorStop(1, '#a5bfa5');
        } else if (style === 'marble') {
            // 大理石 - 灰色调为主，带有白色纹理
            gradient.addColorStop(0, '#f8f8f8');
            gradient.addColorStop(0.3, '#eeeeee');
            gradient.addColorStop(0.6, '#e0e0e0');
            gradient.addColorStop(1, '#d5d5d5');
        } else if (style === 'brocade') {
            // 织锦棋盘 - 暖棕色与金色混合，富贵感
            gradient.addColorStop(0, '#d8a86f');
            gradient.addColorStop(0.3, '#c9984a');
            gradient.addColorStop(0.6, '#b8873a');
            gradient.addColorStop(1, '#a67930');
        } else if (style === 'acrylic') {
            // 亚克力棋盘 - 浅蓝色，透明感，现代感
            gradient.addColorStop(0, '#e8f4ff');
            gradient.addColorStop(0.4, '#d8e8f5');
            gradient.addColorStop(0.7, '#c8dce8');
            gradient.addColorStop(1, '#b8d0db');
        } else {
            // 桧木棋盘 - 日本高级木材，红褐色调
            gradient.addColorStop(0, '#d8a873');
            gradient.addColorStop(0.3, '#c89960');
            gradient.addColorStop(0.6, '#b88a50');
            gradient.addColorStop(1, '#a87a40');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // 添加纹理效果
        if (style === 'hiba') {
            // 桧木纹理 - 更细腻的木纹
            ctx.strokeStyle = 'rgba(200, 150, 100, 0.18)';
            ctx.lineWidth = 1.5;
            const lines = 14;
            for (let i = 0; i < lines; i += 1) {
                const y = ((i + 1) / (lines + 1)) * size;
                const amplitude = size * 0.018;
                ctx.beginPath();
                ctx.moveTo(0, y);
                for (let x = 0; x <= size; x += size / 22) {
                    const wave = Math.sin(x / size * Math.PI * 4.5 + i) * amplitude;
                    ctx.lineTo(x, y + wave);
                }
                ctx.stroke();
            }

            // 添加年轮效果（深色）
            ctx.strokeStyle = 'rgba(100, 60, 30, 0.12)';
            ctx.lineWidth = 2.5;
            for (let i = 0; i < 10; i += 1) {
                const y = ((i + 1) / 11) * size;
                const amplitude = size * 0.025;
                ctx.beginPath();
                ctx.moveTo(0, y);
                for (let x = 0; x <= size; x += size / 18) {
                    const wave = Math.sin(x / size * Math.PI * 3.5 + i * 0.6) * amplitude;
                    ctx.lineTo(x, y + wave);
                }
                ctx.stroke();
            }

            // 添加浅色木纹细节
            ctx.strokeStyle = 'rgba(255, 240, 220, 0.08)';
            ctx.lineWidth = 0.8;
            for (let i = 0; i < 6; i += 1) {
                const y = ((i + 1) / 7) * size;
                const amplitude = size * 0.008;
                ctx.beginPath();
                ctx.moveTo(0, y);
                for (let x = 0; x <= size; x += size / 25) {
                    const wave = Math.sin(x / size * Math.PI * 5 + i) * amplitude;
                    ctx.lineTo(x, y + wave);
                }
                ctx.stroke();
            }
        } else if (style === 'bamboo') {
            // 竹制纹理 - 竹节效果
            const segmentHeight = size / 7;
            for (let i = 0; i < 7; i += 1) {
                const y = i * segmentHeight;
                // 竹节（深棕色）
                ctx.fillStyle = `rgba(100, 70, 20, ${0.12 + Math.random() * 0.08})`;
                ctx.fillRect(0, y - 3, size, 6);

                // 竹纹（细腻的浅色纹理）
                ctx.strokeStyle = 'rgba(255, 240, 200, 0.2)';
                ctx.lineWidth = 0.7;
                for (let j = 0; j < 4; j += 1) {
                    ctx.beginPath();
                    ctx.moveTo(0, y + segmentHeight * (j + 0.5) / 4);
                    ctx.lineTo(size, y + segmentHeight * (j + 0.5) / 4);
                    ctx.stroke();
                }

                // 纵向竹纹
                ctx.strokeStyle = 'rgba(200, 150, 80, 0.08)';
                ctx.lineWidth = 1;
                for (let x = 0; x < size; x += size / 12) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + segmentHeight);
                    ctx.stroke();
                }
            }
        } else if (style === 'whitePorcelain') {
            // 白釉瓷棋盘 - 更精致的光泽效果
            const gloss = ctx.createRadialGradient(
                size * 0.25,
                size * 0.2,
                size * 0.05,
                size * 0.35,
                size * 0.3,
                size * 0.85
            );
            gloss.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            gloss.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)');
            gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(0, 0, size, size);

            // 微妙的釉面龟裂纹理（瓷器的特征）
            ctx.strokeStyle = 'rgba(200, 190, 180, 0.1)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 12; i += 1) {
                const angle = (Math.PI * 2 * i) / 12;
                const cx = size * 0.45;
                const cy = size * 0.45;
                const r1 = size * 0.15;
                const r2 = size * 0.8;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
                ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
                ctx.stroke();
            }

            // 细微的瓷器细节纹理
            for (let i = 0; i < 20; i += 1) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * size * 0.008 + size * 0.003;
                ctx.fillStyle = `rgba(220, 210, 200, ${Math.random() * 0.1})`;
                ctx.fillRect(x, y, r, r);
            }
        } else if (style === 'celadon') {
            // 青瓷 - 温润的青绿色光泽
            const gloss = ctx.createRadialGradient(
                size * 0.3,
                size * 0.25,
                size * 0.08,
                size * 0.35,
                size * 0.3,
                size * 0.88
            );
            gloss.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            gloss.addColorStop(0.3, 'rgba(240, 250, 245, 0.4)');
            gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(0, 0, size, size);

            // 青瓷特有的细纹
            ctx.strokeStyle = 'rgba(100, 130, 110, 0.15)';
            ctx.lineWidth = 0.6;
            for (let i = 0; i < 10; i += 1) {
                const angle = (Math.PI * 2 * i) / 10;
                const cx = size * 0.5;
                const cy = size * 0.5;
                const r1 = size * 0.18;
                const r2 = size * 0.75;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
                ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
                ctx.stroke();
            }

            // 青瓷的细微纹理点缀
            ctx.fillStyle = 'rgba(100, 140, 120, 0.06)';
            for (let i = 0; i < 25; i += 1) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * size * 0.01 + size * 0.004;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (style === 'marble') {
            // 大理石纹理 - 更自然的大理石纹路
            ctx.strokeStyle = 'rgba(150, 150, 150, 0.2)';
            ctx.lineWidth = 1.2;
            const waves = 10;
            for (let i = 0; i < waves; i += 1) {
                ctx.beginPath();
                const startY = size * (0.08 + i * 0.092);
                ctx.moveTo(0, startY);
                for (let x = 0; x <= size; x += size / 32) {
                    const phase = (x / size) * Math.PI * 3.5;
                    const y = startY + Math.sin(phase + i * 0.8) * size * 0.035;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // 大理石的斑点（深灰色）
            ctx.fillStyle = 'rgba(100, 100, 100, 0.12)';
            for (let i = 0; i < 20; i += 1) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * size * 0.025 + size * 0.008;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // 添加浅色大理石细节
            ctx.fillStyle = 'rgba(200, 200, 200, 0.08)';
            for (let i = 0; i < 15; i += 1) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * size * 0.015 + size * 0.005;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (style === 'brocade') {
            // 织锦纹理 - 经纬纹理
            ctx.strokeStyle = 'rgba(255, 240, 200, 0.2)';
            ctx.lineWidth = 1.2;
            const step = size / 14;
            // 经线（纵向）
            for (let x = 0; x <= size; x += step) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, size);
                ctx.stroke();
            }
            // 纬线（横向）
            ctx.strokeStyle = 'rgba(120, 80, 40, 0.18)';
            for (let y = 0; y <= size; y += step) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(size, y);
                ctx.stroke();
            }

            // 织锦花纹 - 菱形图案
            ctx.fillStyle = 'rgba(220, 180, 120, 0.12)';
            const patternSize = size / 7;
            for (let i = 0; i < 7; i += 1) {
                for (let j = 0; j < 7; j += 1) {
                    if ((i + j) % 2 === 0) {
                        const x = i * patternSize;
                        const y = j * patternSize;
                        ctx.fillRect(x + patternSize * 0.25, y + patternSize * 0.25, patternSize * 0.5, patternSize * 0.5);
                    }
                }
            }

            // 织锦光泽效果
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            for (let i = 0; i < size; i += size / 20) {
                for (let j = 0; j < size; j += size / 20) {
                    if (Math.random() > 0.6) {
                        ctx.fillRect(i, j, size / 25, size / 25);
                    }
                }
            }
        } else if (style === 'acrylic') {
            // 亚克力透明感 - 现代蓝色透明效果
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1.8;
            const step = size / 12;
            for (let i = 1; i < 12; i += 1) {
                const pos = i * step;
                // 垂直线
                ctx.beginPath();
                ctx.moveTo(pos, 0);
                ctx.lineTo(pos, size);
                ctx.stroke();
                // 水平线
                ctx.beginPath();
                ctx.moveTo(0, pos);
                ctx.lineTo(size, pos);
                ctx.stroke();
            }

            // 亚克力光晕和透光效果
            const highlight = ctx.createRadialGradient(
                size * 0.25,
                size * 0.25,
                size * 0.1,
                size * 0.25,
                size * 0.25,
                size * 0.7
            );
            highlight.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            highlight.addColorStop(0.5, 'rgba(220, 240, 255, 0.25)');
            highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = highlight;
            ctx.fillRect(0, 0, size, size);

            // 添加亚克力的气泡效果（微妙）
            ctx.fillStyle = 'rgba(200, 220, 255, 0.08)';
            for (let i = 0; i < 8; i += 1) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * size * 0.02 + size * 0.005;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawInfluence() {
        const pad = render.pad;
        const cell = render.cell;

        // 收集所有棋子位置和它们所属的组
        const blackStones = [];
        const whiteStones = [];
        const groupInfluence = new Map(); // 存储每个组的强度（基于气数）

        const visited = new Set();
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (value === 0) continue;

                const key = `${x},${y}`;
                if (visited.has(key)) continue;

                const group = getGroup(state.board, x, y);
                group.stones.forEach(stone => visited.add(`${stone.x},${stone.y}`));

                // 计算组的强度：气越多，影响力越强
                const strength = Math.min(group.liberties.size / 8, 1); // 最多8气为满强度

                group.stones.forEach(stone => {
                    if (value === 1) {
                        blackStones.push({ x: stone.x, y: stone.y, strength });
                    } else {
                        whiteStones.push({ x: stone.x, y: stone.y, strength });
                    }
                });
            }
        }

        // 如果棋盘上没有棋子，不显示势力
        if (blackStones.length === 0 && whiteStones.length === 0) {
            return;
        }

        // 计算每个空点的势力
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                if (state.board[y][x] !== 0) continue;

                // 计算黑白双方的总影响力
                let blackInfluence = 0;
                let whiteInfluence = 0;

                blackStones.forEach(stone => {
                    const dist = Math.abs(x - stone.x) + Math.abs(y - stone.y);
                    if (dist <= 5) {
                        // 距离越近影响力越大，组的强度也会影响
                        const influence = stone.strength * (1 - dist / 6);
                        blackInfluence += influence;
                    }
                });

                whiteStones.forEach(stone => {
                    const dist = Math.abs(x - stone.x) + Math.abs(y - stone.y);
                    if (dist <= 5) {
                        const influence = stone.strength * (1 - dist / 6);
                        whiteInfluence += influence;
                    }
                });

                const cx = pad + x * cell;
                const cy = pad + y * cell;
                const rectSize = cell * 0.88;

                // 根据双方影响力差异决定颜色
                const totalInfluence = blackInfluence + whiteInfluence;
                if (totalInfluence < 0.1) continue; // 影响力太小，不显示

                if (blackInfluence > whiteInfluence * 1.3) {
                    // 黑方优势区
                    const alpha = Math.min(blackInfluence / totalInfluence * 0.4, 0.4);
                    ctx.fillStyle = `rgba(50, 50, 50, ${alpha})`;
                    ctx.fillRect(cx - rectSize / 2, cy - rectSize / 2, rectSize, rectSize);
                } else if (whiteInfluence > blackInfluence * 1.3) {
                    // 白方优势区
                    const alpha = Math.min(whiteInfluence / totalInfluence * 0.45, 0.45);
                    ctx.fillStyle = `rgba(245, 245, 245, ${alpha})`;
                    ctx.fillRect(cx - rectSize / 2, cy - rectSize / 2, rectSize, rectSize);
                } else if (totalInfluence > 0.2) {
                    // 争夺区（双方势力接近）
                    const alpha = Math.min(totalInfluence * 0.15, 0.15);
                    ctx.fillStyle = `rgba(180, 150, 100, ${alpha})`;
                    ctx.fillRect(cx - rectSize / 2, cy - rectSize / 2, rectSize, rectSize);
                }
            }
        }
    }

    function drawStones() {
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.45;

        // 计算每个棋子组的气数（用于危险状态检测）
        const dangerGroups = new Set();
        if (state.showConnections) {
            const visited = new Set();
            for (let y = 0; y < config.size; y += 1) {
                for (let x = 0; x < config.size; x += 1) {
                    const value = state.board[y][x];
                    if (value === 0) continue;
                    const key = `${x},${y}`;
                    if (visited.has(key)) continue;

                    const group = getGroup(state.board, x, y);
                    group.stones.forEach(stone => visited.add(`${stone.x},${stone.y}`));

                    // 如果这个组只有1气，标记为危险
                    if (group.liberties.size === 1) {
                        group.stones.forEach(stone => dangerGroups.add(`${stone.x},${stone.y}`));
                    }
                }
            }
        }

        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (!value) {
                    continue;
                }

                // 如果这是最后落下的棋子且手部动画还在进行中且进度 < 0.4，则隐藏它
                if (state.handAnimation && state.lastMove &&
                    x === state.lastMove.x && y === state.lastMove.y &&
                    state.handAnimation.progress < 0.4) {
                    continue;
                }

                const cx = pad + x * cell;
                const cy = pad + y * cell;
                const isDanger = dangerGroups.has(`${x},${y}`);

                // 先绘制棋子阴影
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = radius * 0.3;
                ctx.shadowOffsetX = radius * 0.15;
                ctx.shadowOffsetY = radius * 0.15;

                ctx.fillStyle = value === 1 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)';
                ctx.beginPath();
                ctx.arc(cx + radius * 0.1, cy + radius * 0.1, radius, 0, Math.PI * 2);
                ctx.fill();

                // 重置阴影
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // 绘制棋子主体
                const gradient = ctx.createRadialGradient(
                    cx - radius * 0.4,
                    cy - radius * 0.4,
                    radius * 0.15,
                    cx,
                    cy,
                    radius
                );
                if (value === 1) {
                    gradient.addColorStop(0, '#666');
                    gradient.addColorStop(0.4, '#333');
                    gradient.addColorStop(1, '#0a0a0a');
                } else {
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(0.6, '#f0f0f0');
                    gradient.addColorStop(1, '#d0d0d0');
                }
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();

                // 棋子边缘高光
                if (value === 2) {
                    const highlight = ctx.createRadialGradient(
                        cx - radius * 0.5,
                        cy - radius * 0.5,
                        0,
                        cx - radius * 0.5,
                        cy - radius * 0.5,
                        radius * 0.6
                    );
                    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.fillStyle = highlight;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 棋子外边框
                ctx.strokeStyle = value === 1 ? 'rgba(0, 0, 0, 0.5)' : 'rgba(150, 150, 150, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();

                // 如果处于危险状态（叫吃），绘制红色警告边框
                if (isDanger) {
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                    ctx.lineWidth = 3.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
                    ctx.stroke();

                    // 添加内侧的红色光晕
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
    }

    function drawConnections() {
        const pad = render.pad;
        const cell = render.cell;
        const lineWidth = cell * 0.25;
        const visited = new Set();
        const connections = [];

        // 收集所有连接（只包括上下左右）
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (value === 0) continue;

                const neighbors = getNeighbors(x, y, config.size);
                for (const neighbor of neighbors) {
                    if (state.board[neighbor.y][neighbor.x] !== value) continue;

                    // 避免重复绘制同一条连接
                    const key1 = `${x},${y}-${neighbor.x},${neighbor.y}`;
                    const key2 = `${neighbor.x},${neighbor.y}-${x},${y}`;
                    if (visited.has(key1) || visited.has(key2)) continue;
                    visited.add(key1);

                    connections.push({
                        sx: pad + x * cell,
                        sy: pad + y * cell,
                        ex: pad + neighbor.x * cell,
                        ey: pad + neighbor.y * cell,
                        color: value
                    });
                }
            }
        }

        // 先绘制所有边框（立体效果）
        connections.forEach(conn => {
            ctx.strokeStyle = conn.color === 1
                ? 'rgba(0, 0, 0, 0.25)'
                : 'rgba(100, 100, 100, 0.35)';
            ctx.lineWidth = lineWidth + 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(conn.sx, conn.sy);
            ctx.lineTo(conn.ex, conn.ey);
            ctx.stroke();
        });

        // 再绘制所有主体连接线
        connections.forEach(conn => {
            ctx.strokeStyle = conn.color === 1
                ? 'rgba(30, 30, 30, 0.6)'
                : 'rgba(230, 230, 230, 0.7)';
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(conn.sx, conn.sy);
            ctx.lineTo(conn.ex, conn.ey);
            ctx.stroke();
        });
    }

    function drawLiberties() {
        const pad = render.pad;
        const cell = render.cell;
        const visited = new Set();
        const libertiesMap = new Map();

        // 收集所有棋子组的气
        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                const value = state.board[y][x];
                if (value === 0) {
                    continue;
                }
                const key = `${x},${y}`;
                if (visited.has(key)) {
                    continue;
                }

                const group = getGroup(state.board, x, y);
                group.stones.forEach(stone => visited.add(`${stone.x},${stone.y}`));

                // 记录每个气属于哪个颜色的棋子组
                group.liberties.forEach(libertyKey => {
                    if (!libertiesMap.has(libertyKey)) {
                        libertiesMap.set(libertyKey, new Set());
                    }
                    libertiesMap.get(libertyKey).add(value);
                });
            }
        }

        // 绘制气的标记
        libertiesMap.forEach((colors, libertyKey) => {
            const [lx, ly] = libertyKey.split(',').map(Number);
            const cx = pad + lx * cell;
            const cy = pad + ly * cell;
            const radius = cell * 0.15;

            // 如果这个点同时是黑白两方的气，绘制混合标记
            if (colors.size === 2) {
                // 绘制左半黑色，右半白色
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.clip();

                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(cx - radius, cy - radius, radius, radius * 2);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(cx, cy - radius, radius, radius * 2);

                ctx.restore();

                ctx.strokeStyle = 'rgba(128, 128, 128, 0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // 单一颜色的气
                const color = [...colors][0];
                if (color === 1) {
                    // 黑棋的气用半透明黑色
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                } else {
                    // 白棋的气用半透明白色
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
                }
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });
    }

    function drawEyes() {
        const pad = render.pad;
        const cell = render.cell;
        const eyes = findEyes();

        eyes.forEach(eye => {
            const cx = pad + eye.x * cell;
            const cy = pad + eye.y * cell;
            const radius = cell * 0.2;

            if (eye.isReal) {
                // 真眼（活眼）- 实心圆，带光晕
                if (eye.color === 1) {
                    // 黑方的活眼
                    ctx.fillStyle = 'rgba(0, 150, 0, 0.7)';
                    ctx.strokeStyle = 'rgba(0, 200, 0, 0.8)';
                } else {
                    // 白方的活眼
                    ctx.fillStyle = 'rgba(0, 180, 0, 0.7)';
                    ctx.strokeStyle = 'rgba(0, 220, 0, 0.9)';
                }
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.stroke();

                // 外层光晕
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // 假眼（死眼）- 空心圆带叉
                if (eye.color === 1) {
                    ctx.strokeStyle = 'rgba(200, 0, 0, 0.7)';
                } else {
                    ctx.strokeStyle = 'rgba(220, 0, 0, 0.8)';
                }

                // 外圆
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();

                // 叉号
                ctx.lineWidth = 2;
                const crossSize = radius * 0.6;
                ctx.beginPath();
                ctx.moveTo(cx - crossSize, cy - crossSize);
                ctx.lineTo(cx + crossSize, cy + crossSize);
                ctx.moveTo(cx + crossSize, cy - crossSize);
                ctx.lineTo(cx - crossSize, cy + crossSize);
                ctx.stroke();
            }
        });
    }

    function findEyes() {
        const eyes = [];

        for (let y = 0; y < config.size; y += 1) {
            for (let x = 0; x < config.size; x += 1) {
                // 只检查空点
                if (state.board[y][x] !== 0) continue;

                // 检查是否是眼位
                const eyeInfo = checkEye(x, y);
                if (eyeInfo) {
                    eyes.push({ x, y, color: eyeInfo.color, isReal: eyeInfo.isReal });
                }
            }
        }

        return eyes;
    }

    function checkEye(x, y) {
        // 获取上下左右的邻居
        const neighbors = getNeighbors(x, y, config.size);
        if (neighbors.length === 0) return null;

        // 检查所有邻居是否都是同一颜色
        const firstColor = state.board[neighbors[0].y][neighbors[0].x];
        if (firstColor === 0) return null;

        for (const neighbor of neighbors) {
            const color = state.board[neighbor.y][neighbor.x];
            if (color !== firstColor) {
                return null; // 邻居颜色不一致，不是眼
            }
        }

        // 这是一个潜在的眼位，现在判断是真眼还是假眼
        const isReal = isRealEye(x, y, firstColor);

        return { color: firstColor, isReal };
    }

    function isRealEye(x, y, color) {
        // 获取斜向的四个角点
        const diagonals = [];
        if (x > 0 && y > 0) diagonals.push({ x: x - 1, y: y - 1 });
        if (x < config.size - 1 && y > 0) diagonals.push({ x: x + 1, y: y - 1 });
        if (x > 0 && y < config.size - 1) diagonals.push({ x: x - 1, y: y + 1 });
        if (x < config.size - 1 && y < config.size - 1) diagonals.push({ x: x + 1, y: y + 1 });

        const opponent = color === 1 ? 2 : 1;
        let opponentCorners = 0;
        let adjacentOpponentCorners = [];

        diagonals.forEach(diag => {
            if (state.board[diag.y][diag.x] === opponent) {
                opponentCorners += 1;
                adjacentOpponentCorners.push(diag);
            }
        });

        // 判断真假眼的规则：
        // - 在角上（2个斜角）：不能有对方棋子
        // - 在边上（3个斜角）：最多1个对方棋子
        // - 在中央（4个斜角）：最多2个对方棋子，且必须在对角位置（不相邻）

        if (diagonals.length === 2) {
            // 在角上
            return opponentCorners === 0;
        } else if (diagonals.length === 3) {
            // 在边上
            return opponentCorners <= 1;
        } else {
            // 在中央（4个斜角）
            if (opponentCorners > 2) {
                return false;
            }
            if (opponentCorners === 2) {
                // 检查两个对方棋子是否在对角位置（不相邻）
                const [c1, c2] = adjacentOpponentCorners;
                // 对角位置：x坐标和y坐标都相差2
                const isDiagonal = Math.abs(c1.x - c2.x) === 2 && Math.abs(c1.y - c2.y) === 2;
                return isDiagonal; // 对角位置是真眼，相邻位置是假眼
            }
            return true;
        }
    }

    function drawLastMove() {
        if (!state.lastMove || state.lastMove.pass) {
            return;
        }
        const pad = render.pad;
        const cell = render.cell;
        const radius = cell * 0.18;
        const cx = pad + state.lastMove.x * cell;
        const cy = pad + state.lastMove.y * cell;

        // 只绘制一个简洁的标记圆圈
        ctx.strokeStyle = state.lastMove.color === 1 ? '#f2f2f2' : '#111';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    function getStarPoints(size) {
        if (size < 7 || size % 2 === 0) {
            return [];
        }
        const center = Math.floor(size / 2);
        const cornerDistance = size >= 13 ? 3 : 2;
        const low = cornerDistance;
        const high = size - 1 - cornerDistance;
        if (low >= high) {
            return [];
        }
        const points = [
            { x: low, y: low },
            { x: low, y: high },
            { x: high, y: low },
            { x: high, y: high },
            { x: center, y: center }
        ];
        if (size >= 15) {
            points.push(
                { x: low, y: center },
                { x: high, y: center },
                { x: center, y: low },
                { x: center, y: high }
            );
        }
        return points;
    }

    function startHandAnimation(x, y, color) {
        if (!state.showHandAnimation || !render.handImage) {
            return false; // SVG图像未加载完成或禁用动画
        }

        const pad = render.pad;
        const cell = render.cell;
        const targetX = pad + x * cell;
        const targetY = pad + y * cell;

        // 黑棋从底部边缘进入（玩家坐在下方）
        // 白棋从顶部边缘进入（AI坐在上方）
        const isBlack = color === 1;

        state.handAnimation = {
            targetX: targetX,
            targetY: targetY,
            color: color,
            isBlack: isBlack,
            progress: 0,
            duration: 1800, // 动画持续时间，放慢速度
            startTime: Date.now()
        };

        animateHand();
        return true;
    }

    function animateHand() {
        if (!state.handAnimation) return;

        const elapsed = Date.now() - state.handAnimation.startTime;
        state.handAnimation.progress = Math.min(elapsed / state.handAnimation.duration, 1);

        draw();

        if (state.handAnimation.progress < 1) {
            requestAnimationFrame(animateHand);
        } else {
            // 动画结束，清除相关状态
            state.handAnimation = null;
            state.pendingMove = null;
            draw();
        }
    }

    function drawHandAnimation() {
        if (!state.handAnimation || !render.handImage) return;

        const anim = state.handAnimation;
        const progress = anim.progress;
        const isBlack = anim.isBlack;

        // 简单的三阶段动画
        // 阶段1 (0-0.4): 从边缘移入到目标位置
        // 阶段2 (0.4-0.6): 停留在目标位置
        // 阶段3 (0.6-1.0): 移出到边缘

        let currentX, currentY, alpha, scale;

        const edgeY = isBlack ? render.size - render.cell * 0.2 : -render.cell * 0.2;

        // 根据棋盘大小调整手部大小：9路最大，13路中等，19路最小
        let handSizeMultiplier;
        if (config.size === 9) {
            handSizeMultiplier = 1.20;
        } else if (config.size === 13) {
            handSizeMultiplier = 1.10;
        } else {
            handSizeMultiplier = 1.05;
        }
        const handSize = render.cell * handSizeMultiplier;
        const imageWidth = render.handImage.naturalWidth || render.handImage.width || 1;
        const imageHeight = render.handImage.naturalHeight || render.handImage.height || 1;
        const imageRatio = imageWidth / imageHeight;
        const drawWidth = imageRatio >= 1 ? handSize : handSize * imageRatio;
        const drawHeight = imageRatio >= 1 ? handSize / imageRatio : handSize;

        if (progress < 0.4) {
            // 阶段1: 移入
            const t = easeInOutCubic(progress / 0.4);
            currentX = anim.targetX;
            currentY = edgeY + (anim.targetY - edgeY) * t;
            alpha = Math.min(progress / 0.1, 1);
            scale = 0.8 + 0.2 * t;
        } else if (progress < 0.6) {
            // 阶段2: 停留
            currentX = anim.targetX;
            currentY = anim.targetY;
            alpha = 1;
            scale = 1;
        } else {
            // 阶段3: 移出
            const t = easeInOutCubic((progress - 0.6) / 0.4);
            currentX = anim.targetX;
            currentY = anim.targetY + (edgeY - anim.targetY) * t;
            alpha = Math.max(1 - (progress - 0.8) / 0.2, 0);
            scale = 1 - 0.2 * t;
        }

        // 绘制手部SVG图像
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(currentX, currentY);

        // 白棋从上方来，旋转180度
        if (!isBlack) {
            ctx.rotate(Math.PI);
        }

        ctx.scale(scale, scale);

        // 绘制手部图像，居中显示
        ctx.drawImage(
            render.handImage,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight
        );

        ctx.restore();
    }


    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    init();
})();
