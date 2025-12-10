// simplex.js - Implementation of Simplex Method for Linear Programming
document.addEventListener('DOMContentLoaded', () => {
    const objectiveInput = document.getElementById('objective');
    const constraintsInput = document.getElementById('constraints');
    const rhsInput = document.getElementById('rhs');
    const inequalitiesInput = document.getElementById('inequalities');
    const solveBtn = document.getElementById('solve');
    const loadExampleBtn = document.getElementById('loadExample');
    const outputDiv = document.getElementById('output');
    const problemTypeRadios = document.getElementsByName('problemType');

    loadExampleBtn.addEventListener('click', () => {
        document.querySelector('input[name="problemType"][value="min"]').checked = true;
        objectiveInput.value = '-4 -6 -18';
        constraintsInput.value = '1 0 3\n1 2 0';
        rhsInput.value = '3 3';
        inequalitiesInput.value = '<= <=';
    });

    function parseArray(text) {
        text = text.replace(/[－−—‒–]/g, '-');
        return text.trim().split(/[,\s]+/).map(x => parseFloat(x)).filter(x => !isNaN(x));
    }

    function parseMatrix(text) {
        text = text.replace(/[－−—‒–]/g, '-');
        const rows = text.trim().split(/\n+/).map(r => r.trim()).filter(r => r.length > 0);
        return rows.map(r => r.split(/[,\s]+/).map(x => parseFloat(x)));
    }

    function parseInequalities(text) {
        return text.trim().split(/\s+/).map(s => s.trim());
    }

    function getProblemType() {
        for (const radio of problemTypeRadios) {
            if (radio.checked) return radio.value;
        }
        return 'min';
    }

    function formatNumber(num) {
        if (Math.abs(num) < 1e-10) return '0';
        if (Math.abs(num - Math.round(num)) < 1e-10) return Math.round(num).toString();
        return num.toFixed(3);
    }

    function fractionString(num) {
        if (Math.abs(num) < 1e-10) return '0';
        if (Math.abs(num - Math.round(num)) < 1e-10) return Math.round(num).toString();

        // Try to find simple fraction
        const sign = num < 0 ? -1 : 1;
        const absNum = Math.abs(num);

        for (let d = 2; d <= 20; d++) {
            for (let n = 1; n < d * 10; n++) {
                if (Math.abs(n / d - absNum) < 1e-9) {
                    return sign < 0 ? `\\(-\\frac{${n}}{${d}}\\)` : `\\(\\frac{${n}}{${d}}\\)`;
                }
            }
        }

        return formatNumber(num);
    }

    function createTableau(tableau, basicVars, iteration, pivotRow = -1, pivotCol = -1) {
        const numRows = tableau.length;
        const numCols = tableau[0].length;
        const numVars = numCols - 1; // Last column is RHS

        let html = '<div class="tableau">';
        html += `<p style="font-weight:600; margin-bottom:8px">单纯形表 ${iteration}：</p>`;
        html += '<table>';

        // Header row
        html += '<tr><th>基变量</th>';
        for (let j = 0; j < numVars; j++) {
            const varName = j < numVars - basicVars.length ? `x<sub>${j + 1}</sub>` : `s<sub>${j - (numVars - basicVars.length) + 1}</sub>`;
            const className = (j === pivotCol) ? 'pivot-col' : '';
            html += `<th class="${className}">${varName}</th>`;
        }
        html += '<th>RHS</th></tr>';

        // Data rows
        for (let i = 0; i < numRows - 1; i++) {
            const rowClass = (i === pivotRow) ? 'pivot-row' : '';
            html += `<tr class="${rowClass}">`;
            html += `<td style="font-weight:600">${basicVars[i]}</td>`;
            for (let j = 0; j < numCols; j++) {
                const cellClass = (i === pivotRow && j === pivotCol) ? 'pivot-cell' : '';
                html += `<td class="${cellClass}">${fractionString(tableau[i][j])}</td>`;
            }
            html += '</tr>';
        }

        // Z row
        html += '<tr style="border-top: 2px solid #667eea">';
        html += '<td style="font-weight:600">z</td>';
        for (let j = 0; j < numCols; j++) {
            const cellClass = (j === pivotCol) ? 'pivot-col' : '';
            html += `<td class="${cellClass}" style="font-weight:600">${fractionString(tableau[numRows - 1][j])}</td>`;
        }
        html += '</tr>';

        html += '</table></div>';
        return html;
    }

    async function renderMath(element) {
        if (window.renderMathInElement) {
            try {
                renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false
                });
            } catch (e) {
                console.warn('KaTeX render failed', e);
            }
        }
        if (window.MathJax && MathJax.typesetPromise) {
            await MathJax.typesetPromise([element]);
        }
    }

    async function simplex(c, A, b, inequalities, isMin) {
        const m = A.length;    // Number of constraints
        const n = c.length;    // Number of variables
        let output = '';

        // Step 1: Display original problem
        output += '<div class="panel step-section">';
        output += '<div class="step-title">步骤 1：原始问题</div>';
        output += '<p>';
        output += isMin ? '\\[\\min z = ' : '\\[\\max z = ';
        output += c.map((ci, i) => {
            const sign = ci >= 0 ? (i === 0 ? '' : '+') : '';
            return `${sign}${formatNumber(ci)}x_{${i + 1}}`;
        }).join(' ');
        output += '\\]</p>';

        output += '<p>约束条件：</p>';
        output += '<p>\\[\\begin{aligned}';
        for (let i = 0; i < m; i++) {
            output += A[i].map((aij, j) => {
                const sign = aij >= 0 ? (j === 0 ? '' : '+') : '';
                return `${sign}${formatNumber(aij)}x_{${j + 1}}`;
            }).join(' ');
            output += ` &${inequalities[i]} ${formatNumber(b[i])}\\\\`;
        }
        output += 'x_i &\\geq 0, \\forall i';
        output += '\\end{aligned}\\]</p>';
        output += '</div>';

        // Step 2: Introduce slack/surplus variables
        output += '<div class="panel step-section">';
        output += '<div class="step-title">步骤 2：引入松弛变量/剩余变量</div>';

        const slackVars = [];
        const artificialVars = [];
        let numSlack = 0;
        let numArtificial = 0;

        for (let i = 0; i < m; i++) {
            if (inequalities[i] === '<=') {
                slackVars.push({ row: i, type: 'slack', index: numSlack });
                numSlack++;
            } else if (inequalities[i] === '>=') {
                slackVars.push({ row: i, type: 'surplus', index: numSlack });
                numSlack++;
                artificialVars.push({ row: i, index: numArtificial });
                numArtificial++;
            } else if (inequalities[i] === '=') {
                artificialVars.push({ row: i, index: numArtificial });
                numArtificial++;
            }
        }

        output += '<p>转换为标准型：</p>';
        output += '<p>\\[\\begin{aligned}';
        for (let i = 0; i < m; i++) {
            output += A[i].map((aij, j) => {
                const sign = aij >= 0 ? (j === 0 ? '' : '+') : '';
                return `${sign}${formatNumber(aij)}x_{${j + 1}}`;
            }).join(' ');

            const slackVar = slackVars.find(s => s.row === i);
            if (slackVar) {
                if (slackVar.type === 'slack') {
                    output += ` + s_{${slackVar.index + 1}}`;
                } else {
                    output += ` - s_{${slackVar.index + 1}}`;
                }
            }

            const artVar = artificialVars.find(a => a.row === i);
            if (artVar) {
                output += ` + a_{${artVar.index + 1}}`;
            }

            output += ` &= ${formatNumber(b[i])}\\\\`;
        }
        output += '\\end{aligned}\\]</p>';

        if (numSlack > 0) {
            output += `<p>其中 `;
            for (let i = 0; i < numSlack; i++) {
                output += `\\(s_{${i + 1}}\\)${i < numSlack - 1 ? ', ' : ''}`;
            }
            output += ' 为松弛/剩余变量。</p>';
        }

        if (numArtificial > 0) {
            output += `<p style="color:#dc2626">⚠️ 问题包含 ≥ 或 = 约束，需要使用大M法或两阶段法。当前简化实现仅支持 ≤ 约束。</p>`;
        }

        output += '</div>';

        // For simplicity, only handle <= constraints for now
        if (numArtificial > 0) {
            output += '<div class="panel step-section">';
            output += '<p style="color:#dc2626; font-weight:600">当前版本仅完整支持所有约束为 ≤ 的情况。对于包含 ≥ 或 = 的约束，请将问题转换为 ≤ 形式。</p>';
            output += '</div>';
            outputDiv.innerHTML = output;
            renderMath(outputDiv);
            return;
        }

        // Step 3: Build initial tableau
        output += '<div class="panel step-section">';
        output += '<div class="step-title">步骤 3：构建初始单纯形表</div>';

        // Convert to max if min
        let cObj = c.slice();
        if (isMin) {
            cObj = cObj.map(x => -x);
        }

        // Build tableau: [A | I | b; -c | 0 | 0]
        const tableau = [];
        const totalVars = n + m; // original vars + slack vars

        for (let i = 0; i < m; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                row.push(A[i][j]);
            }
            for (let j = 0; j < m; j++) {
                row.push(i === j ? 1 : 0);
            }
            row.push(b[i]);
            tableau.push(row);
        }

        // Z row (objective)
        const zRow = [];
        for (let j = 0; j < n; j++) {
            zRow.push(-cObj[j]);
        }
        for (let j = 0; j < m; j++) {
            zRow.push(0);
        }
        zRow.push(0);
        tableau.push(zRow);

        const basicVars = [];
        for (let i = 0; i < m; i++) {
            basicVars.push(`s<sub>${i + 1}</sub>`);
        }

        output += '<p>初始基变量为松弛变量。</p>';
        output += createTableau(tableau, basicVars, 0);
        output += '</div>';

        // Step 4: Simplex iterations
        let iteration = 1;
        const maxIterations = 20;

        while (iteration <= maxIterations) {
            // Find entering variable (most negative in z-row)
            const zRow = tableau[m];
            let enteringCol = -1;
            let minValue = 0;

            for (let j = 0; j < totalVars; j++) {
                if (zRow[j] < minValue) {
                    minValue = zRow[j];
                    enteringCol = j;
                }
            }

            // Optimal solution found
            if (enteringCol === -1) {
                output += '<div class="panel step-section">';
                output += '<div class="step-title">✓ 找到最优解</div>';
                output += '<p>所有目标函数系数均非负，达到最优解。</p>';
                output += '</div>';
                break;
            }

            output += '<div class="panel step-section">';
            output += `<div class="step-title">步骤 ${3 + iteration}：迭代 ${iteration}</div>`;

            const enteringVarName = enteringCol < n ? `x<sub>${enteringCol + 1}</sub>` : `s<sub>${enteringCol - n + 1}</sub>`;
            output += `<p><strong>进基变量：</strong>${enteringVarName} (列 ${enteringCol + 1}，系数 ${fractionString(zRow[enteringCol])})</p>`;

            // Find leaving variable (minimum ratio test)
            let leavingRow = -1;
            let minRatio = Infinity;

            for (let i = 0; i < m; i++) {
                if (tableau[i][enteringCol] > 1e-10) {
                    const ratio = tableau[i][totalVars] / tableau[i][enteringCol];
                    if (ratio < minRatio) {
                        minRatio = ratio;
                        leavingRow = i;
                    }
                }
            }

            if (leavingRow === -1) {
                output += '<p style="color:#dc2626">问题无界！</p>';
                output += '</div>';
                break;
            }

            output += `<p><strong>出基变量：</strong>${basicVars[leavingRow]} (行 ${leavingRow + 1}，比值 ${fractionString(minRatio)})</p>`;
            output += `<p><strong>主元：</strong>位于行 ${leavingRow + 1}，列 ${enteringCol + 1}，值为 ${fractionString(tableau[leavingRow][enteringCol])}</p>`;

            output += createTableau(tableau, basicVars, iteration, leavingRow, enteringCol);

            // Pivot operation
            const pivotElement = tableau[leavingRow][enteringCol];

            // Divide pivot row by pivot element
            for (let j = 0; j <= totalVars; j++) {
                tableau[leavingRow][j] /= pivotElement;
            }

            // Eliminate other rows
            for (let i = 0; i <= m; i++) {
                if (i === leavingRow) continue;
                const factor = tableau[i][enteringCol];
                for (let j = 0; j <= totalVars; j++) {
                    tableau[i][j] -= factor * tableau[leavingRow][j];
                }
            }

            // Update basic variables
            basicVars[leavingRow] = enteringVarName;

            output += '<p><strong>主元行操作：</strong>将主元行除以主元值</p>';
            output += '<p><strong>消元操作：</strong>使用主元行消去其他行的进基变量列元素</p>';

            output += '</div>';

            iteration++;
        }

        if (iteration > maxIterations) {
            output += '<div class="panel step-section">';
            output += '<p style="color:#dc2626">达到最大迭代次数，可能存在问题。</p>';
            output += '</div>';
        }

        // Step 5: Display final solution
        output += '<div class="panel step-section">';
        output += '<div class="step-title">最终单纯形表</div>';
        output += createTableau(tableau, basicVars, '最终');
        output += '</div>';

        // Extract solution
        output += '<div class="panel">';
        output += '<div class="result-box">';
        output += '<p style="font-size:1.2rem; font-weight:700; margin-bottom:12px">最优解：</p>';

        const solution = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
            const varName = basicVars[i];
            // Check if it's an original variable
            const match = varName.match(/x<sub>(\d+)<\/sub>/);
            if (match) {
                const varIndex = parseInt(match[1]) - 1;
                solution[varIndex] = tableau[i][totalVars];
            }
        }

        output += '<p>';
        for (let i = 0; i < n; i++) {
            output += `\\(x_{${i + 1}} = ${fractionString(solution[i])}\\)${i < n - 1 ? ', ' : ''}`;
        }
        output += '</p>';

        const optimalValue = isMin ? -tableau[m][totalVars] : tableau[m][totalVars];
        output += `<p style="margin-top:12px"><strong>最优值：</strong> \\(z^* = ${fractionString(optimalValue)}\\)</p>`;

        output += '</div>';
        output += '</div>';

        outputDiv.innerHTML = output;
        await renderMath(outputDiv);
    }

    solveBtn.addEventListener('click', async () => {
        try {
            const c = parseArray(objectiveInput.value);
            const A = parseMatrix(constraintsInput.value);
            const b = parseArray(rhsInput.value);
            const inequalities = parseInequalities(inequalitiesInput.value);
            const isMin = getProblemType() === 'min';

            if (c.length === 0) {
                throw new Error('请输入目标函数系数');
            }
            if (A.length === 0) {
                throw new Error('请输入约束条件矩阵');
            }
            if (b.length !== A.length) {
                throw new Error('约束条件右侧常数数量与约束数量不匹配');
            }
            if (inequalities.length !== A.length) {
                throw new Error('约束类型数量与约束数量不匹配');
            }
            for (const row of A) {
                if (row.length !== c.length) {
                    throw new Error('约束矩阵列数与变量数量不匹配');
                }
            }
            for (const bi of b) {
                if (bi < 0) {
                    throw new Error('约束右侧常数必须非负（请乘以-1转换）');
                }
            }

            await simplex(c, A, b, inequalities, isMin);
        } catch (e) {
            outputDiv.innerHTML = `<div class="panel"><p style="color:#dc2626; font-weight:600">错误：${e.message}</p></div>`;
        }
    });
});
