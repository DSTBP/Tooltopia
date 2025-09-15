class BinaryMatrixSolver {
    /**
     * 点灯游戏求解器
     * 核心逻辑：首行变量推导 + GF(2)高斯消元 + 自由变量枚举，获取最少翻转次数与第一行点灯路径
     * @param {number[][]} matrix 初始二进制矩阵（m行n列，元素为0或1）
     */
    constructor(matrix) {
        this._validateMatrix(matrix);
        this.matrix = matrix;
        this.m = matrix.length;
        this.n = this.m > 0 ? matrix[0].length : 0;

        this._A = [];
        this._b = [];
        this._hasSolution = false;
        this._minFlips = -1;
        this._firstRowPath = [];
        this._fullPlan = [];
    }

    _validateMatrix(matrix) {
        if (!Array.isArray(matrix) || matrix.length === 0) {
            throw new Error("输入矩阵不能为空，需为非空列表");
        }
        const rowLen = matrix[0].length;
        for (const row of matrix) {
            if (!Array.isArray(row) || row.length !== rowLen) {
                throw new Error("输入矩阵需为二维列表，所有行长度必须一致");
            }
            for (const val of row) {
                if (val !== 0 && val !== 1) {
                    throw new Error("矩阵元素必须为二进制（0 或 1）");
                }
            }
        }
    }

    _deriveFirstRowSystem() {
        if (this.m === 0 || this.n === 0) {
            this._A = [];
            this._b = [];
            return;
        }

        let currCoeff = Array.from({ length: this.n }, (_, c) => 1n << BigInt(c));
        let currConst = new Array(this.n).fill(0);
        let prevCoeff = null;
        let prevConst = null;

        for (let r = 0; r < this.m - 1; r++) {
            let nextCoeff = new Array(this.n).fill(0n);
            let nextConst = new Array(this.n).fill(0);
            const currRowInit = this.matrix[r];

            for (let c = 0; c < this.n; c++) {
                let coeff = 0n;
                let constant = currRowInit[c] & 1;

                if (prevCoeff) {
                    coeff ^= prevCoeff[c];
                    constant ^= prevConst[c];
                }
                if (c > 0) {
                    coeff ^= currCoeff[c - 1];
                    constant ^= currConst[c - 1];
                }
                coeff ^= currCoeff[c];
                constant ^= currConst[c];
                if (c < this.n - 1) {
                    coeff ^= currCoeff[c + 1];
                    constant ^= currConst[c + 1];
                }

                nextCoeff[c] = coeff;
                nextConst[c] = constant;
            }

            prevCoeff = currCoeff;
            prevConst = currConst;
            currCoeff = nextCoeff;
            currConst = nextConst;
        }

        this._A = new Array(this.n).fill(0n);
        this._b = new Array(this.n).fill(0);
        const lastRowInit = this.matrix[this.m - 1];

        for (let c = 0; c < this.n; c++) {
            let coeff = 0n;
            let constant = lastRowInit[c] & 1;

            if (this.m > 1) {
                coeff ^= prevCoeff[c];
                constant ^= prevConst[c];
            }
            if (c > 0) {
                coeff ^= currCoeff[c - 1];
                constant ^= currConst[c - 1];
            }
            coeff ^= currCoeff[c];
            constant ^= currConst[c];
            if (c < this.n - 1) {
                coeff ^= currCoeff[c + 1];
                constant ^= currConst[c + 1];
            }

            this._A[c] = coeff;
            this._b[c] = constant & 1;
        }
    }

    _gaussianEliminationRREF() {
        const n = this.n;
        if (n === 0 || this._A.length === 0) {
            return [true, [], 0, [], [], []];
        }

        let rows = [];
        for (let i = 0; i < n; i++) {
            rows.push(this._A[i] | (BigInt(this._b[i] & 1) << BigInt(n)));
        }

        let pivotColForRow = new Array(n).fill(-1);
        let rank = 0;

        for (let col = 0; col < n; col++) {
            let pivot = -1;
            for (let r = rank; r < n; r++) {
                if ((rows[r] >> BigInt(col)) & 1n) {
                    pivot = r;
                    break;
                }
            }
            if (pivot === -1) continue;

            [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
            pivotColForRow[rank] = col;

            for (let r = 0; r < n; r++) {
                if (r !== rank && ((rows[r] >> BigInt(col)) & 1n)) {
                    rows[r] ^= rows[rank];
                }
            }
            rank++;
        }

        const coeffMask = (1n << BigInt(n)) - 1n;
        for (let r = rank; r < n; r++) {
            if ((rows[r] & coeffMask) === 0n && ((rows[r] >> BigInt(n)) & 1n) === 1n) {
                return [false, [], rank, [], rows, pivotColForRow];
            }
        }

        let x = new Array(n).fill(0);
        for (let r = 0; r < rank; r++) {
            const pc = pivotColForRow[r];
            if (pc >= 0) {
                x[pc] = Number((rows[r] >> BigInt(n)) & 1n);
            }
        }

        const pivotSet = new Set(pivotColForRow.slice(0, rank));
        const freeCols = [];
        for (let c = 0; c < n; c++) {
            if (!pivotSet.has(c)) freeCols.push(c);
        }

        return [true, x, rank, freeCols, rows, pivotColForRow];
    }

    _backSubstituteWithFree(rowsBits, pivotCols, freeCols, freeAssignment) {
        const x = new Array(this.n).fill(0);
        const coeffMask = (1n << BigInt(this.n)) - 1n;

        for (let idx = 0; idx < freeCols.length; idx++) {
            x[freeCols[idx]] = freeAssignment[idx] & 1;
        }

        for (let r = 0; r < pivotCols.length; r++) {
            const pc = pivotCols[r];
            if (pc === -1) continue;

            const row = rowsBits[r];
            let rhs = Number((row >> BigInt(this.n)) & 1n);
            let rowCoeff = row & coeffMask;

            let acc = rhs;
            let tempMask = rowCoeff & ~(1n << BigInt(pc));
            while (tempMask !== 0n) {
                const lsb = tempMask & -tempMask;
                const j = BigInt(lsb.toString(2).length - 1);
                acc ^= x[Number(j)];
                tempMask ^= lsb;
            }
            x[pc] = acc;
        }
        return x;
    }

    _propagateFullPlan(firstRow) {
        if (this.m === 0 || this.n === 0) return [[], 0];

        const fullPlan = Array.from({ length: this.m }, () => new Array(this.n).fill(0));
        fullPlan[0] = firstRow.slice();
        let totalFlips = firstRow.reduce((a, b) => a + b, 0);

        for (let r = 0; r < this.m - 1; r++) {
            for (let c = 0; c < this.n; c++) {
                let lightState = this.matrix[r][c];
                lightState ^= fullPlan[r][c];
                if (c > 0) lightState ^= fullPlan[r][c - 1];
                if (c < this.n - 1) lightState ^= fullPlan[r][c + 1];
                if (r > 0) lightState ^= fullPlan[r - 1][c];

                fullPlan[r + 1][c] = lightState;
                totalFlips += lightState;
            }
        }

        return [fullPlan, totalFlips];
    }

    solve(maxEnumBits = 20) {
        this._deriveFirstRowSystem();
        const [ok, x0, rank, freeCols, rowsBits, pivotCols] = this._gaussianEliminationRREF();
        this._hasSolution = ok;
        if (!ok) {
            this._minFlips = -1;
            this._firstRowPath = [];
            this._fullPlan = [];
            return [this._minFlips, this._firstRowPath];
        }

        let bestFirst = x0;
        let [bestFull, bestCost] = this._propagateFullPlan(bestFirst);

        const k = freeCols.length;
        if (k > 0 && k <= maxEnumBits) {
            for (let mask = 1; mask < (1 << k); mask++) {
                const freeAssignment = [];
                for (let idx = 0; idx < k; idx++) {
                    freeAssignment.push((mask >> idx) & 1);
                }
                const currFirst = this._backSubstituteWithFree(rowsBits, pivotCols, freeCols, freeAssignment);
                const [currFull, currCost] = this._propagateFullPlan(currFirst);
                if (currCost < bestCost) {
                    bestCost = currCost;
                    bestFirst = currFirst;
                    bestFull = currFull;
                }
            }
        }

        this._minFlips = bestCost;
        this._firstRowPath = bestFirst;
        this._fullPlan = bestFull;

        return [this._minFlips, this._firstRowPath];
    }

    get hasSolution() {
        return this._hasSolution;
    }

    get fullPlan() {
        return this._fullPlan.map(row => row.slice());
    }
}