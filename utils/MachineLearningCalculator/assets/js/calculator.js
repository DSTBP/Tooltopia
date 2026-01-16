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

    // allow pressing Enter in display to evaluate
    displayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            evalBtn.click();
        }
    });

});
