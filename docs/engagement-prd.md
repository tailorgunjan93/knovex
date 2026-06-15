# Knovex — Engagement & Retention PRD

**Status:** Draft  
**Author:** Business Analyst  
**Date:** 2026-06-11  
**Scope:** Desktop app (Phase 1); signals apply equally to a future web version.

---

## 1. Problem Statement

### 1.1 The Transactional Problem

Knovex is built well but used episodically. The current flow is: user has a task → opens the app → asks a question or runs a lesson → gets an answer → closes the app. There is no reason to return tomorrow unless the user has another task.

This is the classic "tool, not habit" trap. A tool commands willingness; a habit commands loyalty.

Evidence from the codebase:

- **Learn mode** has XP, streaks, badges, and spaced-repetition (all backend logic exists in `backend/core/domain/learn.py` and `backend/core/domain/srs.py`) but nothing surfaces to the user *between* sessions — no reminder, no prompt to return, no "here is what is waiting for you."
- **Progress page** tracks streak and activity heatmap but is passive: the user must navigate to it; it does not call them back.
- **Review page** has a full SM-2 queue (`/api/learn/reviews/due`) but the due-card count appears only in the sidebar badge, which requires the app to already be open.
- **Chat** has knowledge-base grounding but shows no proactive suggestions ("you haven't asked about Chapter 3 yet") that would give the user a reason to open a new thread.
- **KB page** has a `DailySpark` quote widget but it is decorative; it does not connect to the user's actual content.

### 1.2 Target Users

| Segment | Who | Primary motivation |
|---------|-----|-------------------|
| **Self-learner** | Student, professional upskiller, lifelong learner | Wants to genuinely understand and retain material from their documents |
| **Knowledge worker** | Researcher, analyst, writer | Wants to think faster by querying their accumulated notes and docs |
| **Power reader** | Person who ingests many PDFs / articles | Wants to make their reading searchable and interactive |

The engagement strategies differ by segment but overlap: all three benefit from a learning loop, a sense of progress, and intelligent prompting toward their own material.

---

## 2. Target Engagement Loop

The loop below maps directly to existing Knovex capabilities and the gaps that need filling.

```
TRIGGER ──────────────────────────────────────────────────────────────────
  Daily review badge (OS notification or sidebar count)
  "You have 7 cards due" nudge on app open
  Morning digest: "3 topics you haven't revisited in a week"
  Streak at risk warning: "Your 5-day streak ends tonight"

    │
    ▼

ACTION ───────────────────────────────────────────────────────────────────
  Open app → land on a personalised Home feed
  One-click into the highest-priority action:
    • Review due flashcards  (Review page — already built)
    • Continue an interrupted lesson  (Learn session list — already built)
    • Explore a suggested topic derived from KB content
    • Answer today's Daily Challenge

    │
    ▼

REWARD ───────────────────────────────────────────────────────────────────
  XP earned and animated on screen  (XP system — already built)
  Streak counter ticks up  (streak logic — already built)
  Badge unlocked  (badge system — already built, 10 badge types)
  "You now know this well" confidence meter per topic
  Post-lesson next-action chips: "Go deeper · Related · Quiz me"  (suggestions — partially built)

    │
    ▼

INVESTMENT ───────────────────────────────────────────────────────────────
  Flashcard ratings feed the SM-2 scheduler → creates future due dates
  KB grows → smarter recommendations next time
  Completed topics map builds → shows gaps the user hasn't covered
  Streak maintained → user has skin in the game
```

The loop closes because every action (reviewing a card, finishing a lesson) generates future triggers (cards become due again, new suggestions surface). The flywheel accelerates as the KB grows.

---

## 3. Success Metrics

All metrics are measurable locally in SQLite without any cloud telemetry, which matters for a privacy-first desktop app.

| Metric | Definition | How to measure locally | Target (6-month baseline) |
|--------|-----------|------------------------|--------------------------|
| **D1 retention** | User opens app on day after first use | `SELECT COUNT(*) FROM learn_sessions WHERE DATE(created_at) = DATE(first_session) + 1` | ≥ 40% |
| **D7 retention** | User opens app within 7 days of first use | Any session row within 7-day window | ≥ 25% |
| **Sessions / week** | Learn or Chat sessions started per week | Count rows in `learn_sessions` + `chat_sessions` grouped by ISO week | Target: 5+ / week |
| **Lessons / week** | Learn sessions with `status = 'ready'` per week | Filter `learn_sessions` by `status` | Target: 3+ / week |
| **Streak adoption** | % of weeks where streak ≥ 3 days | `user_stats.streak` history (already persisted) | ≥ 30% of active users reach 3-day streak |
| **Review queue utilisation** | Ratio of due cards reviewed vs skipped | `card_schedules` table: count reviews within 24h of `next_review_at` | ≥ 60% of due cards reviewed same day |
| **Avg session length** | Time from first SSE token to page leave (estimate: session window) | `completed_at - created_at` on `learn_sessions` | ≥ 8 min |
| **Feature depth** | Formats used per user per week | Distinct `format` values in `learn_sessions` | Target: 2+ formats / week |
| **KB growth rate** | Files added per week | `file_records` grouped by week | Positive week-over-week trend |
| **Continuation rate** | % of lessons followed by a second lesson within 10 minutes | Consecutive `learn_sessions` within 10-min window | ≥ 35% |

**Instrumentation notes:** All metrics derive from tables that already exist (`learn_sessions`, `card_schedules`, `user_stats`). A lightweight local analytics view can be added to the Progress page without any server.

---

## 4. Prioritised Feature Backlog

Priority is ordered by **impact / effort ratio**. Each story states the acceptance criteria tightly enough to be handed to an engineer.

---

### Priority 1 — Home / "For You" Feed

**User Story**
> As a returning user, I want to open Knovex and immediately see what I should do next — whether that is reviewing due cards, continuing a lesson, or exploring something new from my library — so that I never face a blank slate.

**Acceptance Criteria**
- The app launches to a Home screen (new nav item, first in sidebar) rather than an empty KnowledgeBase page.
- The feed surfaces at most 5 cards, prioritised in this order:
  1. Review queue count (if `GET /api/learn/reviews/count` returns > 0, show a "N cards due" action card).
  2. Most recently opened learn session that is `status = 'ready'` (resume prompt).
  3. AI-generated topic suggestion derived from the user's KB (see "Smart Recommendations" story below for the generation logic — this feed card is the surface).
  4. Daily Challenge card (see story below).
  5. A "Start fresh" prompt with the Learn format picker.
- Feed cards are clickable and navigate directly to the correct page / session.
- Empty state (new user with no KB, no sessions): onboarding prompt to create a KB.
- Feed reloads on every app open (stale-time = 0 for the `home-feed` query key).

**Effort:** M  
**Impact:** High  
**Notes:** Home is the most powerful single change because it converts every app open into a prompted action. All the data it needs already exists.

---

### Priority 2 — Post-Lesson "Next Action" Hook

**User Story**
> As a user who has just finished a lesson, I want to be shown 2–3 intelligent next steps — go deeper, take a quiz on the same topic, or see a related concept from my library — so that I keep learning instead of closing the app.

**Acceptance Criteria**
- When a learn session reaches `status = 'ready'`, the lesson view renders a "What's next?" section below the content (not a modal — inline, always visible).
- The section shows exactly 3 chips, sourced from the existing `LearnSuggestion` API response (`kind: deeper | next | related`). These are already generated by the backend on session completion (`suggestions` SSE event in `learn_service.py`).
- Each chip is styled per the existing `NEXT_KIND_COLOR` / `NEXT_KIND_LABEL` constants that are already defined in `frontend/src/pages/Learn/index.tsx`.
- Clicking "Go deeper" pre-fills the Learn topic input with a more specific version of the current topic and triggers generation.
- Clicking "Quiz me on this" switches the format to `quiz` and regenerates on the same topic/source (the `handleGenerate(overrideFormat)` path already exists).
- Clicking "Related: X" pre-fills the topic with the suggestion label and generates.
- A "Back to library" escape link is available for users who want to stop.
- The section is not shown if the session ended in an error.

**Effort:** S  
**Impact:** High  
**Notes:** The backend already generates suggestions and the frontend already has the chip component and `handleGenerate(overrideFormat)` wired up. This is mostly a UX re-surfacing: move the suggestion chips from the collapsible sidebar history to a prominent post-lesson call-to-action block.

---

### Priority 3 — Daily Streak Goal & At-Risk Notification

**User Story**
> As a user who cares about consistent learning, I want to see my streak prominently, receive an in-app nudge if I have not learned today and my streak is at risk, and feel genuine satisfaction when I maintain it — so that daily use becomes a small personal commitment rather than an afterthought.

**Acceptance Criteria**
- The sidebar displays the streak count at all times, not only inside Learn mode (currently the `StatsBar` component is only rendered within the Learn page sidebar).
- On app open, if `user_stats.streak > 0` AND the user has not yet had a session today (no `learn_sessions` row with today's date), a non-blocking banner appears at the top of the Home feed: "Your N-day streak is at risk. Learn something today to keep it."
- Banner is dismissible per session (disappears for the rest of the current app session if closed).
- Banner auto-dismisses when the user starts a learn session (the `record_activity()` call on `UserStats` already updates the streak; invalidate the `learn-stats` query on session start).
- Streak milestone toasts: on reaching 3 / 7 / 14 / 30 days, show a branded toast with the badge label (the `7_day_streak` badge already exists; add corresponding milestones for 3, 14, 30).
- OS-level notification (via Electron's `new Notification()` API, gated on user permission granted in Settings) fires at 19:00 local time if the user has not learned that day and has a streak > 0. Message: "Your N-day streak ends in a few hours. Quick lesson?" — not sent if the app session is currently active.

**Effort:** M  
**Impact:** High  
**Notes:** The streak data already exists. The gap is: (a) global visibility of the streak, (b) the at-risk trigger, and (c) an OS nudge.

---

### Priority 4 — Smart Recommendations from KB

**User Story**
> As a user with documents in my knowledge base, I want Knovex to suggest specific topics to learn from those documents — based on what I have not covered yet or what is most central to the document — so that my library actively teaches me rather than just storing things.

**Acceptance Criteria**
- A new backend endpoint `GET /api/learn/recommendations` returns up to 5 topic suggestions, each with: `topic` (string), `source_type` (`kb_file`), `source_ref` (file_id), `kb_id`, `reason` (short string: "you haven't learned from this file yet" / "central concept in your most-used KB").
- Recommendation logic (server-side, no LLM call for generation, only heuristic):
  1. Files in any KB with `status = 'ready'` that have no `learn_sessions` with `source_type = 'kb_file'` and `source_ref = file_id` → "not yet learned from."
  2. Files touched by the most recent chat sessions (cross-reference `chat_messages` sources) → "currently active in your thinking."
  3. KB files with `learn_sessions` older than 14 days → "could use a refresher."
- Recommendations are cached for 4 hours (SQLite timestamp on the response object, or simple TTL on the React Query `staleTime`).
- Clicking a recommendation opens Learn mode with `sourceMode = 'kb'`, pre-selected KB and file, and `format = 'guided'`.
- Recommendations appear in the Home feed (Priority 1) AND as a "From your library" section on the Learn page empty state.
- If the user has no KB files, the section is hidden.

**Effort:** M  
**Impact:** High  
**Notes:** This closes the gap between the KB (passive storage) and Learn (active engagement). The data to drive it already exists; this is entirely heuristic — no LLM call needed for recommendations.

---

### Priority 5 — Daily Challenge

**User Story**
> As a regular user, I want a featured learning challenge each day — a specific topic with a bonus XP reward — so that I have a concrete goal that refreshes every 24 hours and gives me a reason to open the app even when I have no specific task.

**Acceptance Criteria**
- A new backend endpoint `GET /api/learn/daily-challenge` returns: `topic` (string), `format` (one of `quiz | guided | animated`), `difficulty`, `xp_multiplier` (2×), `expires_at` (end of the current calendar day, local timezone).
- The daily challenge topic is deterministically derived from the current date (so all app instances see the same challenge) using a pre-seeded list of 365 curated topics spanning science, history, philosophy, technology, mathematics, and current events. Seed the list in `backend/core/learn_service.py` as a constant.
- If the user already has a `learn_session` today with `topic` matching the challenge topic AND `status = 'ready'`, the challenge card shows "Completed" and the XP multiplier was already applied.
- XP multiplier: sessions whose topic and date match the daily challenge award `xp_earned * 2` (modify `LearnService.stream_session` to check this condition before calling `stats.add_xp`).
- Challenge displays prominently on the Home feed (Priority 1) and as a persistent pill in the Learn page header.
- Challenge is dismissible per day (stored in `user_stats` or a separate `dismissed_challenges` table).

**Effort:** M  
**Impact:** Med  
**Notes:** A curated topic list avoids LLM calls for challenge generation, keeping this deterministic and fast. The 2× XP multiplier leverages the existing XP system.

---

### Priority 6 — Achievements Gallery

**User Story**
> As a user who has been learning consistently, I want to see all the badges I have earned and the ones I am working toward — with clear criteria — so that I have a tangible sense of progress and goals to pursue.

**Acceptance Criteria**
- A new "Achievements" section on the Progress page (below the velocity chart) shows a grid of all badge types defined in `BADGE_LABELS` in `frontend/src/pages/Learn/index.tsx` (currently 10 badges).
- Each badge tile shows: icon, label, description (criteria), and either "earned" (with date) or "locked" state.
- Locked badges show progress toward the next milestone where applicable: e.g., "Quiz Master — 7 / 10 quizzes completed."
- Progress data is derived from existing fields: total sessions by format (from `learn_sessions`), streak (from `user_stats`), XP level (from `user_stats`).
- Newly earned badges trigger a full-screen confetti overlay (brief, 2 seconds) the first time they are viewed, gated by a `seen_badge_intro` set in localStorage.
- The badge grid is also accessible via a "View all achievements" link from the `StatsBar` in Learn mode.

**Effort:** S  
**Impact:** Med  
**Notes:** All badge logic already exists in the backend (`award_badge`, `_check_badges` in `learn_service.py`). The gap is a dedicated display surface with progress indicators.

---

### Priority 7 — Contextual Nudges at Session End (Post-Answer in Chat)

**User Story**
> As a user who has just received a chat answer that references a document, I want a one-click prompt to "Turn this into a lesson" or "Add to review deck" — so that valuable insights from chat conversations flow into my learning loop without friction.

**Acceptance Criteria**
- Each assistant chat message in Chat page has a "Learn this" action in its action row (alongside existing Copy, Thumb up/down, Refresh actions).
- Clicking "Learn this" navigates to Learn mode with `topic` pre-populated from the chat message's first KB source citation title (or from the first sentence of the answer if no citations) and `sourceMode = 'topic'`. Uses the existing `?topic=` URL param already wired in `Learn/index.tsx`.
- If the message has at least one KB source citation, "Learn this" navigates with `sourceMode = 'kb'`, pre-selected `kbId` and `fileId` from the first citation.
- A secondary "Make flashcards" action (shown only when there are KB citations) navigates to Learn mode with `format = 'flashcard'` and the KB source pre-set.
- Both actions are icon buttons with tooltips; they do not interrupt the chat flow.

**Effort:** S  
**Impact:** Med  
**Notes:** The `?topic=` navigation already exists and is consumed by `Learn/index.tsx`. The Chat page already has the message action row structure. This is largely additive.

---

### Priority 8 — Smart Review Reminder (In-App)

**User Story**
> As a user who has rated flashcards in previous lessons, I want to see how many cards are due for review when I open the app — without having to navigate to the Review page — so that I do not let my spaced-repetition queue go stale.

**Acceptance Criteria**
- The Review sidebar nav item already shows the due count badge (`/api/learn/reviews/count`) — this exists. The gap: the Home feed (Priority 1) must also show the review card as the first item when `count > 0`.
- If the user has not visited the Review page in 3+ days AND `count >= 5`, the Home feed review card uses a higher-urgency visual treatment (amber border, fire icon) with copy: "N cards are overdue — your memory is fading without review."
- "Overdue" determination: `card_schedules.next_review_at < NOW() - 3 days`. Query this server-side and add an `overdue_count` field to `DueReviewCountResponse`.
- Clicking the Home feed review card navigates directly to `/review`.

**Effort:** S  
**Impact:** Med  
**Notes:** The Review page and SM-2 backend are fully implemented. This is a surface-level change that makes the existing mechanism visible from the Home feed.

---

### Priority 9 — Weekly Progress Summary

**User Story**
> As a consistent user, I want a brief summary at the start of each week showing what I learned last week — topics covered, XP earned, streak status, and what to focus on this week — so that I feel a sense of accomplishment and have direction.

**Acceptance Criteria**
- A "Weekly recap" card appears on the Home feed every Monday (or first app open of the new week).
- Card content: last week's session count, XP earned, formats used, longest day streak, and top 3 topics.
- Card also surfaces the single most-recommended topic for the week (from Smart Recommendations, Priority 4).
- All data is derived locally from `learn_sessions` grouped by ISO week; no LLM call required.
- Card is dismissible. Once dismissed, it does not reappear until the next Monday.
- Dismissed state stored in localStorage keyed by ISO week number.

**Effort:** S  
**Impact:** Low–Med  
**Notes:** Purely a frontend aggregation; all data exists in SQLite. Low risk, good for "closing the loop" on the previous week and priming the next.

---

### Priority 10 — OS Notification Permission & Nudge System

**User Story**
> As a user who wants to build a learning habit, I want Knovex to optionally send me a brief daily notification if I have not learned that day — so that the app can prompt me even when it is not open.

**Acceptance Criteria**
- First time a user completes a learn session, a permission prompt appears: "Allow Knovex to remind you to learn each day?" (Yes / Not now). Stored in `settings`.
- If granted, Electron schedules a daily check at 19:00 local time using `setInterval` (app must be running). A notification fires if: (a) no learn session today and (b) user has streak > 0 OR has completed at least 3 sessions total.
- Notification text variants: "Your N-day streak ends tonight." / "You haven't learned today. Quick 5-minute lesson?" / "7 flashcards due for review."
- Clicking the notification brings the app window to the foreground (Electron's `win.show()` + `win.focus()`).
- Permission can be revoked in Settings > App Settings.
- On Windows, notifications are OS toast notifications via Electron's `new Notification()`.

**Effort:** M  
**Impact:** Med  
**Notes:** Electron's notification API is already available in `desktop/main.js`. The trigger logic is straightforward using the existing stats. This is the only feature that reaches the user when the app is closed (via Electron system tray — already implemented).

---

## 5. Phased Rollout

### Phase MVP — Habit Foundation (v0.14)

Ship these together; they form a complete loop even on their own.

| # | Feature | Effort | Why first |
|---|---------|--------|-----------|
| 2 | Post-lesson next-action hook | S | Highest-leverage, lowest effort. Uses existing suggestions. Directly extends the current session rather than requiring a new app-open. |
| 1 | Home / For You feed | M | Converts every app open into a prompted action. Requires Priority 4 data (recommendations) to be most useful, but works without it using sessions and review count. |
| 8 | Smart review reminder (in-app) | S | The review queue already works; this just makes it visible from Home. Lowest-risk item. |
| 3 | Streak at-risk banner | M | Leverages existing streak logic. High psychological impact for users who already have a streak. |

**MVP acceptance gate:** A user who opens the app on day 2 sees: (a) their due review count, (b) an option to continue yesterday's lesson, (c) their streak status, and (d) the post-lesson next-action chips after finishing a lesson.

### Phase v2 — Depth & Discovery (v0.15)

| # | Feature | Effort |
|---|---------|--------|
| 4 | Smart KB recommendations | M |
| 5 | Daily challenge | M |
| 6 | Achievements gallery | S |
| 7 | Chat → Learn bridge | S |

### Phase v3 — Proactive Reach (v0.16)

| # | Feature | Effort |
|---|---------|--------|
| 9 | Weekly progress summary | S |
| 10 | OS notification nudge | M |

---

## 6. The ONE Feature to Ship First

**Post-lesson next-action hook (Priority 2).**

Reason: It has the highest immediate impact per line of code written. The engagement problem is not that users never open the app — it is that each session is self-contained with no bridge to the next one. The post-lesson hook installs that bridge at the exact moment of highest motivation: right after the user has just learned something and the topic is live in their mind. The backend already generates suggestions; the frontend already has the continuation chip logic and the `handleGenerate(overrideFormat)` path. This is largely a visual re-arrangement — moving the suggestions from inside a history sidebar into a first-class post-lesson section. Estimated engineering effort: 1 day. Retention impact: directly increases continuation rate (the metric that compounds into sessions/week).

---

## Appendix — Mapping to Existing Code

| PRD feature | Existing code hooks |
|-------------|---------------------|
| Home feed review card | `GET /api/learn/reviews/count` → `learnApi.getDueReviewCount()` |
| Post-lesson suggestions | `LearnSuggestion[]` SSE event, `NEXT_KIND_LABEL/COLOR` constants, `handleGenerate(overrideFormat)` |
| Streak at-risk banner | `UserStats.streak`, `UserStats.last_activity`, `GET /api/learn/stats` |
| KB recommendations | `learn_sessions.source_ref`, `file_records` table, `kb_repository` |
| Daily challenge XP multiplier | `LearnService.stream_session`, `UserStats.add_xp` |
| Achievements gallery | `UserStats.badges`, `award_badge()`, `BADGE_LABELS` constant |
| Chat → Learn bridge | `?topic=` URL param in `Learn/index.tsx`, `SourceCitation.kb_id` / `file_id` |
| OS notification | `desktop/main.js` (Electron), `new Notification()` API, system tray already active |
| Streak global display | `StatsBar` component (currently Learn-only) — move to global sidebar or Layout |
