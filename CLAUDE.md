# Knovex — Developer Guide for Claude

## Project Overview

Knovex is an AI-powered desktop knowledge base app.
- **Backend**: Python/FastAPI (PyInstaller-bundled for production)
- **Frontend**: React/Vite/TypeScript
- **Desktop shell**: Electron + electron-builder (NSIS installer on Windows)
- **Repo**: `D:\Learning\knovex`

---

## MANDATORY Release Process

> These steps are non-negotiable. Every release must follow them in order.
> **Never push a git tag until all steps pass.**

### Step 1 — Understand the issue
- Read the full error message and stack trace
- Find the exact file and line causing the bug
- Understand WHY it happens in production but not in dev (if applicable)
- Check if the same root cause could affect other code paths

### Step 2 — Audit for related issues
- Before fixing anything, search the codebase for similar patterns
- Check if the same bug class exists elsewhere (e.g. other IPC handlers, other providers)
- Read the KNOWN ISSUES section below and update it

### Step 3 — Write test cases FIRST
- Add failing test cases to the E2E suite (`e2e/`) that reproduce the bug
- Add unit tests where appropriate (`tests/`)
- Tests must fail before the fix, pass after

### Step 4 — Fix the code
- Make the minimal correct change
- Do not introduce unrelated refactors in the same commit

### Step 5 — Run the full test suite
```bash
# Unit / integration tests
pytest tests/ -v

# E2E tests against the packaged app
cd e2e && npx playwright test
```
**Do not proceed unless ALL tests pass.**

### Step 6 — Single clean release
- Bump version in ALL version files (config.py, package.json ×2, test, docs, README, CHANGELOG)
- Write a meaningful CHANGELOG entry explaining root cause and fix
- One commit, one tag, one release
- **Never release multiple versions in a single session without full test coverage**

---

## Architecture — Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Desktop IPC | `desktop/main.js` | All Electron IPC handlers, auto-updater, backend spawn |
| Desktop API | `desktop/preload.js` | `window.knovex.*` exposed to renderer |
| TS types | `frontend/src/types/electron.d.ts` | Must match preload exactly |
| Backend entry | `backend/backend_entry.py` | PyInstaller entry point |
| PyInstaller spec | `backend/knovex-backend.spec` | Bundle config — critical for packaged app |
| Runtime hook | `backend/hooks/rthook_tiktoken.py` | Pre-imports tiktoken before app code |
| Settings API | `backend/api/settings.py` | LLM model fetch, settings CRUD |
| Providers | `backend/core/providers/*.py` | One file per LLM provider |
| Config | `backend/core/config.py` | App version lives here |

---

## Version Files — ALL must be updated together

When bumping a version, update ALL of these:
1. `backend/core/config.py` — `version: str = "x.y.z"`
2. `desktop/package.json` — `"version": "x.y.z"`
3. `frontend/package.json` — `"version": "x.y.z"`
4. `tests/test_imports.py` — `assert settings.version == "x.y.z"`
5. `docs/index.html` — `FALLBACK_VERSION = "x.y.z"`
6. `README.md` — version badge
7. `CHANGELOG.md` — new entry at top

---

## Known Issues & Bugs Found in Desktop App

Track every bug found in the packaged app here. Each entry must have:
- Root cause (not just symptom)
- Which version fixed it
- Whether an E2E test covers it

### Fixed Issues

| # | Symptom | Root Cause | Fixed | E2E Test |
|---|---------|-----------|-------|----------|
| 1 | "Unknown encoding cl100k_base" on Test Connection | `tiktoken_ext` namespace pkg not bundled by PyInstaller | v0.8.9 | ❌ TODO |
| 2 | "Knovex cannot be closed" during auto-update | `knovex-backend.exe` still alive when NSIS ran | v0.9.0 | ❌ TODO |
| 3 | Auto-updater only checked once (missed updates published while app was open) | `checkForUpdates()` only called at startup, no interval | v0.9.2 | ❌ TODO |
| 4 | LLM model list used wrong provider's API key | `effective_key` in `settings.py` always used stored key regardless of provider | v0.9.1 | ❌ TODO |
| 5 | Cerebras "Model llama-3.3-70b does not exist" | Static catalogue had `llama-3.3-70b` (hyphen) not `llama3.3-70b` (dot) | v0.9.4 | ❌ TODO |
| 6 | "filePaths is not iterable" on file upload | IPC returned `string[]` but renderer accessed `.filePaths` on it | v0.9.5 | ❌ TODO |
| 7 | Groq model list outdated | Static fallback had retired models (llama3-70b-8192, mixtral-8x7b) | v0.9.1 | ❌ TODO |
| 8 | "LLM returned invalid JSON: Unterminated string" on quiz/flashcard generation | `max_tokens=2048` too low — LLM hit token limit mid-JSON string | v0.9.9 | ✅ `TestTruncatedJsonRepair` (8 tests) |

### Open Issues

| # | Symptom | Root Cause | Workaround |
|---|---------|-----------|------------|
| 1 | "Failed to uninstall old application files.: 2" | App was installed to `C:\Program Files\` (user changed dir on first install). NSIS updater looks at `%LOCALAPPDATA%\Programs\Knovex` default path — mismatch → ERROR_FILE_NOT_FOUND | Manual uninstall from Windows Settings, then fresh install |

---

## Dev vs. Packaged App Differences

These are the most common sources of bugs that only appear in the packaged app:

| Difference | Dev | Packaged |
|-----------|-----|---------|
| `window.knovex` | `undefined` — browser `<input>` fallback runs | Defined — IPC path runs |
| Python imports | Full virtualenv | Only what PyInstaller bundled |
| File paths | Relative to project root | `process.resourcesPath` + absolute paths |
| Backend | Spawned via uvicorn | PyInstaller binary (`knovex-backend.exe`) |
| tiktoken | Finds namespace packages normally | Needs `collect_submodules` + runtime hook |
| Auto-updater | Disabled (`IS_DEV = true`) | Active — downloads from GitHub Releases |
| NSIS installer | Not applicable | Runs on update, may fail if path changed |

---

## E2E Test Coverage Requirements

All of these flows **must have passing E2E tests** before any release:

- [ ] App launches, backend health check passes
- [ ] File upload via native file picker (`dialog:openFile` IPC returns `{canceled, filePaths}`)
- [ ] File upload via drag-and-drop
- [ ] Knowledge base creation and deletion
- [ ] File indexing and search
- [ ] Chat with an LLM (stub/mock is fine)
- [ ] Settings: provider switch, model dropdown populates
- [ ] Settings: API key save and mask display
- [ ] Test Connection button
- [ ] Sidebar navigation (all 5 pages)
- [ ] Reader: open file, display content
- [ ] Auto-update: banner appears when update is available
- [ ] Window state persistence (size/position saved across restarts)
- [ ] Tray icon: minimize to tray, restore, quit

---

## Why Bugs Weren't Caught Early — Lessons

1. **No E2E tests on the packaged binary.** Unit tests and localhost testing hide Electron-specific bugs because `window.knovex` is undefined in the browser.

2. **Type mismatch not caught by TypeScript.** `electron.d.ts` declared `FilePickerResult` but `main.js` (JavaScript, not TypeScript) returned a plain array. No compiler error.

3. **Rushing releases.** Multiple versions released in a single session without running any tests, each "fixing" the previous release's bug but introducing new ones.

4. **Static catalogues not validated against live APIs.** Provider model IDs were hardcoded without verifying the format the API actually accepts.

5. **NSIS behavior only observable after full build + install.** The installer path mismatch bug requires building, packaging, and installing — none of which are in the CI test suite.
