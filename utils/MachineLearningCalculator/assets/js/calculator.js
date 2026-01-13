document.addEventListener('DOMContentLoaded', () => {
    const displayEl = document.getElementById('display');
    const evalBtn = document.getElementById('evalBtn');
    const clearBtn = document.getElementById('clearBtn');
    const backBtn = document.getElementById('backBtn');
    const buttons = Array.from(document.querySelectorAll('.btn-calc'));
    const historyEl = document.getElementById('history');
    const precisionEl = document.getElementById('precision');
    const angleModeEl = document.getElementById('angleMode');
    const deriveBtn = document.getElementById('deriveBtn');
    const solveBtn = document.getElementById('solveBtn');
    const solveVarEl = document.getElementById('solveVar');
    const solveGuessEl = document.getElementById('solveGuess');
    const unitInput = document.getElementById('unitInput');
    const convertBtn = document.getElementById('convertBtn');
    const unitResult = document.getElementById('unitResult');

    let lastAns = 0;
    const FN_INSERTS = Object.freeze({
        sqrt: 'sqrt(',
        sqrt2: 'sqrt(',
        pow: '^',
        pi: 'pi',
        fact: '!',
        mod: ' mod ',
        percent: '/100',
        ans: 'ans',
        sin: 'sin(',
        cos: 'cos(',
        tan: 'tan(',
        log: 'log(',
        ln: 'ln('
    });
    const SYMBOL_REPLACEMENTS = [
        [/Ã·/g, '/'], [/÷/g, '/'],
        [/Ã—/g, '*'], [/×/g, '*'],
        [/âˆ?/g, '-'], [/−/g, '-'], [/–/g, '-'], [/—/g, '-'], [/﹣/g, '-']
    ];

    // wrapper math functions to honor degree/radian setting
    function makeScope() {
        const mode = angleModeEl.value || 'rad';
        const toRad = (x) => mode === 'deg' ? x * Math.PI / 180 : x;
        return {
            sin: (x) => Math.sin(toRad(x)),
            cos: (x) => Math.cos(toRad(x)),
            tan: (x) => Math.tan(toRad(x)),
            asin: (x) => mode === 'deg' ? Math.asin(x) * 180 / Math.PI : Math.asin(x),
            acos: (x) => mode === 'deg' ? Math.acos(x) * 180 / Math.PI : Math.acos(x),
            atan: (x) => mode === 'deg' ? Math.atan(x) * 180 / Math.PI : Math.atan(x),
            pi: math.pi,
            e: math.e,
            ans: lastAns,
            // keep math functions available via math namespace if needed
            math: math
        };
    }

    function getDisplay() {
        return displayEl.innerText.trim();
    }
    function setDisplay(v) {
        displayEl.innerText = v;
    }

    // append token to display at end
    function appendToDisplay(token) {
        const current = getDisplay();
        setDisplay(current === '0' ? token : current + token);
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
                appendToDisplay(FN_INSERTS[fn]);
            }
        });
    });

    clearBtn.addEventListener('click', () => setDisplay('0'));
    backBtn.addEventListener('click', () => {
        const s = getDisplay();
        if (s.length <= 1) setDisplay('0'); else setDisplay(s.slice(0, -1));
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

    function pushHistory(expr, result) {
        const div = document.createElement('div');
        div.style.padding = '6px 8px';
        div.style.borderBottom = '1px solid #e9eef8';
        div.innerHTML = `<div style="font-weight:600">${expr}</div><div style="color:#334;height:auto">${result}</div>`;
        div.addEventListener('click', () => setDisplay(expr));
        historyEl.prepend(div);
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
                // show fraction and decimal
                const frac = res; // math.Fraction
                const dec = frac.valueOf();
                const out = `${frac.toString()} = ${formatNumber(dec)}`;
                lastAns = dec;
                pushHistory(expr, out);
                setDisplay(formatNumber(dec));
                return;
            }

            if (typeof res === 'function') res = res();

            // If result is a Unit
            if (math.typeOf(res) === 'Unit') {
                const out = res.toString();
                pushHistory(expr, out);
                setDisplay(out);
                return;
            }

            // For complex objects, try to stringify
            if (typeof res === 'object') res = res.toString();

            // numeric formatting
            if (typeof res === 'number') {
                lastAns = res;
                const out = formatNumber(res);
                // also attempt fraction
                try {
                    const f = math.fraction(res);
                    if (f && f.toString && f.toString() !== String(out)) {
                        pushHistory(expr, `${out} ≈ ${f.toString()}`);
                    } else {
                        pushHistory(expr, out);
                    }
                } catch (e) {
                    pushHistory(expr, out);
                }
                setDisplay(out);
                return;
            }

            // otherwise
            pushHistory(expr, String(res));
            setDisplay(String(res));
        } catch (err) {
            setDisplay('错误: ' + err.message);
        }
    });

    // 符号求导（使用 Algebrite）
    deriveBtn.addEventListener('click', () => {
        const raw = getDisplay();
        const expr = raw || '0';
        const variable = (solveVarEl.value && solveVarEl.value.trim()) || 'x';
        try {
            // Algebrite 使用 d(expr, x) 或 derivative(expr, x)
            const cmd = `d(${expr}, ${variable})`;
            const out = Algebrite.run(cmd).toString();
            pushHistory(`d(${expr})/d${variable}`, out);
            setDisplay(out);
        } catch (e) {
            setDisplay('求导错误: ' + e.message);
        }
    });

    // 单变量数值求解（牛顿法）
    async function numericSolve(expr, variable='x', guess=0) {
        const f = (v) => {
            try { return Number(math.evaluate(expr, { [variable]: v, ans: lastAns })); } catch (e) { throw e; }
        };
        const h = 1e-6;
        let x = Number(guess || 0);
        for (let i=0;i<80;i++) {
            const fx = f(x);
            const dfx = (f(x+h) - f(x-h)) / (2*h);
            if (!isFinite(fx) || !isFinite(dfx)) throw new Error('函数值或导数非有限');
            if (Math.abs(fx) < 1e-12) return x;
            if (Math.abs(dfx) < 1e-12) x = x + (Math.sign(fx) || 1) * 1e-1; else x = x - fx/dfx;
        }
        throw new Error('未收敛');
    }

    solveBtn.addEventListener('click', async () => {
        const raw = getDisplay();
        const expr = raw || '0';
        const variable = (solveVarEl.value && solveVarEl.value.trim()) || 'x';
        const guess = Number(solveGuessEl.value) || 0;
        try {
            const root = await numericSolve(expr, variable, guess);
            const out = formatNumber(root);
            pushHistory(`solve(${expr}, ${variable})`, out);
            setDisplay(out);
        } catch (e) {
            setDisplay('求解失败: ' + e.message);
        }
    });

    // 单纯的单位转换（支持 math.unit），输入示例： "10 cm to m"
    convertBtn.addEventListener('click', () => {
        const txt = (unitInput.value || '').trim();
        if (!txt) return unitResult.innerText = '请输入要转换的量，例如：10 cm to m';
        const parts = txt.split(/\s+to\s+/i);
        try {
            if (parts.length === 2) {
                const from = math.unit(parts[0]);
                const to = from.to(parts[1]);
                unitResult.innerText = to.toString();
            } else {
                // 尝试直接构造unit
                const u = math.unit(txt);
                unitResult.innerText = u.toString();
            }
        } catch (e) {
            unitResult.innerText = '转换错误: ' + e.message;
        }
    });

    // allow pressing Enter in display to evaluate
    displayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            evalBtn.click();
        }
    });

});
