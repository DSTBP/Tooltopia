'use strict';

/**
 * 修正版 — 高性能 JavaScript 实现：菱形 (Diamond) Lights Out 求解器（GF(2)）
 * - 修正了 nullspace basis 的构造（使用回代计算）
 * - 其它部分保留高性能实现：位块 Uint32Array、forward eliminate + back-sub、基向量枚举
 */

class DiamondLightsOutSolver {
  constructor(k, matrix, options = {}) {
    this.k = k;
    this.rows = 2 * k + 1;
    this.rowCounts = new Array(this.rows);
    for (let i = 0; i < this.rows; i++) {
      this.rowCounts[i] = i <= k ? 2 * i + 1 : 2 * (2 * k - i) + 1;
    }
    this.rowStarts = new Array(this.rows).fill(0);
    for (let i = 1; i < this.rows; i++) this.rowStarts[i] = this.rowStarts[i - 1] + this.rowCounts[i - 1];

    this.total = (k + 1) * (k + 1) + k * k; // total lights
    this.matrix = matrix; // matrix: array of arrays matching rowCounts
    this.maxEnumBits = options.maxEnumBits ?? 22;
    this.WORD_BITS = 32;
    this.words = Math.ceil(this.total / this.WORD_BITS);
  }

  // utils: set/get bit in Uint32Array
  _setBitRow(rowArr, pos) {
    const w = (pos / this.WORD_BITS) | 0;
    const b = pos & (this.WORD_BITS - 1);
    rowArr[w] |= (1 << b) >>> 0;
  }
  static _getBitFromWords(wordsArr, pos) {
    const w = (pos / 32) | 0;
    const b = pos & 31;
    return (wordsArr[w] >>> b) & 1;
  }

  // popcount for 32-bit unsigned
  static popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  static popcountWordsAll(wordsArr) {
    let s = 0;
    for (let i = 0; i < wordsArr.length; i++) {
      const v = wordsArr[i] >>> 0;
      if (v) s += DiamondLightsOutSolver.popcount32(v);
    }
    return s;
  }

  _getIndex(r, c) {
    if (r < 0 || r >= this.rows) return -1;
    if (c < 0 || c >= this.rowCounts[r]) return -1;
    return this.rowStarts[r] + c;
  }

  // Build coefficient rows and RHS
  _buildSystem() {
    const rows = new Array(this.total);
    const rhs = new Uint8Array(this.total);
    for (let r = 0; r < this.rows; r++) {
      const cnt = this.rowCounts[r];
      for (let c = 0; c < cnt; c++) {
        const idx = this._getIndex(r, c);
        const arr = new Uint32Array(this.words);
        this._setBitRow(arr, idx); // self
        if (r > 0) {
          const upCol = (r <= this.k) ? c - 1 : c + 1;
          const nb = this._getIndex(r - 1, upCol);
          if (nb !== -1) this._setBitRow(arr, nb);
        }
        if (r < this.rows - 1) {
          const downCol = (r < this.k) ? c + 1 : c - 1;
          const nb = this._getIndex(r + 1, downCol);
          if (nb !== -1) this._setBitRow(arr, nb);
        }
        if (c > 0) {
          const nb = this._getIndex(r, c - 1);
          if (nb !== -1) this._setBitRow(arr, nb);
        }
        if (c < cnt - 1) {
          const nb = this._getIndex(r, c + 1);
          if (nb !== -1) this._setBitRow(arr, nb);
        }
        rows[idx] = arr;
        rhs[idx] = (this.matrix[r][c] & 1) ? 1 : 0;
      }
    }
    return { rows, rhs };
  }

  // forward elimination
  _forwardEliminate(rows, rhs) {
    const n = this.total;
    const m = rows.length;
    const pivotColForRow = new Int32Array(m).fill(-1); // map row->pivot col
    const pivotRowForCol = new Int32Array(n).fill(-1); // map col->pivot row
    let row = 0;
    for (let col = 0; col < n && row < m; col++) {
      const w = (col / this.WORD_BITS) | 0;
      const bmask = (1 << (col & 31)) >>> 0;
      let pivot = -1;
      for (let r = row; r < m; r++) {
        if ((rows[r][w] & bmask) !== 0) { pivot = r; break; }
      }
      if (pivot === -1) continue;
      if (pivot !== row) {
        const tmp = rows[row]; rows[row] = rows[pivot]; rows[pivot] = tmp;
        const t = rhs[row]; rhs[row] = rhs[pivot]; rhs[pivot] = t;
      }
      pivotColForRow[row] = col;
      pivotRowForCol[col] = row;
      // eliminate below
      for (let r = row + 1; r < m; r++) {
        if ((rows[r][w] & bmask) !== 0) {
          const prow = rows[row], rrow = rows[r];
          for (let ww = w; ww < this.words; ww++) rrow[ww] ^= prow[ww];
          rhs[r] ^= rhs[row];
        }
      }
      row++;
    }
    const rank = row;
    // inconsistency check
    for (let r = rank; r < m; r++) {
      let allZero = true;
      const rrow = rows[r];
      for (let ww = 0; ww < this.words; ww++) { if (rrow[ww] !== 0) { allZero = false; break; } }
      if (allZero && rhs[r]) return { ok: false };
    }
    return { ok: true, rank, pivotColForRow, pivotRowForCol, rows, rhs };
  }

  // back substitution for particular solution (free vars = 0)
  _backSubstitute(rows, rhs, pivotColForRow, rank) {
    const n = this.total;
    const x = new Uint8Array(n);
    const xWords = new Uint32Array(this.words);
    for (let prow = rank - 1; prow >= 0; prow--) {
      const col = pivotColForRow[prow];
      if (col === -1) continue;
      const wstart = (col / this.WORD_BITS) | 0;
      let parity = rhs[prow] & 1;
      const rrow = rows[prow];
      // compute dot(rrow[j>col], x[j])
      // first word: mask off bits <= col
      const bitInWord = col & 31;
      const maskHigh = (bitInWord === 31) ? 0 >>> 0 : (~((1 << (bitInWord + 1)) - 1)) >>> 0;
      let v = (rrow[wstart] & maskHigh) & xWords[wstart];
      if (v !== 0) parity ^= (DiamondLightsOutSolver.popcount32(v) & 1);
      for (let ww = wstart + 1; ww < this.words; ww++) {
        const vv = (rrow[ww] & xWords[ww]);
        if (vv !== 0) parity ^= (DiamondLightsOutSolver.popcount32(vv) & 1);
      }
      const xi = parity & 1;
      x[col] = xi;
      if (xi) xWords[wstart] |= (1 << (col & 31)) >>> 0;
    }
    return { x, xWords };
  }

  // build nullspace basis correctly by back-substitution (homogeneous system)
  _buildBasis(rows, pivotColForRow, pivotRowForCol, rank) {
    const n = this.total;
    // free columns: those with pivotRowForCol[col] === -1
    const freeCols = [];
    for (let c = 0; c < n; c++) if (pivotRowForCol[c] === -1) freeCols.push(c);
    const basis = [];

    // For each free column f, construct v with v[f]=1, then back-substitute pivot rows
    for (let f of freeCols) {
      const vWords = new Uint32Array(this.words);
      // set v[f]=1
      vWords[(f / this.WORD_BITS) | 0] |= (1 << (f & 31)) >>> 0;
      // back-substitute pivots from last to first
      for (let prow = rank - 1; prow >= 0; prow--) {
        const pcol = pivotColForRow[prow];
        if (pcol === -1) continue;
        const wstart = (pcol / this.WORD_BITS) | 0;
        const bitInWord = pcol & 31;
        // parity = dot( A[prow][j>pcol], v[j] )
        let parity = 0;
        const rrow = rows[prow];
        // first word: mask out bits <= pcol
        const maskHigh = (bitInWord === 31) ? 0 >>> 0 : (~((1 << (bitInWord + 1)) - 1)) >>> 0;
        let vv = (rrow[wstart] & maskHigh) & vWords[wstart];
        if (vv !== 0) parity ^= (DiamondLightsOutSolver.popcount32(vv) & 1);
        for (let ww = wstart + 1; ww < this.words; ww++) {
          const vv2 = (rrow[ww] & vWords[ww]);
          if (vv2 !== 0) parity ^= (DiamondLightsOutSolver.popcount32(vv2) & 1);
        }
        if (parity & 1) {
          // set v[pcol] = 1
          vWords[wstart] |= (1 << bitInWord) >>> 0;
        }
      }
      basis.push({ col: f, words: vWords });
    }
    return { basis, freeCols };
  }

  static xorWordsInto(target, src) {
    for (let i = 0; i < target.length; i++) target[i] ^= src[i];
  }

  solve() {
    // validate matrix shape
    for (let r = 0; r < this.rows; r++) {
      if (!Array.isArray(this.matrix[r]) || this.matrix[r].length !== this.rowCounts[r]) {
        throw new Error(`matrix row ${r} length mismatch`);
      }
    }

    // build system
    const { rows, rhs } = this._buildSystem();

    // eliminate
    const elim = this._forwardEliminate(rows, rhs);
    if (!elim.ok) return null;
    const { rank, pivotColForRow, pivotRowForCol } = elim;

    // particular solution
    const { x: x0_arr, xWords: x0Words } = this._backSubstitute(rows, rhs, pivotColForRow, rank);

    // basis
    const { basis, freeCols } = this._buildBasis(rows, pivotColForRow, pivotRowForCol, rank);

    // prepare best = x0Words
    const bestWords = new Uint32Array(this.words);
    for (let i = 0; i < this.words; i++) bestWords[i] = x0Words[i];
    let bestWeight = DiamondLightsOutSolver.popcountWordsAll(bestWords);

    // enumerate basis if small
    const freeCount = basis.length;
    if (freeCount > 0 && freeCount <= this.maxEnumBits) {
      // pre-extract basis words
      const basisWordsArr = basis.map(b => b.words);
      const totalMasks = 1 << freeCount;
      for (let mask = 1; mask < totalMasks; mask++) {
        const cand = new Uint32Array(this.words);
        for (let i = 0; i < this.words; i++) cand[i] = x0Words[i];
        // xor selected basis
        let mm = mask, idx = 0;
        while (mm) {
          if (mm & 1) DiamondLightsOutSolver.xorWordsInto(cand, basisWordsArr[idx]);
          mm >>>= 1; idx++;
        }
        const w = DiamondLightsOutSolver.popcountWordsAll(cand);
        if (w < bestWeight) {
          bestWeight = w;
          for (let i = 0; i < this.words; i++) bestWords[i] = cand[i];
        }
      }
    }

    // extract flips
    const flips = [];
    for (let pos = 0; pos < this.total; pos++) {
      const w = (pos / this.WORD_BITS) | 0;
      const b = pos & 31;
      if (((bestWords[w] >>> b) & 1) !== 0) {
        // binary search row
        let lo = 0, hi = this.rows - 1, rowFound = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const start = this.rowStarts[mid];
          const end = start + this.rowCounts[mid] - 1;
          if (pos < start) hi = mid - 1;
          else if (pos > end) lo = mid + 1;
          else { rowFound = mid; break; }
        }
        const col = pos - this.rowStarts[rowFound];
        flips.push([rowFound, col]);
      }
    }

    return { flips, steps: bestWeight };
  }
}


// -------------------- 快速测试 --------------------
// if (require.main === module) {
//   const matrix = [
//     [1],
//     [1,1,1],
//     [1,1,1,1,1],
//     [1,1,1],
//     [1]
//   ];
//   const k = 2;
//   const solver = new DiamondLightsOutSolver(k, matrix, { maxEnumBits: 22 });
//   console.time('solve');
//   const res = solver.solve();
//   console.timeEnd('solve');
//   if (res === null) {
//     console.log('无解');
//   } else {
//     console.log('steps:', res.steps);
//     console.log('flip count:', res.flips.length);
//     console.log('flips:', res.flips);
//   }
// }
