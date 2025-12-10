// pseudoinverse.js -- compute A^+ using full-rank factorization and show intermediate steps
document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('matrixA');
    const computeBtn = document.getElementById('compute');
    const loadBtn = document.getElementById('loadSample');
    const outF = document.getElementById('outF');
    const outG = document.getElementById('outG');
    const outFHF = document.getElementById('outFHF');
    const outFHFinv = document.getElementById('outFHFinv');
    const outGGH = document.getElementById('outGGH');
    const outGGHinv = document.getElementById('outGGHinv');
    const outAplus = document.getElementById('outAplus');

    loadBtn.addEventListener('click', () => {
        ta.value = '2 4 1 1\n1 2 -1 2\n-1 -2 -2 1';
    });

    function parseMatrix(text) {
        text = text.replace(/[－−—‒–]/g, '-');
        const rows = text.trim().split(/\n+/).map(r => r.trim()).filter(r => r.length>0);
        const M = rows.map(r => r.split(/[ ,\t]+/).map(v => Number(v)));
        return math.matrix(M);
    }

    // approximate a floating number by a rational p/q using continued fraction
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
        a = Math.abs(a); b = Math.abs(b);
        if (!b) return a;
        return gcd(b, a % b);
    }

    function lcm(a, b) {
        if (a === 0 || b === 0) return 0;
        return Math.abs(a * b) / gcd(a, b);
    }

    // produce LaTeX for matrix with common-denominator factoring
    // Extracts all fractions so the matrix contains only integers
    function matrixToLatex(mat) {
        try {
            const A = mat.toArray();
            // Convert all elements to fraction form {n, d}
            const fractions = A.map(r => r.map(v => {
                if (v && typeof v === 'object' && v.s !== undefined && v.n !== undefined && v.d !== undefined) {
                    const sign = v.s === -1 ? -1 : 1;
                    return { n: sign * v.n, d: v.d };
                }
                if (Math.abs(v - Math.round(v)) < 1e-12) {
                    return { n: Math.round(v), d: 1 };
                }
                const fr = approxFractionObj(Number(v));
                return { n: fr.n, d: fr.d };
            }));

            // Check if all elements are already integers
            const allIntegers = fractions.every(row => row.every(fr => fr.d === 1));

            if (allIntegers) {
                // Find GCD of all integer values
                let commonGCD = 0;
                fractions.forEach(row => row.forEach(fr => {
                    if (fr.n !== 0) {
                        commonGCD = gcd(commonGCD, Math.abs(fr.n));
                    }
                }));

                if (commonGCD === 0) commonGCD = 1;

                if (commonGCD > 1) {
                    const matrixIntegers = fractions.map(r => r.map(fr => fr.n / commonGCD));
                    const innerLatex = '\\begin{bmatrix}' +
                        matrixIntegers.map(r => r.join(' & ')).join('\\\\') +
                        '\\end{bmatrix}';
                    return `\\displaystyle ${commonGCD} ${innerLatex}`;
                }

                const innerLatex = '\\begin{bmatrix}' +
                    fractions.map(r => r.map(fr => fr.n).join(' & ')).join('\\\\') +
                    '\\end{bmatrix}';
                return '\\displaystyle ' + innerLatex;
            }

            // Calculate LCM of all denominators
            let commonDenom = 1;
            fractions.forEach(row => row.forEach(fr => {
                if (isFinite(fr.d) && fr.d !== 0) {
                    commonDenom = lcm(commonDenom, fr.d);
                }
            }));

            // Multiply all elements by commonDenom to get integers
            const integers = fractions.map(r => r.map(fr => {
                return Math.round(fr.n * (commonDenom / fr.d));
            }));

            // Calculate GCD of all integers
            let commonGCD = 0;
            integers.forEach(row => row.forEach(val => {
                if (val !== 0) {
                    commonGCD = gcd(commonGCD, Math.abs(val));
                }
            }));

            if (commonGCD === 0) commonGCD = 1;

            // Simplify the fraction commonGCD/commonDenom
            const g = gcd(commonGCD, commonDenom);
            const finalNum = commonGCD / g;
            const finalDenom = commonDenom / g;

            // Matrix with integers only
            const matrixIntegers = integers.map(r => r.map(val => val / commonGCD));

            const innerLatex = '\\begin{bmatrix}' +
                matrixIntegers.map(r => r.join(' & ')).join('\\\\') +
                '\\end{bmatrix}';

            if (finalDenom === 1) {
                if (finalNum === 1) {
                    return '\\displaystyle ' + innerLatex;
                }
                return `\\displaystyle ${finalNum} ${innerLatex}`;
            }
            return `\\displaystyle \\frac{${finalNum}}{${finalDenom}} ${innerLatex}`;
        } catch (e) {
            console.error('matrixToLatex error:', e);
            return String(mat);
        }
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

    // reuse rref/pivot and computeFullRank from previous implementation (copied locally)
    function rrefPivotColumns(A) {
        const m = A.length;
        const n = A[0].length;
        const M = A.map(r => r.slice());
        const pivots = [];
        let row = 0;
        for (let col = 0; col < n && row < m; col++) {
            let sel = row;
            while (sel < m && Math.abs(M[sel][col]) < 1e-12) sel++;
            if (sel === m) continue;
            const tmp = M[row]; M[row] = M[sel]; M[sel] = tmp;
            const piv = M[row][col];
            for (let j = col; j < n; j++) M[row][j] /= piv;
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
        const A = A_mat.toArray();
        const m = A.length;
        const n = (A[0] || []).length;
        const { pivots } = rrefPivotColumns(A);
        const r = pivots.length;
        if (r === 0) {
            return { F: math.zeros(m, 0), G: math.zeros(0, n) };
        }
        const F = math.matrix(A.map(row => pivots.map(c => row[c]))); // m x r
        const Ft = math.transpose(F);
        const FtF = math.multiply(Ft, F);
        const FtF_inv = math.inv(FtF);
        const FtA = math.multiply(Ft, A_mat);
        const G = math.multiply(FtF_inv, FtA);
        return { F, G };
    }

    function conjTranspose(M) {
        // conjugate transpose: transpose(conj(M))
        try {
            return math.transpose(math.conj(M));
        } catch (e) {
            return math.transpose(M);
        }
    }

    computeBtn.addEventListener('click', async () => {
        try {
            const A = parseMatrix(ta.value);
            // step 1: compute F and G
            const { F, G } = computeFullRank(A);
            const latexF = matrixToLatex(F);
            const latexG = matrixToLatex(G);
            outF.innerHTML = `\\[F = ${latexF}\\]`;
            outG.innerHTML = `\\[G = ${latexG}\\]`;
            await renderLatex([outF, outG]);

            // step 2: compute F^H F and inverse
            const Fh = conjTranspose(F);
            const FhF = math.multiply(Fh, F);
            outFHF.innerHTML = `\\[F^{H}F = ${matrixToLatex(FhF)}\\]`;
            const FhF_inv = math.inv(FhF);
            outFHFinv.innerHTML = `\\[(F^{H}F)^{-1} = ${matrixToLatex(FhF_inv)}\\]`;

            // step 3: compute G G^H and inverse
            const Gh = conjTranspose(G);
            const GGh = math.multiply(G, Gh);
            outGGH.innerHTML = `\\[GG^{H} = ${matrixToLatex(GGh)}\\]`;
            const GGh_inv = math.inv(GGh);
            outGGHinv.innerHTML = `\\[(GG^{H})^{-1} = ${matrixToLatex(GGh_inv)}\\]`;

            // step 4: A^+ = G^H * (G G^H)^{-1} * (F^H F)^{-1} * F^H
            const term = math.multiply(Gh, GGh_inv);
            const term2 = math.multiply(term, FhF_inv);
            const Aplus = math.multiply(term2, Fh);
            outAplus.innerHTML = `\\[A^{+} = ${matrixToLatex(Aplus)}\\]`;
            await renderLatex([outFHF, outFHFinv, outGGH, outGGHinv, outAplus]);
        } catch (e) {
            outF.textContent = '错误: ' + e.message;
            outG.textContent = '';
            outFHF.textContent = '';
            outFHFinv.textContent = '';
            outGGH.textContent = '';
            outGGHinv.textContent = '';
            outAplus.textContent = '';
        }
    });
});
