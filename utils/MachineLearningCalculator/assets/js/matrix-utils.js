(() => {
    const MINUS_CHARS = /[\u2212\u2013\u2014\u2012\u2010\uFF0D\u002D]/g;
    const TOKEN_SPLIT = /[ ,\t]+/;

    function parseMatrix(text = '') {
        const normalized = text.replace(MINUS_CHARS, '-').trim();
        if (!normalized) {
            return math.matrix([]);
        }
        const rows = normalized
            .split(/\n+/)
            .map(row => row.trim())
            .filter(Boolean)
            .map(row => row.split(TOKEN_SPLIT).filter(Boolean).map(Number));
        return math.matrix(rows);
    }

    function approxFractionObj(x, maxDen = 1000000, tol = 1e-12) {
        if (!isFinite(x)) return { n: NaN, d: NaN, str: String(x), isInt: false };
        const nearest = Math.round(x);
        if (Math.abs(x - nearest) < tol) {
            return { n: nearest, d: 1, str: String(nearest), isInt: true };
        }
        let a = Math.floor(x);
        let h1 = 1, k1 = 0, h = a, k = 1;
        let x1 = x;
        while (Math.abs(h / k - x) > tol && k <= maxDen) {
            x1 = 1 / (x1 - a);
            a = Math.floor(x1);
            const h2 = h1; h1 = h; const k2 = k1; k1 = k;
            h = a * h1 + h2;
            k = a * k1 + k2;
            if (k > maxDen) break;
        }
        if (k === 1) return { n: h, d: 1, str: String(h), isInt: true };
        return { n: h, d: k, str: `${h}/${k}`, isInt: false };
    }

    function gcd(a, b) {
        let x = Math.abs(a);
        let y = Math.abs(b);
        while (y) {
            const t = y;
            y = x % y;
            x = t;
        }
        return x || 0;
    }

    function lcm(a, b) {
        if (a === 0 || b === 0) return 0;
        return Math.abs(a * b) / gcd(a, b);
    }

    function toFraction(value) {
        if (value && typeof value === 'object' && 's' in value && 'n' in value && 'd' in value) {
            const sign = value.s === -1 ? -1 : 1;
            return { n: sign * value.n, d: value.d };
        }
        if (!isFinite(value)) {
            return { n: value, d: 1 };
        }
        if (Math.abs(value - Math.round(value)) < 1e-12) {
            return { n: Math.round(value), d: 1 };
        }
        const approx = approxFractionObj(Number(value));
        return { n: approx.n, d: approx.d };
    }

    function matrixToLatex(mat) {
        try {
            const arr = mat.toArray();
            const fractions = arr.map(row => row.map(toFraction));
            const allIntegers = fractions.every(row => row.every(fr => fr.d === 1));

            if (allIntegers) {
                let commonGCD = 0;
                fractions.forEach(row => row.forEach(fr => {
                    if (fr.n !== 0) {
                        commonGCD = gcd(commonGCD, Math.abs(fr.n));
                    }
                }));
                if (commonGCD === 0) commonGCD = 1;
                const scaled = fractions.map(row => row.map(fr => fr.n / commonGCD));
                const inner = '\\begin{bmatrix}' + scaled.map(r => r.join(' & ')).join('\\\\') + '\\end{bmatrix}';
                return commonGCD === 1 ? `\\displaystyle ${inner}` : `\\displaystyle ${commonGCD} ${inner}`;
            }

            let commonDenom = 1;
            fractions.forEach(row => row.forEach(fr => {
                if (isFinite(fr.d) && fr.d) {
                    commonDenom = lcm(commonDenom, fr.d);
                }
            }));

            const integers = fractions.map(row => row.map(fr => Math.round(fr.n * (commonDenom / fr.d))));
            let integerGCD = 0;
            integers.forEach(row => row.forEach(val => {
                if (val !== 0) {
                    integerGCD = gcd(integerGCD, Math.abs(val));
                }
            }));
            if (integerGCD === 0) integerGCD = 1;

            const reduction = gcd(integerGCD, commonDenom);
            const num = integerGCD / reduction;
            const denom = commonDenom / reduction;
            const matrixIntegers = integers.map(row => row.map(val => val / integerGCD));
            const inner = '\\begin{bmatrix}' + matrixIntegers.map(r => r.join(' & ')).join('\\\\') + '\\end{bmatrix}';

            if (denom === 1) {
                return num === 1 ? `\\displaystyle ${inner}` : `\\displaystyle ${num} ${inner}`;
            }
            return `\\displaystyle \\frac{${num}}{${denom}} ${inner}`;
        } catch (error) {
            console.error('matrixToLatex error:', error);
            return String(mat);
        }
    }

    async function renderLatex(containers) {
        const targets = Array.isArray(containers) ? containers : [containers];
        if (window.renderMathInElement) {
            targets.forEach(container => {
                try {
                    renderMathInElement(container, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '\\[', right: '\\]', display: true },
                            { left: '\\(', right: '\\)', display: false }
                        ],
                        throwOnError: false
                    });
                } catch (error) {
                    console.warn('KaTeX render failed', error);
                }
            });
            return;
        }
        if (window.MathJax && MathJax.typesetPromise) {
            await MathJax.typesetPromise(targets);
        } else {
            console.warn('No LaTeX renderer (KaTeX/MathJax) available');
        }
    }

    function rrefPivotColumns(A) {
        const m = A.length;
        const n = (A[0] || []).length;
        const M = A.map(row => row.slice());
        const pivots = [];
        let row = 0;
        for (let col = 0; col < n && row < m; col++) {
            let sel = row;
            while (sel < m && Math.abs(M[sel][col]) < 1e-12) sel++;
            if (sel === m) continue;
            const tmp = M[row]; M[row] = M[sel]; M[sel] = tmp;
            const pivot = M[row][col];
            for (let j = col; j < n; j++) M[row][j] /= pivot;
            for (let i = 0; i < m; i++) {
                if (i === row) continue;
                const factor = M[i][col];
                if (Math.abs(factor) < 1e-12) continue;
                for (let j = col; j < n; j++) {
                    M[i][j] -= factor * M[row][j];
                }
            }
            pivots.push(col);
            row++;
        }
        return { pivots, rref: M };
    }

    function computeFullRank(A_mat) {
        const A = A_mat.toArray();
        const m = A.length;
        const n = (A[0] || []).length;
        if (!m || !n) {
            throw new Error('Matrix is empty, please provide valid data');
        }
        const { pivots } = rrefPivotColumns(A);
        const r = pivots.length;
        if (r === 0) {
            return { F: math.zeros(m, 0), G: math.zeros(0, n) };
        }
        const F = math.matrix(A.map(row => pivots.map(col => row[col])));
        const Ft = math.transpose(F);
        const FtF = math.multiply(Ft, F);
        const FtF_inv = math.inv(FtF);
        const FtA = math.multiply(Ft, A_mat);
        const G = math.multiply(FtF_inv, FtA);
        return { F, G };
    }

    window.MatrixUtils = {
        parseMatrix,
        approxFractionObj,
        matrixToLatex,
        renderLatex,
        rrefPivotColumns,
        computeFullRank
    };
})();
