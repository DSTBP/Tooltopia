class BinaryMatrixSolver {
  /**
   * 点灯游戏求解器 (高性能版，支持只按亮灯解法转换)
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
          throw new Error("输入矩阵不能为空，需为非空数组");
      }
      const rowLen = matrix[0].length;
      for (const row of matrix) {
          if (!Array.isArray(row) || row.length !== rowLen) {
              throw new Error("输入矩阵需为二维数组，所有行长度必须一致");
          }
          for (const val of row) {
              if (val !== 0 && val !== 1) {
                  throw new Error("矩阵元素必须为0或1");
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

      let currCoeff = Array.from({ length: this.n }, (_, c) => 1 << c);
      let currConst = Array(this.n).fill(0);
      let prevCoeff = null, prevConst = null;

      for (let r = 0; r < this.m - 1; r++) {
          const nextCoeff = Array(this.n).fill(0);
          const nextConst = Array(this.n).fill(0);
          const currRowInit = this.matrix[r];

          for (let c = 0; c < this.n; c++) {
              let coeff = 0;
              let constant = currRowInit[c] & 1;

              if (prevCoeff !== null) {
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

      this._A = Array(this.n).fill(0);
      this._b = Array(this.n).fill(0);
      const lastRowInit = this.matrix[this.m - 1];

      for (let c = 0; c < this.n; c++) {
          let coeff = 0;
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
          rows.push(this._A[i] | ((this._b[i] & 1) << n));
      }

      let pivotColForRow = Array(n).fill(-1);
      let rank = 0;

      for (let col = 0; col < n; col++) {
          let pivot = -1;
          for (let r = rank; r < n; r++) {
              if ((rows[r] >> col) & 1) {
                  pivot = r;
                  break;
              }
          }
          if (pivot === -1) continue;

          [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
          pivotColForRow[rank] = col;

          for (let r = 0; r < n; r++) {
              if (r !== rank && ((rows[r] >> col) & 1)) {
                  rows[r] ^= rows[rank];
              }
          }
          rank++;
      }

      const coeffMask = (1 << n) - 1;
      for (let r = rank; r < n; r++) {
          if ((rows[r] & coeffMask) === 0 && ((rows[r] >> n) & 1) === 1) {
              return [false, [], rank, [], rows, pivotColForRow];
          }
      }

      let x = Array(n).fill(0);
      for (let r = 0; r < rank; r++) {
          const pc = pivotColForRow[r];
          if (pc >= 0) {
              x[pc] = (rows[r] >> n) & 1;
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
      const x = Array(this.n).fill(0);
      const coeffMask = (1 << this.n) - 1;

      freeCols.forEach((col, idx) => {
          x[col] = freeAssignment[idx] & 1;
      });

      for (let r = 0; r < pivotCols.length; r++) {
          const pc = pivotCols[r];
          if (pc === -1) continue;

          const row = rowsBits[r];
          let rhs = (row >> this.n) & 1;
          let rowCoeff = row & coeffMask;

          let acc = rhs;
          let tempMask = rowCoeff & (~(1 << pc));
          while (tempMask) {
              const lsb = tempMask & -tempMask;
              const j = Math.log2(lsb) | 0;
              acc ^= x[j];
              tempMask ^= lsb;
          }
          x[pc] = acc;
      }
      return x;
  }

  _propagateFullPlan(firstRow) {
      if (this.m === 0 || this.n === 0) return [[], 0];

      const fullPlan = Array.from({ length: this.m }, () => Array(this.n).fill(0));
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
          const limit = 1 << k;
          for (let mask = 1; mask < limit; mask++) {
              const freeAssignment = freeCols.map((_, idx) => (mask >> idx) & 1);
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

  convertToLitOnlyPlan(fullPlan) {
      const state = this.matrix.map(row => row.slice());
      const moves = [];
      const targets = new Set();
      for (let r = 0; r < this.m; r++) {
          for (let c = 0; c < this.n; c++) {
              if (fullPlan[r][c] === 1) {
                  targets.add(r + "," + c);
              }
          }
      }

      const press = (r, c) => {
          this._toggle(state, r, c);
          moves.push([r, c]);
          targets.delete(r + "," + c);
      };

      while (targets.size > 0) {
          let progress = false;
          for (const key of Array.from(targets)) {
              const [r, c] = key.split(",").map(Number);
              if (state[r][c] === 1) {
                  press(r, c);
                  progress = true;
              }
          }
          if (!progress) {
              for (const key of Array.from(targets)) {
                  const [r, c] = key.split(",").map(Number);
                  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                      const nr = r + dr, nc = c + dc;
                      if (nr >= 0 && nr < this.m && nc >= 0 && nc < this.n && state[nr][nc] === 1) {
                          press(nr, nc);
                          press(r, c);
                          press(nr, nc);
                          progress = true;
                          break;
                      }
                  }
                  if (progress) break;
              }
          }
          if (!progress) throw new Error("无法转换为亮灯解法");
      }

      return moves;
  }

  _toggle(state, r, c) {
      const toggleOne = (x, y) => {
          if (x >= 0 && x < this.m && y >= 0 && y < this.n) {
              state[x][y] ^= 1;
          }
      };
      toggleOne(r, c);
      toggleOne(r - 1, c);
      toggleOne(r + 1, c);
      toggleOne(r, c - 1);
      toggleOne(r, c + 1);
  }

  get hasSolution() { return this._hasSolution; }
  get fullPlan() { return this._fullPlan.map(r => r.slice()); }
}


// === 测试 ===
function generateBinaryMatrix(rows, cols, seed = null) {
  let rng = seed !== null ? mulberry32(seed) : Math.random;
  const matrix = [];
  for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
          row.push((rng() * 2) | 0);
      }
      matrix.push(row);
  }
  return matrix;
}

function mulberry32(seed) {
  return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}


// 示例运行
// const matrix = generateBinaryMatrix(10, 10, 123);
// const solver = new BinaryMatrixSolver(matrix);


// const [minFlips, firstRowPath] = solver.solve(20);
// const litOnlyMoves = solver.convertToLitOnlyPlan(solver.fullPlan);
// console.log("亮灯解法步数:", litOnlyMoves.length);
// console.log("亮灯前20步:", litOnlyMoves.slice(0, 20));
