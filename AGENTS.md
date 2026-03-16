# Repository Guidelines

## Project Structure & Module Organization
`index.html` is the landing page for the full tool collection. Shared homepage assets live in `assets/css`, `assets/js`, and `assets/image`. Individual tools live under `utils/<ToolName>/`; most include their own `index.html`, `assets/css/style.css`, `assets/js/script.js`, and `favicon.png`. Keep tool-specific code inside its own folder, and treat root assets as shared landing-page resources.

## Build, Test, and Development Commands
This repository is static HTML, CSS, and JavaScript, so there is no package install or build step.

```powershell
python -m http.server 8000
```

Run that from the repo root, then open `http://localhost:8000/`. Prefer a local server over `file://` because some tools load JSON or remote data with `fetch()`. Opening `index.html` directly is fine for quick visual checks, but not for tools such as `GameSaveEditor` that read local data files at runtime.

## Coding Style & Naming Conventions
Match the style already used in the file you touch. In this repo, HTML and CSS commonly use 2-space indentation, while JavaScript files commonly use 4 spaces. Preserve existing folder and file patterns such as `utils/LightsOut/`, `assets/js/script.js`, and `assets/css/style.css`. Use descriptive IDs and function names that match the tool domain. Avoid editing vendored or minified files like `*.min.js` and `*.min.css` unless you are intentionally updating a bundled dependency.

## Testing Guidelines
There is no checked-in automated test suite or CI workflow. Test changes manually in a browser:
- verify the root landing page still loads
- verify each affected tool view works from `http://localhost:8000/`
- re-check file loading, export actions, and any remote-data paths you changed

For UI changes, test at least one desktop browser width and one narrow mobile-sized width.

## Commit & Pull Request Guidelines
Recent history uses generic messages like `update`, but new contributions should be more specific. Prefer short imperative commits such as `Add CSV validation to ExcelGrep` or `Fix theme toggle in LightsOut`. Pull requests should name the affected tool(s), summarize behavior changes, include manual test notes, and attach screenshots for visible UI updates.
