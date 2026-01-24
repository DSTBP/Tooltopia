/*
 * @Description: 
 * @Author: DSTBP
 * @Date: 2026-01-24 10:10:03
 * @LastEditTime: 2026-01-24 13:26:06
 * @LastEditors: DSTBP
 */
/**
 * AI Manager - 管理 KataGo Web Worker 通信 (Fixed)
 */
class AIManager {
    constructor() {
        this.worker = null;
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;
        this.isReady = false;
        this.config = { modelSize: '6b', difficulty: 'medium', size: 19 };
    }

    async initialize(config = {}) {
        return new Promise((resolve, reject) => {
            // [修复] 检测本地文件运行
            if (window.location.protocol === 'file:') {
                console.warn('[AI] 检测到 file:// 协议，Web Worker 无法运行。降级到启发式 AI。');
                reject(new Error('SecurityError: Cannot run Web Worker from file:// protocol.'));
                return;
            }

            try {
                this.config = { ...this.config, ...config };
                if (typeof Worker !== 'undefined') {
                    this.worker = new Worker('./assets/js/ai-worker.js');
                    this.worker.onmessage = (event) => this._handleWorkerMessage(event);
                    this.worker.onerror = (error) => console.error('[AI] Worker error:', error);

                    const checkReady = setInterval(() => {
                        if (this.isReady) { clearInterval(checkReady); resolve(true); }
                    }, 100);
                    setTimeout(() => { clearInterval(checkReady); if (!this.isReady) console.warn('[AI] Loading...'); }, 15000);

                    this._sendCommand('init', this.config);
                } else {
                    reject(new Error('Browser does not support Web Worker'));
                }
            } catch (error) { reject(error); }
        });
    }

    async genmove(board, color, options = {}) {
        if (!this.isReady) throw new Error('AI not ready');
        return new Promise((resolve, reject) => {
            const id = ++this.requestIdCounter;
            const timeout = setTimeout(() => { this.pendingRequests.delete(id); reject(new Error('Timeout')); }, (options.timeLimit||3000)+2000);
            this.pendingRequests.set(id, { resolve: r=>{clearTimeout(timeout);resolve(r)}, reject: e=>{clearTimeout(timeout);reject(e)} });
            this._sendCommand('genmove', { board, color, options: { timeLimit: options.timeLimit||3000, difficulty: options.difficulty||this.config.difficulty } }, id);
        });
    }

    _sendCommand(command, args, id = null) {
        if (!this.worker) return;
        this.worker.postMessage({ command, args, id: id || this.requestIdCounter });
    }

    _handleWorkerMessage(event) {
        const { type, id, result } = event.data;
        if (type === 'ready') this.isReady = true;
        if (type === 'result' && id && this.pendingRequests.has(id)) {
            this.pendingRequests.get(id).resolve(result);
            this.pendingRequests.delete(id);
        }
    }
}

let globalAIManager = null;
function getAIManager() { if (!globalAIManager) globalAIManager = new AIManager(); return globalAIManager; }
async function initializeAI(config = {}) { return getAIManager().initialize(config); }
window.AIManager = AIManager;
window.getAIManager = getAIManager;
window.initializeAI = initializeAI;