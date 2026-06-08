# RCA — Recurring "network error" in Learn & Chat (2026-06-07)

**Status:** Resolved (v0.12.1 fix + v0.12.2 resilience) · guards added · CI gaps being closed
**Severity:** High (core feature unusable; eroded trust — perceived as the same bug recurring)
**Author:** Engineering (with Claude)

---

## 1. Summary

Users saw a bare red **"network error"** toast twice in close succession:

1. **Learn → Animated** (v0.12.0): every generation failed instantly. **Real bug.**
2. **Chat → "hi"** (v0.12.1): a one-off failure right after the auto-update relaunch.
   **Not a code defect** — a transient during backend cold-start — but it *looked*
   identical to (1), so it read as "the same bug, still not fixed."

Both surfaced as the **same generic message**, which is why two unrelated causes
felt like one recurring failure.

---

## 2. Impact

- Learn → Animated was 100% broken in v0.12.0 for all users/models.
- Repeated identical-looking errors eroded confidence in the release process.

---

## 3. Root cause

### 3a. The real bug (Learn → Animated)

Two independent allow-lists for the learn "format" **drifted**:

| Source of truth | Contains `animated`? |
|---|---|
| API schema `LearnSessionCreate.format` (Literal) | ✅ yes |
| Domain `VALID_FORMATS` frozenset (`core/domain/learn.py`) | ❌ **no** (added "guided", forgot "animated") |

Consequence chain:

1. Request passes pydantic (schema allows `animated`).
2. Endpoint returns `StreamingResponse` → **HTTP 200 begins**.
3. Starlette iterates the generator; `stream_session()` hits
   `format not in VALID_FORMATS` on its **first iteration** and raises `ValueError`.
4. That raise is **outside** the generator's own `try/except` and happens **after**
   the 200 response already started → Starlette **aborts the connection mid-stream**.
5. The renderer's `fetch` body errors → Chromium throws `TypeError: network error`.

The endpoint's pre-existing `try/except ValueError` was **dead code**: creating an
async generator never runs its body, so the guard never fired.

### 3b. The transient (Chat)

The chat path was correct (verified end-to-end with a real LLM reply, and the
endpoint validates the session eagerly → clean 404, no mid-stream drop). The single
failure was a connection attempt during the post-auto-update **cold-start window**
(backend still warming). The frontend had **no retry** and **one generic message**,
so a recoverable blip became a hard, scary error.

---

## 4. The real question: why wasn't it caught in dev/CI?

This is the important part. Every layer that *could* have caught it was blind:

| Layer | Why it missed the animated bug |
|---|---|
| **Backend unit tests** (`test_learn.py`) | Drain the service generator directly. The "all formats" test enumerated quiz/flashcard/guided but **omitted `animated`**. No test asserted the schema Literal ≡ `VALID_FORMATS`. |
| **Backend HTTP integration** | **Did not exist for the stream endpoint** at the time. The bug only manifests across the HTTP/SSE boundary (raise *after* 200). |
| **Frontend unit tests** (vitest) | Mock the API layer; never hit a real backend. **And — see 4a — they don't even run in CI.** |
| **Browser E2E** (`playwright.config.ts`) | **Mocks every `/api/*` call** via `page.route()`, including `/api/learn/sessions/stream` with a scripted `text/event-stream` success. A mock can't drop the connection, so the real backend contract is never exercised. (Repeat of prior lesson: "a mock validated an imagined API.") |
| **Electron E2E** (`playwright.config.electron.ts`) | Launches real `main.js` + real backend — **the one layer that would catch it** — but is **not run in CI** and requires a manually-started backend. |

### 4a. The two systemic gaps (the actual root causes of the *escape*)

1. **CI never exercised the real frontend↔backend streaming boundary.** Unit tests
   mock across it; browser E2E mocks it; the only real-boundary suite (Electron E2E)
   isn't in CI. The entire class of "raise-after-200 → connection drop" bugs was
   invisible to the gate.
2. **CI didn't even run the frontend `vitest` suite.** The `frontend` job is only
   `tsc --noEmit` + `npm run build`. Hundreds of written unit tests (ScenePlayer,
   hooks, etc.) **never executed in CI** — so a frontend regression could merge green.
3. **Undifferentiated error UX.** Connection failure, HTTP error, and mid-stream drop
   all rendered the identical "network error" string with no retry and no detail —
   making distinct problems indistinguishable and untriageable.

---

## 5. Resolution & guards (what now prevents recurrence)

| Fix | Where | Catches |
|---|---|---|
| Add `animated` to `VALID_FORMATS` | `core/domain/learn.py` | the bug itself (v0.12.1) |
| **Eager format/difficulty validation before `StreamingResponse`** | `api/learn.py` | any future format drift → clean 422, never a mid-stream drop |
| **Drift guard** — schema Literal must equal `VALID_FORMATS` | `test_learn_api_integration.py::TestFormatSourcesOfTruthAgree` | this *class* of drift, permanently |
| **HTTP/SSE integration tests** for learn + chat (ASGITransport) | `test_learn_api_integration.py`, `test_chat_api_integration.py` | raise-after-200 / mid-stream drops at the real backend contract |
| Full audit of **every** `StreamingResponse` (learn/chat/reader/summarizer/setup) | — | confirmed animated was the only instance of the class |
| **Resilient SSE client** — connection retry + clear messages, no duplicate submit | `lib/streaming/sseStream.ts` (+ 7 tests) | transient cold-start blips (self-heal); turns generic toast into actionable text (v0.12.2) |
| Restored reader tests CI wasn't running | `OutlineTab`/`RenderBlock` specs | reader regressions |

### Still to close (CI gate hardening — this change set)

- [ ] **Run `vitest` in the frontend CI job** (currently never runs).
- [ ] **Run the browser E2E in CI** (frontend journey regressions).
- [ ] **Run a real-backend streaming E2E in CI** using a **fake LLM provider** (no
      secrets) so the animated-class drop is caught at the real HTTP boundary, not a mock.

---

## 6. Lessons (added to CLAUDE.md)

1. **Two allow-lists for the same concept must have a test asserting they're equal.**
2. **Never validate inside a streaming generator after the response has started** —
   validate eagerly in the endpoint so failures are clean status codes, not dropped
   connections.
3. **A mock of an endpoint is not coverage of that endpoint.** At least one test per
   streaming journey must hit the real backend (ASGITransport in CI; real socket in
   E2E).
4. **If a suite of tests exists, CI must run it.** Written-but-unrun tests are worse
   than none — they create false confidence.
5. **Error UX must distinguish causes.** One generic "network error" for connect
   failure vs HTTP error vs mid-stream drop makes unrelated problems look like one
   recurring bug and blocks triage.
