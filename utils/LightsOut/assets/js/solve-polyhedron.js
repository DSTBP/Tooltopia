/*
 * Polyhedron (Cuboid) Lights Out Solver (GF(2))
 *
 * Face indices follow the same convention as the cube variant and HTML `data-face`:
 * 0=Up, 1=Left, 2=Front, 3=Right, 4=Back, 5=Down
 *
 * Dimensions:
 * - length (L): front-back depth (Up/Down face rows)
 * - width  (W): left-right width (Up/Down face cols)
 * - height (H): up-down height (Front/Back/Left/Right face rows)
 *
 * Input matrix convention:
 * - entries must be 0/1
 * - the solver solves A*x = b over GF(2) to reach all-0 state
 *   (the caller should pre-transform game state accordingly, e.g. on=0 off=1).
 */

'use strict';

class PolyhedronLightsOutSolver {
    constructor(length, width, height, polyhedron, options = {}) {
        this.length = length | 0;
        this.width = width | 0;
        this.height = height | 0;
        this.maxEnumBits = options.maxEnumBits ?? 20;

        this._validateInput(polyhedron);
        this.polyhedron = polyhedron;

        this.faceOffsets = new Array(6).fill(0);
        this.faceRows = new Array(6).fill(0);
        this.faceCols = new Array(6).fill(0);
        this._initFaceLayout();

        this.size = this.faceOffsets[5] + this.faceRows[5] * this.faceCols[5];
        this.indexToCoord = new Array(this.size);
        this._initIndexMap();

        this.hasSolution = false;
        this.minFlips = -1;
        this.bestMask = 0n;
    }

    _faceDims(face) {
        // 0=U, 1=L, 2=F, 3=R, 4=B, 5=D
        switch (face) {
            case 0:
            case 5:
                return [this.length, this.width];   // L x W
            case 2:
            case 4:
                return [this.height, this.width];   // H x W
            case 1:
            case 3:
                return [this.height, this.length];  // H x L
            default:
                return [0, 0];
        }
    }

    _initFaceLayout() {
        let offset = 0;
        for (let f = 0; f < 6; f++) {
            const [r, c] = this._faceDims(f);
            this.faceOffsets[f] = offset;
            this.faceRows[f] = r;
            this.faceCols[f] = c;
            offset += r * c;
        }
    }

    _idx(face, r, c) {
        return this.faceOffsets[face] + r * this.faceCols[face] + c;
    }

    _initIndexMap() {
        for (let f = 0; f < 6; f++) {
            const rows = this.faceRows[f];
            const cols = this.faceCols[f];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = this._idx(f, r, c);
                    this.indexToCoord[idx] = [f, r, c];
                }
            }
        }
    }

    _validateInput(polyhedron) {
        const L = this.length, W = this.width, H = this.height;
        if (!Array.isArray(polyhedron) || polyhedron.length !== 6) {
            throw new Error('polyhedron must be an array of 6 faces');
        }

        const expect = (face, rows, cols) => {
            const mat = polyhedron[face];
            if (!Array.isArray(mat) || mat.length !== rows) {
                throw new Error(`face ${face} must be ${rows}x${cols}`);
            }
            for (const row of mat) {
                if (!Array.isArray(row) || row.length !== cols) {
                    throw new Error(`face ${face} must be ${rows}x${cols}`);
                }
                for (const v of row) {
                    if (v !== 0 && v !== 1) {
                        throw new Error('polyhedron entries must be 0 or 1');
                    }
                }
            }
        };

        // U, D
        expect(0, L, W);
        expect(5, L, W);
        // F, B
        expect(2, H, W);
        expect(4, H, W);
        // L, R
        expect(1, H, L);
        expect(3, H, L);
    }

    _getBit(x, i) {
        return (x >> BigInt(i)) & 1n;
    }

    _popcountBigInt(x) {
        let n = x;
        let count = 0;
        while (n) {
            n &= (n - 1n);
            count++;
        }
        return count;
    }

    _neighborCoords(face, r, c) {
        const coords = [];
        const seen = new Set();
        const L = this.length;
        const W = this.width;
        const H = this.height;

        const add = (f, rr, cc) => {
            const rows = this.faceRows[f];
            const cols = this.faceCols[f];
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return;
            const key = `${f},${rr},${cc}`;
            if (seen.has(key)) return;
            seen.add(key);
            coords.push([f, rr, cc]);
        };

        add(face, r, c);

        const rows = this.faceRows[face];
        const cols = this.faceCols[face];

        // up
        if (r > 0) {
            add(face, r - 1, c);
        } else {
            switch (face) {
                case 0: add(4, 0, W - 1 - c); break;         // U -> B
                case 5: add(2, H - 1, c); break;             // D -> F
                case 2: add(0, L - 1, c); break;             // F -> U
                case 4: add(0, 0, W - 1 - c); break;         // B -> U
                case 1: add(0, c, 0); break;                 // L -> U
                case 3: add(0, L - 1 - c, W - 1); break;     // R -> U
            }
        }

        // down
        if (r < rows - 1) {
            add(face, r + 1, c);
        } else {
            switch (face) {
                case 0: add(2, 0, c); break;                 // U -> F
                case 5: add(4, H - 1, W - 1 - c); break;     // D -> B
                case 2: add(5, 0, c); break;                 // F -> D
                case 4: add(5, L - 1, W - 1 - c); break;     // B -> D
                case 1: add(5, L - 1 - c, 0); break;         // L -> D
                case 3: add(5, c, W - 1); break;             // R -> D
            }
        }

        // left
        if (c > 0) {
            add(face, r, c - 1);
        } else {
            switch (face) {
                case 0: add(1, 0, r); break;                 // U -> L
                case 5: add(1, H - 1, L - 1 - r); break;     // D -> L
                case 2: add(1, r, L - 1); break;             // F -> L
                case 4: add(3, r, L - 1); break;             // B -> R
                case 1: add(4, r, W - 1); break;             // L -> B
                case 3: add(2, r, W - 1); break;             // R -> F
            }
        }

        // right
        if (c < cols - 1) {
            add(face, r, c + 1);
        } else {
            switch (face) {
                case 0: add(3, 0, L - 1 - r); break;         // U -> R
                case 5: add(3, H - 1, r); break;             // D -> R
                case 2: add(3, r, 0); break;                 // F -> R
                case 4: add(1, r, 0); break;                 // B -> L
                case 1: add(2, r, 0); break;                 // L -> F
                case 3: add(4, r, 0); break;                 // R -> B
            }
        }

        return coords;
    }

    _gaussianEliminationRref(rows) {
        const numRows = rows.length;
        const numCols = this.size;
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
                const tmp = rows[row];
                rows[row] = rows[pivot];
                rows[pivot] = tmp;
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

    solve(maxEnumBits = this.maxEnumBits) {
        const n = this.size;
        if (n === 0) {
            this.hasSolution = true;
            this.minFlips = 0;
            return [0, []];
        }

        // Build coefficient rows (augmented with RHS at bit position n)
        const rows = new Array(n).fill(0n);

        for (let idxVar = 0; idxVar < n; idxVar++) {
            const [f, r, c] = this.indexToCoord[idxVar];
            const affected = this._neighborCoords(f, r, c);
            const bit = 1n << BigInt(idxVar);
            for (const [af, ar, ac] of affected) {
                const eq = this._idx(af, ar, ac);
                rows[eq] |= bit;
            }
        }

        const rhsBit = 1n << BigInt(n);
        for (let f = 0; f < 6; f++) {
            const rr = this.faceRows[f];
            const cc = this.faceCols[f];
            for (let r = 0; r < rr; r++) {
                for (let c = 0; c < cc; c++) {
                    const eq = this._idx(f, r, c);
                    if (this.polyhedron[f][r][c] & 1) {
                        rows[eq] |= rhsBit;
                    }
                }
            }
        }

        const [A, pivotRowForCol] = this._gaussianEliminationRref(rows);

        const maskCoeff = (1n << BigInt(n)) - 1n;
        for (let r = 0; r < n; r++) {
            if ((A[r] & maskCoeff) === 0n && this._getBit(A[r], n)) {
                this.hasSolution = false;
                this.minFlips = -1;
                this.bestMask = 0n;
                return [this.minFlips, []];
            }
        }

        // Particular solution with all free vars = 0
        let x0 = 0n;
        for (let col = 0; col < n; col++) {
            const pr = pivotRowForCol[col];
            if (pr !== null && this._getBit(A[pr], n)) {
                x0 |= 1n << BigInt(col);
            }
        }

        const freeCols = [];
        for (let col = 0; col < n; col++) {
            if (pivotRowForCol[col] === null) freeCols.push(col);
        }

        const basis = [];
        for (const fcol of freeCols) {
            let v = 1n << BigInt(fcol);
            for (let pcol = 0; pcol < n; pcol++) {
                const pr = pivotRowForCol[pcol];
                if (pr !== null && this._getBit(A[pr], fcol)) {
                    v |= 1n << BigInt(pcol);
                }
            }
            basis.push(v);
        }

        let best = x0;
        let bestW = this._popcountBigInt(best);
        const k = basis.length;

        if (k > 0 && k <= maxEnumBits) {
            const total = 1 << k;
            for (let mask = 1; mask < total; mask++) {
                let cand = x0;
                for (let i = 0; i < k; i++) {
                    if (mask & (1 << i)) cand ^= basis[i];
                }
                const w = this._popcountBigInt(cand);
                if (w < bestW) {
                    bestW = w;
                    best = cand;
                    if (bestW === 0) break;
                }
            }
        }

        this.hasSolution = true;
        this.minFlips = bestW;
        this.bestMask = best;

        // Convert mask to polyhedron-shaped plan (0/1 presses)
        const plan = [
            Array.from({ length: this.length }, () => Array(this.width).fill(0)),   // U
            Array.from({ length: this.height }, () => Array(this.length).fill(0)),  // L
            Array.from({ length: this.height }, () => Array(this.width).fill(0)),   // F
            Array.from({ length: this.height }, () => Array(this.length).fill(0)),  // R
            Array.from({ length: this.height }, () => Array(this.width).fill(0)),   // B
            Array.from({ length: this.length }, () => Array(this.width).fill(0))    // D
        ];

        for (let idx = 0; idx < n; idx++) {
            if ((best >> BigInt(idx)) & 1n) {
                const [f, r, c] = this.indexToCoord[idx];
                plan[f][r][c] = 1;
            }
        }

        return [this.minFlips, plan];
    }
}

