(() => {
    const DELIMITERS = [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
    ];

    function normalizeTargets(containers) {
        const source = Array.isArray(containers)
            ? containers
            : (containers && typeof containers.length === 'number' && !containers.nodeType && typeof containers !== 'string')
                ? Array.from(containers)
                : [containers];

        return source.filter((node) => node && node.nodeType === 1);
    }

    async function renderLatex(containers) {
        const targets = normalizeTargets(containers);
        if (targets.length === 0) {
            return;
        }

        if (window.renderMathInElement) {
            targets.forEach((target) => {
                try {
                    window.renderMathInElement(target, {
                        delimiters: DELIMITERS,
                        throwOnError: false
                    });
                } catch (error) {
                    console.warn('KaTeX render failed', error);
                }
            });
            return;
        }

        if (window.MathJax && window.MathJax.typesetPromise) {
            await window.MathJax.typesetPromise(targets);
            return;
        }

        console.warn('No LaTeX renderer (KaTeX/MathJax) available');
    }

    function renderMarkedScopes() {
        return renderLatex(document.querySelectorAll('[data-latex-scope]'));
    }

    window.DPFLatex = {
        renderLatex,
        renderMarkedScopes
    };

    const initialRender = () => {
        renderMarkedScopes().catch((error) => {
            console.warn('Initial LaTeX render failed', error);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialRender);
    } else {
        initialRender();
    }
})();
