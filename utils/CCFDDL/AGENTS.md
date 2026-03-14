# Repository Guidelines

## Project Structure & Module Organization
`index.html` is the single entry point for this static utility. Keep layout and markup changes there unless a section clearly belongs in shared assets. Put styles in `assets/css/style.css`. Put interactive behavior in `assets/js/script.js`; keep focused helpers in separate files such as `assets/js/theme-toggle.js`. Treat `assets/js/ccfdata.js`, `assets/js/scimago.js`, `assets/js/if.js`, and `assets/data/*.csv` as data sources, not generic logic modules. Store fonts in `assets/fonts/` and shared imagery like `favicon.png` at the repo root when referenced globally.

## Build, Test, and Development Commands
There is no package manager or build pipeline in this folder.

- `python -m http.server 8000` runs a local static server from the repo root.
- Open `http://localhost:8000` in a browser to verify behavior without `file://` quirks.
- `git diff --check` catches trailing whitespace and patch formatting issues before review.

## Coding Style & Naming Conventions
Match the existing style: 4-space indentation in HTML, CSS, and JavaScript; semicolons in JavaScript; and small, readable DOM-focused functions. Use `camelCase` for JavaScript variables and functions, and use descriptive kebab-case for CSS classes and HTML IDs such as `theme-toggle` or `pagination-container`. Prefer extending existing sections over introducing new files for minor UI tweaks. Preserve UTF-8 encoding and recheck any Chinese copy after edits to avoid mojibake.

## Testing Guidelines
This repo does not currently include an automated test suite, so manual browser verification is required. Before opening a PR, confirm search, filtering, tab switching, pagination, timezone selection, and theme toggling still work in a current Chromium-based browser. If you touch data files, verify the affected records render correctly and that counts, labels, and sorting still behave as expected.

## Commit & Pull Request Guidelines
Recent history uses generic messages like `update`, but new commits should use short imperative summaries such as `Refine deadline filter labels` or `Fix theme toggle persistence`. Keep each commit scoped to one change. PRs should include a brief description, manual test notes, linked issues when applicable, and before/after screenshots for visible UI changes.
