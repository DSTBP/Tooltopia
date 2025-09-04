class CircularMatrixSolver {
    /**
     * 优化的循环矩阵（无边界）翻转求解器
     * 任意格子翻转时，影响自身+上下左右（卷绕边界）
     * @param {number[][]} matrix - 初始矩阵（0/1）
     */
    constructor(matrix) {
        this.matrix = matrix;
        this.m = matrix.length;
        this.n = (matrix[0] || []).length;
        this.totalCells = this.m * this.n;
        this.neighborMasks = [];
        this._precomputeNeighborMasks();
    }

    _idx(r, c) {
        return r * this.n + c;
    }

    _getBit(x, i) {
        return (x >> BigInt(i)) & 1n;
    }

    _precomputeNeighborMasks() {
        this.neighborMasks = Array(this.totalCells).fill(0n);
        for (let r = 0; r < this.m; r++) {
            for (let c = 0; c < this.n; c++) {
                const idx = this._idx(r, c);
                const neighbors = [
                    [r, c],
                    [r - 1, c],
                    [r + 1, c],
                    [r, c - 1],
                    [r, c + 1]
                ];
                const flipCounts = new Map();
                for (const [rr, cc] of neighbors) {
                    const wr = (rr + this.m) % this.m;
                    const wc = (cc + this.n) % this.n;
                    const key = `${wr},${wc}`;
                    flipCounts.set(key, (flipCounts.get(key) || 0) ^ 1);
                }
                let mask = 0n;
                for (const [key, count] of flipCounts.entries()) {
                    if (count === 1) {
                        const [wr, wc] = key.split(",").map(Number);
                        mask |= 1n << BigInt(this._idx(wr, wc));
                    }
                }
                this.neighborMasks[idx] = mask;
            }
        }
    }

    _buildBBits() {
        let bBits = 0n;
        for (let r = 0; r < this.m; r++) {
            for (let c = 0; c < this.n; c++) {
                if (this.matrix[r][c] & 1) {
                    bBits |= 1n << BigInt(this._idx(r, c));
                }
            }
        }
        return bBits;
    }

    _gaussianEliminationRref(rows) {
        const numRows = rows.length;
        const numCols = this.totalCells;
        const pivotRowForCol = Array(numCols).fill(null);
        let row = 0;
        for (let col = 0; col < numCols; col++) {
            let pivot = null;
            for (let r = row; r < numRows; r++) {
                if (this._getBit(rows[r], col)) {
                    pivot = r;
                    break;
                }
            }
            if (pivot === null) continue;

            if (pivot !== row) {
                [rows[row], rows[pivot]] = [rows[pivot], rows[row]];
            }
            pivotRowForCol[col] = row;
            const pivotVal = rows[row];
            for (let r = 0; r < numRows; r++) {
                if (r !== row && this._getBit(rows[r], col)) {
                    rows[r] ^= pivotVal;
                }
            }
            row++;
            if (row === numRows) break;
        }
        return [rows, pivotRowForCol];
    }

    solve() {
        if (this.totalCells === 0) return [];

        const bBits = this._buildBBits();

        let rows = [];
        for (let idx = 0; idx < this.totalCells; idx++) {
            const coeffs = this.neighborMasks[idx];
            const rhs = (bBits >> BigInt(idx)) & 1n;
            rows.push(coeffs | (rhs << BigInt(this.totalCells)));
        }

        const [A, pivotRowForCol] = this._gaussianEliminationRref(rows);
        const numRows = A.length;
        const numCols = this.totalCells;

        const maskCoeff = (1n << BigInt(numCols)) - 1n;
        for (let r = 0; r < numRows; r++) {
            if ((A[r] & maskCoeff) === 0n && this._getBit(A[r], numCols)) {
                return null; // 无解
            }
        }

        let x0 = 0n;
        for (let col = 0; col < numCols; col++) {
            const pr = pivotRowForCol[col];
            if (pr !== null && this._getBit(A[pr], numCols)) {
                x0 |= 1n << BigInt(col);
            }
        }

        const freeCols = [];
        for (let c = 0; c < numCols; c++) {
            if (pivotRowForCol[c] === null) freeCols.push(c);
        }

        const basis = [];
        for (const fcol of freeCols) {
            let v = 1n << BigInt(fcol);
            for (let pcol = 0; pcol < numCols; pcol++) {
                const pr = pivotRowForCol[pcol];
                if (pr !== null && this._getBit(A[pr], fcol)) {
                    v |= 1n << BigInt(pcol);
                }
            }
            basis.push(v);
        }

        let best = x0;
        let bestW = best.toString(2).replace(/0/g, "").length;
        const k = basis.length;

        if (k <= 20) {
            const total = 1 << k;
            for (let mask = 1; mask < total; mask++) {
                let cand = x0;
                for (let i = 0; i < k; i++) {
                    if (mask & (1 << i)) cand ^= basis[i];
                }
                const currentW = cand.toString(2).replace(/0/g, "").length;
                if (currentW < bestW) {
                    bestW = currentW;
                    best = cand;
                    if (bestW === 0) break;
                }
            }
        }

        const flips = [];
        for (let col = 0; col < numCols; col++) {   
            if ((best >> BigInt(col)) & 1n) {
                const r = Math.floor(col / this.n);
                const c = col % this.n;
                flips.push([r, c]);
            }
        }
        return flips;
    }
}