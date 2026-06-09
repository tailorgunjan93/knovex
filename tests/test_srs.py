"""
SRS scheduler (domain) — lightweight SM-2 spaced repetition.

Pure function tests: no DB, no service. Proves the scheduling maths that the
"review due" return loop relies on — intervals compound on success, reset on a
lapse, and the ease factor stays in the SM-2 band.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from backend.core.domain.srs import (
    GRADES,
    MIN_EASE_FACTOR,
    CardSchedule,
    apply_grade,
    new_schedule,
)

NOW = datetime(2026, 6, 9, 12, 0, 0)


def _grade(schedule: CardSchedule, grade: str, now: datetime = NOW) -> CardSchedule:
    return apply_grade(schedule, grade, now)


class TestNewCardGraduation:
    def test_good_graduates_to_one_day(self):
        s = _grade(new_schedule("sess", 0), "good")
        assert s.repetitions == 1
        assert s.interval_days == 1
        assert s.next_review_at == NOW + timedelta(days=1)
        assert s.last_rating == "good"

    def test_easy_jumps_further_than_good_on_first_sight(self):
        good = _grade(new_schedule("s", 0), "good")
        easy = _grade(new_schedule("s", 0), "easy")
        assert easy.interval_days > good.interval_days   # Anki-like "easy interval"

    def test_hard_stays_short_on_first_sight(self):
        s = _grade(new_schedule("s", 0), "hard")
        assert s.interval_days == 1
        assert s.repetitions == 1


class TestCompounding:
    def test_two_goods_reach_six_days(self):
        s = _grade(new_schedule("s", 0), "good")          # rep 1 → 1d
        s = _grade(s, "good", NOW + timedelta(days=1))    # rep 2 → 6d
        assert s.repetitions == 2
        assert s.interval_days == 6

    def test_third_good_multiplies_by_ease(self):
        s = new_schedule("s", 0)
        for _ in range(3):
            s = _grade(s, "good")
        # rep3 interval = round(6 * ease_factor) with ease ~2.5 → 15
        assert s.repetitions == 3
        assert s.interval_days == round(6 * s.ease_factor)
        assert s.interval_days > 6

    def test_easy_interval_exceeds_good_at_same_step(self):
        base = _grade(_grade(new_schedule("s", 0), "good"), "good")  # rep2, 6d
        good = _grade(base, "good")
        easy = _grade(base, "easy")
        assert easy.interval_days > good.interval_days


class TestLapse:
    def test_again_resets_repetitions_and_interval(self):
        s = new_schedule("s", 0)
        for _ in range(3):
            s = _grade(s, "good")     # mature it
        lapsed = _grade(s, "again")
        assert lapsed.repetitions == 0
        assert lapsed.interval_days == 1
        assert lapsed.lapses == s.lapses + 1
        assert lapsed.next_review_at == NOW + timedelta(days=1)

    def test_again_lowers_ease_factor(self):
        s = _grade(new_schedule("s", 0), "good")
        lapsed = _grade(s, "again")
        assert lapsed.ease_factor < s.ease_factor


class TestEaseFactorBand:
    def test_ease_never_drops_below_floor(self):
        s = new_schedule("s", 0)
        for _ in range(20):
            s = _grade(s, "again")
        assert s.ease_factor >= MIN_EASE_FACTOR

    def test_easy_raises_ease_hard_lowers_it(self):
        start = _grade(new_schedule("s", 0), "good").ease_factor
        easier = _grade(_grade(new_schedule("s", 0), "good"), "easy").ease_factor
        harder = _grade(_grade(new_schedule("s", 0), "good"), "hard").ease_factor
        assert easier > start
        assert harder < start


class TestValidation:
    def test_invalid_grade_raises(self):
        with pytest.raises(ValueError):
            _grade(new_schedule("s", 0), "perfect")

    def test_grades_constant_is_the_four_anki_buttons(self):
        assert set(GRADES) == {"again", "hard", "good", "easy"}

    def test_new_schedule_is_due_immediately_unreviewed(self):
        s = new_schedule("s", 3)
        assert s.repetitions == 0
        assert s.interval_days == 0
        assert s.next_review_at is None
        assert s.card_index == 3
