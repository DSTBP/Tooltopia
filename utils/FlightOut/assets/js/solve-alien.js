class AlienTilesSolver {
  constructor(matrix, modulus = 4) {
      this.matrix = matrix;
      this.modulus = modulus;
      this.m = matrix.length;
      this.n = matrix[0].length;
      this.size = this.m * this.n;
      this.A = this.genA();
  }

  // 二维索引 -> 一维索引
  idx(r, c) {
      return r * this.n + c;
  }

  // 生成系数矩阵 (模4)
  genA() {
      const size = this.size;
      let A = Array.from({ length: size }, () => new Array(size).fill(0));

      for (let pr = 0; pr < this.m; pr++) {
          for (let pc = 0; pc < this.n; pc++) {
              const q = this.idx(pr, pc);

              // 整行
              for (let j = 0; j < this.n; j++) {
                  const p = this.idx(pr, j);
                  A[p][q] = (A[p][q] + 1) % 4;
              }

              // 整列
              for (let i = 0; i < this.m; i++) {
                  if (i === pr) continue;
                  const p = this.idx(i, pc);
                  A[p][q] = (A[p][q] + 1) % 4;
              }
          }
      }
      return A;
  }

  // GF(2) 消元（用 bitset 优化）
  solveGF2(A2, b2) {
      const m = A2.length, n = A2[0].length;
      const M = A2.map((row, i) => {
          let bits = 0n;
          for (let j = 0; j < n; j++) {
              if (row[j] & 1) bits |= 1n << BigInt(j);
          }
          return { bits, b: b2[i] & 1 };
      });

      let pivotCols = [];
      let row = 0;
      for (let col = 0; col < n && row < m; col++) {
          let sel = -1;
          for (let r = row; r < m; r++) {
              if ((M[r].bits >> BigInt(col)) & 1n) {
                  sel = r; break;
              }
          }
          if (sel === -1) continue;
          if (sel !== row) [M[sel], M[row]] = [M[row], M[sel]];
          for (let r = 0; r < m; r++) {
              if (r !== row && ((M[r].bits >> BigInt(col)) & 1n)) {
                  M[r].bits ^= M[row].bits;
                  M[r].b ^= M[row].b;
              }
          }
          pivotCols.push(col);
          row++;
      }
      for (let r = row; r < m; r++) {
          if (M[r].bits === 0n && M[r].b === 1) return { ok: false };
      }
      let xPart = new Array(n).fill(0);
      let pivotRow = 0;
      for (let col of pivotCols) {
          xPart[col] = M[pivotRow].b;
          pivotRow++;
      }
      let freeCols = [];
      for (let col = 0; col < n; col++) {
          if (!pivotCols.includes(col)) freeCols.push(col);
      }
      let nullspace = [];
      for (let free of freeCols) {
          let v = new Array(n).fill(0);
          v[free] = 1;
          pivotRow = 0;
          for (let col of pivotCols) {
              v[col] = Number((M[pivotRow].bits >> BigInt(free)) & 1n);
              pivotRow++;
          }
          nullspace.push(v);
      }
      return { ok: true, xPart, nullspace };
  }

  // 模4解法
  solveMod4(b) {
      const A = this.A, n = this.size, m = A.length;
      const A2 = A.map(row => row.map(v => v % 2));
      const b2 = b.map(v => v % 2);

      let { ok, xPart: x0_mod2, nullspace: ns } = this.solveGF2(A2, b2);
      if (!ok) return { solution: null, info: "模2子问题无解 -> 模4无解" };

      const tryLift = (x_mod2) => {
          let Ax0 = new Array(m).fill(0);
          for (let i = 0; i < m; i++) {
              let sum = 0;
              for (let j = 0; j < n; j++) sum += A[i][j] * x_mod2[j];
              Ax0[i] = sum % 4;
          }
          let r = b.map((val, i) => (val - Ax0[i] + 4) % 4);
          if (r.some(v => v % 2 === 1)) return null;
          let b2_second = r.map(v => (v / 2) % 2);
          let { ok, xPart: t0 } = this.solveGF2(A2, b2_second);
          if (!ok) return null;
          return x_mod2.map((v, i) => (v + 2 * t0[i]) % 4);
      };

      if (n < 10) {
          let sols = new Set();
          let k = ns.length;
          for (let mask = 0; mask < (1 << k); mask++) {
              let x_mod2 = x0_mod2.slice();
              for (let i = 0; i < k; i++) {
                  if ((mask >> i) & 1) {
                      for (let j = 0; j < n; j++) x_mod2[j] ^= ns[i][j];
                  }
              }
              let lifted = tryLift(x_mod2);
              if (lifted) sols.add(lifted.join(","));
          }
          if (sols.size === 0) return { solution: null, info: "模4无解" };
          let res = Array.from(sols).map(s => s.split(",").map(Number));
          return { solution: res, info: `找到 ${res.length} 个解（枚举模式 n=${n}）` };
      } else {
          let candidates = [x0_mod2];
          if (ns.length > 0) {
              let x2 = x0_mod2.slice();
              for (let j = 0; j < n; j++) x2[j] ^= ns[0][j];
              candidates.push(x2);
          }
          for (let cand of candidates) {
              let lifted = tryLift(cand);
              if (lifted) return { solution: lifted, info: "返回一个代表解（模2->模4提升）" };
          }
          return { solution: null, info: "模4无解（尝试失败）" };
      }
  }

  // 调用入口
  solve() {
      const s = [];
      for (let i = 0; i < this.m; i++) {
          for (let j = 0; j < this.n; j++) s.push(this.matrix[i][j]);
      }
      const b = s.map(v => (-v + this.modulus) % this.modulus);
      let { solution, info } = this.solveMod4(b);
      if (!solution) return [null, info];
      let x = Array.isArray(solution[0]) ? solution[0] : solution;
      let flips = [];
      for (let i = 0; i < this.m; i++) {
          flips.push(x.slice(i * this.n, (i + 1) * this.n));
      }
      return [flips, info];
  }
}

// 验证解
function verifySolution(matrix, flips, modulus = 4) {
  const m = matrix.length, n = matrix[0].length;
  let result = matrix.map(row => row.slice());
  for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
          let flip = flips[i][j] % modulus;
          if (flip === 0) continue;
          for (let col = 0; col < n; col++) result[i][col] = (result[i][col] + flip) % modulus;
          for (let row = 0; row < m; row++) result[row][j] = (result[row][j] + flip) % modulus;
          result[i][j] = (result[i][j] - flip + modulus) % modulus;
      }
  }
  let ok = result.every(row => row.every(v => v === 0));
  return [ok, ok ? "验证成功" : "验证失败"];
}

// ------------------- 测试 -------------------

function test() {
  let matrix = [
      [1, 3, 2],
      [3, 3, 2],
      [0, 2, 2]
  ];
  let solver = new AlienTilesSolver(matrix, 4);
  let [flips, info] = solver.solve();
  console.log("初始矩阵:");
  console.log(matrix);
  console.log("次数矩阵:", flips);
  console.log("信息:", info);
  if (flips) console.log("验证:", verifySolution(matrix, flips));
}

// test();
