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
| 9 | "Failed to uninstall old application files.: 2" on install/update | **Full cause (took 3 tries — v0.11.1/0.11.2 were tested with a STUB backend that hid it):** the Electron shell spawns *multiple* `Knovex.exe` processes + a backend loading ~120 `_internal` DLLs. Killing them is necessary but NOT sufficient — electron-builder's uninstaller **aborts on the first transiently-busy file** (antivirus still scanning the freshly-written DLLs / 188 MB exe) within its ~5s retry budget → `$(uninstallFailed): 2` (a MessageBox with no silent-default → hangs in silent mode). | v0.11.3 | ✅ `desktop/assets/installer.nsh` `customInit` kills app+backend AND **force-removes the old install dir itself with a retry loop** (`RMDir /r`, guarded by `Knovex.exe`) before electron-builder's uninstaller runs. **Verified with the REAL backend** over the running real app: exit 0 ×3; reproduced exit-2/hang without it. Lesson: an installer fix MUST be tested with the real packaged backend, never a stub. Guard: `tests/test_installer_nsis.py` |
| 10 | "LLM returned invalid JSON: Expecting ',' delimiter" on guided/animated (any JSON format) | Small/local models emit malformed JSON in several ways: (a) **unescaped `"` inside a string value** (quoting a term mid-sentence); (b) truncation by token limit; (c) **structural breaks** — e.g. a *flattened `steps` array* where elements after the first lose their wrapping braces (`[{step1}, "step":2, …]`), plus stray `�` replacement chars. Hand-rolled repairs can't cover the long tail of structural breaks | unreleased (`design/visual-redesign-lab`) | ✅ `_parse_llm_json`: cheap content-preserving repairs (`_escape_inner_quotes`, `_repair_truncated_json`) first, then **`json_repair` library via `backend/adapters/json_repair_adapter.py` (anti-corruption wrapper)** as the structural catch-all. Tests: `TestUnescapedInnerQuoteRepair` (12) + `TestStructuralJsonRepair` (2); full raw logged on unrepairable failures |
| 11 | PDFs with images rendered as a black dot-grid box in the Reader; the page-assistant then answered "no content" | Two issues: (a) image/design pages reconstructed from `get_text("dict")` use raw image bytes that ignore PDF soft-masks → artefacts; (b) ingestion stored the *display HTML* (71 KB base64 `<img>` data URIs) as chunk content, polluting FTS + embeddings | unreleased (`design/visual-redesign-lab`) | ✅ image-dominant pages (`_image_coverage ≥ 0.55`) rendered to a composited pixmap PNG (`page-raster`); ingestion indexes plain text via `_html_to_plain` (drops images). Tests: `test_pdf_raster.py` (7), `test_ingestion_pdf_text.py` |
| 12 | Scanned / image-only PDFs ingested as empty — no searchable text, assistant had nothing to answer from. **Ingestion belongs in docnest, not Knovex.** | Delegation to docnest was coded against `docnest.parsers.get_parser(fmt)` — a **non-existent API** (real one is `ParserFactory().get(path).parse(path)`), so it silently no-op'd and the mock test validated the *imagined* API. Even once wired, docnest's `DoclingPDFParser` defaults `ocr=False` (no OCR), and OCR'd single lines land in the section *title* with empty body | unreleased (`design/visual-redesign-lab`) | ✅ **`backend/adapters/docnest_adapter.py`** anti-corruption seam wraps the real `ParserFactory`, registers an `ocr=True` docling parser, and falls back to a section's title as content. PDF + UDF ingestion delegate through it; absent/unsupported → lightweight PyMuPDF/ZIP fallback. Tests: `test_docnest_adapter.py` (incl. a real-docnest `@slow` OCR integration test that recovers text from an image-only PDF) |
| 12a | Smart OCR routing (perf) — docling/OCR is ~10–28 s/doc on CPU; running it on *every* PDF (incl. born-digital text) is wasteful | `PDFParser.parse` called docnest first unconditionally whenever OCR was available, so text PDFs paid the full ML pipeline cost despite having a perfect text layer | unreleased (`design/visual-redesign-lab`) | ✅ `_pages_need_ocr()` routes by content: text PDFs → fast PyMuPDF (~0.04 s); only image-dominant/scanned pages (the `page-raster` signal) → docnest OCR. Packaged app provisions OCR on demand (`OcrProvisionService` + `/api/ocr/*` + out-of-process `ocr_sidecar.py`; `uv`-built env under app-data) since docnest/torch is too large to bundle. Tests: `test_ingestion_pdf_text.py` (routing), `test_ocr_sidecar.py`, `test_ocr_provision.py`, `test_ocr_api.py` |
| 13 | Learn → **Animated** failed instantly with a bare "network error" toast (Guided + all other formats worked) | **Two sources of truth for the valid-format allow-list drifted.** The API schema (`LearnSessionCreate.format` Literal) accepted `"animated"`, but domain `VALID_FORMATS` (in `core/domain/learn.py`) was never updated to include it. So the request passed pydantic → the `200` SSE response **started** → `stream_session()` (an async generator) hit `format not in VALID_FORMATS` on its first iteration and raised `ValueError` **outside** its own `try/except`, *after* the response began. Starlette aborted the connection mid-stream; the renderer's `fetch` body errored as Chromium's lowercase `TypeError: network error` (no error event, no done event). The endpoint's pre-existing `try/except ValueError` was **dead code** — creating a generator never runs its body. | v0.12.1 | ✅ Added `"animated"` to `VALID_FORMATS` **and** moved format/difficulty validation to **eager checks in the endpoint** (`api/learn.py`, before `StreamingResponse`) so drift now yields a clean `422` not a dropped connection. Tests: `test_learn_api_integration.py::test_animated_format_streams_and_saves` (reproduces the drop) + `TestFormatSourcesOfTruthAgree` (drift guard: schema Literal ≡ `VALID_FORMATS`). Verified end-to-end on a real HTTP SSE backend. **Lesson:** when two allow-lists describe the same thing, add a test that asserts they're equal — and never validate inside a streaming generator after the response has started. |
| 14 | **"Backend did not start after 60 attempts"** dialog on launch — but the log showed `Uvicorn running on 127.0.0.1:8765` (a false negative; the backend *was* coming up) | Electron's health poll used a fixed **60-attempt / ~30s** budget (`waitForBackend(60, 500)`). On the FIRST launch after an update, Defender scans the freshly-written ~188 MB exe + ~120 `_internal` DLLs, so the PyInstaller cold start exceeds 30s. Polling gave up before the backend bound the port; the success log line appeared *after* the dialog. | v0.12.3 | ✅ Poll is now a wall-clock **deadline (120s)**, not an attempt count, and **fails fast if the backend process exits**. Logic extracted to **`desktop/lib/backendHealth.js`** (pure, injectable) with `node --test` unit tests, now run by a new **desktop CI job**. `desktop/package.json` `build.files` updated to package `lib/**`. **Lesson:** a cold-start budget must exceed worst-case post-update AV-scan time; tie the wait to a deadline + process liveness, not a magic attempt count. |
| 15 | Chat shows **"network error"** when a knowledge base is selected (plain chat without a KB worked) | `_retrieve_hybrid` imported the optional dense stack (`numpy`/`faiss` via `backend/adapters/vector_index.py`, which does `import numpy` at module top) **outside** its FTS5-fallback `try`. The packaged app deliberately excludes numpy/faiss, so the import raised `ModuleNotFoundError` **mid-stream** (during `_retrieve_kb_context` inside `stream_message`) → connection dropped → bare "network error". Same class as #13 (raise after the 200 began). | v0.12.3 | ✅ Moved the `vector_index` import **inside** the `try`, so a missing dense stack degrades to FTS5-only. Tests: `test_chat.py::test_retrieve_hybrid_falls_back_to_fts5_when_dense_stack_missing` (unit, proven to fail pre-fix) + `test_chat_api_integration.py::test_stream_with_kb_survives_missing_dense_stack` (HTTP, KB chat reaches `done`). **Lesson:** optional/unbundled deps must be imported behind the same guard that handles their absence; never above it. |
| 16 | Web search "grounded" but the model replied **"I don't have real-time access"** for a "today's news" query | The web search worked (returned 4 real headline sources, injected into the user message as "Web Search Results"), but the **system prompt had no directive to use them**. `gpt-oss`-class models have a strong prior to refuse current-events queries with "no real-time access"; with nothing overriding it in the system prompt, the prior won despite fresh headlines being in context. (The KB path already had a "prioritise the provided context" directive; the web path had none.) | v0.12.4 | ✅ `_build_messages` adds a **web grounding directive** to the system prompt whenever web results are present ("…real-time results retrieved just now… never reply that you lack real-time access…"). Tests: `test_chat.py::test_build_messages_adds_web_grounding_directive_when_web_context_present` (+ negative). **Lesson:** retrieval without a grounding directive is half a feature — instruct the model to use every context source you inject. RCA: `docs/rca/2026-06-08-web-search-not-grounding.md`. |
| 17 | User reported **"Serper isn't working"**; web results were poor | Two parts. (a) **Serper was actually fine** — correctly wired, keyed, decrypted, and persisted (round-trip verified), no errors in logs. (b) The REAL bug: the **Wikipedia search engine returned 403 every time** because its User-Agent (`Knovex/1.0 (knowledge base)`) lacked contact info, which Wikimedia's API policy rejects. An enabled engine silently contributed nothing, degrading blended results — and there was **no per-engine visibility** to tell which engine produced what. Verified live: old UA → 403, UA with a contact URL → 200. | v0.12.7 | ✅ Wikipedia UA now includes a contact URL (`_WIKIPEDIA_UA`); blended search **logs each engine's result count**; added Serper request-shape + Wikipedia UA contract tests (+ `@slow` live check). **Lesson:** a silently-failing component in a blend (one engine 403ing) looks like "the whole feature is broken" — log per-component outcomes so failures are attributable, and verify external-API contracts (UA/headers) against the live service. |
| 18 | Animated lessons: the **arrows between boxes were invisible** — flow steps, a reaction's middle input/output arrows, a cycle's flat edge, and tree/hub edges all rendered as *disconnected* boxes, so a learner saw scattered labels instead of the flow/structure the lesson was teaching. (Surfaced by an "observe like a naive student" render-review across 7 topics × diagram types.) | The arrow glow SVG `filter` (`#kx-glow`) used the default `objectBoundingBox` filter region (`x=-50% width=200%`). A **perfectly horizontal/vertical line has a zero-area geometric bounding box**, so the region collapsed to nothing and clipped the arrow entirely. Only **diagonal** arrows (non-zero bbox on both axes) survived; the unfiltered `compare` divider also survived — which is why the bug looked random rather than systematic. | unreleased (`feat/learn-semantic-animation`) | ✅ Glow filter switched to `filterUnits="userSpaceOnUse"` with a stage-sized region (independent of each arrow's bbox), so every arrow renders. Guard: `ScenePlayer.test.tsx` asserts `#kx-glow` uses `userSpaceOnUse` (jsdom can't rasterise SVG filters, so we assert the config that prevents the clip). Verified by re-capturing flow/cycle/tree/reaction/hub — all arrows now visible. **Lesson:** an `objectBoundingBox` SVG filter silently clips axis-aligned geometry; a visual-only bug like this is invisible to jsdom unit tests and needs a real-browser render-review. |
| 19 | **Cinematic (Manim) lessons in a non-Latin language rendered every glyph as a `.notdef` "tofu" box** (e.g. Hindi "प्रकाश संश्लेषण"); Latin ("CO2") was fine. So any Hindi/CJK/Arabic lesson was unreadable. (User-reported with a screenshot.) | The Cinematic pipeline instructs the LLM to write on-screen `Text(...)` in the lesson's language, but Manim's `Text()` **default font does no per-glyph fallback** to a script-covering font — even though a covering font (e.g. Nirmala UI) IS installed and visible to manimpango. The render tests used a STUB sidecar runner and never rendered a real frame, so a missing-glyph path was invisible to the suite. | v0.15.0 | ✅ The render sidecar (`manim_sidecar.py`) maps the lesson language → a prioritised list of script-covering fonts, picks the first one actually installed (`_pick_font` via `manimpango.list_fonts()`), and sets it as the `Text` default before executing the generated scene. `manim_render_service` threads `language` to the sidecar (`--lang`). Tests: `test_manim_sidecar.py::TestPickFont` (pure mapping) + `test_manim_render.py::test_passes_language_to_runner`. **Verified end-to-end against the REAL provisioned Manim env** (Hindi → correct Devanagari). **Lesson:** render/visual bugs need a real-render test in the matrix incl. edge inputs (non-Latin scripts); a stub runner hides them. |

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

6. **A mock validated an imagined API.** The docnest delegation was tested only with a mock that mirrored the API I *assumed* (`docnest.parsers.get_parser`), not the real one (`ParserFactory`). The test passed while the feature silently no-op'd. Lesson: any integration with an external package needs at least one test that exercises the *real* installed package (gated/`@slow` if heavy), not just a mock of how we imagine it behaves. Mocks belong behind a verified anti-corruption adapter.

7. **CI didn't exercise the real frontend↔backend streaming boundary** (Learn → Animated "network error", v0.12.0). Backend unit tests drain the generator directly; frontend unit tests mock the API; **browser E2E mocks every `/api/*` call** (a scripted `text/event-stream` success can't reproduce a real mid-stream connection drop); and the only real-boundary suite (Electron E2E) wasn't in CI. The bug — a `ValueError` raised *inside* a `StreamingResponse` generator **after** the 200 began, which aborts the connection → renderer shows "network error" — was invisible to every gate. Lesson: every streaming journey needs at least one test that hits the **real** backend contract (ASGITransport in CI), and **never validate inside a streaming generator after the response has started** — validate eagerly in the endpoint so failures are clean status codes. Full RCA: `docs/rca/2026-06-07-network-error.md`.

8. **Two allow-lists for the same concept drifted with no guard.** The API schema `format` Literal accepted `animated` but domain `VALID_FORMATS` didn't. Lesson: when two sources of truth describe the same set, add a test asserting they're equal (`TestFormatSourcesOfTruthAgree`).

9. **Tests existed but CI never ran them.** The `frontend` CI job was only `tsc` + `build` — the entire `vitest` suite never executed in CI, so a frontend regression could merge green. Lesson: if a test suite exists, the gate must run it. Written-but-unrun tests are false confidence.

10. **Undifferentiated error UX made two unrelated failures look like one recurring bug.** Connection failure, HTTP error, and mid-stream drop all rendered the same "network error". Lesson: error messages must distinguish causes; transient connection failures should retry before surfacing (`lib/streaming/sseStream.ts`).
