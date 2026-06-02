# Knovex — Developer Guide for Claude

## Project Overview

Knovex is an AI-powered desktop knowledge base app.
- **Backend**: Python/FastAPI (PyInstaller-bundled for production)
- **Frontend**: React/Vite/TypeScript
- **Desktop shell**: Electron + electron-builder (NSIS installer on Windows)
- **Repo**: `D:\Learning\knovex`

---

## MANDATORY Release Process

> **Quality over quantity. One working release beats ten broken ones.**
> These steps are non-negotiable and must be followed in order — every single time.
> Do NOT rush to deployment. Rushing is what caused 9 broken releases in a row.
> **Never push a git tag until every step below is complete and green.**

---

### Step 1 — Deeply understand the issue first. Don't touch code yet.

Resist the urge to fix immediately. Understand first.

- Read the full error message, stack trace, and any logs
- Find the exact file and line causing the bug
- Understand WHY it happens in production but not in dev (packaged vs dev differences — see table below)
- Trace the root cause: what assumption was wrong? what was missing?
- Ask: could the same root cause exist in other code paths? Other IPC handlers? Other providers?

---

### Step 2 — Audit the whole codebase before writing a single fix

Before fixing anything, do a full audit:

- Search the codebase for similar patterns that could have the same bug
- Read ALL entries in the **Known Issues** table below
- Check every ❌ TODO in the E2E Test Coverage list — these are unguarded failure points
- Look for anything related to the current issue that might have been missed

Then write a **process checklist** — ask yourself:
- Why wasn't this caught by existing tests?
- Was it a missing test? A wrong assumption? A type mismatch? A packaged-app-only path?
- Are there other bugs of this class still lurking?

This checklist becomes the basis for the new test cases in Step 3. It also goes into "Why Bugs Weren't Caught Early" at the bottom of this file — keep that section updated.

---

### Step 3 — Write failing test cases BEFORE touching production code

Tests prove the bug exists and prove the fix works. Write them first.

- Add failing E2E tests to `e2e/` that reproduce the exact bug
- Add unit/integration tests to `tests/` where appropriate
- Every bug in the Known Issues table with ❌ TODO must eventually get a test — if you're touching related code, add the test now
- Tests must **fail** before the fix. If they pass before the fix, the test is wrong.

---

### Step 4 — Fix the code

Now — and only now — write the fix.

- Make the minimal correct change. Don't refactor unrelated things in the same commit.
- Double-check: does the fix address the root cause, or just the symptom?
- Update the **Known Issues** table: add the root cause, fixed version, and E2E test status

---

### Step 5 — Run the full test suite. All of it. No shortcuts.

```bash
# Unit / integration tests
pytest tests/ -v

# E2E tests against the packaged app
cd e2e && npx playwright test
```

- Every test must pass — including the new ones you just wrote
- If anything fails, go back. Do not proceed with a partially-green suite.
- Do not skip slow tests. Do not comment out failing tests to make the suite green.

---

### Step 6 — Pre-release historical audit (do this before EVERY release)

Before creating any release, do one final sweep:

1. **Mine all known issues** — go through this CLAUDE.md's Known Issues table, previous session notes, and any bugs found during manual testing
2. **Check E2E coverage** — for every ❌ TODO in the Known Issues table, either add a test now or explicitly acknowledge it as deferred with a reason
3. **Check server-side issues too** — not just Electron/desktop bugs. Backend, API, provider bugs all count.
4. **Run the full suite one final time** after all new tests are added
5. Only when everything is green: bump version, write CHANGELOG, commit, tag, release

---

### Step 7 — Single clean release

- Bump version in ALL version files (see Version Files section below)
- Write a CHANGELOG entry that explains: what the bug was, what the root cause was, how it was fixed
- One commit, one tag, one GitHub release
- **Never release multiple versions in a single session.** If you find another bug after releasing, go back to Step 1.

---

**The philosophy:** A release that works is worth infinitely more than five releases that don't. Every broken release erodes trust. Slow down, do it right, ship once.

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
| 9 | "Failed to uninstall old application files.: 2" on auto-update | `oneClick: true` NSIS silently installs to `%LOCALAPPDATA%\Programs\Knovex`; if user changed dir on first install the registry uninstall path diverges → `ERROR_FILE_NOT_FOUND` (code 2) | v0.10.0 | ❌ TODO |
| 10 | "LLM returned invalid JSON: Expecting ',' delimiter" on guided/animated (any JSON format) | LLM emits an **unescaped `"` inside a string value** (quoting a term mid-sentence, e.g. the "boundary" layer) → string terminates early, `json.loads` fails. Prior `_repair_truncated_json` only fixed truncation at the END, not stray mid-string quotes | unreleased (`design/visual-redesign-lab`) | ✅ `TestUnescapedInnerQuoteRepair` (10 tests) — `_escape_inner_quotes` + chained `_parse_llm_json` |

### Open Issues

_(none)_

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
