+  # CLAUDE.md
         2 +  
         3 +  This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
         4 +  
         5 +  ## Project Overview
         6 +  
         7 +  MachineLearningCalculator is a web-based calculator suite with advanced mathematical capabilities, built entirely with vanilla JavaScript, HTML, and CSS. The project consists of:
         8 +  
         9 +  1. **Main Calculator** (`index.html`) - Scientific calculator with symbolic computation
        10 +  2. **Matrix Operations** (`more/`) - Full-rank factorization and pseudoinverse computation
        11 +  3. **Static Site** - No build process, runs directly in browser
        12 +  
        13 +  ## Running the Application
        14 +  
        15 +  This is a static website with no build step required:
        16 +  
        17 +  ```bash
        18 +  # Using Python 3
        19 +  python -m http.server 8000
        20 +  
        21 +  # Using Python 2
        22 +  python -m SimpleHTTPServer 8000
        23 +  
        24 +  # Using Node.js http-server
        25 +  npx http-server -p 8000
        26 +  
        27 +  # Then open http://localhost:8000
        28 +  ```
        29 +  
        30 +  For development, any static file server will work. Simply open `index.html` in a browser, though a local server is recommended for proper CORS handling of external CDN resources.
        31 +  
        32 +  ## Architecture
        33 +  
        34 +  ### Core Components
        35 +  
        36 +  **Main Calculator (`assets/js/calculator.js`)**
        37 +  - Uses `math.js` for numerical computation (fractions, units, modular arithmetic)
        38 +  - Uses `Algebrite` for symbolic operations (derivatives, simplification)
        39 +  - Supports: trigonometry (rad/deg modes), logarithms, factorials, equation solving
        40 +  - Features numerical solver using Newton's method (80 iterations max)
        41 +  - Maintains `lastAns` for result chaining
        42 +  - Custom scope builder (`makeScope()`) wraps trig functions to honor angle mode
        43 +  
        44 +  **Matrix Operations**
        45 +  - `assets/js/fullrank.js` - Implements full-rank factorization A = F·G via:
        46 +    - RREF-based pivot column selection
        47 +    - Formula: G = (F^T F)^(-1) F^T A
        48 +  - `assets/js/pseudoinverse.js` - Computes Moore-Penrose pseudoinverse A⁺ via:
        49 +    - Full-rank factorization first
        50 +    - Formula: A⁺ = G^H (GG^H)^(-1) (F^H F)^(-1) F^H
        51 +    - Shows all intermediate steps (F^H F, (F^H F)^(-1), GG^H, (GG^H)^(-1))
        52 +  
        53 +  **LaTeX Rendering System** (both matrix modules)
        54 +  - Attempts KaTeX auto-render first (faster, lighter)
        55 +  - Falls back to MathJax if KaTeX unavailable
        56 +  - `matrixToLatex()` function intelligently factors common denominators
        57 +  - Uses continued fractions (`approxFractionObj()`) to approximate floats as rationals
        58 +  - Example: `1/3 * [[2, 3], [4, 5]]` instead of `[[2/3, 1], [4/3, 5/3]]`
        59 +  
        60 +  ### File Structure
        61 +  
        62 +  ```
        63 +  ├── index.html                    # Main calculator page
        64 +  ├── more.html                     # Feature selection hub
        65 +  ├── more/
        66 +  │   ├── fullrank.html            # Full-rank factorization interface
        67 +  │   └── pseudoinverse.html       # Pseudoinverse computation interface
        68 +  ├── assets/
        69 +  │   ├── js/
        70 +  │   │   ├── calculator.js        # Main calculator logic
        71 +  │   │   ├── fullrank.js          # Full-rank decomposition
        72 +  │   │   ├── pseudoinverse.js     # Pseudoinverse computation
        73 +  │   │   └── script.js            # Lights Out game (separate feature)
        74 +  │   └── css/
        75 +  │       └── style.css            # All styles (responsive, includes Lights Out)
        76 +  └── favicon.png
        77 +  ```
        78 +  
        79 +  ## Key Technical Details
        80 +  
        81 +  ### Expression Normalization (`calculator.js`)
        82 +  The calculator accepts user-friendly symbols and normalizes them:
        83 +  - `÷` → `/`
        84 +  - `×` → `*`
        85 +  - `−` → `-`
        86 +  - `^` → power operator (via math.js)
        87 +  - `!` and `(\d)!` → `factorial($1)` and `factorial`
        88 +  - `mod` → space-padded mod operator
        89 +  
        90 +  ### Matrix Input Parsing
        91 +  All matrix modules use consistent parsing (`parseMatrix()`):
        92 +  - Accepts rows separated by newlines
        93 +  - Elements separated by spaces, commas, or tabs
        94 +  - Normalizes various Unicode minus signs: `[－−—‒–]` → `-`
        95 +  
        96 +  ### Numerical Solver Implementation
        97 +  Equation solving uses custom Newton's method:
        98 +  - Max 80 iterations
        99 +  - Step size h = 1e-6 for numerical derivatives
       100 +  - Convergence threshold: |f(x)| < 1e-12
       101 +  - If derivative near zero, perturbs by ±0.1 to escape local minima
       102 +  - Fails gracefully with "未收敛" (not converged) error
       103 +  
       104 +  ### RREF Algorithm (`rrefPivotColumns`)
       105 +  - Gaussian elimination with partial pivoting
       106 +  - Tolerance: 1e-12 for zero detection
       107 +  - Returns pivot column indices (used to extract F matrix)
       108 +  - Used by both full-rank and pseudoinverse modules
       109 +  
       110 +  ## External Dependencies (CDN)
       111 +  
       112 +  - **math.js 11.8.0** - Numerical computation, units, fractions
       113 +  - **Algebrite 1.5.0** - Symbolic algebra for derivatives
       114 +  - **KaTeX 0.16.10** - Fast LaTeX rendering (matrix pages)
       115 +  - **MathJax 3** - Fallback LaTeX renderer
       116 +  
       117 +  All dependencies loaded via CDN. No npm/package management needed.
       118 +  
       119 +  ## Code Style Conventions
       120 +  
       121 +  - Chinese language UI/errors for user-facing text
       122 +  - Compact ES6 syntax: arrow functions, const/let, template literals
       123 +  - Event listeners attached via `addEventListener` after DOM ready
       124 +  - Functions hoisted or declared before use
       125 +  - Tolerance constants: `1e-12` for zero comparisons, `1e-6` for numerical derivatives
       126 +  
       127 +  ## Common Operations
       128 +  
       129 +  **Adding a new calculator function:**
       130 +  1. Add button/input in HTML with appropriate `data-fn` or `data-val` attribute
       131 +  2. Handle in `calculator.js` button click handler or `handleFn()` switch
       132 +  3. Ensure math.js or Algebrite supports the operation
       133 +  4. Add to scope if needed (e.g., custom trig wrapper)
       134 +  
       135 +  **Adding a new matrix operation page:**
       136 +  1. Create HTML in `more/` directory
       137 +  2. Create JS module in `assets/js/`
       138 +  3. Reuse `parseMatrix()`, `matrixToLatex()`, and LaTeX rendering patterns
       139 +  4. Link from `more.html`
       140 +  5. Ensure math.js operations are numerically stable
       141 +  
       142 +  **Modifying LaTeX rendering:**
       143 +  - Both KaTeX and MathJax use identical delimiters: `$$...$$`, `\\[...\\]`, `\\(...\\)`
       144 +  - Always call `renderLatex([...elements])` after updating innerHTML
       145 +  - Test with both rational and decimal results
       146 +  
       147 +  ## Known Limitations
       148 +  
       149 +  - Matrix operations fail on singular matrices (no graceful degradation for rank-deficient cases in pseudoinverse)
       150 +  - Equation solver limited to single variable, no constraint handling
       151 +  - No input validation on matrix dimensions (relies on math.js error handling)
       152 +  - Numerical precision limited to JavaScript floats (~15-16 decimal digits)
       153 +  - RREF tolerance hardcoded to 1e-12 (not user-configurable)
       154 +  
       155 +  ## Language
       156 +  
       157 +  User interface is in Chinese (zh-CN). All user-facing text, error messages, and labels are in Chinese. Code comments and variable names use English.