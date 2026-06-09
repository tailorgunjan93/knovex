"""
SRS schedule persistence — REAL SQLite repository tests.

In-memory repo tests (test_learn.py / test_learn_api_integration.py) validate the
service logic, but they cannot catch a bug in the actual SQL: the srs_schedules
DDL, the ON CONFLICT(session_id, card_index) upsert, the next_review_at due
query, or the ON DELETE CASCADE. This file drives the production schema on a
temp-file SQLite backend so all of that is exercised end-to-end (CLAUDE.md
lesson #6: never let a mock validate an imagined API).
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from backend.core.domain.srs import CardSchedule, apply_grade, new_schedule
from backend.storage.database import SCHEMA_SQL
from backend.storage.repositories.learn_repository import SQLiteLearnRepository
from backend.storage.sqlite_backend import SQLiteBackend

NOW = datetime(2026, 6, 9, 12, 0, 0)


@pytest.fixture
async def repo(tmp_path):
    backend = SQLiteBackend(tmp_path / "srs.db")
    await backend.executescript(SCHEMA_SQL)
    # A flashcard session to satisfy the srs_schedules → learn_sessions FK.
    await backend.execute(
        "INSERT INTO learn_sessions (id, topic, format, source_type, difficulty, "
        "status, content, created_at) VALUES (?,?,?,?,?,?,?,?)",
        ("sess-1", "Bio", "flashcard", "topic", "intermediate", "ready",
         '{"cards": [{"front": "F", "back": "B", "hint": "H"}]}',
         "2026-06-01T00:00:00.000000"),
    )
    return SQLiteLearnRepository(backend=backend)


async def test_upsert_inserts_then_updates_same_row(repo):
    s = apply_grade(new_schedule("sess-1", 0), "good", NOW)
    await repo.save_card_schedule(s)
    loaded = await repo.get_card_schedule("sess-1", 0)
    assert loaded is not None
    assert loaded.repetitions == 1
    assert loaded.interval_days == 1

    # Second review of the SAME card must UPDATE, not insert a duplicate row.
    s2 = apply_grade(loaded, "good", NOW + timedelta(days=1))
    await repo.save_card_schedule(s2)
    loaded2 = await repo.get_card_schedule("sess-1", 0)
    assert loaded2.repetitions == 2
    assert loaded2.interval_days == 6
    # Only one row for this card.
    assert await repo.count_due_schedules(NOW + timedelta(days=400)) == 1


async def test_get_missing_schedule_returns_none(repo):
    assert await repo.get_card_schedule("sess-1", 5) is None


async def test_due_query_filters_and_orders_by_next_review(repo):
    # Card 0 due yesterday; card-less index 1 due tomorrow.
    await repo.save_card_schedule(CardSchedule(
        session_id="sess-1", card_index=0, repetitions=1, interval_days=1,
        next_review_at=NOW - timedelta(days=1), last_reviewed_at=NOW - timedelta(days=2),
    ))
    await repo.save_card_schedule(CardSchedule(
        session_id="sess-1", card_index=1, repetitions=1, interval_days=3,
        next_review_at=NOW + timedelta(days=1), last_reviewed_at=NOW,
    ))
    due = await repo.find_due_schedules(NOW, limit=10)
    assert [d.card_index for d in due] == [0]              # only the overdue one
    assert await repo.count_due_schedules(NOW) == 1

    # Once "now" advances past both, ordering is soonest-due first.
    due_later = await repo.find_due_schedules(NOW + timedelta(days=2), limit=10)
    assert [d.card_index for d in due_later] == [0, 1]


async def test_round_trip_preserves_all_fields(repo):
    s = CardSchedule(
        session_id="sess-1", card_index=0, ease_factor=2.35, interval_days=12,
        repetitions=4, lapses=2, last_rating="hard",
        next_review_at=NOW + timedelta(days=12), last_reviewed_at=NOW,
    )
    await repo.save_card_schedule(s)
    loaded = await repo.get_card_schedule("sess-1", 0)
    assert loaded.ease_factor == pytest.approx(2.35)
    assert loaded.interval_days == 12
    assert loaded.repetitions == 4
    assert loaded.lapses == 2
    assert loaded.last_rating == "hard"


async def test_deleting_session_cascades_to_schedules(repo):
    await repo.save_card_schedule(CardSchedule(
        session_id="sess-1", card_index=0, repetitions=1, interval_days=1,
        next_review_at=NOW - timedelta(days=1), last_reviewed_at=NOW - timedelta(days=2),
    ))
    assert await repo.count_due_schedules(NOW) == 1
    await repo.delete("sess-1")
    # FK ON DELETE CASCADE must remove the orphaned schedule.
    assert await repo.count_due_schedules(NOW) == 0
