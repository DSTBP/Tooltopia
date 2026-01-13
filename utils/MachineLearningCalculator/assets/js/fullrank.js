// fullrank.js -- compute full rank factorization A = F * G
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('matrixA');
    const decompBtn = document.getElementById('decomp');
    const sampleBtn = document.getElementById('sample');
    const outF = document.getElementById('outF');
    const outG = document.getElementById('outG');
    const utils = window.MatrixUtils;

    if (!utils) {
        console.error('MatrixUtils is required for fullrank.js');
        return;
    }

    sampleBtn.addEventListener('click', () => {
        textarea.value = '2 4 1 1\n1 2 -1 2\n-1 -2 -2 1';
    });

    decompBtn.addEventListener('click', async () => {
        try {
            const A = utils.parseMatrix(textarea.value);
            const { F, G } = utils.computeFullRank(A);
            outF.innerHTML = `\\[F = ${utils.matrixToLatex(F)}\\]`;
            outG.innerHTML = `\\[G = ${utils.matrixToLatex(G)}\\]`;
            await utils.renderLatex([outF, outG]);
        } catch (e) {
            outF.textContent = '错误: ' + e.message;
            outG.textContent = '';
        }
    });
});
