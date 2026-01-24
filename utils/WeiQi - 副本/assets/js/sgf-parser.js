/**
 * SGF 棋谱解析与序列化模块
 *
 * 支持标准 SGF (Smart Game Format) 格式的读写
 * 用于围棋棋局导入、导出和网络传输
 *
 * SGF 标准: https://www.red-bean.com/sgf/spec.html
 */

class SGFParser {
    /**
     * 初始化 SGF 解析器
     * @param {string} sgfString - SGF 格式的棋谱字符串
     */
    constructor(sgfString) {
        this.sgfString = sgfString.trim();
        this.position = 0;
        this.gameTree = null;
    }

    /**
     * 解析 SGF 字符串
     * @returns {Object} 解析后的游戏树对象
     */
    parse() {
        this.position = 0;
        this.gameTree = this._parseCollection();
        return this.gameTree;
    }

    /**
     * 解析集合（可能包含多个序列）
     * @private
     */
    _parseCollection() {
        const sequences = [];

        while (this.position < this.sgfString.length) {
            this._skipWhitespace();
            if (this.position >= this.sgfString.length) break;

            if (this.sgfString[this.position] === '(') {
                sequences.push(this._parseGameTree());
            }
        }

        return sequences.length === 1 ? sequences[0] : sequences;
    }

    /**
     * 解析游戏树（单个序列）
     * @private
     */
    _parseGameTree() {
        if (this.sgfString[this.position] !== '(') {
            throw new Error('Expected "(" at position ' + this.position);
        }

        this.position++;  // 跳过 '('
        this._skipWhitespace();

        const sequence = [];

        while (this.position < this.sgfString.length && this.sgfString[this.position] !== ')') {
            this._skipWhitespace();

            if (this.sgfString[this.position] === ';') {
                sequence.push(this._parseNode());
            } else if (this.sgfString[this.position] === '(') {
                // 变化线（暂不支持）
                this._skipNestedGameTree();
            } else {
                this.position++;
            }
        }

        if (this.sgfString[this.position] === ')') {
            this.position++;  // 跳过 ')'
        }

        return sequence;
    }

    /**
     * 解析节点（单步棋局）
     * @private
     */
    _parseNode() {
        if (this.sgfString[this.position] !== ';') {
            throw new Error('Expected ";" at position ' + this.position);
        }

        this.position++;  // 跳过 ';'
        this._skipWhitespace();

        const node = {};

        while (this.position < this.sgfString.length &&
               this.sgfString[this.position] !== ';' &&
               this.sgfString[this.position] !== ')' &&
               this.sgfString[this.position] !== '(') {

            this._skipWhitespace();

            if (this.position >= this.sgfString.length) break;

            const propMatch = this._parseProperty();
            if (propMatch) {
                const { key, value } = propMatch;

                if (key in node) {
                    // 多值属性
                    if (Array.isArray(node[key])) {
                        node[key].push(value);
                    } else {
                        node[key] = [node[key], value];
                    }
                } else {
                    node[key] = value;
                }
            }
        }

        return node;
    }

    /**
     * 解析属性（单个 SGF 属性）
     * @private
     * @returns {Object} { key: string, value: any }
     */
    _parseProperty() {
        this._skipWhitespace();

        if (this.position >= this.sgfString.length) return null;

        // 读取属性名（大写字母）
        let key = '';
        while (this.position < this.sgfString.length &&
               /[A-Z]/.test(this.sgfString[this.position])) {
            key += this.sgfString[this.position];
            this.position++;
        }

        if (!key) return null;

        this._skipWhitespace();

        // 读取属性值
        const values = [];
        while (this.position < this.sgfString.length &&
               this.sgfString[this.position] === '[') {
            values.push(this._parsePropertyValue());
            this._skipWhitespace();
        }

        // 合并多个值
        let value = values.length === 1 ? values[0] : values.join(',');

        return { key, value };
    }

    /**
     * 解析单个属性值
     * @private
     */
    _parsePropertyValue() {
        if (this.sgfString[this.position] !== '[') {
            throw new Error('Expected "[" at position ' + this.position);
        }

        this.position++;  // 跳过 '['

        let value = '';
        while (this.position < this.sgfString.length && this.sgfString[this.position] !== ']') {
            if (this.sgfString[this.position] === '\\') {
                // 转义符
                this.position++;
                if (this.position < this.sgfString.length) {
                    value += this.sgfString[this.position];
                    this.position++;
                }
            } else {
                value += this.sgfString[this.position];
                this.position++;
            }
        }

        if (this.sgfString[this.position] === ']') {
            this.position++;  // 跳过 ']'
        }

        return value.trim();
    }

    /**
     * 跳过嵌套的游戏树（变化线，暂不支持）
     * @private
     */
    _skipNestedGameTree() {
        let depth = 0;

        while (this.position < this.sgfString.length) {
            if (this.sgfString[this.position] === '(') {
                depth++;
            } else if (this.sgfString[this.position] === ')') {
                depth--;
                if (depth === 0) {
                    this.position++;
                    break;
                }
            }
            this.position++;
        }
    }

    /**
     * 跳过空白字符
     * @private
     */
    _skipWhitespace() {
        while (this.position < this.sgfString.length && /\s/.test(this.sgfString[this.position])) {
            this.position++;
        }
    }
}

/**
 * SGF 序列化器 - 将游戏状态转换为 SGF 格式
 */
class SGFSerializer {
    /**
     * 将游戏状态序列化为 SGF 字符串
     * @param {Array} history - 移动历史数组
     * @param {number} size - 棋盘大小
     * @param {Object} metadata - 游戏元数据（可选）
     * @returns {string} SGF 格式的棋谱字符串
     */
    static serializeGame(history, size = 19, metadata = {}) {
        const parts = ['(;'];

        // 添加 SGF 属性
        parts.push('FF[4]');  // 文件格式版本
        parts.push('GM[1]');  // 游戏类型（1=围棋）
        parts.push(`SZ[${size}]`);  // 棋盘大小

        // 添加元数据
        if (metadata.blackPlayer) {
            parts.push(`PB[${this._escapeValue(metadata.blackPlayer)}]`);
        }
        if (metadata.whitePlayer) {
            parts.push(`PW[${this._escapeValue(metadata.whitePlayer)}]`);
        }
        if (metadata.date) {
            parts.push(`DT[${metadata.date}]`);
        }
        if (metadata.location) {
            parts.push(`PC[${this._escapeValue(metadata.location)}]`);
        }
        if (metadata.komi) {
            parts.push(`KM[${metadata.komi}]`);
        }
        if (metadata.handicap) {
            parts.push(`HA[${metadata.handicap}]`);
        }
        if (metadata.comment) {
            parts.push(`GC[${this._escapeValue(metadata.comment)}]`);
        }

        // 添加移动
        for (const move of history) {
            parts.push(';');

            // 颜色标记
            const colorChar = move.color === 1 ? 'B' : 'W';

            if (move.pass) {
                // 停手用空值表示
                parts.push(`${colorChar}[]`);
            } else {
                // 将坐标转换为 SGF 格式
                const sgfCoord = this._coordToSGF(move.x, move.y);
                parts.push(`${colorChar}[${sgfCoord}]`);
            }

            // 添加可选的注解
            if (move.comment) {
                parts.push(`C[${this._escapeValue(move.comment)}]`);
            }
            if (move.timeLeft) {
                parts.push(`BL[${move.timeLeft}]`);
            }
        }

        parts.push(')');

        return parts.join('');
    }

    /**
     * 棋盘坐标转 SGF 坐标
     * @private
     * @param {number} x - X 坐标 (0-18)
     * @param {number} y - Y 坐标 (0-18)
     * @returns {string} SGF 坐标 (a1-s19)
     */
    static _coordToSGF(x, y) {
        return String.fromCharCode(97 + x, 97 + y);
    }

    /**
     * 转义 SGF 值中的特殊字符
     * @private
     */
    static _escapeValue(value) {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/]/g, '\\]')
            .replace(/\n/g, '\\n');
    }
}

/**
 * SGF 转游戏状态的转换器
 */
class SGFToGameState {
    /**
     * 将解析后的 SGF 转换为游戏状态
     * @param {Array|Object} gameTree - SGF 解析器返回的游戏树
     * @param {number} size - 棋盘大小（默认 19）
     * @returns {Object} 游戏状态对象
     */
    static convert(gameTree, size = 19) {
        // 确保 gameTree 是数组
        const sequence = Array.isArray(gameTree) ? gameTree : [gameTree];

        // 初始化棋盘
        const board = Array(size).fill(0).map(() => Array(size).fill(0));
        const history = [];
        let koPoint = null;

        // 提取棋盘大小（如果 SGF 中有指定）
        if (sequence.length > 0 && sequence[0].SZ) {
            size = parseInt(sequence[0].SZ);
        }

        // 处理每个节点
        for (let i = 0; i < sequence.length; i++) {
            const node = sequence[i];

            // 首个节点通常是游戏信息
            if (i === 0) {
                continue;
            }

            // 检查黑棋移动
            if (node.B) {
                const move = this._parseMove(node.B, 1, board, size);
                if (move) {
                    history.push(move);
                }
            }

            // 检查白棋移动
            if (node.W) {
                const move = this._parseMove(node.W, 2, board, size);
                if (move) {
                    history.push(move);
                }
            }
        }

        return {
            size: size,
            board: board,
            history: history,
            koPoint: koPoint,
            moveCount: history.length
        };
    }

    /**
     * 解析单个移动
     * @private
     */
    static _parseMove(moveValue, color, board, size) {
        if (!moveValue || moveValue === '') {
            // 停手
            return {
                color: color,
                pass: true,
                x: -1,
                y: -1
            };
        }

        // 转换 SGF 坐标到棋盘坐标
        const coords = this._sgfToCoord(moveValue);
        if (!coords) {
            return null;
        }

        const [x, y] = coords;

        // 验证坐标有效性
        if (x < 0 || x >= size || y < 0 || y >= size) {
            return null;
        }

        // 在棋盘上放置棋子
        if (board[y][x] === 0) {
            board[y][x] = color;
        }

        return {
            color: color,
            pass: false,
            x: x,
            y: y
        };
    }

    /**
     * SGF 坐标转棋盘坐标
     * @private
     * @param {string} sgfCoord - SGF 坐标 (e.g., "pd", "q4")
     * @returns {Array|null} [x, y] 或 null
     */
    static _sgfToCoord(sgfCoord) {
        if (!sgfCoord || sgfCoord.length < 2) {
            return null;
        }

        const x = sgfCoord.charCodeAt(0) - 97;
        const y = sgfCoord.charCodeAt(1) - 97;

        return [x, y];
    }
}

/**
 * 全局 SGF 工具函数
 */

/**
 * 将游戏历史序列化为 SGF
 * @param {Array} history - 移动历史
 * @param {number} size - 棋盘大小
 * @param {Object} metadata - 游戏元数据
 * @returns {string} SGF 字符串
 */
function serializeGameToSGF(history, size = 19, metadata = {}) {
    return SGFSerializer.serializeGame(history, size, metadata);
}

/**
 * 解析 SGF 字符串
 * @param {string} sgfString - SGF 格式字符串
 * @returns {Object} 解析后的游戏树
 */
function parseSGF(sgfString) {
    const parser = new SGFParser(sgfString);
    return parser.parse();
}

/**
 * 将 SGF 转换为游戏状态
 * @param {string} sgfString - SGF 字符串
 * @param {number} size - 棋盘大小
 * @returns {Object} 游戏状态对象
 */
function sgfToGameState(sgfString, size = 19) {
    const gameTree = parseSGF(sgfString);
    return SGFToGameState.convert(gameTree, size);
}

/**
 * 将游戏状态转换为 SGF
 * @param {Array} history - 移动历史
 * @param {number} size - 棋盘大小
 * @param {Object} metadata - 元数据
 * @returns {string} SGF 字符串
 */
function gameStateToSGF(history, size = 19, metadata = {}) {
    return SGFSerializer.serializeGame(history, size, metadata);
}
