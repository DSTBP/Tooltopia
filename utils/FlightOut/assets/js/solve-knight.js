'use strict';

/**
 * Knight's Move Lights Out - High-performance JS solver (GF(2))
 */

class KnightLightsOutSolver {
  constructor(matrix, options = {}) {
    this._validateMatrix(matrix);
    this.matrix = matrix;
    this.m = matrix.length;
    this.n = matrix[0].length;
    this.total = this.m * this.n;

    this.maxEnumBits = options.maxEnumBits ?? 22;

    this.WORD_BITS = 32;
    this.words = Math.ceil(this.total / this.WORD_BITS);

    this._hasSolution = false;
    this._steps = null;
    this._plan = null;
  }

  _validateMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      throw new Error('matrix must be a non-empty 2D array');
    }
    const rowLen = matrix[0].length;
    for (const row of matrix) {
      if (!Array.isArray(row) || row.length !== rowLen) {
        throw new Error('matrix must be rectangular');
      }
      for (const v of row) {
        if (v !== 0 && v !== 1) throw new Error('matrix entries must be 0 or 1');
      }
    }
  }

  _idx(r, c) { return r * this.n + c; }

  static _knightOffsets() {
    return [
      [2,1],[2,-1],[-2,1],[-2,-1],
      [1,2],[1,-2],[-1,2],[-1,-2]
    ];
  }

  static popcount32(x) {
    x = x >>> 0;
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  static popcountWords(words, start = 0) {
    let s = 0;
    for (let i = start; i < words.length; i++) {
      const v = words[i] >>> 0;
      if (v) s += KnightLightsOutSolver.popcount32(v);
    }
    return s;
  }

  // 🔥 这里是缺失的函数
  static popcountWordsAll(words) {
    return KnightLightsOutSolver.popcountWords(words, 0);
  }

  static xorWords(target, src) {
    for (let i = 0; i < target.length; i++) target[i] ^= src[i];
  }

  static cloneWords(src) {
    const out = new Uint32Array(src.length);
    out.set(src);
    return out;
  }

  _buildFullSystem() {
    const rows = new Array(this.total);
    const rhs = new Uint8Array(this.total);
    const offsets = [[0,0], ...KnightLightsOutSolver._knightOffsets()];

    for (let r = 0; r < this.m; r++) {
      for (let c = 0; c < this.n; c++) {
        const rowIdx = this._idx(r, c);
        const words = new Uint32Array(this.words);
        for (const [dr, dc] of offsets) {
          const ur = r + dr, uc = c + dc;
          if (ur >= 0 && ur < this.m && uc >= 0 && uc < this.n) {
            const pos = this._idx(ur, uc);
            const w = (pos / this.WORD_BITS) | 0;
            const b = pos & 31;
            words[w] |= (1 << b) >>> 0;
          }
        }
        rows[rowIdx] = words;
        rhs[rowIdx] = this.matrix[r][c] & 1;
      }
    }
    return { rows, rhs, vars: this.total, words: this.words };
  }

  // forward elimination (eliminate below pivot). returns { ok, rank, pivotRowForCol, pivotColForRow, rows, rhs }
  _forwardEliminate(rows, rhs, vars, wordsCount) {
    const nrows = rows.length;
    const pivotRowForCol = new Int32Array(vars).fill(-1); // col -> pivot row
    const pivotColForRow = new Int32Array(nrows).fill(-1); // row -> pivot col
    let row = 0;

    for (let col = 0; col < vars && row < nrows; col++) {
      const w = (col / this.WORD_BITS) | 0;
      const mask = (1 << (col & 31)) >>> 0;
      let pivot = -1;
      for (let r = row; r < nrows; r++) {
        if ((rows[r][w] & mask) !== 0) { pivot = r; break; }
      }
      if (pivot === -1) continue;
      if (pivot !== row) {
        const tmp = rows[row]; rows[row] = rows[pivot]; rows[pivot] = tmp;
        const t = rhs[row]; rhs[row] = rhs[pivot]; rhs[pivot] = t;
      }
      pivotColForRow[row] = col;
      pivotRowForCol[col] = row;
      // eliminate below
      for (let r = row + 1; r < nrows; r++) {
        if ((rows[r][w] & mask) !== 0) {
          // XOR starting from w
          const prow = rows[row], rrow = rows[r];
          for (let ww = w; ww < wordsCount; ww++) rrow[ww] ^= prow[ww];
          rhs[r] ^= rhs[row];
        }
      }
      row++;
    }
    const rank = row;
    // inconsistency check
    for (let r = rank; r < nrows; r++) {
      let allZero = true;
      const rrow = rows[r];
      for (let ww = 0; ww < wordsCount; ww++) { if (rrow[ww] !== 0) { allZero = false; break; } }
      if (allZero && rhs[r]) return { ok: false };
    }
    return { ok: true, rank, pivotRowForCol, pivotColForRow, rows, rhs };
  }

  // back substitution to compute particular solution (free vars = 0)
  _backSubstitute(rows, rhs, pivotColForRow, rank, vars, wordsCount) {
    const x = new Uint8Array(vars);
    const xWords = new Uint32Array(wordsCount); // packed x
    for (let prow = rank - 1; prow >= 0; prow--) {
      const pcol = pivotColForRow[prow];
      if (pcol === -1) continue;
      const wstart = (pcol / this.WORD_BITS) | 0;
      const bitInWord = pcol & 31;
      const rrow = rows[prow];

      // parity = rhs ^ dot( rrow[j>pcol], x[j] )
      let parity = rhs[prow] & 1;
      // first word: mask out bits <= pcol
      const maskHigh = (bitInWord === 31) ? 0 >>> 0 : (~((1 << (bitInWord + 1)) - 1)) >>> 0;
      let v = (rrow[wstart] & maskHigh) & xWords[wstart];
      if (v !== 0) parity ^= (KnightLightsOutSolver.popcount32(v) & 1);
      for (let ww = wstart + 1; ww < wordsCount; ww++) {
        const vv = (rrow[ww] & xWords[ww]);
        if (vv !== 0) parity ^= (KnightLightsOutSolver.popcount32(vv) & 1);
      }
      const xi = parity & 1;
      x[pcol] = xi;
      if (xi) xWords[wstart] |= (1 << bitInWord) >>> 0;
    }
    return { x, xWords };
  }

  // build nullspace basis: for each free col f, set v[f]=1, then back-substitute pivots
  _buildBasis(rows, rhs, pivotColForRow, pivotRowForCol, rank, vars, wordsCount) {
    const freeCols = [];
    for (let c = 0; c < vars; c++) if (pivotRowForCol[c] === -1) freeCols.push(c);
    const basis = []; // { col, words: Uint32Array }

    for (const f of freeCols) {
      const vWords = new Uint32Array(wordsCount);
      // set v[f] = 1
      const wf = (f / this.WORD_BITS) | 0, bf = f & 31;
      vWords[wf] |= (1 << bf) >>> 0;
      // back-substitute pivots from last to first
      for (let prow = rank - 1; prow >= 0; prow--) {
        const pcol = pivotColForRow[prow];
        if (pcol === -1) continue;
        const wstart = (pcol / this.WORD_BITS) | 0;
        const bitInWord = pcol & 31;
        const rrow = rows[prow];
        // parity = dot( rrow[j>pcol], v[j] )
        let parity = 0;
        const maskHigh = (bitInWord === 31) ? 0 >>> 0 : (~((1 << (bitInWord + 1)) - 1)) >>> 0;
        let vv = (rrow[wstart] & maskHigh) & vWords[wstart];
        if (vv !== 0) parity ^= (KnightLightsOutSolver.popcount32(vv) & 1);
        for (let ww = wstart + 1; ww < wordsCount; ww++) {
          const vv2 = (rrow[ww] & vWords[ww]);
          if (vv2 !== 0) parity ^= (KnightLightsOutSolver.popcount32(vv2) & 1);
        }
        if (parity & 1) {
          vWords[wstart] |= (1 << bitInWord) >>> 0;
        }
      }
      basis.push({ col: f, words: vWords });
    }
    return { basis, freeCols };
  }

  // convert words => flat Uint8Array solution
  _wordsToFlat(wordsArr, vars) {
    const flat = new Uint8Array(vars);
    for (let pos = 0; pos < vars; pos++) {
      const w = (pos / this.WORD_BITS) | 0;
      const b = pos & 31;
      if (((wordsArr[w] >>> b) & 1) !== 0) flat[pos] = 1;
    }
    return flat;
  }

  // solve entry
  solve() {
    if (this.total === 0) {
      this._hasSolution = true; this._steps = 0; this._plan = []; return { steps: 0, plan: [] };
    }

    const { rows, rhs, vars, words } = this._buildFullSystem();

    // forward elimination
    const elim = this._forwardEliminate(rows, rhs, vars, words);
    if (!elim.ok) { this._hasSolution = false; return null; }
    const { rank, pivotRowForCol, pivotColForRow } = elim;
    this._hasSolution = true;

    // particular solution (free vars = 0)
    const { x: x0_arr, xWords: x0Words } = this._backSubstitute(rows, rhs, pivotColForRow, rank, vars, words);
    // convert x0Words to flat array if needed
    const x0_flat = this._wordsToFlat(x0Words, vars);
    let bestWords = x0Words;
    let bestWeight = KnightLightsOutSolver.popcountWordsAll(bestWords);

    // build basis
    const { basis, freeCols } = this._buildBasis(rows, rhs, pivotColForRow, pivotRowForCol, rank, vars, words);
    const freeCount = basis.length;

    // enumerate if small
    if (freeCount > 0 && freeCount <= this.maxEnumBits) {
      // prepare basis words
      const basisWordsArr = basis.map(b => b.words);
      const totalMasks = 1 << freeCount;
      for (let mask = 1; mask < totalMasks; mask++) {
        const cand = new Uint32Array(words);
        cand.set(x0Words);
        let mm = mask, idx = 0;
        while (mm) {
          if (mm & 1) KnightLightsOutSolver.xorWords(cand, basisWordsArr[idx]);
          mm >>>= 1; idx++;
        }
        const w = KnightLightsOutSolver.popcountWordsAll(cand);
        if (w < bestWeight) { bestWeight = w; bestWords = cand; }
      }
    }

    // produce full plan matrix m x n from bestWords
    const flat = this._wordsToFlat(bestWords, vars);
    const plan = Array.from({ length: this.m }, (_, r) => Array(this.n).fill(0));
    let steps = 0;
    for (let pos = 0; pos < vars; pos++) {
      if (flat[pos]) {
        steps++;
        const r = (pos / this.n) | 0;
        const c = pos % this.n;
        plan[r][c] = 1;
      }
    }
    this._steps = steps;
    this._plan = plan;
    return { steps, plan };
  }
}


// ----------------- Helper test harness -----------------
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBinaryMatrix(rows, cols, seed = null) {
  const rng = seed !== null ? mulberry32(seed) : Math.random;
  const M = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) row.push(rng() < 0.5 ? 0 : 1);
    M.push(row);
  }
  return M;
}

// quick demo if run directly
if (require.main === module) {
  const rows = 25, cols = 25;
  const mat = generateBinaryMatrix(rows, cols, 42);
  const solver = new KnightLightsOutSolver(mat, { maxEnumBits: 20 });
  console.time('solve');
  const res = solver.solve();
  console.timeEnd('solve');
  if (res === null) {
    console.log('No solution');
  } else {
    console.log('steps:', res.steps);
    console.log('plan:');
    for (let r = 0; r < rows; r++) console.log(res.plan[r].join(' '));
  }
}
