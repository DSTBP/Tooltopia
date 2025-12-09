// fullrank.js -- compute full rank factorization A = F * G
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('matrixA');
    const decompBtn = document.getElementById('decomp');
    const sampleBtn = document.getElementById('sample');
    const outF = document.getElementById('outF');
    const outG = document.getElementById('outG');

    sampleBtn.addEventListener('click', () => {
        textarea.value = '2 4 1 1\n1 2 -1 2\n-1 -2 -2 1';
    });

    function parseMatrix(text) {
        // replace non-ascii minus
        text = text.replace(/[－−—‒–]/g, '-');
        const rows = text.trim().split(/\n+/).map(r => r.trim()).filter(r => r.length>0);
        const M = rows.map(r => r.split(/[ ,\t]+/).map(v => Number(v)));
        return math.matrix(M);
    }

    // approximate a floating number by a rational p/q using continued fraction
    // returns object {n, d, str, isInt}
    function approxFractionObj(x, maxDen = 1000000, tol = 1e-12) {
        if (!isFinite(x)) return { n: NaN, d: NaN, str: String(x), isInt: false };
        const xi = Math.round(x);
        if (Math.abs(x - xi) < tol) return { n: xi, d: 1, str: String(xi), isInt: true };
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
        if (!b) return a; return gcd(b, a % b);
    }

    // Convert matrix to LaTeX; factor out common denominator if majority share same denom
    function matrixToLatex(mat) {
        try {
            const arr = mat.toArray();
            const objs = arr.map(r => r.map(v => {
                if (v && typeof v === 'object' && v.s !== undefined && v.n !== undefined && v.d !== undefined) {
                    const sign = v.s === -1 ? -1 : 1;
                    const nn = sign * v.n;
                    return { n: nn, d: v.d, latex: v.d === 1 ? `${nn}` : `\\tfrac{${nn}}{${v.d}}`, isInt: v.d === 1 };
                }
                if (Math.abs(v - Math.round(v)) < 1e-12) return { n: Math.round(v), d: 1, latex: `${Math.round(v)}`, isInt: true };
                const fr = approxFractionObj(Number(v));
                return { n: fr.n, d: fr.d, latex: fr.d === 1 ? `${fr.n}` : `\\tfrac{${fr.n}}{${fr.d}}`, isInt: fr.isInt };
            }));

            // detect common denominator
            const denomCount = Object.create(null); let total = 0;
            objs.forEach(row => row.forEach(o => { total++; if (o.d !== 1 && isFinite(o.d)) denomCount[o.d] = (denomCount[o.d] || 0) + 1; }));
            let bestD = null, bestCount = 0;
            for (const d in denomCount) { if (denomCount[d] > bestCount) { bestCount = denomCount[d]; bestD = Number(d); } }

            function latexMatrixFromObjs(objsInner) {
                return '\\begin{bmatrix}' + objsInner.map(r => r.map(c => c.latex).join(' & ')).join('\\\\') + '\\end{bmatrix}';
            }

            if (bestD !== null && bestCount > total / 2) {
                const D = bestD;
                // inner entries = (o.n * D) / o.d simplified
                const inner = objs.map(r => r.map(o => {
                    const p = o.n * D; const q = o.d; const g = gcd(Math.abs(p), Math.abs(q));
                    const sp = p / g; const sq = q / g;
                    if (sq === 1) return { latex: `${sp}` };
                    return { latex: `\\tfrac{${sp}}{${sq}}` };
                }));
                const innerLatex = '\\begin{bmatrix}' + inner.map(r => r.map(c => c.latex).join(' & ')).join('\\\\') + '\\end{bmatrix}';
                return `\\displaystyle \\frac{1}{${D}} ${innerLatex}`;
            }

            return `\\displaystyle ${latexMatrixFromObjs(objs)}`;
        } catch (e) { return String(mat); }
    }

    // Render LaTeX using KaTeX auto-render if available, otherwise fallback to MathJax
    async function renderLatex(containers) {
        if (!Array.isArray(containers)) containers = [containers];
        if (window.renderMathInElement) {
            containers.forEach(c => {
                try {
                    renderMathInElement(c, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ],
                        throwOnError: false
                    });
                } catch (e) { console.warn('KaTeX render failed', e); }
            });
        } else if (window.MathJax && MathJax.typesetPromise) {
            await MathJax.typesetPromise(containers);
        } else {
            console.warn('No LaTeX renderer (KaTeX/MathJax) available');
        }
    }

    // compute rref and pivot columns (Gaussian elimination)
    function rrefPivotColumns(A) {
        // operate on clone array
        const m = A.length;
        const n = A[0].length;
        const M = A.map(r => r.slice());
        const pivots = [];
        let row = 0;
        for (let col = 0; col < n && row < m; col++) {
            // find pivot in or below row
            let sel = row;
            while (sel < m && Math.abs(M[sel][col]) < 1e-12) sel++;
            if (sel === m) continue; // no pivot in this col
            // swap
            const tmp = M[row]; M[row] = M[sel]; M[sel] = tmp;
            // normalize
            const piv = M[row][col];
            for (let j = col; j < n; j++) M[row][j] /= piv;
            // eliminate other rows
            for (let i = 0; i < m; i++) {
                if (i === row) continue;
                const factor = M[i][col];
                if (Math.abs(factor) < 1e-12) continue;
                for (let j = col; j < n; j++) M[i][j] -= factor * M[row][j];
            }
            pivots.push(col);
            row++;
        }
        return { pivots, rref: M };
    }

    function computeFullRank(A_mat) {
        // A_mat: math.matrix m x n
        const A = A_mat.toArray();
        const m = A.length;
        const n = (A[0] || []).length;
        if (m === 0 || n === 0) throw new Error('空矩阵');

        const { pivots } = rrefPivotColumns(A);
        const r = pivots.length;
        if (r === 0) {
            // zero matrix
            const F = math.zeros(m, 0);
            const G = math.zeros(0, n);
            return { F, G };
        }

        // Form F by selecting the pivot columns from original A
        const Aarr = A_mat.toArray();
        const F = math.matrix(Aarr.map(row => pivots.map(c => row[c]))); // m x r

        // Compute G = (F^T F)^{-1} F^T A
        const Ft = math.transpose(F);
        const FtF = math.multiply(Ft, F);
        // invert
        const FtF_inv = math.inv(FtF);
        const FtA = math.multiply(Ft, A_mat);
        const G = math.multiply(FtF_inv, FtA);

        return { F, G };
    }

    decompBtn.addEventListener('click', async () => {
        try {
            const A = parseMatrix(textarea.value);
            const res = computeFullRank(A);
            // LaTeX outputs
            const latexF = matrixToLatex(res.F);
            const latexG = matrixToLatex(res.G);
            outF.innerHTML = `\\[F = ${latexF}\\]`;
            outG.innerHTML = `\\[G = ${latexG}\\]`;
            await renderLatex([outF, outG]);
        } catch (e) {
            outF.textContent = '错误: ' + e.message;
            outG.textContent = '';
        }
    });
});
