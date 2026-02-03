document.addEventListener('DOMContentLoaded', () => {
    const displayEl = document.getElementById('display');
    const evalBtn = document.getElementById('evalBtn');
    const clearBtn = document.getElementById('clearBtn');
    const backBtn = document.getElementById('backBtn');
    const buttons = Array.from(document.querySelectorAll('.btn-calc'));
    const historyEl = document.getElementById('history');
    const precisionEl = document.getElementById('precision');
    const angleModeEl = document.getElementById('angleMode');
    const displayModeEl = document.getElementById('displayMode');
    const logBaseEl = document.getElementById('logBase');
    const rootDegreeEl = document.getElementById('rootDegree');
    const unitCategoryEl = document.getElementById('unitCategory');
    const unitFromEl = document.getElementById('unitFrom');
    const unitToEl = document.getElementById('unitTo');
    const unitValueEl = document.getElementById('unitValue');
    const unitConvertBtn = document.getElementById('unitConvertBtn');
    const unitResult = document.getElementById('unitResult');
    const baseValueEl = document.getElementById('baseValue');
    const baseFromEl = document.getElementById('baseFrom');
    const baseToEl = document.getElementById('baseTo');
    const baseConvertBtn = document.getElementById('baseConvertBtn');
    const baseResultEl = document.getElementById('baseResult');
    
    // 颜色转换相关元素
    const colorValueEl = document.getElementById('colorValue');
    const colorFromEl = document.getElementById('colorFrom');
    const colorToEl = document.getElementById('colorTo');
    const colorConvertBtn = document.getElementById('colorConvertBtn');
    const colorResultEl = document.getElementById('colorResult');
    const colorPreviewEl = document.getElementById('colorPreview');

    let lastAns = 0;
    const MAX_HISTORY = 50;
    setDisplay('0', 1, false);
    const FN_INSERTS = Object.freeze({
        root: 'root(',
        sqrt: 'root(',
        pow: '^',
        fact: '!',
        mod: ' mod ',
        percent: '/100',
        ans: 'ans',
        sin: 'sin(',
        cos: 'cos(',
        tan: 'tan(',
        cot: 'cot(',
        sec: 'sec(',
        csc: 'csc(',
        asin: 'asin(',
        acos: 'acos(',
        atan: 'atan(',
        sinh: 'sinh(',
        cosh: 'cosh(',
        tanh: 'tanh(',
        asinh: 'asinh(',
        acosh: 'acosh(',
        atanh: 'atanh(',
        logb: 'log(',
        log: 'log(',
        ln: 'ln(',
        abs: 'abs(',
        sum: 'sum(',
        primeFactors: 'primeFactors(',
        floor: 'floor(',
        ceil: 'ceil(',
        pow10: 'pow10('
    });
    const SYMBOL_REPLACEMENTS = [
        [/Ã·/g, '/'], [/÷/g, '/'],
        [/Ã—/g, '*'], [/×/g, '*'],
        [/âˆ?/g, '-'], [/−/g, '-'], [/–/g, '-'], [/—/g, '-'], [/﹣/g, '-']
    ];

    function getPrimeFactorsAbs(value) {
        let n = Math.abs(value);
        const factors = [];
        while (n % 2 === 0) {
            factors.push(2);
            n /= 2;
        }
        let d = 3;
        while (d * d <= n) {
            while (n % d === 0) {
                factors.push(d);
                n /= d;
            }
            d += 2;
        }
        if (n > 1) factors.push(n);
        return factors;
    }

    function formatPrimeFactors(factors) {
        if (!Array.isArray(factors) || factors.length === 0) {
            return '';
        }
        if (factors.length === 1) {
            return String(factors[0]);
        }
        const parts = [];
        for (let i = 0; i < factors.length; i += 1) {
            const value = factors[i];
            if (value === -1) {
                parts.push('-1');
                continue;
            }
            let count = 1;
            while (i + count < factors.length && factors[i + count] === value) {
                count += 1;
            }
            if (count > 1) {
                parts.push(`${value}^${count}`);
            } else {
                parts.push(String(value));
            }
            i += count - 1;
        }
        return parts.join('*');
    }

    // wrapper math functions to honor degree/radian setting
    function makeScope() {
        const mode = angleModeEl.value || 'rad';
        const toRad = (x) => mode === 'deg' ? x * Math.PI / 180 : x;
        const toAngle = (val) => mode === 'deg' ? val * 180 / Math.PI : val;
        const trigWrap = (fn) => (x) => fn(toRad(x));
        const invWrap = (fn) => (x) => toAngle(fn(x));
        const hyperWrap = (fn) => (x) => fn(toRad(x));
        const hyperInvWrap = (fn) => (x) => mode === 'deg' ? fn(x) * 180 / Math.PI : fn(x);
        const getValidLogBase = () => {
            const raw = logBaseEl ? Number(logBaseEl.value) : 10;
            const base = Number.isFinite(raw) ? raw : 10;
            if (base <= 0 || base === 1) {
                throw new Error('对数底需大于 0 且不等于 1');
            }
            return base;
        };
        const getRootDegree = () => {
            const raw = rootDegreeEl ? Number(rootDegreeEl.value) : 2;
            const degree = Number.isFinite(raw) ? raw : 2;
            if (!Number.isInteger(degree) || degree < 2) {
                throw new Error('开方次数需为大于等于 2 的整数');
            }
            return degree;
        };
        const logWithBase = (value) => math.log(value, getValidLogBase());
        const rootWithDegree = (value) => math.nthRoot(value, getRootDegree());
        const isMatrixValue = (value) => {
            const valueType = math.typeOf(value);
            return valueType === 'Matrix' || valueType === 'DenseMatrix' || valueType === 'SparseMatrix';
        };
        const isVector = (value) => Array.isArray(value) || isMatrixValue(value);
        const normalizeVector = (value) => {
            if (Array.isArray(value)) return value;
            if (isMatrixValue(value)) return value.valueOf();
            throw new Error('请输入向量数组');
        };
        const scalarMultiply = (a, b) => {
            const aIsVector = isVector(a);
            const bIsVector = isVector(b);
            if (aIsVector && bIsVector) {
                throw new Error('数乘需要一个标量和一个向量');
            }
            return math.multiply(a, b);
        };
        const outerProduct = (a, b) => {
            const va = normalizeVector(a);
            const vb = normalizeVector(b);
            const col = math.reshape(va, [va.length, 1]);
            const row = math.reshape(vb, [1, vb.length]);
            return math.multiply(col, row);
        };
        const vectorNorm = (v, p) => {
            const vec = normalizeVector(v);
            const values = vec.map((item) => math.abs(item));
            const normalizeOrder = (order) => {
                if (order === undefined || order === null) return 2;
                if (order === Infinity || order === -Infinity) return Infinity;
                if (typeof order === 'string') {
                    const trimmed = order.trim().toLowerCase();
                    if (trimmed === 'inf' || trimmed === 'infinity') return Infinity;
                    const parsed = Number(trimmed);
                    if (Number.isFinite(parsed)) return parsed;
                }
                if (math.typeOf(order) === 'BigNumber') return order.toNumber();
                if (math.typeOf(order) === 'Fraction') return order.valueOf();
                const numeric = Number(order);
                if (Number.isFinite(numeric)) return numeric;
                throw new Error('请输入有效的范数阶数');
            };
            const order = normalizeOrder(p);
            if (order === 0) {
                return values.reduce((count, val) => count + (math.equal(val, 0) ? 0 : 1), 0);
            }
            if (order === 1) {
                return values.reduce((sum, val) => math.add(sum, val), 0);
            }
            if (order === 2) {
                const sumSquares = values.reduce((sum, val) => math.add(sum, math.multiply(val, val)), 0);
                return math.sqrt(sumSquares);
            }
            if (order === Infinity) {
                return values.reduce((max, val) => (math.larger(val, max) ? val : max), 0);
            }
            if (order <= 0) {
                throw new Error('范数阶数需大于 0');
            }
            const sum = values.reduce((acc, val) => math.add(acc, math.pow(val, order)), 0);
            return math.pow(sum, math.divide(1, order));
        };
        const isMatrixLike = (value) => Array.isArray(value) || isMatrixValue(value);
        const normalizeMatrix = (value) => {
            if (isMatrixValue(value)) return value;
            if (Array.isArray(value)) return math.matrix(value);
            throw new Error('请输入矩阵数组');
        };
        const ensureSquareMatrix = (matrix) => {
            const size = math.size(matrix).valueOf();
            if (size.length !== 2 || size[0] !== size[1]) {
                throw new Error('请输入方阵');
            }
            return size[0];
        };
        const matrixScalarMul = (a, b) => {
            const aIsMatrix = isMatrixLike(a);
            const bIsMatrix = isMatrixLike(b);
            if (aIsMatrix && bIsMatrix) {
                throw new Error('矩阵数乘需要一个标量和一个矩阵');
            }
            if (!aIsMatrix && !bIsMatrix) {
                throw new Error('矩阵数乘需要一个矩阵');
            }
            return aIsMatrix
                ? math.multiply(normalizeMatrix(a), b)
                : math.multiply(a, normalizeMatrix(b));
        };
        const matrixMultiply = (a, b) => {
            if (!isMatrixLike(a) || !isMatrixLike(b)) {
                throw new Error('矩阵乘法需要两个矩阵');
            }
            return math.multiply(normalizeMatrix(a), normalizeMatrix(b));
        };
        const matrixTranspose = (a) => math.transpose(normalizeMatrix(a));
        const matrixConjTranspose = (a) => math.conj(math.transpose(normalizeMatrix(a)));
        const matrixTrace = (a) => {
            const matrix = normalizeMatrix(a);
            const n = ensureSquareMatrix(matrix);
            const data = matrix.valueOf();
            let sum = 0;
            for (let i = 0; i < n; i += 1) {
                sum = math.add(sum, data[i][i]);
            }
            return sum;
        };
        const matrixDet = (a) => {
            const matrix = normalizeMatrix(a);
            ensureSquareMatrix(matrix);
            return math.det(matrix);
        };
        const matrixInv = (a) => {
            const matrix = normalizeMatrix(a);
            ensureSquareMatrix(matrix);
            return math.inv(matrix);
        };
        const matrixAdj = (a) => {
            const matrix = normalizeMatrix(a);
            const n = ensureSquareMatrix(matrix);
            const data = matrix.valueOf();
            if (n === 1) {
                return math.matrix([[1]]);
            }
            const cofactors = Array.from({ length: n }, (_, i) => {
                return Array.from({ length: n }, (_, j) => {
                    const minor = data
                        .filter((_, row) => row !== i)
                        .map((row) => row.filter((_, col) => col !== j));
                    const detMinor = math.det(minor);
                    const sign = (i + j) % 2 === 0 ? 1 : -1;
                    return math.multiply(sign, detMinor);
                });
            });
            return math.matrix(math.transpose(cofactors));
        };
        const matrixRank = (a) => {
            const matrix = normalizeMatrix(a);
            if (typeof math.rank === 'function') {
                return math.rank(matrix);
            }
            const data = matrix.valueOf();
            const rows = data.length;
            const cols = rows > 0 ? data[0].length : 0;
            if (rows === 0 || cols === 0) return 0;
            const toNumeric = (value) => {
                const valueType = math.typeOf(value);
                if (valueType === 'Fraction') return value.valueOf();
                if (valueType === 'BigNumber') return value.toNumber();
                if (valueType === 'Complex') return math.abs(value);
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) {
                    throw new Error('请输入数值矩阵');
                }
                return numeric;
            };
            const mat = data.map((row) => row.map(toNumeric));
            const tol = 1e-10;
            let rank = 0;
            let row = 0;
            for (let col = 0; col < cols && row < rows; col += 1) {
                let pivot = row;
                for (let r = row + 1; r < rows; r += 1) {
                    if (Math.abs(mat[r][col]) > Math.abs(mat[pivot][col])) {
                        pivot = r;
                    }
                }
                if (Math.abs(mat[pivot][col]) <= tol) {
                    continue;
                }
                if (pivot !== row) {
                    const tmp = mat[row];
                    mat[row] = mat[pivot];
                    mat[pivot] = tmp;
                }
                const pivotVal = mat[row][col];
                for (let c = col; c < cols; c += 1) {
                    mat[row][c] /= pivotVal;
                }
                for (let r = 0; r < rows; r += 1) {
                    if (r === row) continue;
                    const factor = mat[r][col];
                    if (Math.abs(factor) <= tol) continue;
                    for (let c = col; c < cols; c += 1) {
                        mat[r][c] -= factor * mat[row][c];
                    }
                }
                row += 1;
                rank += 1;
            }
            return rank;
        };
        const normalizeSetInput = (value) => {
            if (Array.isArray(value)) return value;
            if (isMatrixValue(value)) return value.valueOf();
            throw new Error('请输入数组');
        };
        const makeSetKey = (item) => {
            const itemType = math.typeOf(item);
            if (itemType === 'BigNumber' || itemType === 'Fraction' || itemType === 'Complex') {
                return `${itemType}:${item.toString()}`;
            }
            const primitiveType = typeof item;
            if (primitiveType === 'number' || primitiveType === 'string' || primitiveType === 'boolean') {
                return `${primitiveType}:${String(item)}`;
            }
            if (item === null || item === undefined) {
                return String(item);
            }
            try {
                return `object:${JSON.stringify(item)}`;
            } catch (e) {
                return `object:${String(item)}`;
            }
        };
        const uniqueByKey = (items) => {
            const seen = new Set();
            const result = [];
            items.forEach((item) => {
                const key = makeSetKey(item);
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(item);
                }
            });
            return result;
        };
        const setUnion = (a, b) => {
            const arrA = normalizeSetInput(a);
            const arrB = normalizeSetInput(b);
            return uniqueByKey([...arrA, ...arrB]);
        };
        const setIntersect = (a, b) => {
            const arrA = normalizeSetInput(a);
            const arrB = normalizeSetInput(b);
            const keysB = new Set(arrB.map(makeSetKey));
            return uniqueByKey(arrA.filter((item) => keysB.has(makeSetKey(item))));
        };
        const setDifference = (a, b) => {
            const arrA = normalizeSetInput(a);
            const arrB = normalizeSetInput(b);
            const keysB = new Set(arrB.map(makeSetKey));
            return uniqueByKey(arrA.filter((item) => !keysB.has(makeSetKey(item))));
        };
        const setSymDifference = (a, b) => {
            const left = setDifference(a, b);
            const right = setDifference(b, a);
            return uniqueByKey([...left, ...right]);
        };
        return {
            sin: trigWrap(Math.sin),
            cos: trigWrap(Math.cos),
            tan: trigWrap(Math.tan),
            cot: (x) => 1 / Math.tan(toRad(x)),
            sec: (x) => 1 / Math.cos(toRad(x)),
            csc: (x) => 1 / Math.sin(toRad(x)),
            asin: invWrap(Math.asin),
            acos: invWrap(Math.acos),
            atan: invWrap(Math.atan),
            sinh: hyperWrap(Math.sinh),
            cosh: hyperWrap(Math.cosh),
            tanh: hyperWrap(Math.tanh),
            asinh: hyperInvWrap(Math.asinh),
            acosh: hyperInvWrap(Math.acosh),
            atanh: hyperInvWrap(Math.atanh),
            log: logWithBase,
            logb: logWithBase,
            ln: (x) => math.log(x),
            root: (x) => rootWithDegree(x),
            floor: (x) => Math.floor(x),
            ceil: (x) => Math.ceil(x),
            pi: math.pi,
            e: math.e,
            i: math.complex(0, 1),
            phi: (1 + Math.sqrt(5)) / 2,
            gamma: 0.5772156649015329,
            sqrt2: Math.SQRT2,
            ln2: Math.LN2,
            zeta3: 1.202056903159594,
            G: 0.915965594177219,
            K: 2.685452001065306,
            delta: 4.66920160910299,
            alpha: -2.5029078750958928,
            tau: Math.PI * 2,
            Omega: 0.5671432904097838,
            C: 0.12345678910111213,
            rho: 1.3247179572447458,
            B: 1.902160583104,
            zeta2: (Math.PI * Math.PI) / 6,
            ans: lastAns,
            primeFactors: (value) => {
                const num = Number(value);
                if (!Number.isFinite(num)) {
                    throw new Error('请输入有限数字');
                }
                if (!Number.isInteger(num)) {
                    throw new Error('质因数分解仅支持整数');
                }
                if (Math.abs(num) < 2) return String(num);
                const factors = typeof math.primeFactors === 'function'
                    ? math.primeFactors(Math.abs(num))
                    : getPrimeFactorsAbs(num);
                const result = num < 0 ? [-1, ...factors] : factors;
                return formatPrimeFactors(result);
            },
            pow10: (exponent) => {
                const x = Number(exponent);
                if (!Number.isFinite(x)) {
                    throw new Error('请输入有限指数');
                }
                return Math.pow(10, x);
            },
            vecAdd: (a, b) => math.add(a, b),
            vecSub: (a, b) => math.subtract(a, b),
            scalarMul: scalarMultiply,
            dot: (a, b) => math.dot(a, b),
            cross: (a, b) => math.cross(a, b),
            outer: outerProduct,
            hadamard: (a, b) => math.dotMultiply(a, b),
            vecNorm: vectorNorm,
            matAdd: (a, b) => math.add(normalizeMatrix(a), normalizeMatrix(b)),
            matSub: (a, b) => math.subtract(normalizeMatrix(a), normalizeMatrix(b)),
            matScalarMul: matrixScalarMul,
            matMul: matrixMultiply,
            matTranspose: matrixTranspose,
            matConjTranspose: matrixConjTranspose,
            matTrace: matrixTrace,
            matDet: matrixDet,
            matInv: matrixInv,
            matAdj: matrixAdj,
            matRank: matrixRank,
            setUnion: setUnion,
            setIntersect: setIntersect,
            setDifference: setDifference,
            setSymDifference: setSymDifference,
            // keep math functions available via math namespace if needed
            math: math
        };
    }

    function getDisplay() {
        return displayEl.value;
    }
    function setDisplay(v, caretPos = null, shouldFocus = true) {
        const value = String(v);
        displayEl.value = value;
        const pos = caretPos === null ? value.length : Math.max(0, Math.min(caretPos, value.length));
        displayEl.setSelectionRange(pos, pos);
        if (shouldFocus) {
            displayEl.focus();
        }
    }

    function insertText(text, caretOffset = null) {
        const value = getDisplay();
        const start = displayEl.selectionStart ?? value.length;
        const end = displayEl.selectionEnd ?? start;
        const replaceZero = value === '0' && value.length === 1 && start === end;
        const before = replaceZero ? '' : value.slice(0, start);
        const after = replaceZero ? '' : value.slice(end);
        const next = before + text + after;
        const insertionStart = before.length;
        const offset = caretOffset === null ? text.length : caretOffset;
        setDisplay(next, insertionStart + offset);
    }

    function insertWithAutoParen(token) {
        insertText(token + ')', token.length);
    }

    // append token at caret
    function appendToDisplay(token) {
        insertText(token);
    }

    // button clicks
    buttons.forEach(btn => {
        const val = btn.getAttribute('data-val');
        const fn = btn.getAttribute('data-fn');
        btn.addEventListener('click', () => {
            if (val) {
                appendToDisplay(val);
                return;
            }
            if (fn && FN_INSERTS[fn]) {
                const snippet = FN_INSERTS[fn];
                if (snippet.endsWith('(')) {
                    insertWithAutoParen(snippet);
                } else {
                    appendToDisplay(snippet);
                }
            }
        });
    });

    clearBtn.addEventListener('click', () => setDisplay('0', 1));
    backBtn.addEventListener('click', () => {
        const value = getDisplay();
        const start = displayEl.selectionStart ?? value.length;
        const end = displayEl.selectionEnd ?? start;
        if (value.length <= 1) {
            setDisplay('0', 1);
            return;
        }
        if (start !== end) {
            const next = value.slice(0, start) + value.slice(end);
            setDisplay(next, start);
        } else if (start > 0) {
            const next = value.slice(0, start - 1) + value.slice(start);
            setDisplay(next, start - 1);
        }
    });

    // sanitize user-friendly characters
    function normalizeExpr(expr) {
        let normalized = expr;
        SYMBOL_REPLACEMENTS.forEach(([pattern, replacement]) => {
            normalized = normalized.replace(pattern, replacement);
        });
        normalized = normalized.replace(/\s+mod\s+/gi, ' mod ');
        normalized = normalized.replace(/(\d+(?:\.\d+)?)!/g, (_, n) => `factorial(${n})`);
        return normalized.replace(/!/g, 'factorial');
    }

    function formatNumber(val) {
        const prec = parseInt(precisionEl.value || '6', 10);
        if (typeof val === 'number' && isFinite(val)) {
            return Number(val).toFixed(prec).replace(/\.?(0+)$/, '');
        }
        return String(val);
    }

    function getDisplayMode() {
        return (displayModeEl && displayModeEl.value) || 'decimal';
    }

    function fractionStringFromValue(value) {
        try {
            const frac = math.fraction(value);
            if (frac && typeof frac.toFraction === 'function') {
                const text = frac.toFraction(false); // always simple ratio
                return { text, numeric: Number(frac.valueOf()) };
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    function formatNumericOutput(value) {
        const mode = getDisplayMode();
        if (mode === 'fraction') {
            const fracResult = fractionStringFromValue(value);
            if (fracResult) {
                return fracResult;
            }
        }
        const formatted = formatNumber(value);
        return { text: formatted, numeric: Number(value) };
    }

    function isMatrixResult(value) {
        const valueType = math.typeOf(value);
        return valueType === 'Matrix' || valueType === 'DenseMatrix' || valueType === 'SparseMatrix';
    }

    function formatComplexValue(value) {
        const re = value.re ?? 0;
        const im = value.im ?? 0;
        const reText = formatNumericOutput(re).text;
        const imAbsText = formatNumericOutput(Math.abs(im)).text;
        if (im === 0) return reText;
        if (re === 0) return `${im < 0 ? '-' : ''}${imAbsText}i`;
        const sign = im < 0 ? '-' : '+';
        return `${reText} ${sign} ${imAbsText}i`;
    }

    function formatScalarValue(value) {
        const valueType = math.typeOf(value);
        if (valueType === 'Fraction') {
            if (getDisplayMode() === 'fraction' && typeof value.toFraction === 'function') {
                return value.toFraction(false);
            }
            return formatNumber(value.valueOf());
        }
        if (valueType === 'BigNumber') {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                return formatNumber(numeric);
            }
            return value.toString();
        }
        if (valueType === 'Complex') {
            return formatComplexValue(value);
        }
        if (typeof value === 'number') {
            return formatNumericOutput(value).text;
        }
        return String(value);
    }

    function formatStructuredValue(value) {
        if (Array.isArray(value)) {
            const items = value.map(formatStructuredValue);
            return `[${items.join(', ')}]`;
        }
        if (isMatrixResult(value)) {
            const items = value.valueOf().map(formatStructuredValue);
            return `[${items.join(', ')}]`;
        }
        return formatScalarValue(value);
    }

    function pushHistory(expr, result) {
        if (!historyEl) return;
        const item = document.createElement('div');
        item.classList.add('history-item');
        item.innerHTML = `
            <div class="history-expression">${expr}</div>
            <div class="history-result">${result}</div>
        `;
        item.addEventListener('click', () => setDisplay(expr));
        historyEl.prepend(item);
        while (historyEl.children.length > MAX_HISTORY) {
            historyEl.removeChild(historyEl.lastElementChild);
        }
        historyEl.scrollTop = 0;
    }

    evalBtn.addEventListener('click', () => {
        const raw = getDisplay();
        const expr = normalizeExpr(raw);
        try {
            // create scope with trig wrappers and constants
            const scope = makeScope();

            // math.evaluate supports 'mod' via function math.mod, so we provide mod to scope
            scope.mod = (a,b) => math.mod(a,b);
            scope.factorial = (n) => math.factorial(n);

            let res = math.evaluate(expr, scope);

            // If result is a mathjs Fraction or BigNumber, convert to number/string appropriately
            if (math.typeOf(res) === 'Fraction') {
                const decimalValue = res.valueOf();
                if (getDisplayMode() === 'fraction') {
                    const text = typeof res.toFraction === 'function'
                        ? res.toFraction(false)
                        : res.toString();
                    lastAns = decimalValue;
                    pushHistory(expr, text);
                    setDisplay(text);
                    return;
                } else {
                    const { text, numeric } = formatNumericOutput(decimalValue);
                    lastAns = numeric;
                    pushHistory(expr, text);
                    setDisplay(text);
                    return;
                }
            }

            if (typeof res === 'function') res = res();

            // If result is a Unit
            if (math.typeOf(res) === 'Unit') {
                const out = res.toString();
                pushHistory(expr, out);
                setDisplay(out);
                return;
            }

            const resType = math.typeOf(res);
            if (Array.isArray(res) || isMatrixResult(res)) {
                const text = formatStructuredValue(res);
                pushHistory(expr, text);
                setDisplay(text);
                return;
            }
            if (resType === 'Complex' || resType === 'BigNumber') {
                const text = formatScalarValue(res);
                pushHistory(expr, text);
                setDisplay(text);
                return;
            }

            // For complex objects, try to stringify
            if (typeof res === 'object') res = res.toString();

            // numeric formatting
            if (typeof res === 'number') {
                const { text, numeric } = formatNumericOutput(res);
                lastAns = numeric;
                pushHistory(expr, text);
                setDisplay(text);
                return;
            }

            // otherwise
            pushHistory(expr, String(res));
            setDisplay(String(res));
        } catch (err) {
            setDisplay('错误: ' + err.message);
        }
    });

    const UNIT_GROUPS = {
        length: [
            { value: 'mm', label: '毫米 (mm)' },
            { value: 'cm', label: '厘米 (cm)' },
            { value: 'm', label: '米 (m)' },
            { value: 'km', label: '千米 (km)' },
            { value: 'inch', label: '英寸 (in)' },
            { value: 'ft', label: '英尺 (ft)' },
            { value: 'yd', label: '码 (yd)' },
            { value: 'mi', label: '英里 (mi)' }
        ],
        temperature: [
            { value: 'degC', label: '摄氏度 (°C)' },
            { value: 'degF', label: '华氏度 (°F)' },
            { value: 'K', label: '开尔文 (K)' }
        ],
        power: [
            { value: 'W', label: '瓦 (W)' },
            { value: 'kW', label: '千瓦 (kW)' },
            { value: 'MW', label: '兆瓦 (MW)' },
            { value: 'hp', label: '马力 (hp)' }
        ],
        speed: [
            { value: 'm/s', label: '米/秒 (m/s)' },
            { value: 'km/h', label: '千米/时 (km/h)' },
            { value: 'mi/h', label: '英里/时 (mph)' },
            { value: 'knot', label: '节 (knot)' }
        ],
        weight: [
            { value: 'g', label: '克 (g)' },
            { value: 'kg', label: '千克 (kg)' },
            { value: 'tonne', label: '吨 (t)' },
            { value: 'lb', label: '磅 (lb)' }
        ],
        area: [
            { value: 'cm^2', label: '平方厘米 (cm²)' },
            { value: 'm^2', label: '平方米 (m²)' },
            { value: 'km^2', label: '平方千米 (km²)' },
            { value: 'hectare', label: '公顷 (ha)' },
            { value: 'acre', label: '英亩 (acre)' }
        ],
        volume: [
            { value: 'ml', label: '毫升 (ml)' },
            { value: 'l', label: '升 (L)' },
            { value: 'm^3', label: '立方米 (m³)' },
            { value: 'gal', label: '加仑 (gal)' }
        ]
    };

    function populateUnitOptions(category) {
        if (!unitFromEl || !unitToEl) return;
        const options = UNIT_GROUPS[category] || [];
        unitFromEl.innerHTML = '';
        unitToEl.innerHTML = '';
        options.forEach((opt) => {
            const optionFrom = document.createElement('option');
            optionFrom.value = opt.value;
            optionFrom.textContent = opt.label;
            unitFromEl.appendChild(optionFrom);

            const optionTo = document.createElement('option');
            optionTo.value = opt.value;
            optionTo.textContent = opt.label;
            unitToEl.appendChild(optionTo);
        });
        if (options.length > 1) {
            unitToEl.selectedIndex = 1;
        }
    }

    if (unitCategoryEl) {
        populateUnitOptions(unitCategoryEl.value || 'length');
        unitCategoryEl.addEventListener('change', (e) => {
            populateUnitOptions(e.target.value);
            if (unitResult) unitResult.innerText = '';
        });
    }

    if (unitConvertBtn) {
        unitConvertBtn.addEventListener('click', () => {
            if (!unitValueEl || !unitFromEl || !unitToEl) return;
            const rawValue = unitValueEl.value;
            const numericValue = Number(rawValue);
            if (!rawValue || Number.isNaN(numericValue)) {
                unitResult.innerText = '请输入要转换的数值';
                return;
            }
            const fromUnit = unitFromEl.value;
            const toUnit = unitToEl.value;
            if (!fromUnit || !toUnit) {
                unitResult.innerText = '请选择需要转换的单位';
                return;
            }
            try {
                const converted = math.unit(numericValue, fromUnit).to(toUnit);
                const formatted = formatNumber(converted.toNumber(toUnit));
                const fromLabel = unitFromEl.options[unitFromEl.selectedIndex]?.textContent || fromUnit;
                const toLabel = unitToEl.options[unitToEl.selectedIndex]?.textContent || toUnit;
                unitResult.innerText = `${numericValue} ${fromLabel} = ${formatted} ${toLabel}`;
            } catch (e) {
                unitResult.innerText = '转换错误: ' + e.message;
            }
        });
    }

    const BASE_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    function populateBaseSelect(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        for (let base = 2; base <= 36; base++) {
            const option = document.createElement('option');
            option.value = String(base);
            option.textContent = `${base} 进制`;
            selectEl.appendChild(option);
        }
    }

    function parseToBigInt(value, base) {
        let s = (value || '').trim().toUpperCase();
        if (!s) throw new Error('请输入要转换的数值');
        let sign = 1n;
        if (s.startsWith('-')) {
            sign = -1n;
            s = s.slice(1);
        }
        s = s.replace(/\s+/g, '');
        if (!s) throw new Error('请输入要转换的数值');
        let acc = 0n;
        for (const ch of s) {
            const idx = BASE_DIGITS.indexOf(ch);
            if (idx === -1 || idx >= base) {
                throw new Error(`字符 ${ch} 不在 ${base} 进制范围内`);
            }
            acc = acc * BigInt(base) + BigInt(idx);
        }
        return acc * sign;
    }

    function bigIntToBase(value, base) {
        if (value === 0n) return '0';
        let sign = '';
        let n = value;
        if (n < 0) {
            sign = '-';
            n = -n;
        }
        let result = '';
        while (n > 0) {
            const rem = n % BigInt(base);
            result = BASE_DIGITS[Number(rem)] + result;
            n = n / BigInt(base);
        }
        return sign + result;
    }

    if (baseFromEl && baseToEl) {
        populateBaseSelect(baseFromEl);
        populateBaseSelect(baseToEl);
        baseFromEl.value = '10';
        baseToEl.value = '2';
    }

    if (baseConvertBtn) {
        baseConvertBtn.addEventListener('click', () => {
            if (!baseValueEl || !baseFromEl || !baseToEl || !baseResultEl) return;
            const raw = (baseValueEl.value || '').trim();
            if (!raw) {
                baseResultEl.innerText = '请输入要转换的数值';
                return;
            }
            const fromBase = parseInt(baseFromEl.value, 10);
            const toBase = parseInt(baseToEl.value, 10);
            try {
                const bigIntValue = parseToBigInt(raw, fromBase);
                const converted = bigIntToBase(bigIntValue, toBase);
                baseResultEl.innerText = `${raw} (${fromBase} 进制) = ${converted} (${toBase} 进制)`;
            } catch (e) {
                baseResultEl.innerText = '转换失败: ' + e.message;
            }
        });
    }

    // --- Color Conversion Logic Start ---
    const COLOR_FORMATS = [
        { value: 'hex', label: 'HEX' },
        { value: 'rgb', label: 'RGB' },
        { value: 'rgba', label: 'RGBA' },
        { value: 'hsl', label: 'HSL' },
        { value: 'hsla', label: 'HSLA' },
        { value: 'hsv', label: 'HSV' },
        { value: 'hsva', label: 'HSVA' },
        { value: 'cmyk', label: 'CMYK' },
        { value: 'cmyka', label: 'CMYKA' }
    ];

    if (colorFromEl && colorToEl) {
        const populate = (sel) => {
            sel.innerHTML = '';
            COLOR_FORMATS.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.value;
                opt.textContent = f.label;
                sel.appendChild(opt);
            });
        };
        populate(colorFromEl);
        populate(colorToEl);
        colorFromEl.value = 'hex';
        colorToEl.value = 'rgb';
    }

    function clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    }

    // RGBA Struct: {r: 0-255, g: 0-255, b: 0-255, a: 0-1}
    function parseColorInput(input, format) {
        let s = input.trim();
        const nums = (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
        
        if (format === 'hex') {
            if (s.startsWith('#')) s = s.slice(1);
            if (s.length === 3) {
                s = s[0]+s[0] + s[1]+s[1] + s[2]+s[2];
            }
            if (s.length !== 6) throw new Error('无效的 HEX 格式');
            const r = parseInt(s.substring(0,2), 16);
            const g = parseInt(s.substring(2,4), 16);
            const b = parseInt(s.substring(4,6), 16);
            return { r, g, b, a: 1 };
        } 
        else if (format.startsWith('rgb')) {
            if (nums.length < 3) throw new Error('RGB 需要 3 个数值');
            return {
                r: clamp(nums[0], 0, 255),
                g: clamp(nums[1], 0, 255),
                b: clamp(nums[2], 0, 255),
                a: nums.length > 3 ? clamp(nums[3], 0, 1) : 1
            };
        }
        else if (format.startsWith('hsl')) {
            // HSL to RGB
            if (nums.length < 3) throw new Error('HSL 需要 3 个数值');
            const h = nums[0] % 360;
            const sVal = clamp(nums[1], 0, 100) / 100;
            const l = clamp(nums[2], 0, 100) / 100;
            const a = nums.length > 3 ? clamp(nums[3], 0, 1) : 1;
            
            const c = (1 - Math.abs(2 * l - 1)) * sVal;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = l - c / 2;
            let r=0, g=0, b=0;

            if (h < 60) { r=c; g=x; b=0; }
            else if (h < 120) { r=x; g=c; b=0; }
            else if (h < 180) { r=0; g=c; b=x; }
            else if (h < 240) { r=0; g=x; b=c; }
            else if (h < 300) { r=x; g=0; b=c; }
            else { r=c; g=0; b=x; }

            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255),
                a: a
            };
        }
        else if (format.startsWith('hsv')) {
            // HSV to RGB
            if (nums.length < 3) throw new Error('HSV 需要 3 个数值');
            const h = nums[0] % 360;
            const sVal = clamp(nums[1], 0, 100) / 100;
            const v = clamp(nums[2], 0, 100) / 100;
            const a = nums.length > 3 ? clamp(nums[3], 0, 1) : 1;

            const c = v * sVal;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            let r=0, g=0, b=0;

            if (h < 60) { r=c; g=x; b=0; }
            else if (h < 120) { r=x; g=c; b=0; }
            else if (h < 180) { r=0; g=c; b=x; }
            else if (h < 240) { r=0; g=x; b=c; }
            else if (h < 300) { r=x; g=0; b=c; }
            else { r=c; g=0; b=x; }

            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255),
                a: a
            };
        }
        else if (format.startsWith('cmyk')) {
            // CMYK to RGB
            if (nums.length < 4) throw new Error('CMYK 需要 4 个数值');
            const c = clamp(nums[0], 0, 100) / 100;
            const m = clamp(nums[1], 0, 100) / 100;
            const y = clamp(nums[2], 0, 100) / 100;
            const k = clamp(nums[3], 0, 100) / 100;
            const a = nums.length > 4 ? clamp(nums[4], 0, 1) : 1;

            const r = 255 * (1 - c) * (1 - k);
            const g = 255 * (1 - m) * (1 - k);
            const b = 255 * (1 - y) * (1 - k);

            return {
                r: Math.round(r),
                g: Math.round(g),
                b: Math.round(b),
                a: a
            };
        }
        throw new Error('不支持的输入格式');
    }

    function formatColorOutput(rgba, format) {
        const { r, g, b, a } = rgba;

        if (format === 'hex') {
            const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
        if (format === 'rgb') return `rgb(${r}, ${g}, ${b})`;
        if (format === 'rgba') return `rgba(${r}, ${g}, ${b}, ${a})`;

        if (format.startsWith('hsl')) {
            const rN = r / 255, gN = g / 255, bN = b / 255;
            const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
            let h, s, l = (max + min) / 2;

            if (max === min) {
                h = s = 0;
            } else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
                    case gN: h = (bN - rN) / d + 2; break;
                    case bN: h = (rN - gN) / d + 4; break;
                }
                h *= 60;
            }
            const sP = (s * 100).toFixed(1);
            const lP = (l * 100).toFixed(1);
            h = Math.round(h);
            if (format === 'hsla') return `hsla(${h}, ${sP}%, ${lP}%, ${a})`;
            return `hsl(${h}, ${sP}%, ${lP}%)`;
        }

        if (format.startsWith('hsv')) {
            const rN = r / 255, gN = g / 255, bN = b / 255;
            const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
            let h, s, v = max;
            const d = max - min;
            s = max === 0 ? 0 : d / max;
            
            if (max === min) {
                h = 0;
            } else {
                switch (max) {
                    case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
                    case gN: h = (bN - rN) / d + 2; break;
                    case bN: h = (rN - gN) / d + 4; break;
                }
                h *= 60;
            }
            const sP = (s * 100).toFixed(1);
            const vP = (v * 100).toFixed(1);
            h = Math.round(h);
            if (format === 'hsva') return `hsva(${h}, ${sP}%, ${vP}%, ${a})`;
            return `hsv(${h}, ${sP}%, ${vP}%)`;
        }

        if (format.startsWith('cmyk')) {
            let c = 0, m = 0, y = 0, k = 0;
            const rN = r / 255, gN = g / 255, bN = b / 255;
            k = 1 - Math.max(rN, gN, bN);
            if (k < 1) {
                c = (1 - rN - k) / (1 - k);
                m = (1 - gN - k) / (1 - k);
                y = (1 - bN - k) / (1 - k);
            }
            const p = (n) => Math.round(n * 100);
            if (format === 'cmyka') return `cmyka(${p(c)}%, ${p(m)}%, ${p(y)}%, ${p(k)}%, ${a})`;
            return `cmyk(${p(c)}%, ${p(m)}%, ${p(y)}%, ${p(k)}%)`;
        }
        return '';
    }

    if (colorConvertBtn) {
        colorConvertBtn.addEventListener('click', () => {
            if (!colorValueEl || !colorFromEl || !colorToEl) return;
            const raw = colorValueEl.value;
            if (!raw) {
                colorResultEl.innerText = '请输入颜色值';
                colorPreviewEl.style.display = 'none';
                return;
            }
            try {
                const rgba = parseColorInput(raw, colorFromEl.value);
                const result = formatColorOutput(rgba, colorToEl.value);
                colorResultEl.innerText = result;
                
                // 设置预览条颜色
                const previewColor = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
                colorPreviewEl.style.backgroundColor = previewColor;
                colorPreviewEl.style.display = 'block';
            } catch (e) {
                colorResultEl.innerText = '转换失败: ' + e.message;
                colorPreviewEl.style.display = 'none';
            }
        });
    }
    // --- Color Conversion Logic End ---

    // allow pressing Enter in display to evaluate
    displayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            evalBtn.click();
        }
    });

});