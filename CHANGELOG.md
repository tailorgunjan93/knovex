# Changelog

All notable changes to **Knovex** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

---

## [0.12.1] — 2026-06-07

Hotfix: **Learn → Animated** failed with a bare "network error".

### Fixed

- **Learn → Animated "network error" (regression in 0.12.0).** Generating an
  Animated lesson failed instantly with an unexplained "network error" toast;
  Guided and all other formats worked.
  - **Root cause:** two independent allow-lists for the learn format drifted. The
    API schema (`LearnSessionCreate.format` Literal) accepted `"animated"`, but the
    domain `VALID_FORMATS` frozenset did **not** — `"animated"` was never added when
    the format shipped. So the request passed pydantic, the `200` SSE response
    began, and then `stream_session()` (an async generator) raised `ValueError` on
    its first iteration — **outside** its own `try/except`, after the response had
    already started. Starlette aborted the connection mid-stream and the renderer's
    `fetch` surfaced the dropped body as `TypeError: network error`. The endpoint's
    pre-existing `try/except ValueError` was dead code (creating a generator never
    runs its body).
  - **Fix:** added `"animated"` to `VALID_FORMATS`, and added **eager
    format/difficulty validation in the endpoint** (before the `StreamingResponse`
    starts) so any future drift returns a clean `422` instead of dropping the
    connection mid-stream.
  - **Guard:** `tests/test_learn_api_integration.py` —
    `test_animated_format_streams_and_saves` (reproduces the exact failure) plus
    `TestFormatSourcesOfTruthAgree` (a drift guard asserting the schema Literal and
    `VALID_FORMATS` stay in lock-step, making this class of bug impossible).
    Verified end-to-end against a real HTTP SSE backend: `animated` now streams to
    a clean `done` event.

---

## [0.12.0] — 2026-06-07

Learn upgrades + a self-healing/launch-resilient app.

### Added

- **Guided → master-teacher prompt:** intuition-first, one idea building on the
  last, vivid concrete examples, names+busts the common misconception, Socratic
  check-ins.
- **Animated → real motion-graphics:** "Animated" is now its own format that emits
  a scene script (text/nodes/circles/arrows on a 0–100 stage), rendered by a new
  `ScenePlayer` (Framer Motion + SVG, autoplay + controls). No longer just guided
  on autoplay.
- **Cinematic (HD) pack:** optional, on-demand Manim renderer for true
  3Blue1Brown-style videos — installed on first use (uv env: manim + ffmpeg, no
  LaTeX), with an LLM-writes-Manim → render → error-repair pipeline. Quality is
  model-dependent (use a strong LLM).
- **App version** shown as a clickable badge at the sidebar foot.

### Fixed

- **No more "network error" on launch:** a startup gate shows "Starting Knovex…"
  and waits for the backend before rendering (cold-start requests no longer fail).

### Internal

- Generalised on-demand provisioning into a shared `EnvPackProvisionService`
  (OCR + Cinematic share one engine); PyInstaller bundles the pack sidecars.

---

## [0.11.3] — 2026-06-07

Actually fix "Failed to uninstall old application files. … : 2" — verified
against the real packaged app this time.

### Bug Fix

**Why v0.11.1/0.11.2 didn't fix it:** those were tested with a *stub* backend
(one 45 KB file) that released instantly and hid the real failure. With the real
app, the Electron shell spawns **multiple `Knovex.exe` processes** + a backend
that loads **~120 `_internal` DLLs**, and — critically — even after every process
is killed, electron-builder's uninstaller **aborts on the first transiently-busy
file** (antivirus still scanning the freshly-written DLLs / 188 MB exe) within
its ~5s retry budget → the "uninstall old files: 2" dialog.

**Fix:** `customInit` now kills the app + backend **and removes the old install
directory itself** with a retry loop (the Win32 delete that reliably succeeds in
~2s), so electron-builder's uninstaller has nothing left to choke on. Guarded by
`Knovex.exe` so it can never delete an unrelated folder.

**Verified:** built the installer with the **real backend** and reinstalled over
the **running real app** — exit 0 across 3 cycles (the same scenario reproduced
the hang/exit-2 without the fix). Guard: `tests/test_installer_nsis.py`.

---

## [0.11.2] — 2026-06-06

Self-healing backend — the app no longer gets stuck on "network error" if the
backend process dies.

### Added

- **Backend auto-restart:** if `knovex-backend.exe` exits unexpectedly (crash,
  OOM, killed), the desktop app restarts it automatically (linear backoff, capped
  at 5 restarts per 60s; a hard crash-loop surfaces a clear error instead of
  spinning forever). Suppressed during intentional shutdown (quit/update).

### Fixed

- Auto-restart could have re-broken the v0.11.1 install fix (a respawned backend
  re-locks files mid-install). The NSIS script now kills the Electron app
  (`Knovex.exe`, with its child tree) **before** the backend, so a respawn can't
  fight the installer.

---

## [0.11.1] — 2026-06-05

Fix the recurring **"Failed to uninstall old application files. … : 2"** on
install/update (Known Issue #9 / #2 — present since early versions).

### Bug Fix

**Root cause:** Knovex runs a separate backend process, `knovex-backend.exe`
(PyInstaller). electron-builder/NSIS closes the Electron app but has no knowledge
of this child process, so during an update it keeps running and holds open file
handles inside the install directory. Windows can't delete a running executable,
the old version's uninstaller aborts with "File is busy" and exits with code 2,
and electron-builder surfaces it as "Failed to uninstall old application files…: 2".
The v0.10.0 `oneClick:false` change never addressed this — the lock was the real
cause.

**Fix:** A custom NSIS script (`desktop/build/installer.nsh`, wired via
`nsis.include`) force-kills `knovex-backend.exe` in `customInit` (runs before the
old-version uninstall) and in `customUnInstall`. The backend is never
auto-respawned, so the handles release and the uninstaller deletes cleanly.

**Verified:** built the real installer and ran install-over-existing with
`knovex-backend.exe` running — exit 0 across repeated cycles; the same scenario
without the script reproduces exit 2. Guarded by `tests/test_installer_nsis.py`
(ties the killed image name to the name the desktop app actually spawns).

---

## [0.11.0] — 2026-06-05

The visual redesign release — plus a real OCR pipeline, multi-provider LLM,
multi-engine search, and a much sturdier reader. Motto holds: **Secure · Fast ·
Reliable · Cost-Effective.**

### Added

- **Full visual redesign** across every screen (Library, Reader, Learn, Chat,
  Progress, Settings) to the locked amber/copper "design lab" identity — three
  themes (Dark · Charcoal · Parchment), unified headers, input bars, and rails.
- **Learn** Stage B.2: lesson outline + connected-concepts rails with
  click-to-navigate, format tabs, and a Wikipedia source pill.
- **Multi-provider LLM** settings — per-provider API keys, activate, live model
  dropdowns, and per-card Test Connection.
- **Multi-engine web search** — DuckDuckGo, Wikipedia, Serper, Brave with result
  blending (RRF-style interleave) and a Wikipedia adapter.
- **Reader**: persisted highlights, a page-scoped "Ask about this page"
  assistant, and image-dominant PDF pages rendered as a composited pixmap (no
  more black dot-grid boxes).
- **OCR / advanced ingestion via docnest** (`docnest-ai >= 0.7.0`): scanned and
  image-only PDFs — including **Devanagari/Hindi** (EasyOCR) — are read via a
  content-routed pipeline (text PDFs stay on the fast path; only image/scanned
  pages pay OCR). Provisioned **on demand** into app-data with `uv` (out-of-process
  sidecar) since docnest/torch is too large to bundle. Settings → App → "OCR pack"
  card installs/manages it.

### Fixed

- Recurring "LLM returned invalid JSON" on guided/animated generation — robust
  repair via the `json_repair` library behind an anti-corruption adapter.
- PDF ingestion indexed display HTML (71 KB base64 image blobs) instead of plain
  text, polluting FTS + embeddings; now indexes plain text only.
- Reader upload no longer times out at 2 minutes during slow OCR ingestion —
  polling waits while the backend reports progress.

---

## [0.10.0] — 2026-05-29

Fix "Failed to uninstall old application files.: 2" on Windows auto-update

### Bug Fix

**Root cause:** `oneClick: true` in the NSIS config silently installs Knovex to
`%LOCALAPPDATA%\Programs\Knovex` without showing a directory picker. If the user
chose a different install path on first install (e.g. `C:\Program Files\Knovex`),
the Windows registry uninstall key pointed to the custom path, but the NSIS updater
assumed the default path → `ERROR_FILE_NOT_FOUND` (error code 2) on every update.

**Fix:** Set `oneClick: false` + `allowToChangeInstallationDirectory: true` in
`desktop/package.json`. The installer now shows a directory picker on every
install/update, reads the existing install location from the registry, and
pre-fills the correct path — so the uninstaller always knows where to look.

**Note:** Users currently affected by the mismatched install path still need to
manually uninstall via Windows Settings and do a fresh install of v0.10.0 once.
All subsequent updates will work correctly after that.

---

## [0.9.9] — 2026-05-29

Fix quiz/flashcard generation crashing with "LLM returned invalid JSON: Unterminated string"

### Bug Fix

**Root cause:** `max_tokens=2048` was too low for quiz and flashcard generation. The LLM
would hit the token limit mid-string, producing unterminated JSON that `json.loads` could
not parse — causing the entire Learn session to fail with an error event.

**Fix — two layers:**
1. **Raised token budgets** in `learn_service.py`:
   - `quiz`: 2048 → 3000
   - `flashcard`: 2048 → 2500
   - `guided`: unchanged at 4096
   This prevents truncation for all normal-length topics.
2. **Added `_repair_truncated_json()`** — if a response is still truncated (very long topic,
   small model, provider-imposed output limit), the function uses a bracket stack to close
   any open string, arrays, and objects in the correct reverse order so the partial JSON
   can still be parsed. A warning is logged when repair triggers.

### Tests

- Added `TestTruncatedJsonRepair` class (8 tests) to `tests/test_learn.py`:
  - Unit tests for `_repair_truncated_json()` directly (5 cases including the exact
    payload from the filed bug report)
  - Integration tests: `LearnService.stream_session()` recovers from truncated quiz
    and flashcard responses (yields `done` event, not `error`)
  - Regression: completely unparseable JSON still yields an `error` event (not a crash)

### Deep QA Test Suite (from v0.9.8 commit)

4 new professional-grade browser E2E spec files covering every real user workflow:
- `e2e/kb-workflow.spec.ts` (24 tests) — KB create/rename/delete, file upload, FileViewer
- `e2e/chat-workflow.spec.ts` (14 tests) — session CRUD, web search, streaming, errors
- `e2e/settings.spec.ts` (55 tests) — all 4 tabs, provider/model switch, API key, theme
- `e2e/learn-workflow.spec.ts` (27 tests) — all 6 formats, structured output, history

**Total test count: 216 Python + 202 browser + 55 Electron = 473 tests**

---

## [0.9.8] — 2026-05-29

Full E2E coverage for KB, Chat, and Reader — the three zero-coverage core workflows

### Tests

**Browser E2E (mocked API):**
- `e2e/kb.spec.ts` (25 tests) — Library page: empty state, create dialog (name validation,
  colour & icon presets, live preview, Enter to submit), filter pills (All/Mastered/Review/New),
  KB card rendering, error state on 500
- `e2e/chat.spec.ts` (14 tests) — Chat page: session list, clicking session loads messages,
  markdown rendering, source citations, KB selector, no-sessions empty state
- `e2e/reader.spec.ts` (16 tests) — Reader page: upload zone, KB accordion, file list,
  clicking file opens viewer, content block rendering, URL deep-link (?kb=&file=)

**Electron E2E (real backend — live SQLite DB):**
- `e2e/electron/kb.spec.ts` (13 tests) — KB CRUD: GET returns array, POST 201 + shape check,
  created KB visible in list, 422 on missing name, file_count=0 on fresh KB, POST file adds
  record, file has correct shape, non-existent path returns 4xx, DELETE 204 + removed from
  list, GET 404 after delete, PUT updates name
- `e2e/electron/chat.spec.ts` (9 tests) — Chat CRUD: GET sessions, POST 201 + shape,
  session in list, kb_id=null preserved, empty messages on new session, DELETE 204 + removed,
  messages 404 after delete, stream without LLM key returns error event (not crash), export
  returns markdown

### Result: 55 Electron + 98 browser + 208 Python = **361 tests passing**

---

## [0.9.7] — 2026-05-29

Electron E2E suite: all 33 tests passing + unknown-route white screen fixed

### Fixed

- **`frontend/src/App.tsx`** — added `<Route path="*" element={<Navigate to="/kb" replace />} />`
  catch-all inside the `AppShell` wrapper.  Without it, any unrecognised hash route
  (`#/does-not-exist`, typos in deep links, stale bookmarks) rendered the dark AppShell
  background with no content — a completely black screen.  Now redirects to Library.

- **`desktop/main.js`** — suppressed `openDevTools()` when `KNOVEX_TESTING=1`.
  In `--dev` mode the DevTools panel opens automatically; when Playwright launches
  Electron with this flag it interfered with page evaluation (preload context appeared
  undefined to the test runner).

### Tests

- **`e2e/electron/fixtures.ts`** — fixed three issues that prevented Electron tests
  from running:
  1. Import changed from `'playwright'` (not installed) to `'@playwright/test'`
  2. Added `executablePath` resolved from `desktop/node_modules/electron` (cross-platform)
  3. Fixture now navigates to `http://localhost:5173` and waits for `window.knovex` to
     be defined before yielding `page` to tests — eliminated race between `domcontentloaded`
     and preload `contextBridge.exposeInMainWorld`

- **`playwright.config.electron.ts`** — added `webServer` block to auto-start the Vite
  dev server (`npm run dev` in `./frontend`) before tests; `reuseExistingServer: true`
  avoids double-starts when Vite is already running.

- **`e2e/electron/startup.spec.ts`** — fixed "Electron window opens" test to use the
  `page` fixture (which awaits `firstWindow()`) instead of calling `windows()` synchronously
  at launch time before the backend had started.

- **`package.json`** (root) — added `test:e2e:electron` script for the Electron suite.

### Result: 33/33 Electron E2E + 208 Python + 61 browser = **302 tests passing**

---

## [0.9.6] — 2026-05-29

Quality release: process overhaul, all tests green, NSIS installer fixed

### Fixed

- **`desktop/package.json`** — changed NSIS `oneClick: false` → `oneClick: true`.
  `oneClick: false` ran the old version's uninstaller via `ExecWait ... /S _?=$INSTDIR`
  which returned exit code 2, triggering "Failed to uninstall old application files."
  on every auto-update.  `oneClick: true` uses an overwrite-style install that skips
  the old-uninstaller step entirely — same approach used by Chrome, Slack, VS Code.
  Also removed `allowToChangeInstallationDirectory` and `allowElevation` (not applicable
  with oneClick mode).

- **`backend/models/schemas.py`** — added `Literal` types for `LearnSessionCreate.format`
  and `LearnSessionCreate.difficulty`.  Plain `str` let invalid values (e.g. `"nonsense"`,
  `"ultra-hard"`) pass Pydantic validation and reach the service where they raised
  `ValueError` → 500.  Now FastAPI returns 422 at the schema level.

- **`backend/core/learn_service.py`** — `review_flashcard` now raises `ValueError` for
  unknown `ease_rating` values instead of silently falling back to a 3-day interval.
  The route's existing `except ValueError → 400` handler now fires correctly.

- **`e2e/progress.spec.ts` and `e2e/learn.spec.ts`** — fixed all `page.goto('/route')`
  calls to `page.goto('/#/route')`.  The app uses `HashRouter` so all routes are hash-
  prefixed; the wrong URLs silently redirected to the Library page, causing every
  progress/learn E2E test to fail since the project began.

- **`playwright.config.ts`** — added `testIgnore: '**/electron/**'` to exclude the new
  Electron-specific tests from the browser test run.

### Added

- **`CLAUDE.md`** — project-level developer guide documenting the mandatory release
  process (understand → audit → test first → fix → run full suite → one release).
  Also lists all known issues, architecture, and why bugs weren't caught early.

- **`playwright.config.electron.ts`** + **`e2e/electron/`** — new Electron-specific
  E2E test suite covering the bugs that only appear in the packaged app:
  - `ipc.spec.ts`: Verifies `dialog:openFile` returns `{canceled, filePaths}` (not raw
    array), and all `window.knovex.*` API surface is correct
  - `startup.spec.ts`: App launch, backend health, settings API, provider model fetch,
    Cerebras model ID format, provider key isolation
  - `navigation.spec.ts`: All 6 pages load without crashing via hash routes
  - `settings.spec.ts`: Provider model catalogues, retired model ID regression,
    provider key isolation

---

## [0.9.5] — 2026-05-29

Fix — "filePaths is not iterable" crash when adding files in packaged app

### Fixed

- **`desktop/main.js`** — `dialog:openFile` IPC handler was returning a raw `string[]`
  (`result.filePaths`) instead of the full `{ canceled, filePaths }` object.
  The renderer code in `KBDetail.tsx` and `UpdatePathDialog.tsx` correctly accesses
  `result.filePaths` matching the `FilePickerResult` type in `electron.d.ts`, but
  `"string[]".filePaths` is `undefined` — not iterable — causing the crash.
  In dev mode `window.knovex` is undefined so the browser `<input>` fallback runs
  instead, hiding the bug entirely.
  Fix: return `{ canceled: result.canceled, filePaths: result.filePaths }`.

---

## [0.9.4] — 2026-05-29

Hotfix — Cerebras model IDs wrong format causing NotFoundError

### Fixed

- **`backend/core/providers/cerebras.py`** — static fallback catalogue had wrong model
  ID format: `llama-3.3-70b` (hyphen before version) instead of `llama3.3-70b`
  (dot notation, no hyphen).  The Cerebras API only accepts the dot form.
  When the live fetch was unavailable the auto-fix effect in the Settings page
  would pick the first static model, save the wrong ID, and every subsequent
  completion call would fail with:
  `CerebrasException - Model llama-3.3-70b does not exist or you do not have access to it`
  Fixed IDs: `cerebras/llama3.3-70b`, `cerebras/llama3.1-8b` (unchanged: `qwen-3-32b`,
  `deepseek-r1-distill-llama-70b`).

---

## [0.9.3] — 2026-05-29

Fix — auto-update "Failed to uninstall old application files" error

### Fixed

- **`desktop/package.json`** — NSIS `allowToChangeInstallationDirectory` changed from
  `true` → `false`, and `allowElevation` changed from `true` → `false`:
  - When `allowToChangeInstallationDirectory: true`, a user who moved the install path
    from the default (`%LOCALAPPDATA%\Programs\Knovex`) to a custom location (e.g.
    `C:\Program Files\Knovex`) would break all future auto-updates.  The NSIS installer
    always looks for the old app at the **default** path; if the app is somewhere else it
    fails with *"Failed to uninstall old application files.: 2"*
    (Windows `ERROR_FILE_NOT_FOUND`).
  - Fix: lock every install to `%LOCALAPPDATA%\Programs\Knovex` (the `perMachine: false`
    default).  This makes the install path 100% predictable so auto-update always finds
    the previous version to replace.
  - `allowElevation: false` is also set — elevation is not needed for a per-user install
    and was the reason auto-update ran the installer without UAC when the app was in
    `C:\Program Files\`, silently failing.

> **One-time migration:** Users who installed to a custom path must uninstall the old
> copy via *Windows Settings → Apps* and then re-run the latest installer.  All future
> updates will be seamless from that point on.

---

## [0.9.2] — 2026-05-29

Fix — auto-updater now checks for updates every 4 hours, not just at startup

### Fixed

- **`desktop/main.js`** — added `setInterval(checkNow, 4h)` alongside the existing
  8-second startup check.  Previously the app only checked once at launch; if a new
  release was published while the app was already running, users would never see the
  "Restart to update" banner until they manually restarted — which could be days later.
  Now the check repeats every 4 hours, matching the cadence used by Chrome / Slack / VS Code.

---

## [0.9.1] — 2026-05-29

Fix — live model fetching from provider APIs; stale model list bug

### Fixed

- **`backend/api/settings.py`** — root cause fix: `GET /api/settings/llm/models` was
  using the **stored provider's key** (e.g. an OpenAI key) even when querying a
  **different provider** (e.g. Cerebras). This caused every live-fetch to return a 401
  → `fetch_live_models` returned `None` → silent fallback to the stale static catalogue.
  Fix: only reuse the stored key when `current.llm.provider == requested provider`.

- **`backend/core/providers/openai.py`** — added `fetch_live_models`:
  calls `https://api.openai.com/v1/models`, filters to chat-completion-capable models
  (gpt-*, o1/o3/o4, chatgpt-*; excludes embeddings, whisper, TTS, DALL-E).

- **`backend/core/providers/anthropic.py`** — added `fetch_live_models`:
  calls `https://api.anthropic.com/v1/models` with `x-api-key` + `anthropic-version`
  headers; uses `display_name` for human-readable labels.

- **`backend/core/providers/cerebras.py`** — updated static fallback catalogue with
  current Cerebras models: Qwen 3 32B, DeepSeek R1 70B.

- **`backend/core/providers/groq.py`** — refreshed stale static fallback catalogue:
  replaced retired `llama3-70b-8192` / `mixtral-8x7b-32768` / `gemma-7b-it` with
  current Groq models (Llama 3.3 70B, Llama 3.1 8B/70B, Gemma 2 9B, DeepSeek R1 70B).

- **`frontend/src/pages/Settings/LLMSettings.tsx`** — clear the API key field when
  the provider changes so a stale key from one provider is never passed to another.

---

## [0.9.0] — 2026-05-29

Fix — auto-update now installs silently with no installer UI

### Fixed

- **`desktop/main.js`** — seamless silent auto-update on Windows:
  - Previously `autoUpdater.quitAndInstall(false, true)` launched the NSIS installer in
    interactive mode, showing a progress bar and a recurring *"Knovex cannot be closed —
    please close it manually and click Retry"* dialog.
  - Root cause: `knovex-backend.exe` (a child process of the Electron app) was not killed
    before the installer ran.  NSIS found it alive and could not proceed without user
    intervention.
  - Fix 1 — new `killBackendAndWait()` helper explicitly kills `backendProcess` and awaits
    the `'exit'` event (with a 3 s safety-net timeout) **before** calling `quitAndInstall`.
    This guarantees the OS has released all file handles so NSIS never needs to ask the user
    to close anything.
  - Fix 2 — changed to `quitAndInstall(true, true)`:
    - `isSilent = true` → NSIS runs with the `/S` flag — **zero installer UI**, no dialogs,
      no progress bar.
    - `forceRunAfter = true` → the new version launches automatically after installation.
  - Net result: user clicks *"Restart to update"* → app closes → new version installs
    invisibly → new version opens.  Exactly like Chrome / Slack / Discord.

---

## [0.8.9] — 2026-05-29

Fix — tiktoken `cl100k_base` encoding unavailable in packaged binary

### Fixed

- **`backend/knovex-backend.spec`** — added `collect_submodules("tiktoken_ext")` and explicit
  `hiddenimports` for `tiktoken_ext` + `tiktoken_ext.openai_public`:
  - tiktoken discovers encoding modules (cl100k\_base, p50k\_base, r50k\_base, …) by calling
    `pkgutil.iter_modules(tiktoken_ext.__path__)` at runtime.
  - `tiktoken_ext` is a **namespace package** — PyInstaller does not bundle its submodules
    unless explicitly told.  Without them the frozen binary raises:
    `Unknown encoding cl100k_base. Plugins found: [] tiktoken version: 0.13.0`
    on every "Test connection" / chat / token-counting call.
  - Fix: `collect_submodules("tiktoken_ext")` ensures PyInstaller bundles the submodule and
    its frozen importer exposes it to `pkgutil.iter_modules`.

- **`backend/hooks/rthook_tiktoken.py`** — new runtime hook:
  - Pre-imports `tiktoken_ext.openai_public` before any application code runs, as a
    belt-and-suspenders guarantee that the encoding constructors are in `sys.modules`
    even if `pkgutil.iter_modules` behaves differently in the frozen environment.

---

## [0.8.8] — 2026-05-29

Fix — LiteLLM data files missing from bundle; stale model catalogues; blank model dropdown; correct Vite base path

### Fixed

- **`backend/knovex-backend.spec`** — added `collect_data_files("litellm")` to the `datas` list:
  - LiteLLM reads `model_prices_and_context_window_backup.json` and related JSON files at runtime.
    PyInstaller does not include them automatically.  Result: every LLM call (chat, learn, summarize,
    test connection) raised `FileNotFoundError` inside the packaged binary.
  - `collect_data_files("litellm", include_py_files=False)` collects all JSON/data files from the
    litellm package and places them under `_internal/litellm/` in the bundle — exactly where litellm
    expects them via `os.path.dirname(__file__)`.

- **`frontend/vite.config.ts`** — moved `base: './'` from `build:{}` to the **top level** of `defineConfig`:
  - `base` is a shared Vite option; placing it inside `build:{}` is silently ignored.  The default
    `base: '/'` produced absolute `/assets/…` paths that resolve to the filesystem root under
    Electron's `file://` protocol, so the JS bundle was never found and React never mounted.
  - With `base: './'` at top level, Vite emits `./assets/…` (relative), which loads correctly
    from any directory on disk.

- **`frontend/src/pages/Settings/LLMSettings.tsx`** — auto-fix blank model dropdown:
  - When a saved model ID is no longer in the provider's catalogue (removed or renamed), the MUI
    `Select` showed a blank field with no feedback.  Added a `useEffect` that detects this on
    initial model-list load and silently selects the first available model.

### Changed

- **`backend/core/providers/openai.py`** — updated model catalogue: added GPT-4.1 / 4.1 Mini /
  4.1 Nano (1 M context), o1, o1-mini, o3, o3-mini, o4-mini; removed deprecated gpt-4-turbo.
- **`backend/core/providers/anthropic.py`** — updated model catalogue: added Claude Opus 4.5,
  Claude Sonnet 4.5, Claude 3.7 Sonnet, Claude 3.5 Haiku; retained Claude 3 Haiku as legacy.
- **`backend/core/providers/gemini.py`** — updated model catalogue: added Gemini 2.5 Pro / Flash /
  Flash Lite, Gemini 2.0 Flash / Flash Lite; retained Gemini 1.5 family for compatibility.
- Version bumped to `0.8.8` across `backend/core/config.py`, `frontend/package.json`,
  `desktop/package.json`, and `tests/test_imports.py`.

---

## [0.8.7] — 2026-05-29

Fix — blank window in packaged app; all API calls silently failing via CORS

### Fixed

- **`frontend/src/App.tsx`** — replaced `BrowserRouter` with `HashRouter`:
  - Under `file://` protocol, `BrowserRouter` reads `window.location.pathname` as the
    full filesystem path (e.g. `C:/Users/…/index.html`). No route matches; React renders
    nothing; without an error boundary, the component tree unmounts silently → black window.
  - `HashRouter` uses the URL hash (`#/kb`, `#/settings`) which is immune to the
    `file://` path prefix. Routes resolve correctly in both dev (Vite) and packaged app.

- **`frontend/src/components/ErrorBoundary.tsx`** — new `RootErrorBoundary` component:
  - React 18: an uncaught render error causes the entire tree to unmount with no visible
    output. Added a root-level class component error boundary that catches any render
    crash and renders a styled error screen (message, stack trace, Reload button)
    instead of going silently blank. Styled with Knovex dark theme using only inline CSS
    so it works even if MUI fails to load.

- **`frontend/src/main.tsx`** — defensive `#root` null-check before `ReactDOM.createRoot`:
  - If the DOM element is missing (e.g. corrupted build), renders a plain HTML error
    message rather than throwing uncaught `TypeError: Cannot read properties of null`.
  - Wraps the React tree in `<RootErrorBoundary>` so any startup crash is surfaced.

- **`desktop/main.js`** — added DevTools toggle shortcut (Ctrl+Shift+I / F12):
  - Production builds previously had no way to inspect console errors. The shortcut opens
    DevTools in detached mode so the app window stays intact while debugging.

- **`backend/main.py`** — added `"null"` to CORS `allow_origins`:
  - The Electron packaged app loads `index.html` via `file://` protocol. Chromium sends
    `Origin: null` for cross-origin requests from a `file://` page.
  - Without `"null"` in `allow_origins`, FastAPI's `CORSMiddleware` drops the
    `Access-Control-Allow-Origin` header from every response; Electron's Chromium blocks
    all API responses → settings, KB list, chat — everything silently fails.

- **`backend/core/settings_service.py`** — added `"enabled": False` to default embedding dict:
  - The `EmbeddingSettings` Pydantic model has `enabled: bool = False`. The
    `_default_settings()` factory was missing this key; `_merge_defaults()` filled it
    via `setdefault`, but explicit is safer and avoids any future schema divergence.

### Changed

- Version bumped to `0.8.7` across `backend/core/config.py`, `frontend/package.json`,
  `desktop/package.json`, and `tests/test_imports.py`.

---

## [0.8.6] — 2026-05-29

Fix — blank white/black window; frontend never rendered in installed app

### Fixed

- **`frontend/vite.config.ts`** — added `base: './'` to the build config:
  - Without this, Vite generates `<script src="/assets/index-HASH.js">` (absolute path).
    Electron loads the app via `file://` protocol; `/assets/...` resolves to the root of
    the C: drive, so the JS bundle is never found, React never mounts, and the window
    stays solid black (only `backgroundColor: '#0B0B0C'` visible)
  - With `base: './'`, all asset references become relative (`./assets/...`), which
    resolves correctly relative to `index.html` under any `file://` path
- **`desktop/package.json`** — moved frontend dist from `files` (packed into ASAR) to
  `extraResources` (copied to disk at `resources/frontend/dist/`):
  - Files inside the ASAR at a `../frontend/dist/` path are never reached by
    `loadFile(path.join(__dirname, '..', ...))` because Node.js normalises the path
    outside the `.asar` directory, bypassing the ASAR virtual filesystem
  - `extraResources` puts the dist folder on real disk at `resources/frontend/dist/`
    which is exactly what `process.resourcesPath + '/frontend/dist/index.html'` points to
- **`desktop/main.js`** — `loadFile` now uses `process.resourcesPath` explicitly:
  ```js
  mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'dist', 'index.html'))
  ```
  `process.resourcesPath` is the guaranteed real-disk path to the `resources/` directory,
  consistent with how the backend binary path is resolved

---

## [0.8.5] — 2026-05-29

Fix — health check timeout too short; app never opened despite backend being ready

### Fixed

- **`desktop/main.js` — `waitForBackend()`**
  - Per-request timeout raised `400 ms → 3 000 ms`: the backend was receiving every
    health check and responding 200 OK (confirmed in backend.log — 41 consecutive
    `"GET /api/health" 200 OK` entries) but Electron destroyed the socket at 400 ms
    before the response arrived, treated every attempt as a failure, and showed the
    "Backend did not start after 40 attempts" error dialog
  - Retry count raised `40 → 60` (30 s total window) for extra headroom on slow machines
  - Health-check URL changed from `http://localhost:PORT` to `http://127.0.0.1:PORT`
    to bypass any `localhost → ::1` IPv6 resolution that could silently misroute the
    request on Windows machines where IPv6 loopback is preferred
- **`frontend/src/api/client.ts`** — `API_BASE` likewise uses `127.0.0.1` (not
  `localhost`) when reading the port from `window.knovex.backendPort`

---

## [0.8.4] — 2026-05-29

Fix — dynamic port selection; app survives port 8765 already in use

### Changed

- **`desktop/main.js`** — replaced `clearBackendPort()` (process-killing approach, fragile)
  with `findFreePort()` (pure Node.js `net` probe, always reliable):
  - Tries port 8765 first by briefly binding to it; if free, uses it
  - If 8765 is occupied by *anything* (dev server, another app, leftover process),
    immediately falls back to an OS-assigned free port — no killing, no race conditions
  - Dynamic port is stored in `let BACKEND_PORT` and passed to the backend via
    `KNOVEX_BACKEND_PORT` env var (read by pydantic-settings with `KNOVEX_` prefix)
  - Adds `ipcMain.on('app:backendPort', ...)` synchronous IPC handler so the renderer
    always knows the actual port before any API call is made
- **`desktop/preload.js`** — exposes `window.knovex.backendPort` (number, synchronous)
  resolved via `ipcRenderer.sendSync('app:backendPort')` in preload — available
  immediately, before any renderer JS runs
- **`frontend/src/api/client.ts`** — `API_BASE` now reads `window.knovex?.backendPort`
  first; falls back to `VITE_API_BASE` env var or `http://localhost:8765` for the
  dev server where the Electron bridge is absent
- **`frontend/src/types/electron.d.ts`** — added `backendPort: number` to `KnovexAPI`

---

## [0.8.3] — 2026-05-29

Hotfix — enable auto-updater by publishing `latest.yml` to GitHub Releases

### Fixed

- **`.github/workflows/package.yml`** — switched electron-builder from `--publish never`
  to `--publish always` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
  - electron-builder now uploads both the installer **and** the platform metadata file
    (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`) directly to the GitHub Release
  - `electron-updater` in the installed app checks for `latest.yml` on startup;
    without it the auto-updater silently did nothing — the banner/restart flow in
    `AppShell.tsx` was already complete but had no update signal to act on
  - Removed the now-redundant manual `release` job (electron-builder handles the upload)
  - Added `permissions: contents: write` to the `build` job
  - `Upload installer artifact` step also captures `latest*.yml` for direct download
    from the Actions run

---

## [0.8.2] — 2026-05-29

Hotfix — port conflict with uvicorn `--reload` parent process

### Fixed

- **`desktop/main.js` — `clearBackendPort()` rewritten** to handle the case where a
  `uvicorn --reload` dev server is running:
  - Previously only the *worker* process (the one listening on port 8765) was killed;
    the invisible *reloader parent* immediately spawned a replacement worker, creating a
    race condition that let the port stay occupied
  - Now resolves the worker's parent PID via `wmic` (Windows) before killing, then kills
    the parent with `/F /T` (force + full process tree) so no respawn can occur
  - Retries up to 4 times with a 400 ms gap in case the OS needs extra time to release
    the socket
  - macOS/Linux path likewise retries up to 4 times (`lsof -ti` returns all PIDs in the
    process group, so one pass is usually enough)

---

## [0.8.1] — 2026-05-29

Hotfix — port conflict on app launch

### Fixed

- **`desktop/main.js`** — added `clearBackendPort()` called at the start of `spawnBackend()`
  - On Windows: uses `netstat -ano` to find any PID listening on port 8765, then kills it with `taskkill /PID … /F`
  - On macOS/Linux: uses `lsof -ti :8765` and `kill -9` for the same effect
  - Prevents `[Errno 10048]` (Windows) / `[Errno 98]` (Linux) "address already in use" errors when the
    previous backend process was not cleaned up (e.g. dev uvicorn left running after manual testing)
  - Errors in the cleanup step are caught and logged as warnings so a stale-port failure never blocks launch

### Changed

- Version bumped to `0.8.1` in `backend/core/config.py`, `frontend/package.json`, `desktop/package.json`

---

## [0.8.0] — 2026-05-28

Sprint 8 — Progress Page · GuidedViewer · KB Browser Upload · E2E Test Suite

### Added

#### Frontend — Progress Page (new)
- **`frontend/src/pages/Progress/`** — fully standalone analytics dashboard
  - **4 stat cards**: Streak (days, "🔥" trend, "start today" fallback), XP (level badge, comma-formatted large values),
    Sessions (ready-only count, "N more/fewer than last week" week-over-week trend), Active Days (distinct session days)
  - **Daily activity heatmap** (SVG, 26 weeks × 7 days) — colour-coded intensity cells;
    "N active day(s)" summary; sessions outside the 26-week window excluded
  - **Learning velocity chart** — dual-axis Recharts `ComposedChart` (sessions/wk bars + active days/wk line)
  - **Date-range selector** ("Last 6 months" default) and Export button in page header
  - Eyebrow label `PROGRESS · LAST 6 MONTHS` for at-a-glance context
  - All data sourced from `/api/learn/sessions` + `/api/learn/stats` — zero hardcoded values
  - Graceful zero-state: all cards and charts render correctly when API returns empty data

#### Frontend — GuidedViewer (new)
- **`frontend/src/pages/Learn/GuidedViewer.tsx`** — step-by-step guided learning viewer
  - Renders multi-step guided sessions with step title, body text, and step counter (`Step N of M`)
  - "Got it →" button advances through steps; progress preserved in session state
  - Loaded from session history in the Learn Mode sidebar alongside all other formats

#### Backend — KB browser upload endpoint (new)
- **`POST /api/v1/kb/{kb_id}/upload`** — multipart/form-data file upload
  - Accepts `UploadFile` field; saves to `data_dir/kb_uploads/{kb_id}/{uuid}/{filename}`
  - Calls `svc.add_file(kb_id, FileAddRequest(file_path=...))` for standard ingestion pipeline
  - Supports `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.udf` uploads from the browser

#### Frontend — KB browser file picker
- **`KBDetail.tsx`** — replaced `window.prompt()`-based path entry with a hidden
  `<input type="file" multiple accept="...">` element triggered via `fileInputRef.current.click()`
- Added `uploadFileMutation` (TanStack Query) — `kbApi.uploadFile(kbId, file)` — multipart POST
- `kbApi.uploadFile(kbId, file)` added to `frontend/src/api/kb.api.ts`

#### Quality — E2E test suite (new)
- **`e2e/learn.spec.ts`** — 27 Playwright tests for Learn Mode
  - Visual & Layout: 13 tests (format card grid, difficulty pills, source mode pills, sidebar, stats bar, streak badge)
  - Functional Flows: 14 tests (format selection, SSE streaming progress, streamed text content, XP alert,
    session history, GuidedViewer step navigation, delete session, source mode switching, new session reset)
- **`e2e/progress.spec.ts`** — 34 Playwright tests for Progress Page
  - Visual & Layout: 12 tests (heading, stat cards, heatmap SVG, velocity chart, export button, date range, eyebrow label, active days badge)
  - Data Accuracy: 22 tests (streak singular/plural, trend text, XP formatting, sessions week-over-week, active days
    distinct-date counting, 26-week exclusion, heatmap cell counts, zero-state)
- **`playwright.config.ts`** — Playwright configuration
  - `navigationTimeout: 60_000` (generous for cold Vite dev-server under 9 parallel workers)
  - `actionTimeout: 10_000`; `reuseExistingServer: true` (dev); `fullyParallel: true`

### Changed
- **`frontend/src/pages/Learn/index.tsx`** — added `data-testid="format-card-{id}"` to each
  `FormatCard` Box element (quiz, flashcard, mindmap, story, timeline, eli5, speedlearn, brainstorm, guided)
  to provide unambiguous locators for Playwright tests
- `desktop/package.json` — version `0.8.0`
- `frontend/package.json` — version `0.8.0`
- `backend/core/config.py` — `version = "0.8.0"`

---

## [0.7.3] — 2026-05-25

### Fixed

- **Backend binary fails to start — `Could not import module "backend.main"`** (critical) —
  `backend_entry.py` was passing the string `"backend.main:app"` to `uvicorn.run()`.
  PyInstaller's static analyser follows Python `import` statements to discover which modules
  to freeze into the PYZ archive; a bare string argument is **opaque** to the analyser, so
  `backend.main` and all of its transitive dependencies were entirely absent from the frozen
  binary.  At runtime uvicorn called `importlib.import_module("backend.main")`, found nothing
  in the archive, and aborted with the error above.
  Fixed by importing `app` directly in `backend_entry.py`
  (`from backend.main import app`) and passing the live ASGI callable to uvicorn instead of
  the string — uvicorn never needs to do a string-based import at runtime.
  Also added `backend.main`, `backend.core.config`, `backend.core.dependencies`, and
  `backend.storage.database` to `hiddenimports` in `knovex-backend.spec` as a belt-and-
  suspenders safety net.

---

## [0.7.2] — 2026-05-25

### Fixed

- **macOS CI verification script crash** — `shopt -s globstar` is only available in
  bash 4+; macOS runners ship bash 3.2. The `Verify installer artifact exists` step now
  uses `find` instead of bash glob expansion, making it portable across all platforms.

---

## [0.7.1] — 2026-05-25

### Fixed

- **Backend binary missing from installer (root cause fix)** — `docnest-ai>=0.6.0` was listed
  in `requirements.txt`, which transitively depends on `docling>=2.0`. `docling` pulls in
  `torch`, `transformers`, `onnxruntime`, and other large ML packages (several GB combined),
  causing the CI `pip install` step to time out before PyInstaller ever ran. When PyInstaller
  does not run, `backend/dist/knovex-backend/` is never produced, `extraResources` has nothing
  to copy, and the installer ships without any backend binary.
  Removed `docnest-ai` from `requirements.txt` — it is imported lazily and both call sites
  (`UDFParser.parse()` for `.udf` files and the `/health` version string) have graceful
  fallbacks. All other formats (PDF, DOCX, TXT, MD, CSV) are unaffected.
- **CI binary verification step** — `package.yml` now runs `Verify backend binary exists`
  immediately after PyInstaller, explicitly failing the build if the binary is absent.
  Also added `Verify installer artifact exists` before the upload step, and changed
  `if-no-files-found` from `warn` to `error` so missing installers fail CI loudly
  instead of silently producing a broken release.

---

## [0.7.0] — 2026-05-25

### Changed

- **App icon redesign** — replaced the plain purple square with a new copper-gradient K icon
  that matches the download page brand aesthetic: warm near-black rounded-square background
  (`#0C0B0E`) with a copper gradient letterform (top `#E4AE58` to bottom `#986428`).
  Applies to both the installer / dock icon (512x512) and the system tray icon (32x32).
- **Icon generation script** (`scripts/gen_icon.py`) — pure Python stdlib generator
  (no Pillow required) using raw PNG chunk encoding and distance-to-segment math for
  anti-aliased K letterform rendering.

---

## [0.6.9] — 2026-05-25

### Fixed

- **Backend binary missing from installer (ENOENT on launch)** — `onnxruntime` (100+ MB),
  `tokenizers`, and `numpy` were listed in `requirements.txt`, causing the PyInstaller
  CI build step to time out or fail. When PyInstaller fails, `backend/dist/knovex-backend/`
  is never produced, so `extraResources` copies nothing and the installer ships with no
  backend binary at all. Removed all three from `requirements.txt`; they are runtime-optional
  (only needed after the user downloads the ONNX model via Settings → Embedding).
- **Pre-flight binary check in Electron** — `spawnBackend()` now calls `fs.existsSync()`
  on the executable path before attempting to spawn. If the binary is missing, shows an
  actionable error dialog with the exact path, `process.resourcesPath`, and a download link
  instead of 40 silent health-check attempts followed by a generic "did not start" message.
- Also logs `process.resourcesPath` and `__dirname` at startup for path diagnostics.

---

## [0.6.8] — 2026-05-25

### Fixed

- **Windows SmartScreen "Don't run" / "Unrecognised app" popup** — changed NSIS installer
  from machine-wide (`allowElevation: true`) to per-user install (`perMachine: false`,
  `allowElevation: false`). Requesting admin elevation is the main trigger for SmartScreen
  on unsigned executables; per-user installs are treated with less suspicion.
- **Download page** — added a collapsible `<details>` callout "Windows says Don't run?"
  directly below the Windows download button with step-by-step instructions:
  (1) browser download bar → Keep → Keep anyway,
  (2) SmartScreen popup → More info → Run anyway.

---

## [0.6.7] — 2026-05-25

### Fixed

- **Backend fails to start after installation** — removed `onnxruntime`, `onnxruntime.capi`,
  `tokenizers`, and `numpy` from PyInstaller `hiddenimports`. These packages are only
  imported lazily inside `ONNXEmbedder._load()` (called only when dense embeddings are
  actually run). Bundling their native Windows DLLs as hiddenimports caused load-order
  conflicts that crashed the backend binary at boot time on Windows.
- **`tokenizers` listed in both `hiddenimports` and `excludes`** — `excludes` silently
  won, causing a broken dependency chain during PyInstaller analysis. Removed from both;
  the package is optional at runtime (app falls back to FTS5-only via `NullEmbedder`).
- **Backend crash details invisible to user** — `stdio: 'pipe'` was silently discarding
  backend stdout/stderr. Now piped to `userData/backend.log` (appended on every launch).
  The error dialog now shows the last 10 stderr lines and the log file path so crashes
  are diagnosable without a debugger.

---

## [0.6.6] — 2026-05-25

Sprint 7 — Semantic Search · Copper Theme · Auto-update

### Added

#### Backend — Embedding layer (Sprint 7)
- **`backend/adapters/embedder.py`** — `IEmbedder` ABC + three implementations
  - `OpenAIEmbedder` — calls `text-embedding-3-small` via httpx (batched, up to 96 texts per request)
  - `ONNXEmbedder` — local `all-MiniLM-L6-v2` via onnxruntime; lazy-loaded, mean-pooled + L2-normalised (384-dim)
  - `NullEmbedder` — silent no-op fallback; retrieval degrades gracefully to FTS5-only
  - `build_embedder(api_key, provider, model)` factory: OpenAI key → OpenAI; local model ready → ONNX; else Null
  - `model_files_ready()`, `download_model(progress_cb)`, `_download_file()` — stdlib urllib download with 64 KB streaming + progress hook
- **`backend/api/setup.py`** — first-launch model download endpoints
  - `GET  /api/setup/models/status` → `{ready, model_name, size_bytes, path}`
  - `POST /api/setup/models/download` → SSE stream: `progress` / `done` / `error` events
  - Async bridge: blocking download runs in `run_in_executor`, progress pushed via `asyncio.Queue`
- **`backend/models/schemas.py`** — `EmbeddingSettings` model (`provider`, `model`, `api_key`); added `embedding` field to `AppSettingsResponse` and `AppSettingsUpdate`
- **`backend/core/settings_service.py`** — `embedding.api_key` added to `SENSITIVE_FIELDS`; embedding defaults wired into `_default_settings()`
- **`backend/requirements.txt`** — added `onnxruntime>=1.17`, `tokenizers>=0.19`, `numpy>=1.26`
- **`backend/knovex-backend.spec`** — `backend.api.setup`, `backend.adapters.embedder`, `onnxruntime`, `tokenizers`, `numpy` added to `hiddenimports`

#### Frontend — Embedding settings UI
- **`frontend/src/api/settings.api.ts`** — `EmbeddingSettings` interface + `embedding` field in `AppSettings` and update patch type
- **`frontend/src/api/setup.api.ts`** — `setupApi.getModelStatus()` and `setupApi.downloadModel(onProgress, signal)` via SSE fetch
- **`frontend/src/pages/Settings/LLMSettings.tsx`** — Embeddings section:
  - Provider toggle (Local ONNX / OpenAI API)
  - Optional masked OpenAI embedding API key field with show/hide toggle
  - Local model status card: file size, path, `LinearProgress` download bar, cancel button
  - "Save Embedding Settings" button

#### Desktop — Auto-update
- **`desktop/main.js`** — `electron-updater` wired up (production only, 8 s startup delay)
  - `autoDownload = true` — new releases download silently in background
  - `update-downloaded` → sends `app:update-downloaded` IPC to renderer with `{version, releaseNotes}`
  - `app:install-update` IPC handler → `autoUpdater.quitAndInstall()`
  - Download progress forwarded to renderer via `app:update-progress`
- **`desktop/preload.js`** — exposes `onUpdateDownloaded`, `onUpdateProgress`, `installUpdate` on `window.knovex`
- **`frontend/src/types/electron.d.ts`** — TypeScript declarations for all three update APIs
- **`frontend/src/components/Layout/AppShell.tsx`** — copper top banner with "Restart now" button + dismiss; uses MUI `Collapse` for slide-in/out

#### Design — Copper warm-dark theme
- **`frontend/src/theme/index.ts`** — complete theme rewrite
  - Accent: `#C8924A` (copper — `oklch(0.78 0.13 60)` match) replacing violet `#7C3AED`
  - Dark: `#0B0B0C` bg / `#111114` paper / `#F5F1EA` warm off-white text
  - Light: `#F5F1EA` bg / `#EFEAE0` paper / `#14120E` text (warm parchment)
  - Medium: `#E7E1D5` bg / `#DDD7CB` paper
  - Font: **Geist** + Geist Mono (matches the download page)
  - `action.hover/selected/focus` tokens use copper alpha — all components inherit automatically
- **`frontend/index.html`** — Geist + Geist Mono loaded from Google Fonts
- **`frontend/src/components/Layout/Sidebar.tsx`** — active background now uses `theme.palette.action.selected` (theme-aware, no hardcoded colour)
- **`desktop/main.js`** — `backgroundColor` updated to `#0B0B0C`

#### Download page
- **`docs/index.html`** — full redesign matching Claude Design aesthetic:
  - Geist fonts, copper `oklch` accent, `html[data-theme]` light/dark, conic-gradient K brand mark
  - Stats strip, 3×3 features grid, v0.6.6 download URLs, copy buttons, reveal animations
- **`docs/tweaks-panel.jsx`** — React Tweaks Panel with 5 accent presets + PostMessage protocol

### Changed
- `desktop/package.json` — version `0.6.6`
- `frontend/package.json` — version `0.6.6`
- `backend/core/config.py` — `version = "0.6.6"`

---

## [0.6.0] — 2026-05-25

Sprint 6 — Learn Mode + Encryption Verification

### Added

#### Backend — Learn Mode domain + service
- **`backend/core/domain/learn.py`** — pure domain entities
  - `LearnSession` dataclass: id, topic, format, source_type, difficulty, status, content, created_at, completed_at
  - `UserStats` dataclass with XP, level, streak, last_activity, badges
  - `VALID_FORMATS = {"quiz","flashcard","mindmap","timeline","story","eli5","speedlearn","brainstorm"}`
  - `VALID_DIFFICULTIES = {"beginner","intermediate","expert"}`
  - `xp_to_level()` / `xp_for_next_level()` based on `_LEVEL_XP = [0,100,250,500,1000,2000,4000,7500,12500,20000]`
  - XP constants: SESSION_COMPLETE=10, QUIZ_CORRECT=5, QUIZ_PERFECT=20, FLASHCARD_DECK=15, STREAK_BONUS=5
- **`backend/storage/repositories/learn_repository.py`**
  - `ILearnRepository(SQLiteRepository[LearnSession])` — abstract interface (DIP)
  - `SQLiteLearnRepository` — UPSERT-based session persistence; `user_stats` singleton (id=1)
  - `get_user_stats()`, `save_user_stats()`, `find_sessions(limit)` implementations
- **`backend/core/learn_service.py`** — `LearnService` facade (SRP + Strategy pattern)
  - `stream_session()` — SSE async generator for all 8 formats
    - Text formats (story/eli5/speedlearn/brainstorm): real-time token streaming via `LLMService.stream()`
    - JSON formats (quiz/flashcard/mindmap/timeline): `LLMService.complete()` → parse → stream as 40-char chunks
  - `submit_quiz_answer()` — correctness check, XP award, quiz_master badge
  - `review_flashcard()` — spaced repetition intervals `{again:1, hard:2, good:4, easy:7}` days
  - `_award_session_xp()` — base XP + flashcard bonus + streak bonus + 10 badge checks
  - `_SYSTEM_PROMPTS` dict with tailored prompts for all 8 formats (OCP: new format = add entry)
  - `_strip_code_fences()` — strips ` ```json...``` ` wrappers from LLM JSON output

#### Backend — API + wiring
- **`backend/api/learn.py`** — Learn Mode API router
  - `POST /api/learn/sessions/stream` — create session + SSE stream content
  - `GET  /api/learn/sessions` — list 50 most recent sessions
  - `GET  /api/learn/sessions/{id}` — get session by ID
  - `DELETE /api/learn/sessions/{id}` — delete session
  - `POST /api/learn/sessions/{id}/quiz/answer` — submit quiz answer (returns correctness, XP, explanation)
  - `POST /api/learn/sessions/{id}/flashcard/review` — rate flashcard (returns next_review_at)
  - `GET  /api/learn/stats` — get user gamification stats
- **`backend/core/dependencies.py`** — added `get_learn_service()` factory + `LearnServiceDep` annotated type
- **`backend/main.py`** — registered learn router under `/api` with `tags=["learn"]`

#### Frontend — Learn Mode UI
- **`frontend/src/api/learn.api.ts`** — fully typed Learn API client
  - Typed interfaces for all 8 content shapes: `QuizContent`, `FlashcardContent`, `MindmapContent`, `TimelineContent`, `TextContent`
  - `learnApi.streamSession()` — SSE stream via `fetch` + `ReadableStream`
  - `learnApi.submitQuizAnswer()`, `reviewFlashcard()`, `getUserStats()`, CRUD operations
- **`frontend/src/pages/Learn/index.tsx`** — full Learn Mode page (replaces placeholder)
  - Left sidebar: `StatsBar` (XP progress, level, streak), badge chips, session history with format icons
  - Header controls: topic input + 8-format Chip selector + difficulty Chip selector + Generate/Stop buttons
  - **QuizView**: interactive MCQ with per-question answer checking, colour-coded options (green=correct, red=wrong), explanation reveal, +XP toast
  - **FlashcardView**: flip animation, spaced-repetition rating buttons (again/hard/good/easy), progress dots, navigation
  - **MindmapView**: collapsible hierarchical tree with depth-coloured nodes
  - **TimelineView**: vertical spine with year badges and event descriptions
  - **TextContentView**: streamed Markdown rendered with `react-markdown`; blinking cursor during stream
  - XP + badge notification alert with auto-dismiss
  - Session history load: click any past session to reload its content

#### Frontend — Settings encryption indicator
- **`frontend/src/pages/Settings/LLMSettings.tsx`** — added `LockIcon` encryption notice below action buttons
  - Displays: "API keys are encrypted at rest using Fernet symmetric encryption. Key stored in `~/.config/Knovex/.knovex.key`, readable only by your OS user."

#### Tests — Sprint 6
- **`tests/test_encryption.py`** — 25 tests proving encryption works end-to-end
  - `TestFernetEncryptor`: roundtrip, token uniqueness, empty-string handling, invalid token, key file creation, key persistence across "restarts", cross-key incompatibility
  - `TestNullEncryptor`: passthrough behaviour
  - `TestSettingsServiceEncryption`: `llm.api_key` stored as Fernet token in raw store, `search.api_key` encrypted, non-sensitive fields plaintext, get_masked() returns `****`, no double-encrypt, empty key → empty storage
- **`tests/test_learn.py`** — 41 tests for LearnService
  - `InMemoryLearnRepository` stub (no SQLite)
  - Text format streaming: token events, done event, session saved as ready, content field
  - JSON format streaming: tokens reassembled to valid JSON, session content saved, mindmap round-trip
  - Validation: invalid format raises ValueError, invalid difficulty raises ValueError
  - LLM error: yields SSE error event, saves session as error
  - Quiz: correct/wrong answer, XP, explanation, out-of-range index, non-quiz session, missing session
  - Flashcard: all 4 ease ratings + correct `next_review_at`, good/easy awards XP, again awards none
  - Session CRUD: list empty, get not-found, session created during stream, delete
  - Gamification: stats defaults, XP earned after session, XP in done event, first_step badge
- **`tests/test_imports.py`** — 7 new Sprint 6 smoke tests (learn domain, service, repository, encryption, routes, schemas), version assertion updated to `0.6.0`

### Changed
- `backend/core/config.py` — `version = "0.6.0"`
- `frontend/package.json` — `version = "0.6.0"`
- `desktop/package.json` — `version = "0.6.0"`
- `backend/main.py` — version comment updated to `0.6.0`

### Test summary
158 tests — 158 passed (includes all sprints 1–6)

---

## [0.5.0] — 2026-05-25

Sprint 5 — Settings UI + Desktop Packaging

### Added

#### Frontend — Settings UI (complete)
- **LLM Settings tab** (`frontend/src/pages/Settings/LLMSettings.tsx`)
  - Provider dropdown: OpenAI, Anthropic, Groq, Gemini, Cerebras, AWS Bedrock, Ollama
  - Dynamic model selector — fetches live model catalogue per provider via `GET /api/settings/llm/models`
  - Masked API key field with show/hide toggle; leave blank to keep existing key
  - AWS Bedrock fields: region, access key ID, secret access key
  - Ollama base URL field + **Auto-Detect Ollama** button (`RadarIcon`)
    - Probes `localhost:11434`, displays found model count + URL
    - Populates detected-models dropdown and auto-fills base URL on success
  - "Test Connection" button — saves settings first, then calls `POST /api/settings/test-llm`
  - Connection result shown as success/error Alert with latency (ms)
- **Search Settings tab** (`frontend/src/pages/Settings/SearchSettings.tsx`)
  - Engine selector: DuckDuckGo (free), Serper (Google), Brave
  - Conditional API key field (shown only when engine requires a key)
  - Leave blank to keep existing key
- **App Settings tab** (`frontend/src/pages/Settings/AppSettings.tsx`)
  - Theme toggle: Light / Medium / Dark (auto-saves on click, propagates via Zustand)
  - KB Storage Path field with native OS **folder picker** button (uses `window.knovex.openFolderPicker()`)
  - Save path mutation with success/error Alert
  - About section: real app version from `window.knovex.appVersion()` (Electron IPC), Changelog link
- **Settings page shell** (`frontend/src/pages/Settings/index.tsx`)
  - Vertical tab layout (LLM / Search / App) with icons
  - Full-page loading skeleton + error state if backend is down

#### Frontend — Electron IPC wiring
- **AppShell** (`frontend/src/components/Layout/AppShell.tsx`)
  - Wires `window.knovex.onNavigate(route)` so tray "Settings" click navigates React Router
- **`electron.d.ts`** — added `onNavigate: (callback) => () => void` type declaration

#### Desktop — Electron improvements (`desktop/main.js`)
- **Window state persistence** — bounds (width, height, x, y) saved to `userData/window-state.json`
  - Loaded on startup; validated against minimum dimensions before use
  - Saved on every `resize` / `move` event and on `close`
  - Pure JSON (no electron-store dependency — works in packaged build without ESM issues)
- **Preload** — `onNavigate` IPC handler exposed via contextBridge
- **desktop/package.json** — version bumped to 0.5.0

#### Packaging

##### PyInstaller (`backend/knovex-backend.spec`)
- Builds a self-contained `knovex-backend/` folder (`COLLECT` mode, not one-file)
- Entry point: `backend/backend_entry.py`
  - Calls `multiprocessing.freeze_support()` first (required on Windows)
  - Patches `sys.path` for `sys._MEIPASS` when frozen
  - Starts uvicorn on `localhost:8765`
- All 7 LLM providers listed as `hiddenimports` (dynamic registration via decorators)
- All API routers listed explicitly
- Large dev/ML packages excluded (pytest, ruff, pandas, PIL, tkinter, …)
- UPX compression enabled (~35% size reduction)

##### electron-builder (`desktop/package.json`)
- `appId: io.knovex.app`, `productName: Knovex`
- Windows: NSIS installer (`.exe`)
- macOS: DMG disk image (`.dmg`)
- Linux: AppImage (`.AppImage`)
- `extraResources`: copies `backend/dist/knovex-backend/` into `resources/backend/`
- `files`: bundles `main.js`, `preload.js`, `../frontend/dist/**`

##### Build scripts
- **`scripts/build.ps1`** (Windows PowerShell) — 6-step pipeline:
  1. Verify venv; 2. Lint (ruff); 3. Tests (pytest); 4. Frontend (Vite);
  5. Backend binary (PyInstaller); 6. Installer (electron-builder)
  - Flags: `-SkipTests`, `-SkipFrontend`, `-SkipPackaging`
- **`scripts/build.sh`** (macOS / Linux bash) — same 6 steps
  - Flags: `--skip-tests`, `--skip-frontend`, `--skip-packaging`

#### CI/CD
- **`.github/workflows/package.yml`** — new "Package" workflow
  - Triggers on `v*.*.*` tag push
  - Matrix strategy: `windows-latest`, `macos-latest`, `ubuntu-latest`
  - Each runner: PyInstaller → Vite build → electron-builder
  - Uploads `.exe` / `.dmg` / `.AppImage` as workflow artifacts
  - Final job downloads all artifacts and attaches them to the GitHub Release
  - Code-signing secrets optional (unsigned builds work without them)

---

## [0.4.0] — 2026-05-24

Sprint 4 — Chat + Summarizer + Web Search

### Added

#### Backend — Chat
- **`ChatSession` + `ChatMessage`** domain entities (`backend/core/domain/chat.py`)
  - `ChatSession.rename(title)` — validates blank title, updates `updated_at`
  - `ChatSession.touch()` — bumps `updated_at` after each assistant reply
- **`IChatRepository`** + **`SQLiteChatRepository`** (`backend/storage/repositories/chat_repository.py`)
  - Session CRUD: `find_by_id`, `find_all`, `find_sessions_by_kb`, `save`, `delete`
  - Message CRUD: `find_messages`, `save_message`, `delete_message`
  - UPSERT with `ON CONFLICT(id) DO UPDATE SET`
  - Left-join message count in all session queries
- **`ChatService`** (`backend/core/chat_service.py`) — Facade for all chat operations
  - `create_session(kb_id, title)`, `get_session(id)`, `list_sessions(kb_id?)`, `rename_session`, `delete_session`
  - `get_messages(session_id)`, `export_session(session_id)` → Markdown string
  - `stream_message(...)` — streaming QA with full SSE protocol:
    - Step 1: persist user message
    - Step 2: FTS5 chunk retrieval with special-char sanitisation + sequential fallback
    - Step 3: optional web search augmentation
    - Step 4: emit `sources` / `web_sources` events before first token
    - Step 5: build prompt (system + history + KB/web context + question)
    - Step 6: stream LLM tokens, emit `token` events
    - Step 7: persist complete assistant message, emit `done` event
  - Constants: `_MAX_CONTEXT_CHUNKS=12`, `_MAX_CONTEXT_CHARS=8000`, `_MAX_HISTORY_MESSAGES=10`, `_MAX_WEB_RESULTS=4`
- **Chat API** (`backend/api/chat.py`) — 8 endpoints:
  - `POST /api/sessions` — create session
  - `GET  /api/sessions` — list all (or filter `?kb_id=`)
  - `GET  /api/sessions/{id}` — get single session
  - `PATCH /api/sessions/{id}` — rename session
  - `DELETE /api/sessions/{id}` — delete session
  - `GET  /api/sessions/{id}/messages` — message history
  - `POST /api/sessions/{id}/stream` — SSE streaming QA
  - `GET  /api/sessions/{id}/export` — Markdown export

#### Backend — Summarizer
- **`SummariserService`** (`backend/core/summarizer_service.py`)
  - `summarise_file(kb_id, file_id, length, ...)` — streams LLM summary of file chunks
  - `summarise_kb(kb_id, length, ...)` — streams LLM summary across all KB files
  - Length modes: `brief` (~150 words) and `detailed` (~600 words with bullets)
  - SSE protocol identical to Chat (`token` / `done` / `error`)
- **Summarizer API** (`backend/api/summarizer.py`):
  - `POST /api/summarize/file` — summarise a single file
  - `POST /api/summarize/kb` — summarise an entire KB

#### Backend — Web Search
- **`IWebSearchAdapter`** + adapters (`backend/adapters/web_search.py`)
  - `DuckDuckGoAdapter` — free, no API key, wraps `duckduckgo-search`
  - `SerperAdapter` — Google Search via `api.serper.dev`
  - `BraveAdapter` — Brave Search API
  - `StubWebSearchAdapter(results=[...])` — deterministic stub for tests
  - `get_search_adapter(engine)` factory with DuckDuckGo fallback
  - All third-party imports deferred (module importable without optional libs)
- **`SearchService`** (`backend/core/search_service.py`) — Facade over adapter layer
- **Search API** (`backend/api/search.py`) — `POST /api/search/web`

#### Backend — Dependencies & Wiring
- `get_chat_service()`, `get_summariser_service()`, `get_search_service()` added to `dependencies.py`
- `ChatServiceDep`, `SummariserServiceDep`, `SearchServiceDep` annotated shorthands
- Chat, summarizer, and search routers registered in `main.py`
- Version bumped to `0.4.0` in `AppConfig`

#### Frontend — Chat Page
- **Chat page** (`frontend/src/pages/Chat/index.tsx`) — full rewrite from placeholder
  - Left sidebar: session list (`SessionItem` with delete), "New Chat" button
  - Right panel: header, message thread, input bar
  - `MessageBubble` — user right-aligned, assistant left-aligned; KB citations as MUI `Chip`; web sources as `Link`
  - Token-by-token streaming with blinking cursor (`@keyframes blink` CSS animation)
  - Web search toggle (`ToggleButton` with `SearchIcon`)
  - `AbortController` in `abortRef` for stop mid-stream
  - Export to Markdown via `chatApi.exportSession()` + Blob download
  - `EmptyChat` — 4 suggested prompts that populate input field
  - `NoChatSelected` — empty state when no session is active

#### Frontend — Summarizer API
- **`summariserApi`** (`frontend/src/api/summarizer.api.ts`)
  - `streamFileSummary(kbId, fileId, length, onEvent, signal)` — SSE file summary
  - `streamKBSummary(kbId, length, onEvent, signal)` — SSE KB summary
  - Uses `fetch()` + `ReadableStream` (POST-based SSE, not `EventSource`)
  - `SummariseEvent` union type: `token | done | error`

#### Tests
- `tests/test_chat.py` — 30 ChatService + SearchService unit tests
  - `InMemoryChatRepository` — pure-Python stub, no SQLite
  - Session CRUD, rename validation, export Markdown
  - `stream_message`: token events, done event, sources/web-sources events, persistence, LLM error handling, missing session
  - `ChatSession` domain rules (rename / touch)
  - `SearchService` with `StubWebSearchAdapter`
- `tests/test_imports.py` — extended with 7 Sprint 4 smoke tests
  - Chat domain, web-search adapter, chat repository, sprint-4 services, all new routes

---

## [0.3.0] — 2026-05-24

Sprint 3 — File Reader + Inline Q&A

### Added

#### Backend
- **`ReaderService`** (`backend/core/reader_service.py`) — file rendering + Q&A service
  - `get_content(kb_id, file_id, page)` — renders file to `ContentBlock[]` with pagination
  - `ask(kb_id, file_id, req, ...)` — async generator yielding SSE tokens
  - Per-format renderers: `_render_txt`, `_render_md`, `_render_csv`, `_render_pdf`, `_render_docx`
  - PDF: one block per page; `page` param maps 1:1
  - TXT/MD/CSV/DOCX: 40 blocks per page (`_BLOCKS_PER_PAGE`)
  - Inline Q&A: fetches up to 20 chunks / 6 000 chars from the DB for context
  - SSE format: `data: {"token": "…"}\n\n` ending with `data: [DONE]\n\n`
- **`GET /api/kb/{kb_id}/files/{file_id}/content`** — paginated `FileContentResponse`
- **`POST /api/kb/{kb_id}/files/{file_id}/ask`** — SSE `StreamingResponse` for inline Q&A
- **`get_reader_service()`** + **`ReaderServiceDep`** wired in `dependencies.py`
- Reader router registered in `main.py`
- Version bumped to `0.3.0` in `AppConfig`

#### Frontend
- **`readerApi`** (`frontend/src/api/reader.api.ts`) — typed API client
  - `getContent(kbId, fileId, page)` → `FileContentResponse`
  - `askStream(kbId, fileId, question)` → async generator of string tokens (fetch + ReadableStream)
- **`FileViewer`** (`frontend/src/components/FileViewer/index.tsx`)
  - Renders all block types: `paragraph`, `heading`, `table_row`, `code`, `page`
  - Pagination toolbar (prev/next/page indicator) for multi-page files
  - Loading skeleton + error alert with retry
  - "Ask Q&A" toggle icon to show `InlineQA` sidebar
- **`InlineQA`** (`frontend/src/pages/KnowledgeBase/components/InlineQA.tsx`)
  - SSE-driven streaming chat sidebar
  - Token-by-token text rendering with blinking cursor
  - Abort/stop mid-stream with `AbortController`
  - Suggested starter questions in empty state
  - Message bubbles: user right-aligned, assistant left-aligned
- **`KBDetail`** updated — clicking a ready/stale file opens `FileViewer`
- **`FileRow`** updated — `onView` prop + "View" icon button; row is clickable when viewable

#### Tests
- `tests/__init__.py` — test package
- `tests/test_imports.py` — import smoke tests (all modules, app creation, route registration)
- `tests/test_adapters.py` — adapter unit tests (all stubs, anti-corruption layer check)
- `tests/test_reader.py` — `ReaderService` unit tests with stub adapters

#### CI/CD
- **`.github/workflows/ci.yml`** — runs on push/PR to main:
  - Python lint (`ruff`) + pytest with coverage
  - TypeScript type-check + frontend `npm run build`
- **`.github/workflows/release.yml`** — triggers on `v*.*.*` tags:
  - Re-runs full CI checks
  - Creates GitHub Release with CHANGELOG excerpt
- **`backend/requirements-dev.txt`** — `pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `mypy`

---

## [0.2.0] — 2026-05-23

Sprint 2 — Knowledge Base + File Ingestion Pipeline + Adapter Layer

### Added

#### Anti-Corruption Adapter Layer
- **`backend/adapters/__init__.py`** — adapter layer documentation and architecture diagram
- **`backend/adapters/llm_client.py`** — `ILLMClient` interface + `LiteLLMAdapter` + `StubLLMClient`
  - All `litellm` imports deferred inside method bodies (never at module level)
- **`backend/adapters/http_client.py`** — `IHttpClient` interface + `HttpxAdapter` + `StubHttpClient`
  - `HttpResponse` frozen dataclass with `.ok` property and `.json()` method
  - All `httpx` imports deferred inside method bodies
- **`backend/adapters/document_parsers.py`** — `IPDFAdapter` + `IParagraphAdapter` interfaces
  - `PyMuPDFAdapter` — wraps `fitz` (PyMuPDF)
  - `PythonDocxAdapter` — wraps `python-docx`
  - `StubPDFAdapter` + `StubParagraphAdapter` for testing without native libs
  - All third-party imports deferred inside method bodies

#### Domain Layer
- **`backend/core/domain/kb.py`** — `KB` dataclass with `rename()`, `update_appearance()`, `touch()` methods
- **`backend/core/domain/file_record.py`** — `FileRecord` dataclass + `FileStatus` enum
  - State machine: `mark_ingesting()`, `mark_ready(chunk_count)`, `mark_stale()`, `mark_missing()`, `reset_for_reingest()`
  - `SUPPORTED_FORMATS = frozenset({"pdf", "docx", "txt", "md", "csv", "udf"})`

#### Database
- `chunks` table + `chunks_fts` FTS5 virtual table with 3 auto-sync triggers
- WAL mode enabled for concurrent reads during ingestion

#### Repositories
- **`IKBRepository`** + **`SQLiteKBRepository`** — KB CRUD with `ON CONFLICT` UPSERT
- **`IFileRepository`** + **`SQLiteFileRepository`** — file record CRUD + `update_status()` + `delete_chunks()`

#### Services
- **`IngestionService`** — Strategy pattern with `@register_parser` class decorator
  - `PlainTextParser` (txt/md), `CSVParser`, `PDFParser` (via `IPDFAdapter`), `DOCXParser` (via `IParagraphAdapter`), `UDFParser`
  - Async: parsing runs in thread pool via `run_in_executor`
- **`WatcherService`** — periodic scan for stale/missing tracked files
- **`KBService`** — Facade for all KB + file operations; fire-and-forget ingestion via `asyncio.create_task()`

#### Events
- `KBCreatedEvent`, `FileAddedEvent`, `FileIngestedEvent`, `FileStaleEvent`, `FileMissingEvent`, `FileErrorEvent`
- `EventBus.emit_typed()` for type-safe event dispatch

#### API
- 13 KB/file endpoints under `/api/kb` prefix
- `KBServiceDep` annotated dependency shorthand

#### Frontend
- `KnowledgeBase` page — list view with search, grid of KB cards
- `CreateKBDialog` — name + 6 color presets + 10 emoji icon presets + live preview
- `KBCard` — file count / size / chunk chips
- `KBDetail` — file list with 2s auto-poll during ingestion, file picker
- `FileRow` — status badge with `CircularProgress` for ingesting
- `ConfirmDialog`, `UpdatePathDialog` — generic utility modals

---

## [0.1.0] — 2026-05-22

Sprint 1 — Foundation

### Added

#### Backend
- FastAPI application with lifespan context, CORS middleware, global exception handler
- `AppConfig` via pydantic-settings with `KNOVEX_` env prefix + platformdirs
- Fernet encryption for API keys at rest (`IEncryptor` + `FernetEncryptor`)
- `ISettingsStore` + `JsonSettingsStore` — atomic JSON persistence
- `SettingsService` — read/update/mask settings
- `LLMService` with `stream()` + `complete()` + `test_connection()` + `get_models()`
- `LLMProvider` Template Method base + 7 provider implementations:
  `OpenAIProvider`, `AnthropicProvider`, `GroqProvider`, `GeminiProvider`,
  `CerebrasProvider`, `BedrockProvider`, `OllamaProvider`
- Self-registering provider factory via `@register_provider` decorator
- `EventBus` with typed event dispatch
- `SQLiteBackend` with WAL mode + FTS5
- `HealthResponse` endpoint with Ollama probe
- Settings CRUD endpoints (GET/PUT `/api/settings`, POST `/api/settings/test-llm`)
- Tools registry endpoint
- Ollama auto-detect endpoint + models endpoint
- FastAPI dependency injection wiring in `dependencies.py`

#### Frontend
- React 18 + TypeScript + MUI v6 project (Vite 6)
- App shell with responsive sidebar navigation (5 pages)
- Settings page — LLM provider/model/key fields, Ollama detect, connection test
- TanStack Query v5 + Zustand state management
- API client with Axios + error normalisation
- Light / Medium / Dark theme switching

#### Desktop
- Electron 33 shell with `contextBridge` + IPC
- System tray with show/hide/quit menu
- Electron file picker exposed via `window.knovex.openFilePicker()`
- Backend spawned from Electron main process
- Vite proxy to localhost:8765 for dev mode

#### Infrastructure
- `.gitignore` covering Python, Node, Electron, system files
- `docs/` — ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, FEATURES.md, API_SPEC.md, TECH_STACK.md

---

## Links

[Unreleased]: https://github.com/tailorgunjan93/knovex/compare/v0.7.3...HEAD
[0.7.3]: https://github.com/tailorgunjan93/knovex/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/tailorgunjan93/knovex/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/tailorgunjan93/knovex/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/tailorgunjan93/knovex/compare/v0.6.9...v0.7.0
[0.6.9]: https://github.com/tailorgunjan93/knovex/compare/v0.6.8...v0.6.9
[0.6.8]: https://github.com/tailorgunjan93/knovex/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/tailorgunjan93/knovex/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/tailorgunjan93/knovex/compare/v0.6.0...v0.6.6
[0.6.0]: https://github.com/tailorgunjan93/knovex/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/tailorgunjan93/knovex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tailorgunjan93/knovex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tailorgunjan93/knovex/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tailorgunjan93/knovex/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tailorgunjan93/knovex/releases/tag/v0.1.0
