/**
 * WGo.js UI 适配层 (Final Fix v4)
 */

let wgoBoard = null;
let boardClickCallback = null;

function initWGoBoard(size, theme, callback) {
    if (typeof WGo === 'undefined') {
        console.error('WGo.js 库未加载');
        return false;
    }

    const boardContainer = document.getElementById('board');
    if (!boardContainer) return false;

    // 清空容器
    boardContainer.innerHTML = '';

    // 更新回调函数
    if (callback) {
        boardClickCallback = callback;
    }

    try {
        wgoBoard = new WGo.Board(boardContainer, {
            size: size,
            width: boardContainer.clientWidth || 560, // 优先使用容器实际宽度
            background: getWGoThemePath(theme)
        });

        wgoBoard.addEventListener('click', (x, y) => {
            if (boardClickCallback) {
                boardClickCallback({
                    isWGoEvent: true,
                    coord: { x: x, y: y }
                });
            }
        });

        return true;
    } catch (error) {
        console.error('WGo.js 初始化失败:', error);
        return false;
    }
}

function syncBoardToWGo(board, lastMove) {
    if (!wgoBoard) return false;
    try {
        // 1. 清除所有对象
        wgoBoard.removeAllObjects();
        
        const stones = [];
        // 安全获取颜色常量，防止 WGo 版本差异
        const BLACK = WGo.B || 1;
        const WHITE = WGo.W || -1;

        for (let y = 0; y < board.length; y++) {
            for (let x = 0; x < board[y].length; x++) {
                const val = board[y][x];
                if (val === 1) {
                    stones.push({ x: x, y: y, c: BLACK });
                } else if (val === 2) {
                    stones.push({ x: x, y: y, c: WHITE });
                }
            }
        }
        
        // 2. 一次性添加所有棋子
        if (stones.length > 0) {
            wgoBoard.addObject(stones);
        }
        
        // 3. 添加最后落子标记
        if (lastMove && !lastMove.pass) {
            wgoBoard.addObject({
                x: lastMove.x,
                y: lastMove.y,
                type: "CR" 
            });
        }
        
        // 4. 确保宽度同步
        const container = document.getElementById('board');
        if (container && container.clientWidth > 0 && wgoBoard.width !== container.clientWidth) {
            wgoBoard.setWidth(container.clientWidth);
        }
        
        return true;
    } catch (error) {
        console.error('同步棋盘失败:', error);
        return false;
    }
}

// ... 其他辅助函数保持不变 ...
function resizeBoardToWGo(cssSize) { if (wgoBoard) wgoBoard.setWidth(cssSize); }
function getWGoThemePath(theme) { return undefined; }
function showBoardAssistance(options, board) { }
function changeBoardTheme(theme) { }
function destroyWGoBoard() {
    const container = document.getElementById('board');
    if (container) container.innerHTML = '';
    wgoBoard = null;
}
function isWGoBoardReady() { return wgoBoard !== null; }

window.WGoAdapter = {
    initWGoBoard,
    syncBoardToWGo,
    showBoardAssistance,
    changeBoardTheme,
    resizeBoardToWGo,
    destroyWGoBoard,
    isWGoBoardReady
};