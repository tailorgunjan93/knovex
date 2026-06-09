"""
Spaced-Repetition Scheduler — Domain logic (lightweight SM-2)

Pure functions + a value object. No DB, no I/O. This is the maths behind the
"review due" return loop: each flashcard carries a schedule (ease factor,
interval, repetitions); grading it with one of the four Anki-style buttons
(again / hard / good / easy) advances or resets that schedule and computes the
next due date.

Why not the full SM-2 quality 0–5 scale: the UI only ever exposes four grades,
so we map them directly. The behaviour mirrors Anki's defaults closely enough to
feel familiar — new cards graduate at 1 day (good) / 4 days (easy); successful
reviews compound by the ease factor; a lapse ("again") resets progress and
nudges the ease factor down (never below the SM-2 floor of 1.3).

SRP: scheduling only. Persistence lives in the repository; XP/streaks in the
service. OCP: tweak the constants below without touching callers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

# The four grades the UI exposes (Anki-style), worst → best.
GRADES: tuple[str, ...] = ("again", "hard", "good", "easy")

DEFAULT_EASE_FACTOR = 2.5
MIN_EASE_FACTOR = 1.3

# Ease-factor deltas per grade (SM-2-style).
_EASE_DELTA = {"again": -0.20, "hard": -0.15, "good": 0.0, "easy": +0.15}

# Interval (days) when GRADUATING a new/relearning card (repetitions == 0).
_GRADUATING_INTERVAL = {"hard": 1, "good": 1, "easy": 4}
# Interval (days) on the SECOND successful review (repetitions == 1).
_SECOND_INTERVAL = {"hard": 3, "good": 6, "easy": 8}
# Multipliers applied to the ease-scaled interval from the 3rd review onward.
_HARD_MULTIPLIER = 1.2
_EASY_MULTIPLIER = 1.3


@dataclass
class CardSchedule:
    """
    The persistent spaced-repetition state for a single flashcard, identified by
    (session_id, card_index). `next_review_at` is None until first reviewed.
    """
    session_id: str
    card_index: int
    ease_factor: float = DEFAULT_EASE_FACTOR
    interval_days: int = 0
    repetitions: int = 0
    lapses: int = 0
    last_rating: str | None = None
    next_review_at: datetime | None = None
    last_reviewed_at: datetime | None = None


def new_schedule(session_id: str, card_index: int) -> CardSchedule:
    """A fresh, never-reviewed schedule for one card."""
    return CardSchedule(session_id=session_id, card_index=card_index)


def apply_grade(schedule: CardSchedule, grade: str, now: datetime) -> CardSchedule:
    """
    Return a NEW CardSchedule advanced by *grade* at time *now*.

    Pure: never mutates *schedule*. Raises ValueError for an unknown grade.
    """
    if grade not in GRADES:
        raise ValueError(f"Invalid grade '{grade}'. Must be one of: {', '.join(GRADES)}")

    ease = (schedule.ease_factor or DEFAULT_EASE_FACTOR) + _EASE_DELTA[grade]
    ease = max(MIN_EASE_FACTOR, round(ease, 2))

    reps = schedule.repetitions
    lapses = schedule.lapses

    if grade == "again":
        # Lapse: relearn soon, reset the streak, count the lapse.
        reps = 0
        lapses += 1
        interval = 1
    else:
        if reps == 0:
            interval = _GRADUATING_INTERVAL[grade]
        elif reps == 1:
            interval = _SECOND_INTERVAL[grade]
        else:
            prev = schedule.interval_days or 1
            interval = round(prev * ease)
            if grade == "hard":
                interval = max(1, round(prev * _HARD_MULTIPLIER))
            elif grade == "easy":
                interval = round(interval * _EASY_MULTIPLIER)
        reps += 1

    interval = max(1, int(interval))

    return CardSchedule(
        session_id=schedule.session_id,
        card_index=schedule.card_index,
        ease_factor=ease,
        interval_days=interval,
        repetitions=reps,
        lapses=lapses,
        last_rating=grade,
        next_review_at=now + timedelta(days=interval),
        last_reviewed_at=now,
    )
