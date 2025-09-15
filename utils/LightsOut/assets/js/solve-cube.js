class LightsOutCubeSolver {
    /*
    3D点灯游戏（立方体）求解器
    核心逻辑：GF(2)高斯消元 + 自由变量枚举，获取最少翻转次数与完整翻转路径
    立方体表示：6个面（U=0, L=1, F=2, R=3, B=4, D=5），每个面 n x n 个灯
    编号规则：index = face*n*n + r*n + c
    */
    constructor(cube) {
        this.validateCube(cube);
        this.cube = cube;
        this.n = cube[0].length;  // 每个面的边长
        this.size = 6 * this.n * this.n;  // 总灯数
        
        // 初始化求解过程变量
        this.A = Array.from({ length: this.size }, () => new Array(this.size).fill(0));  // 系数矩阵
        this.b = new Array(this.size).fill(0);  // 常数项
        this.hasSolution = false;  // 是否有解
        this.minFlips = -1;  // 最少翻转次数
        this.bestSolution = [];  // 最优翻转方案
        this.buildCoeffMatrix();  // 构建系数矩阵
    }

    validateCube(cube) {
        // 校验面数
        if (!Array.isArray(cube) || cube.length !== 6) {
            throw new Error("输入立方体必须包含6个面（U, L, F, R, B, D）");
        }
        
        // 校验每个面的尺寸
        const n = cube[0].length;
        if (n === 0) throw new Error("每个面的矩阵不能为空");
        
        // 校验所有面尺寸一致且元素为0/1
        for (const face of cube) {
            if (!Array.isArray(face) || face.length !== n) {
                throw new Error(`所有面必须为${n}×${n}的矩阵`);
            }
            for (const row of face) {
                if (!Array.isArray(row) || row.length !== n) {
                    throw new Error(`所有面必须为${n}×${n}的矩阵`);
                }
                for (const val of row) {
                    if (val !== 0 && val !== 1) {
                        throw new Error("立方体元素必须为二进制（0 或 1）");
                    }
                }
            }
        }
    }

    index(face, r, c) {
        return face * this.n * this.n + r * this.n + c;
    }

    neighbors(face, r, c) {
        const res = [this.index(face, r, c)];  // 自身
        
        // 面内邻居（上下左右）
        if (r > 0) res.push(this.index(face, r - 1, c));
        if (r < this.n - 1) res.push(this.index(face, r + 1, c));
        if (c > 0) res.push(this.index(face, r, c - 1));
        if (c < this.n - 1) res.push(this.index(face, r, c + 1));
        
        // 跨面邻居（立方体相邻面）
        // 上面 (U=0)
        if (face === 0) {
            if (r === 0) res.push(this.index(4, 0, this.n - 1 - c));
            if (r === this.n - 1) res.push(this.index(2, 0, c));
            if (c === 0) res.push(this.index(1, 0, r));
            if (c === this.n - 1) res.push(this.index(3, 0, this.n - 1 - r));
        }
        // 下面 (D=5)
        else if (face === 5) {
            if (r === 0) res.push(this.index(2, this.n - 1, c));
            if (r === this.n - 1) res.push(this.index(4, this.n - 1, this.n - 1 - c));
            if (c === 0) res.push(this.index(1, this.n - 1, this.n - 1 - r));
            if (c === this.n - 1) res.push(this.index(3, this.n - 1, r));
        }
        // 前面 (F=2)
        else if (face === 2) {
            if (r === 0) res.push(this.index(0, this.n - 1, c));
            if (r === this.n - 1) res.push(this.index(5, 0, c));
            if (c === 0) res.push(this.index(1, r, this.n - 1));
            if (c === this.n - 1) res.push(this.index(3, r, 0));
        }
        // 后面 (B=4)
        else if (face === 4) {
            if (r === 0) res.push(this.index(0, 0, this.n - 1 - c));
            if (r === this.n - 1) res.push(this.index(5, this.n - 1, this.n - 1 - c));
            if (c === 0) res.push(this.index(3, this.n - 1 - r, this.n - 1));
            if (c === this.n - 1) res.push(this.index(1, this.n - 1 - r, 0));
        }
        // 左面 (L=1)
        else if (face === 1) {
            if (r === 0) res.push(this.index(0, c, 0));
            if (r === this.n - 1) res.push(this.index(5, this.n - 1 - c, 0));
            if (c === 0) res.push(this.index(4, r, this.n - 1));
            if (c === this.n - 1) res.push(this.index(2, r, 0));
        }
        // 右面 (R=3)
        else if (face === 3) {
            if (r === 0) res.push(this.index(0, this.n - 1 - c, this.n - 1));
            if (r === this.n - 1) res.push(this.index(5, c, this.n - 1));
            if (c === 0) res.push(this.index(2, r, this.n - 1));
            if (c === this.n - 1) res.push(this.index(4, r, 0));
        }
        
        return res;
    }

    buildCoeffMatrix() {
        // 构建系数矩阵A
        for (let face = 0; face < 6; face++) {
            for (let r = 0; r < this.n; r++) {
                for (let c = 0; c < this.n; c++) {
                    const rowIdx = this.index(face, r, c);
                    for (const colIdx of this.neighbors(face, r, c)) {
                        this.A[rowIdx][colIdx] ^= 1;  // GF(2)加法
                    }
                }
            }
        }
        
        // 构建常数项b（初始状态）
        for (let face = 0; face < 6; face++) {
            for (let r = 0; r < this.n; r++) {
                for (let c = 0; c < this.n; c++) {
                    const idx = this.index(face, r, c);
                    this.b[idx] = this.cube[face][r][c] & 1;
                }
            }
        }
    }

    gaussianEliminationRREF() {
        // 构造增广矩阵
        const augmented = this.A.map((row, i) => [...row, this.b[i]]);
        const rowsBits = augmented.map(row => [...row]);
        const pivotCols = new Array(this.size).fill(-1);
        let rank = 0;

        // 高斯消元主循环
        for (let col = 0; col < this.size; col++) {
            // 寻找主元行
            let pivot = -1;
            for (let r = rank; r < this.size; r++) {
                if (rowsBits[r][col] === 1) {
                    pivot = r;
                    break;
                }
            }
            if (pivot === -1) continue;  // 自由变量
            
            // 交换行
            [rowsBits[rank], rowsBits[pivot]] = [rowsBits[pivot], rowsBits[rank]];
            pivotCols[rank] = col;
            
            // 消元
            for (let r = 0; r < this.size; r++) {
                if (r !== rank && rowsBits[r][col] === 1) {
                    for (let c = 0; c <= this.size; c++) {
                        rowsBits[r][c] ^= rowsBits[rank][c];  // GF(2)减法
                    }
                }
            }
            rank++;
        }

        // 检查无解情况
        for (let r = rank; r < this.size; r++) {
            let allZero = true;
            for (let c = 0; c < this.size; c++) {
                if (rowsBits[r][c] !== 0) {
                    allZero = false;
                    break;
                }
            }
            if (allZero && rowsBits[r][this.size] === 1) {
                return [false, [], rank, [], rowsBits, pivotCols];
            }
        }

        // 构造特解（自由变量置0）
        const x0 = new Array(this.size).fill(0);
        for (let r = rank - 1; r >= 0; r--) {
            const pc = pivotCols[r];
            if (pc === -1) continue;
            
            let rhs = rowsBits[r][this.size];
            for (let c = pc + 1; c < this.size; c++) {
                rhs ^= rowsBits[r][c] * x0[c];
            }
            x0[pc] = rhs % 2;
        }

        // 确定自由列
        const pivotSet = new Set(pivotCols.slice(0, rank));
        const freeCols = [];
        for (let c = 0; c < this.size; c++) {
            if (!pivotSet.has(c)) freeCols.push(c);
        }

        return [true, x0, rank, freeCols, rowsBits, pivotCols];
    }

    backSubstituteWithFree(rowsBits, pivotCols, freeCols, freeAssignment) {
        const x = new Array(this.size).fill(0);
        // 赋值自由变量
        freeCols.forEach((col, idx) => {
            x[col] = freeAssignment[idx];
        });
        
        // 回代求解主元变量
        for (let r = 0; r < pivotCols.length; r++) {
            const pc = pivotCols[r];
            if (pc === -1) continue;
            
            let sum = rowsBits[r][this.size];  // 常数项
            for (let c = 0; c < this.size; c++) {
                if (c !== pc && rowsBits[r][c] === 1) {
                    sum ^= x[c];
                }
            }
            x[pc] = sum;
        }
        
        return x;
    }

    calculateFlips(solution) {
        return solution.reduce((sum, val) => sum + val, 0);
    }

    solve(maxEnumBits = 20) {
        // 高斯消元求解方程组
        const [ok, x0, rank, freeCols, rowsBits, pivotCols] = this.gaussianEliminationRREF();
        this.hasSolution = ok;
        if (!ok) {
            this.minFlips = -1;
            this.bestSolution = [];
            return [this.minFlips, []];
        }
        
        // 初始化最优解
        this.bestSolution = [...x0];
        this.minFlips = this.calculateFlips(x0);
        
        // 枚举自由变量
        const k = freeCols.length;
        if (k > 0 && k <= maxEnumBits) {
            const totalCases = 1 << k;
            for (let mask = 1; mask < totalCases; mask++) {
                // 生成自由变量赋值
                const freeAssignment = [];
                for (let i = 0; i < k; i++) {
                    freeAssignment.push((mask >> i) & 1);
                }
                
                // 回代求解
                const solution = this.backSubstituteWithFree(
                    rowsBits, pivotCols, freeCols, freeAssignment
                );
                
                // 更新最优解
                const flips = this.calculateFlips(solution);
                if (flips < this.minFlips) {
                    this.minFlips = flips;
                    this.bestSolution = solution;
                }
            }
        }
        
        // 转换为立方体格式
        const bestPlan = this.solutionToCube(this.bestSolution);
        return [this.minFlips, bestPlan];
    }

    solutionToCube(solution) {
        const cubePlan = Array.from({ length: 6 }, () => 
            Array.from({ length: this.n }, () => new Array(this.n).fill(0))
        );
        
        for (let face = 0; face < 6; face++) {
            for (let r = 0; r < this.n; r++) {
                for (let c = 0; c < this.n; c++) {
                    const idx = this.index(face, r, c);
                    cubePlan[face][r][c] = solution[idx];
                }
            }
        }
        return cubePlan;
    }
};