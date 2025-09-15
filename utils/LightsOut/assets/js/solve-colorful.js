// NStateMatrixSolver (JS) - 支持任意 n_state（通过素因子分解 + 提升 + CRT）
'use strict';

/* ---------- 基本整数工具 ---------- */
function egcd(a, b) {
    a = Math.floor(a); b = Math.floor(b);
    if (b === 0) return [a, 1, 0];
    const [g, x1, y1] = egcd(b, a % b);
    return [g, y1, x1 - Math.floor(a / b) * y1];
}
function modInv(a, m) {
    a = ((a % m) + m) % m;
    const [g, x] = (function (aa, mm) { return [egcd(aa, mm)[0], egcd(aa, mm)[1]]; })(a, m);
    const eg = egcd(a, m);
    if (eg[0] !== 1) return null;
    return ((eg[1] % m) + m) % m;
}
function crtPair(a1, m1, a2, m2) {
    // 合并 a1 (mod m1) 与 a2 (mod m2)
    const [g, s, t] = egcd(m1, m2);
    if ((a2 - a1) % g !== 0) throw new Error('CRT 无解');
    const lcm = (m1 / g) * m2;
    const mult = Math.floor((a2 - a1) / g) % (m2 / g);
    const x = (a1 + m1 * ((s * mult) % (m2 / g))) % lcm;
    return [((x % lcm) + lcm) % lcm, lcm];
}
function factorize(n) {
    const res = [];
    let x = n;
    for (let p = 2; p * p <= x; p++) {
        if (x % p === 0) {
            let e = 0;
            while (x % p === 0) { x = Math.floor(x / p); e++; }
            res.push([p, e]);
        }
    }
    if (x > 1) res.push([x, 1]);
    return res;
}

/* ---------- 在 GF(p) 上高斯消元（返回特解 + 零空间基） ---------- */
function gfPEliminate(A, b, p) {
    const n = A.length;
    if (n === 0) return { ok: true, x: [], basis: [], aug: [], pivotCols: [] };
    // 构造增广矩阵
    const aug = Array.from({ length: n }, (_, i) => {
        const row = new Array(n + 1);
        for (let j = 0; j < n; j++) row[j] = ((A[i][j] % p) + p) % p;
        row[n] = ((b[i] % p) + p) % p;
        return row;
    });

    let row = 0;
    const pivotCols = [];
    for (let col = 0; col < n; col++) {
        let sel = -1;
        for (let r = row; r < n; r++) if (aug[r][col] % p !== 0) { sel = r; break; }
        if (sel === -1) continue;
        // 交换
        [aug[row], aug[sel]] = [aug[sel], aug[row]];
        // 归一化
        const inv = modInv(aug[row][col], p);
        if (inv === null) return { ok: false }; // 理论上 p 为素数，此处不会发生
        for (let c = col; c <= n; c++) aug[row][c] = (aug[row][c] * inv) % p;
        // 消去
        for (let r = 0; r < n; r++) {
            if (r !== row && aug[r][col] !== 0) {
                const factor = aug[r][col];
                for (let c = col; c <= n; c++) {
                    aug[r][c] = (aug[r][c] - factor * aug[row][c]) % p;
                    if (aug[r][c] < 0) aug[r][c] += p;
                }
            }
        }
        pivotCols.push(col);
        row++;
        if (row === n) break;
    }

    // 检查无解
    for (let r = row; r < n; r++) {
        let allz = true;
        for (let c = 0; c < n; c++) if (aug[r][c] % p !== 0) { allz = false; break; }
        if (allz && (aug[r][n] % p) !== 0) return { ok: false, x: [], basis: [] };
    }

    // 特解：自由变量置0
    const x0 = new Array(n).fill(0);
    const pivotSet = new Set(pivotCols);
    const prowToCol = {};
    for (let r = 0; r < pivotCols.length; r++) prowToCol[r] = pivotCols[r];
    for (let r = 0; r < pivotCols.length; r++) {
        const col = prowToCol[r];
        x0[col] = aug[r][n] % p;
    }
    // 零空间基
    const freeCols = [];
    for (let c = 0; c < n; c++) if (!pivotSet.has(c)) freeCols.push(c);
    const basis = [];
    for (const fc of freeCols) {
        const vec = new Array(n).fill(0);
        vec[fc] = 1;
        for (let r = 0; r < pivotCols.length; r++) {
            const col = prowToCol[r];
            let s = 0;
            for (let j = 0; j < n; j++) {
                if (j !== col && (aug[r][j] % p) !== 0) s = (s + aug[r][j] * vec[j]) % p;
            }
            vec[col] = ((-s) % p + p) % p;
        }
        basis.push(vec);
    }
    return { ok: true, x: x0, basis: basis, aug: aug, pivotCols: pivotCols };
}

/* ---------- 辅助：矩阵向量乘模 m ---------- */
function matVecMod(A, vec, m) {
    const n = A.length;
    const res = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        let s = 0;
        const row = A[i];
        for (let j = 0; j < n; j++) s = (s + row[j] * vec[j]) % m;
        res[i] = (s + m) % m;
    }
    return res;
}

/* ---------- 在 p^e 上提升（Hensel-style） ---------- */
function liftSolutionToPe(A, b, p, e, x0_mod_p, basis_mod_p) {
    const n = A.length;
    const mod = Math.pow(p, e);
    let x_full = x0_mod_p.map(v => ((v % p) + p) % p);
    let basis_full = basis_mod_p.map(vec => vec.map(v => ((v % p) + p) % p));

    for (let k = 1; k < e; k++) {
        const cur_mod = Math.pow(p, k);
        const next_mod = cur_mod * p;
        // 特解提升
        const Ax = matVecMod(A, x_full, next_mod);
        const r = new Array(n);
        for (let i = 0; i < n; i++) {
            r[i] = ((b[i] - Ax[i]) % next_mod + next_mod) % next_mod;
            if (r[i] % cur_mod !== 0) throw new Error(`提升失败：残差不可整除 p^k (p=${p}, k=${k})`);
        }
        const rhs = r.map(ri => ((Math.floor(ri / cur_mod) % p) + p) % p);
        const sol = gfPEliminate(A, rhs, p);
        if (!sol.ok) throw new Error(`提升失败：在 GF(${p}) 无解（p=${p}, k=${k}）`);
        const t0 = sol.x;
        for (let j = 0; j < n; j++) x_full[j] = (x_full[j] + cur_mod * (t0[j] % p)) % next_mod;

        // 基向量提升
        let new_basis = [];
        let fallback = false;
        for (const v of basis_full) {
            const Av = matVecMod(A, v, next_mod);
            const rhs_v = Av.map(av => ((-Math.floor(av / cur_mod)) % p + p) % p);
            const solv = gfPEliminate(A, rhs_v, p);
            if (!solv.ok) {
                fallback = true;
                break;
            } else {
                const w0 = solv.x;
                const vnew = v.map((val, j) => (val + cur_mod * (w0[j] % p)) % next_mod);
                new_basis.push(vnew);
            }
        }
        if (fallback) {
            // 退回：在 next_mod 上直接做整数模消元求零空间（慢但稳妥）
            basis_full = computeNullspaceModM(A, next_mod);
        } else {
            basis_full = new_basis;
        }
    }

    return [x_full.map(v => ((v % mod) + mod) % mod), basis_full.map(vec => vec.map(v => ((v % mod) + mod) % mod)), mod];
}

/* ---------- 退化路径：在任意模 m 上直接求零空间（整数消元） ---------- */
function computeNullspaceModM(A, m) {
    const n = A.length;
    const aug = Array.from({ length: n }, (_, i) => {
        const row = new Array(n + 1);
        for (let j = 0; j < n; j++) row[j] = ((A[i][j] % m) + m) % m;
        row[n] = 0;
        return row;
    });

    let row = 0;
    const pivotCols = [];
    for (let col = 0; col < n; col++) {
        let sel = -1;
        for (let r = row; r < n; r++) if (aug[r][col] % m !== 0) { sel = r; break; }
        if (sel === -1) continue;
        [aug[row], aug[sel]] = [aug[sel], aug[row]];
        const inv = modInv(aug[row][col], m);
        if (inv === null) { // 无逆，跳过这个列（退化处理）
            continue;
        }
        for (let c = col; c <= n; c++) aug[row][c] = (aug[row][c] * inv) % m;
        for (let r = 0; r < n; r++) {
            if (r !== row && aug[r][col] !== 0) {
                const factor = aug[r][col];
                for (let c = col; c <= n; c++) {
                    aug[r][c] = (aug[r][c] - factor * aug[row][c]) % m;
                    if (aug[r][c] < 0) aug[r][c] += m;
                }
            }
        }
        pivotCols.push(col);
        row++;
        if (row === n) break;
    }

    const pivotSet = new Set(pivotCols);
    const freeCols = [];
    for (let c = 0; c < n; c++) if (!pivotSet.has(c)) freeCols.push(c);
    const basis = [];
    for (const fc of freeCols) {
        const v = new Array(n).fill(0);
        v[fc] = 1;
        for (let r = 0; r < pivotCols.length; r++) {
            const col = pivotCols[r];
            let s = 0;
            for (let j = 0; j < n; j++) {
                if (j !== col) s = (s + aug[r][j] * v[j]) % m;
            }
            v[col] = ((-s) % m + m) % m;
        }
        basis.push(v);
    }
    return basis;
}

/* ---------- 把各个素因子幂下的解用 CRT 合并 ---------- */
function combineSolutionsByCRT(parts) {
    // parts: [ [x0_i (len n), basis_i (list of len-n vec), mi], ... ]
    if (parts.length === 0) return [[], [], 1];
    const n = parts[0][0].length;
    // 合并特解
    let x0 = parts[0][0].slice();
    let M = parts[0][2];
    for (let k = 1; k < parts.length; k++) {
        const [xk, _, mk] = parts[k];
        const newX = new Array(n);
        for (let j = 0; j < n; j++) {
            const [a, mm] = crtPair(x0[j], M, xk[j], mk);
            newX[j] = ((a % mm) + mm) % mm;
        }
        x0 = newX;
        M = (M / egcd(M, mk)[0]) * mk; // M *= mk / gcd(M,mk) but factorization ensures coprime
    }
    // 合并基：把每个模的基向量扩展到全模（当前做法：对某个模的基向量，在其它模上取0，再 CRT 合并）
    const basisFull = [];
    for (let partIdx = 0; partIdx < parts.length; partIdx++) {
        const [x_part, basis_part, m_part] = parts[partIdx];
        if (!basis_part || basis_part.length === 0) continue;
        for (const vec of basis_part) {
            const merged = new Array(n).fill(0);
            for (let j = 0; j < n; j++) {
                // 当前分量： vec[j] mod m_part；其他分量为 0 mod other_m
                let curA = vec[j] % m_part;
                let curM = m_part;
                // 合并其它模（分解 parts）
                for (let k = 0; k < parts.length; k++) {
                    if (k === partIdx) continue;
                    const mk = parts[k][2];
                    // merge curA (mod curM) with 0 (mod mk)
                    const [aNew, mNew] = crtPair(curA, curM, 0, mk);
                    curA = aNew; curM = mNew;
                }
                merged[j] = ((curA % curM) + curM) % curM;
            }
            basisFull.push(merged.map(v => v % M));
        }
    }
    return [x0.map(v => v % M), basisFull, M];
}

/* ---------- 主类：NStateMatrixSolver ---------- */
class NStateMatrixSolver {
    constructor(matrix, nState = 3) {
        this.matrix = matrix;
        this.nState = Math.floor(nState);
        this.m = matrix.length;
        this.n = this.m > 0 ? matrix[0].length : 0;
        // 推导 A x = b (first-row variables)
        this._A = [];
        this._b = [];
        this._deriveFirstRowSystem();
        this._hasSolution = null;
        this._minFlips = null;
        this._firstRow = null;
        this._fullPlan = null;
    }

    _deriveFirstRowSystem() {
        if (this.m === 0 || this.n === 0) { this._A = []; this._b = []; return; }
        let currCoeff = Array.from({ length: this.n }, (_, c) => Array.from({ length: this.n }, (__, j) => (c === j ? 1 : 0)));
        let currConst = new Array(this.n).fill(0);
        let prevCoeff = null, prevConst = null;
        for (let r = 0; r < this.m - 1; r++) {
            const nextCoeff = Array.from({ length: this.n }, () => new Array(this.n).fill(0));
            const nextConst = new Array(this.n).fill(0);
            const rowInit = this.matrix[r];
            for (let c = 0; c < this.n; c++) {
                let constTerm = ((rowInit[c] % this.nState) + this.nState) % this.nState;
                const coeff = new Array(this.n).fill(0);
                if (prevCoeff) {
                    for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + prevCoeff[c][j]) % this.nState;
                    constTerm = (constTerm + prevConst[c]) % this.nState;
                }
                if (c > 0) {
                    for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c - 1][j]) % this.nState;
                    constTerm = (constTerm + currConst[c - 1]) % this.nState;
                }
                for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c][j]) % this.nState;
                constTerm = (constTerm + currConst[c]) % this.nState;
                if (c < this.n - 1) {
                    for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c + 1][j]) % this.nState;
                    constTerm = (constTerm + currConst[c + 1]) % this.nState;
                }
                for (let j = 0; j < this.n; j++) nextCoeff[c][j] = ((-coeff[j]) % this.nState + this.nState) % this.nState;
                nextConst[c] = ((-constTerm) % this.nState + this.nState) % this.nState;
            }
            prevCoeff = currCoeff; prevConst = currConst;
            currCoeff = nextCoeff; currConst = nextConst;
        }
        // 最后一行
        this._A = Array.from({ length: this.n }, () => new Array(this.n).fill(0));
        this._b = new Array(this.n).fill(0);
        const lastRow = this.matrix[this.m - 1];
        for (let c = 0; c < this.n; c++) {
            let constTerm = ((lastRow[c] % this.nState) + this.nState) % this.nState;
            const coeff = new Array(this.n).fill(0);
            if (this.m > 1) {
                for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + prevCoeff[c][j]) % this.nState;
                constTerm = (constTerm + prevConst[c]) % this.nState;
            }
            if (c > 0) {
                for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c - 1][j]) % this.nState;
                constTerm = (constTerm + currConst[c - 1]) % this.nState;
            }
            for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c][j]) % this.nState;
            constTerm = (constTerm + currConst[c]) % this.nState;
            if (c < this.n - 1) {
                for (let j = 0; j < this.n; j++) coeff[j] = (coeff[j] + currCoeff[c + 1][j]) % this.nState;
                constTerm = (constTerm + currConst[c + 1]) % this.nState;
            }
            for (let j = 0; j < this.n; j++) this._A[c][j] = ((coeff[j] % this.nState) + this.nState) % this.nState;
            this._b[c] = ((-constTerm) % this.nState + this.nState) % this.nState;
        }
    }

    _solveViaPrimePowerDecomposition() {
        const N = this.nState;
        if (N === 1) return { ok: true, x0: new Array(this.n).fill(0), basis: [], mod: 1 };
        const parts = [];
        const fac = factorize(N);
        for (const [p, e] of fac) {
            // 在 GF(p) 上求解
            const solP = gfPEliminate(this._A, this._b, p);
            if (!solP.ok) return { ok: false };
            // 提升到 p^e
            let x0_pe, basis_pe, mod_pe;
            try {
                [x0_pe, basis_pe, mod_pe] = liftSolutionToPe(this._A, this._b, p, e, solP.x, solP.basis);
            } catch (err) {
                // 若提升失败则认为无解（与 Python 逻辑一致）
                return { ok: false };
            }
            parts.push([x0_pe, basis_pe, mod_pe]);
        }
        const [x0N, basisN, M] = combineSolutionsByCRT(parts);
        return { ok: true, x0: x0N, basis: basisN, mod: M };
    }

    _propagateFullPlan(firstRow) {
        if (this.m === 0 || this.n === 0) return { plan: [], cost: 0 };
        const full = Array.from({ length: this.m }, () => new Array(this.n).fill(0));
        full[0] = firstRow.map(v => ((v % this.nState) + this.nState) % this.nState);
        let total = full[0].reduce((a, b) => a + b, 0);
        for (let r = 0; r < this.m - 1; r++) {
            for (let c = 0; c < this.n; c++) {
                let s = this.matrix[r][c] % this.nState;
                s = (s + full[r][c]) % this.nState;
                if (c > 0) s = (s + full[r][c - 1]) % this.nState;
                if (c < this.n - 1) s = (s + full[r][c + 1]) % this.nState;
                if (r > 0) s = (s + full[r - 1][c]) % this.nState;
                const val = ((-s) % this.nState + this.nState) % this.nState;
                full[r + 1][c] = val;
                total += val;
            }
        }
        return { plan: full, cost: total };
    }

    solve(options = {}) {
        const enum_limit = options.enum_limit || 1e6;
        const max_enum_dim = options.max_enum_dim || 10;

        const decomposed = this._solveViaPrimePowerDecomposition();
        if (!decomposed.ok) { this._hasSolution = false; this._minFlips = -1; this._firstRow = []; this._fullPlan = []; return { minFlips: -1, firstRow: [] }; }
        this._hasSolution = true;
        let x0 = decomposed.x0.map(v => ((v % this.nState) + this.nState) % this.nState);
        let basis = decomposed.basis.map(vec => vec.map(v => ((v % this.nState) + this.nState) % this.nState));
        const k = basis.length;

        let best = x0.slice();
        let bestPlan = this._propagateFullPlan(best);
        let bestCost = bestPlan.cost;

        if (k > 0) {
            const totalComb = Math.pow(this.nState, k);
            if (k <= max_enum_dim && totalComb <= enum_limit) {
                // 全枚举
                const indices = Array(k).fill(0);
                const rec = (pos) => {
                    if (pos === k) {
                        const cand = x0.slice();
                        for (let i = 0; i < k; i++) {
                            const coeff = indices[i];
                            if (coeff === 0) continue;
                            const bi = basis[i];
                            for (let j = 0; j < this.n; j++) cand[j] = (cand[j] + coeff * bi[j]) % this.nState;
                        }
                        const { cost } = this._propagateFullPlan(cand);
                        if (cost < bestCost) { bestCost = cost; best = cand.slice(); }
                        return;
                    }
                    for (let v = 0; v < this.nState; v++) {
                        indices[pos] = v;
                        rec(pos + 1);
                    }
                };
                rec(0);
            } else {
                // 随机采样 + 局部改进
                const tries = Math.min(20000, totalComb);
                for (let t = 0; t < tries; t++) {
                    const comb = Array.from({ length: k }, () => Math.floor(Math.random() * this.nState));
                    const cand = x0.slice();
                    for (let i = 0; i < k; i++) {
                        const coeff = comb[i];
                        if (coeff === 0) continue;
                        const bi = basis[i];
                        for (let j = 0; j < this.n; j++) cand[j] = (cand[j] + coeff * bi[j]) % this.nState;
                    }
                    const { cost } = this._propagateFullPlan(cand);
                    if (cost < bestCost) { bestCost = cost; best = cand.slice(); }
                }
                // 局部改进：单个自由变量逐值检查
                for (let i = 0; i < k; i++) {
                    let improved = true;
                    while (improved) {
                        improved = false;
                        for (let val = 0; val < this.nState; val++) {
                            const comb = new Array(k).fill(0);
                            comb[i] = val;
                            const cand = x0.slice();
                            for (let t = 0; t < k; t++) {
                                const coeff = comb[t];
                                if (coeff === 0) continue;
                                const bi = basis[t];
                                for (let j = 0; j < this.n; j++) cand[j] = (cand[j] + coeff * bi[j]) % this.nState;
                            }
                            const { cost } = this._propagateFullPlan(cand);
                            if (cost < bestCost) { bestCost = cost; best = cand.slice(); improved = true; }
                        }
                    }
                }
            }
        }

        this._minFlips = bestCost;
        this._firstRow = best.slice();
        this._fullPlan = this._propagateFullPlan(best).plan;
        return { minFlips: this._minFlips, firstRow: this._firstRow };
    }

    get hasSolution() { return this._hasSolution; }
    get fullPlan() { return this._fullPlan ? this._fullPlan.map(r => r.slice()) : []; }
}