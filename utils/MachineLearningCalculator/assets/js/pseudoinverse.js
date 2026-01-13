// pseudoinverse.js -- compute A^+ using full-rank factorization and show intermediate steps
document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('matrixA');
    const computeBtn = document.getElementById('compute');
    const loadBtn = document.getElementById('loadSample');
    const outF = document.getElementById('outF');
    const outG = document.getElementById('outG');
    const outFHF = document.getElementById('outFHF');
    const outInvFHF = document.getElementById('outInvFHF');
    const outGGH = document.getElementById('outGGH');
    const outInvGGH = document.getElementById('outInvGGH');
    const outApinv = document.getElementById('outApinv');
    const utils = window.MatrixUtils;

    if (!utils) {
        console.error('MatrixUtils is required for pseudoinverse.js');
        return;
    }

    loadBtn.addEventListener('click', () => {
        ta.value = '2 4 1 1\n1 2 -1 2\n-1 -2 -2 1';
    });

    function conjTranspose(M) {
        try {
            return math.transpose(math.conj(M));
        } catch (e) {
            return math.transpose(M);
        }
    }

    function handleError(message) {
        const text = '错误: ' + message;
        if (outF) outF.textContent = text;
        [outG, outFHF, outInvFHF, outGGH, outInvGGH, outApinv].forEach(el => {
            if (el) el.textContent = '';
        });
    }

    computeBtn.addEventListener('click', async () => {
        try {
            const A = utils.parseMatrix(ta.value);
            const { F, G } = utils.computeFullRank(A);
            if (outF) outF.innerHTML = `\\[F = ${utils.matrixToLatex(F)}\\]`;
            if (outG) outG.innerHTML = `\\[G = ${utils.matrixToLatex(G)}\\]`;
            await utils.renderLatex([outF, outG]);

            const Fh = conjTranspose(F);
            const Gh = conjTranspose(G);
            const FhF = math.multiply(Fh, F);
            const FhFInv = math.inv(FhF);
            const GGh = math.multiply(G, Gh);
            const GGhInv = math.inv(GGh);

            if (outFHF) outFHF.innerHTML = `\\[F^{H}F = ${utils.matrixToLatex(FhF)}\\]`;
            if (outInvFHF) outInvFHF.innerHTML = `\\[(F^{H}F)^{-1} = ${utils.matrixToLatex(FhFInv)}\\]`;
            if (outGGH) outGGH.innerHTML = `\\[GG^{H} = ${utils.matrixToLatex(GGh)}\\]`;
            if (outInvGGH) outInvGGH.innerHTML = `\\[(GG^{H})^{-1} = ${utils.matrixToLatex(GGhInv)}\\]`;

            const term = math.multiply(Gh, GGhInv);
            const term2 = math.multiply(term, FhFInv);
            const Aplus = math.multiply(term2, Fh);
            if (outApinv) outApinv.innerHTML = `\\[A^{+} = ${utils.matrixToLatex(Aplus)}\\]`;

            await utils.renderLatex([outFHF, outInvFHF, outGGH, outInvGGH, outApinv]);
        } catch (e) {
            handleError(e.message);
        }
    });
});
