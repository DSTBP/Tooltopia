// 高性能 X 型点灯求解器（优化版，适合 23x23 及更大但仍受 O(n^3) 限制）
// 规则：点击 (r,c) 翻转 (r,c),(r-1,c-1),(r-1,c+1),(r+1,c-1),(r+1,c+1)
'use strict';

class BinaryMatrixSolver {
  constructor(matrix) {
    this._validateMatrix(matrix);
    this.matrix = matrix;
    this.m = matrix.length;
    this.n = this.m > 0 ? matrix[0].length : 0;

    this._hasSolution = false;
    this._minFlips = -1;
    this._solutionFlat = [];
    this._fullPlan = [];
  }

  _validateMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('输入矩阵不能为空');
    const rowLen = matrix[0].length;
    for (const row of matrix) {
      if (!Array.isArray(row) || row.length !== rowLen) throw new Error('输入矩阵需为二维数组，所有行长度一致');
      for (const v of row) if (v !== 0 && v !== 1) throw new Error('矩阵元素必须为 0 或 1');
    }
  }

  // popcount for 32-bit unsigned int
  static popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  // Build system: rows as Uint32Array words, separate rhs Uint8Array
  _buildFlatSystem() {
    const m = this.m, n = this.n;
    const vars = m * n;
    const words = Math.ceil(vars / 32);
    const nrows = vars;
    const rows = new Array(nrows);
    const rhs = new Uint8Array(nrows);

    const idx = (i, j) => i * n + j;

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        const pos = idx(i, j);
        const vec = new Uint32Array(words);
        const setBit = (p) => {
          const w = (p / 32) | 0;
          const b = p & 31;
          vec[w] |= (1 << b) >>> 0;
        };
        setBit(pos); // self
        if (i - 1 >= 0 && j - 1 >= 0) setBit(idx(i - 1, j - 1));
        if (i - 1 >= 0 && j + 1 < n) setBit(idx(i - 1, j + 1));
        if (i + 1 < m && j - 1 >= 0) setBit(idx(i + 1, j - 1));
        if (i + 1 < m && j + 1 < n) setBit(idx(i + 1, j + 1));
        rows[pos] = vec;
        rhs[pos] = this.matrix[i][j] & 1;
      }
    }
    return { rows, rhs, vars, words, nrows };
  }

  // Forward elimination (only eliminate below pivot), then back substitution.
  _eliminate(rows, rhs, vars, words) {
    const nrows = rows.length;
    const pivotRowForCol = new Int32Array(vars).fill(-1);
    let rank = 0;

    for (let col = 0; col < vars; col++) {
      const wordIndex = (col / 32) | 0;
      const bitMask = (1 << (col & 31)) >>> 0;

      // find pivot row at or below rank
      let pivot = -1;
      for (let r = rank; r < nrows; r++) {
        if ((rows[r][wordIndex] & bitMask) !== 0) {
          pivot = r;
          break;
        }
      }
      if (pivot === -1) continue;

      // swap pivot into rank
      if (pivot !== rank) {
        const tmp = rows[rank];
        rows[rank] = rows[pivot];
        rows[pivot] = tmp;
        const t = rhs[rank];
        rhs[rank] = rhs[pivot];
        rhs[pivot] = t;
      }

      pivotRowForCol[col] = rank;

      // eliminate below
      for (let r = rank + 1; r < nrows; r++) {
        if ((rows[r][wordIndex] & bitMask) !== 0) {
          // XOR words starting from wordIndex (optimization)
          const prow = rows[rank], rrow = rows[r];
          for (let w = wordIndex; w < words; w++) rrow[w] ^= prow[w];
          rhs[r] ^= rhs[rank];
        }
      }
      rank++;
      if (rank === nrows) break;
    }

    // check inconsistency: any zero-coeff row with rhs=1
    for (let r = rank; r < nrows; r++) {
      let allZero = true;
      const row = rows[r];
      for (let w = 0; w < words; w++) {
        if (row[w] !== 0) { allZero = false; break; }
      }
      if (allZero && rhs[r]) return { ok: false };
    }

    // Back substitution: build solution with free vars = 0 initially
    const x = new Uint8Array(vars); // 0/1 solution
    // We'll compute pivotCols list for back substitution iteration
    const pivotCols = [];
    for (let c = 0; c < vars; c++) {
      const pr = pivotRowForCol[c];
      if (pr >= 0) pivotCols.push({ col: c, row: pr });
    }

    // Solve from last pivot to first
    for (let k = pivotCols.length - 1; k >= 0; k--) {
      const { col, row } = pivotCols[k];
      const wordIndex = (col / 32) | 0;
      const mask = (1 << (col & 31)) >>> 0;
      // compute parity = rhs[row] XOR sum_{j>col} (row[j] & x[j])
      let acc = rhs[row] & 1;
      const rrow = rows[row];
      // For words after wordIndex, compute popcount on (rrow[w] & xWords[w])
      // We need x packed into words for speed. Build xWords on the fly:
      // But building xWords every iteration is costly; instead we'll compute per-bit using x[]
      // To be efficient, iterate words from wordIndex to words-1 and compute (rrow[w] & maskOfKnownX)
      // We'll pack known x into words once and update as we set pivot x's.
      // We'll create xWords now (outside) if not created.
    }

    // More efficient back substitution approach:
    // Build xWords from current x (initially all zero)
    const xWords = new Uint32Array(words);
    // iterate pivots from last to first
    for (let k = pivotCols.length - 1; k >= 0; k--) {
      const { col, row } = pivotCols[k];
      const wordIndex = (col / 32) | 0;
      const bitPos = col & 31;
      // compute parity = rhs[row] XOR popcount(row & xWords) % 2
      let parity = rhs[row] & 1;
      const rrow = rows[row];
      // iterate words, AND with xWords, count bits
      for (let w = wordIndex; w < words; w++) {
        const v = rrow[w] & xWords[w];
        if (v !== 0) parity ^= (BinaryMatrixSolver.popcount32(v) & 1);
      }
      // but note in the word containing pivot bit we excluded pivot when constructing rrow & xWords,
      // because xWords currently doesn't yet include x[col]; so we are fine.
      const xi = parity & 1;
      x[col] = xi;
      if (xi) {
        const w = wordIndex;
        xWords[w] |= (1 << bitPos) >>> 0;
      }
    }

    return { ok: true, x, pivotCols };
  }

  // Given solution flat, convert to matrix
  _flattenToMatrix(flat) {
    const res = [];
    for (let i = 0; i < this.m; i++) {
      res.push(Array.from(flat.slice(i * this.n, (i + 1) * this.n)));
    }
    return res;
  }

  // Try to improve solution by enumerating free variables up to maxEnumBits
  _enumerateFreeVars(rowsOrig, rhsOrig, vars, words, pivotMap, baseSolution, freeCols, maxEnumBits) {
    const k = freeCols.length;
    if (k === 0) return baseSolution;
    if (k > maxEnumBits) return baseSolution; // skip enumeration if too many
    // We'll perform back-substitution per free assignment efficiently by:
    // For each assignment, set x for free cols then solve pivot cols via same back-sub routine but using precomputed rows
    // To avoid copying heavy rows, we only need rows and pivotRows list (pivotCols).
    const rows = rowsOrig;
    const rhs = rhsOrig;
    const pivotColsList = [];
    for (let c = 0; c < vars; c++) {
      const pr = pivotMap[c];
      if (pr >= 0) pivotColsList.push({ col: c, row: pr });
    }

    let best = baseSolution.slice();
    let bestWeight = best.reduce((a, b) => a + b, 0);

    const wordsCount = words;
    const totalMasks = 1 << k;
    // For each free mask
    for (let mask = 1; mask < totalMasks; mask++) {
      const x = new Uint8Array(vars);
      const xWords = new Uint32Array(wordsCount);
      // set free cols
      for (let i = 0; i < k; i++) {
        if ((mask >> i) & 1) {
          const c = freeCols[i];
          x[c] = 1;
          const w = (c / 32) | 0; const b = c & 31;
          xWords[w] |= (1 << b) >>> 0;
        }
      }
      // back-substitute pivots
      for (let kk = pivotColsList.length - 1; kk >= 0; kk--) {
        const { col, row } = pivotColsList[kk];
        const wordIndex = (col / 32) | 0;
        let parity = rhs[row] & 1;
        const rrow = rows[row];
        for (let w = wordIndex; w < wordsCount; w++) {
          const v = rrow[w] & xWords[w];
          if (v !== 0) parity ^= (BinaryMatrixSolver.popcount32(v) & 1);
        }
        const xi = parity & 1;
        x[col] = xi;
        if (xi) {
          const w = wordIndex, b = col & 31;
          xWords[w] |= (1 << b) >>> 0;
        }
      }
      // compute weight
      const weight = x.reduce((a, b) => a + b, 0);
      if (weight < bestWeight) {
        bestWeight = weight;
        best = Array.from(x);
      }
    }
    return best;
  }

  solve(maxEnumBits = 20) {
    if (this.m === 0 || this.n === 0) {
      this._hasSolution = true;
      this._minFlips = 0;
      this._fullPlan = [];
      return [this._minFlips, this._fullPlan];
    }

    // build system
    const { rows, rhs, vars, words, nrows } = this._buildFlatSystem();
    // do elimination
    const elimination = this._eliminate(rows, rhs, vars, words);
    if (!elimination.ok) {
      this._hasSolution = false;
      this._minFlips = -1;
      this._fullPlan = [];
      return [this._minFlips, this._fullPlan];
    }
    this._hasSolution = true;
    // initial solution (free vars = 0)
    const baseSolution = Array.from(elimination.x);
    // find pivot map: for each col, which row is pivot (we tracked in _eliminate via pivotRowForCol local; but we did not return)
    // To get pivot map we recompute quickly: find first 1 in each row to locate pivot.
    const pivotMap = new Int32Array(vars).fill(-1);
    for (let r = 0; r < nrows; r++) {
      const row = rows[r];
      // find first non-zero word
      let found = false;
      for (let w = 0; w < words; w++) {
        const v = row[w];
        if (v !== 0) {
          const lsb = v & -v;
          const bit = 31 - Math.clz32(lsb >>> 0);
          const col = w * 32 + bit;
          if (col < vars) pivotMap[col] = r;
          found = true;
          break;
        }
      }
      if (!found) {
        // zero row, skip
      }
    }

    // compute free cols
    const freeCols = [];
    for (let c = 0; c < vars; c++) if (pivotMap[c] === -1) freeCols.push(c);

    // optionally enumerate free variables to minimize flips
    const bestFlat = this._enumerateFreeVars(rows, rhs, vars, words, pivotMap, baseSolution, freeCols, maxEnumBits);

    const fullPlan = this._flattenToMatrix(bestFlat);
    const minFlips = bestFlat.reduce((a, b) => a + b, 0);

    this._minFlips = minFlips;
    this._solutionFlat = bestFlat;
    this._fullPlan = fullPlan;
    return [minFlips, fullPlan];
  }

  get hasSolution() { return this._hasSolution; }
  get fullPlan() { return this._fullPlan.map(r => r.slice()); }
}

// ----- small test harness ----- (23x23 example)
function generateBinaryMatrix(rows, cols, seed = null) {
  if (seed !== null) {
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const M = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) row.push(Math.floor(rand() * 2));
      M.push(row);
    }
    return M;
  }
  const M = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) row.push(Math.random() < 0.5 ? 0 : 1);
    M.push(row);
  }
  return M;
}

// if (require.main === module) {
//   const R = 23, C = 23;
//   const mat = generateBinaryMatrix(R, C, 42);
//   const solver = new BinaryMatrixSolver(mat);
//   console.time('solve');
//   const [minFlips, plan] = solver.solve(20); // maxEnumBits = 20
//   console.timeEnd('solve');
//   if (solver.hasSolution) {
//     console.log('最少翻转次数:', minFlips);
//     console.log('方案前 6 行（每行前 12 列）预览:');
//     for (let i = 0; i < Math.min(6, plan.length); i++) {
//       console.log(plan[i].slice(0, 12).join(''));
//     }
//   } else {
//     console.log('无解');
//   }
// }

