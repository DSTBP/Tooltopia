import numpy as np
import time
import random
from math import gcd

# -------------------- GF(2) 求解器（位运算实现，高速） --------------------
def gf2_solve(A, b):
    """
    Solve A x = b over GF(2).
    A: (m, n) numpy array of {0,1}
    b: (m,) numpy array of {0,1}
    Returns: (particular_solution (n,), basis_list [ (n,) , ... ])
    If no solution returns (None, None)
    Implementation uses bitmasks for speed.
    """
    m, n = A.shape
    # build row masks: lower n bits are columns, bit n is RHS
    rows = []
    for i in range(m):
        mask = 0
        row = A[i]
        # pack bits
        for j in range(n):
            if int(row[j]) & 1:
                mask |= (1 << j)
        if int(b[i]) & 1:
            mask |= (1 << n)
        rows.append(mask)

    pivot_cols = []
    row = 0
    for col in range(n):
        # find pivot row with bit at col
        sel = None
        for r in range(row, m):
            if (rows[r] >> col) & 1:
                sel = r
                break
        if sel is None:
            continue
        # swap
        rows[row], rows[sel] = rows[sel], rows[row]
        # eliminate other rows
        for r in range(m):
            if r != row and ((rows[r] >> col) & 1):
                rows[r] ^= rows[row]
        pivot_cols.append(col)
        row += 1
        if row == m:
            break

    # check inconsistency: 0 .. 0 | 1
    for r in range(row, m):
        if (rows[r] & ((1 << n) - 1)) == 0:
            if ((rows[r] >> n) & 1) == 1:
                return None, None

    # build particular solution (free vars = 0)
    x0 = np.zeros(n, dtype=np.int64)
    for r_idx, c in enumerate(pivot_cols):
        x0[c] = (rows[r_idx] >> n) & 1

    # build nullspace basis: one vector per free var
    free_vars = [c for c in range(n) if c not in pivot_cols]
    basis = []
    for fv in free_vars:
        v = np.zeros(n, dtype=np.int64)
        v[fv] = 1
        for r_idx, c in enumerate(pivot_cols):
            # if pivot row has a 1 in column fv, then pivot var depends on free var
            if ((rows[r_idx] >> fv) & 1):
                v[c] = 1
        basis.append(v)
    return x0, basis

# -------------------- 工具：将矩阵约化为行和列和问题 --------------------
class AlienTilesSolver:
    """
    高性能 Alien Tiles 求解器（模 4）。
    通过变量降维：引入 R_i（第 i 行的 x 之和）和 C_j（第 j 列的 x 之和），
    推导得到 (m+n) × (m+n) 的线性系统在模 4 上求解，然后恢复每个 x_{i,j}。
    对模 4 的解采用 mod2 求解 + 提升技术（Hensel 风格）并在自由度较小时枚举以获得最小步数解。
    """
    def __init__(self, matrix, modulus=4, max_enum_bits=20):
        """
        matrix: 原始 m x n 矩阵（元素整数）
        modulus: 默认为 4
        max_enum_bits: 当 mod2 自由变量 <=  max_enum_bits 时进行精确枚举；否则用启发式
        """
        self.Amat = np.array(matrix, dtype=int) % modulus
        self.modulus = modulus
        self.m, self.n = self.Amat.shape
        self.N = self.m + self.n  # R_i 和 C_j 的数量
        self.max_enum_bits = max_enum_bits

        # precompute row/col sums (mod modulus)
        self.SRow = np.sum(self.Amat, axis=1) % modulus    # length m
        self.SCol = np.sum(self.Amat, axis=0) % modulus    # length n
        self.T = int(np.sum(self.Amat) % modulus)         # total sum mod modulus

        # build small system M y = s  (y = [R_0..R_{m-1}, C_0..C_{n-1}])
        self.M = self._build_M()
        self.s = np.concatenate((self.SRow, self.SCol)) % self.modulus

    def _build_M(self):
        """构造 (m+n)x(m+n) 的系数矩阵 M（模 modulus）"""
        m, n = self.m, self.n
        N = self.N
        M = np.zeros((N, N), dtype=int)
        kR = (1 - n) % self.modulus  # diag coeff for R_i
        kC = (1 - m) % self.modulus  # diag coeff for C_j

        # top-left block (m x m)
        for i in range(m):
            M[i, i] = kR
        # top-right (m x n): all -1
        for i in range(m):
            for j in range(n):
                M[i, m + j] = (-1) % self.modulus

        # bottom-left (n x m): all -1
        for j in range(n):
            for i in range(m):
                M[m + j, i] = (-1) % self.modulus

        # bottom-right (n x n) diag
        for j in range(n):
            M[m + j, m + j] = kC

        return M % self.modulus

    # ---------- 主求解流程 ----------
    def solve(self, exact_minimize=True):
        """
        求解并返回 flips 矩阵（m x n），其中每个元素 ∈ {0,1,2,3} 表示翻转次数（模 4）。
        如果 exact_minimize 为 True，且自由度较小，将穷举以保证最小步数；否则返回可行解（并尽可能小）。
        返回 (flips_matrix (m x n) as list of lists, info dict)
        info 包含诊断与耗时
        """
        t0 = time.time()
        M = self.M.copy() % self.modulus
        s = self.s.copy() % self.modulus
        N = self.N

        # 必要条件：模 2 可解
        M2 = M % 2
        s2 = s % 2
        y0_2, basis2 = gf2_solve(M2, s2)
        if y0_2 is None:
            return None, {"reason": "no_solution_mod2", "time_ms": (time.time()-t0)*1000}

        # convert to numpy arrays of ints
        y0_2 = np.array(y0_2, dtype=np.int64)
        basis2 = [np.array(b, dtype=np.int64) for b in basis2]
        dim_y2 = len(basis2)

        best = None
        best_sum = None
        tried = 0

        # helper to compute full solution from y (length N mod 4) -> flips x (m,n)
        def compute_x_from_y(y_mod4):
            R = y_mod4[:self.m] % self.modulus
            C = y_mod4[self.m:] % self.modulus
            # x_{i,j} = R_i + C_j + a_{i,j} mod 4
            # compute efficiently with broadcasting
            X = (R.reshape(-1, 1) + C.reshape(1, -1) + self.Amat) % self.modulus
            return X

        # method to evaluate candidate y2 (mod2 vector)
        def process_y2(y2_vec):
            nonlocal best, best_sum, tried
            tried += 1
            # compute residual r = s - M*y2 (mod 4)
            # note: y2_vec are 0/1, promote to int
            My2 = (M.dot(y2_vec) % self.modulus)
            r = (s - My2) % self.modulus
            # for lift to mod4, r must be all even (divisible by 2)
            if np.any(r % 2 != 0):
                return
            r2 = (r // 2) % 2  # RHS for t-equation over GF(2): M t ≡ r2 (mod2)

            # Solve M2 t = r2 over GF(2)
            t0_vec, t_basis = gf2_solve(M2, r2)
            if t0_vec is None:
                return

            # if small number of free vars in t, enumerate t space; 否则启发式
            dim_t = len(t_basis)

            # exact enumeration cutoff for combined complexity
            if exact_minimize and dim_t <= self.max_enum_bits:
                # enumerate all t choices exactly
                if dim_t == 0:
                    candidates_t = [t0_vec]
                else:
                    candidates_t = []
                    # generate via integers
                    for mask in range(1 << dim_t):
                        t = t0_vec.copy()
                        for k in range(dim_t):
                            if ((mask >> k) & 1):
                                t ^= t_basis[k]
                        candidates_t.append(t)
                for tvec in candidates_t:
                    y_mod4 = (y2_vec + 2 * tvec) % self.modulus
                    X = compute_x_from_y(y_mod4)
                    total = int(X.sum())
                    if (best is None) or (total < best_sum):
                        best = X.copy()
                        best_sum = total
                return
            else:
                # too many t free vars: use greedy local search starting from t0
                # start with t0, try flipping each free basis vector if it improves sum
                tvec = t0_vec.copy()
                y_mod4 = (y2_vec + 2 * tvec) % self.modulus
                X = compute_x_from_y(y_mod4)
                cur_sum = int(X.sum())
                improved = True
                iteration = 0
                max_iter = 2000  # safeguard
                while improved and iteration < max_iter:
                    improved = False
                    iteration += 1
                    # try flipping each basis vector individually
                    for k in range(dim_t):
                        cand = tvec ^ t_basis[k]
                        y_mod4_c = (y2_vec + 2 * cand) % self.modulus
                        Xc = compute_x_from_y(y_mod4_c)
                        sc = int(Xc.sum())
                        if sc < cur_sum:
                            tvec = cand
                            X = Xc
                            cur_sum = sc
                            improved = True
                    # also try flipping random single variables (rows/cols) to escape local minima
                    if not improved and iteration % 10 == 0:
                        # random flip some basis vectors greedily
                        k = random.randrange(0, dim_t) if dim_t>0 else None
                        if k is not None:
                            cand = tvec ^ t_basis[k]
                            y_mod4_c = (y2_vec + 2 * cand) % self.modulus
                            Xc = compute_x_from_y(y_mod4_c)
                            sc = int(Xc.sum())
                            if sc < cur_sum:
                                tvec = cand
                                X = Xc
                                cur_sum = sc
                                improved = True
                # accept result
                if (best is None) or (cur_sum < best_sum):
                    best = X.copy()
                    best_sum = cur_sum
                return

        # enumerate y2 choices (mod2 solutions). If many free bits, restrict enumeration.
        if dim_y2 == 0:
            # unique mod2 solution
            process_y2(y0_2)
        elif dim_y2 <= self.max_enum_bits and exact_minimize:
            # exact enumeration
            for mask in range(1 << dim_y2):
                y2 = y0_2.copy()
                for k in range(dim_y2):
                    if ((mask >> k) & 1):
                        y2 ^= basis2[k]
                process_y2(y2)
        else:
            # too many free vars in y2 -> heuristic:
            # 1) try particular solution with free bits = 0
            process_y2(y0_2)
            # 2) try several random samples of free variables (stochastic search)
            tries = min(512, 1 << min(dim_y2, 20))
            for _ in range(tries):
                # build random combination of basis vectors
                y2 = y0_2.copy()
                # sample some subset
                # to explore space, pick random mask with ~50% density up to 20 bits
                for k in range(dim_y2):
                    if random.getrandbits(1):
                        y2 ^= basis2[k]
                process_y2(y2)

        end = time.time()
        info = {
            "time_ms": (end - t0) * 1000.0,
            "tried_mod2_variants": tried,
            "best_sum": int(best_sum) if best is not None else None
        }

        if best is None:
            return None, {"reason": "no_lifted_solution", **info}

        # convert best (numpy array) to list of lists
        flips = (best % self.modulus).astype(int).tolist()
        return flips, info

# -------------------- 验证函数（同你原来逻辑，稍微稳健一些） --------------------
def verify_solution(original_matrix, flip_matrix, modulus=4):
    """
    验证 Alien Tiles 求解结果是否正确：
    original_matrix: m x n list or array
    flip_matrix: m x n list or array
    返回 (True/False, message)
    """
    original = np.array(original_matrix, dtype=int) % modulus
    flips = np.array(flip_matrix, dtype=int) % modulus
    if original.shape != flips.shape:
        return False, f"尺寸不匹配: 原始矩阵 {original.shape}, 翻转矩阵 {flips.shape}"
    m, n = original.shape
    result = original.copy()

    for r in range(m):
        for c in range(n):
            cnt = int(flips[r, c]) % modulus
            if cnt == 0:
                continue
            # add to whole row
            result[r, :] = (result[r, :] + cnt) % modulus
            # add to whole column except intersection
            for i in range(m):
                if i != r:
                    result[i, c] = (result[i, c] + cnt) % modulus

    if np.all(result % modulus == 0):
        return True, "验证通过: 翻转后矩阵为全零矩阵"
    else:
        non_zero = np.argwhere((result % modulus) != 0)
        return False, f"验证失败: 翻转后仍有非零元素，位置: {non_zero.tolist()}, 结果矩阵:\n{result}"

# -------------------- 主运行示例与 50x50 测试 --------------------
if __name__ == "__main__":
    # 你给的 3x3 测试
    # matrix = [
    #     [2, 2, 1],
    #     [0, 2, 3],
    #     [3, 3, 3]
    # ]


    rows, cols = 20, 20
    nstate = 4

    # for _ in range(1000):
    matrix = [[random.randint(0, nstate-1) for _ in range(cols)] for _ in range(rows)]

    print(matrix)

    solver = AlienTilesSolver(matrix, modulus=4, max_enum_bits=20)
    start = time.time()
    flips, info = solver.solve(exact_minimize=True)
    end = time.time()

    print("初始矩阵：")
    print(np.array(matrix))
    print(f"求解时间: {(end - start)*1000:.5f} ms")
    if flips is None:
        print("无解或无法提升到 mod4：", info)
    else:
        print("次数矩阵:")
        print(np.array(flips))
        valid, msg = verify_solution(matrix, flips, modulus=4)
        print("验证：", msg)

    '''
    初始矩阵：
    [[2 2 1]
    [0 2 3]
    [3 3 3]]
    求解时间: 0.00000 ms
    求得次数矩阵 flips:
    [[2 1 0]
    [2 3 0]
    [1 0 0]]
    验证： 验证通过: 翻转后矩阵为全零矩阵
    '''