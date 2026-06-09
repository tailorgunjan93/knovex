"""
Learn API — Integration Tests
══════════════════════════════════════════════════════════════════════════════
HOW THESE DIFFER FROM UNIT TESTS
─────────────────────────────────
Unit tests  (test_learn.py)       → test LearnService in isolation; no HTTP
Integration tests (this file)     → mount the real FastAPI router, send real
                                    HTTP requests via httpx + ASGI transport,
                                    assert HTTP status codes, response shapes,
                                    headers, and SSE wire format.
                                    NO live server, NO network I/O.

SERVERS NEEDED
──────────────
None. httpx.AsyncClient(transport=ASGITransport(app)) talks directly to the
ASGI app in-process. FastAPI dependency_overrides replace the real
LearnService and SettingsService with lightweight stubs.

COVERAGE
────────
  PERSPECTIVE 1 — UI/UX Expert (HTTP contract)
  • Every endpoint returns the documented HTTP status code
  • JSON response matches the documented schema fields
  • SSE stream uses Content-Type: text/event-stream
  • 404 returns {"detail": ...} JSON
  • 422 returns {"detail": ...} for validation errors

  PERSPECTIVE 2 — Business Analyst (functional HTTP flows)
  • POST /stream → tokens arrive, done event contains session_id + xp_earned
  • POST /stream guided format → session saved with status=ready
  • GET  /sessions returns list including the just-created session
  • GET  /sessions/{id} returns the correct session
  • DELETE /sessions/{id} → 204, session no longer in list
  • POST /quiz/answer correct → correct=true, xp_earned > 0
  • POST /quiz/answer wrong  → correct=false, xp_earned == 0
  • POST /quiz/answer out-of-range → 400
  • POST /flashcard/review again → next_review_at ≈ 1 day
  • GET  /stats returns xp / level / streak / badges
  • Invalid format → 422
  • Invalid difficulty → 422
  • Missing session on GET → 404
  • Missing session on quiz answer → 404
══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import get_args
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.api.learn import router as learn_router
from backend.core.dependencies import get_learn_service, get_settings_service
from backend.core.domain.learn import VALID_FORMATS, LearnSession, UserStats
from backend.core.domain.srs import CardSchedule
from backend.core.learn_service import LearnService
from backend.models.schemas import LearnSessionCreate
from backend.storage.repositories.learn_repository import ILearnRepository

# ─────────────────────────────────────────────────────────────────────────────
# In-memory repository (same stub pattern as unit tests)
# ─────────────────────────────────────────────────────────────────────────────

class InMemoryLearnRepo(ILearnRepository):
    def __init__(self) -> None:
        super().__init__(backend=None)  # type: ignore[arg-type]
        self._sessions: dict[str, LearnSession] = {}
        self._stats = UserStats()
        self._schedules: dict[tuple[str, int], CardSchedule] = {}

    async def find_by_id(self, entity_id: str) -> LearnSession | None:
        return self._sessions.get(entity_id)

    async def find_all(self) -> list[LearnSession]:
        return list(self._sessions.values())

    async def find_sessions(self, limit: int = 50) -> list[LearnSession]:
        return sorted(self._sessions.values(), key=lambda s: s.created_at, reverse=True)[:limit]

    async def save(self, session: LearnSession) -> LearnSession:
        self._sessions[session.id] = session
        return session

    async def delete(self, entity_id: str) -> None:
        self._sessions.pop(entity_id, None)

    async def exists(self, entity_id: str) -> bool:
        return entity_id in self._sessions

    async def get_user_stats(self) -> UserStats:
        return self._stats

    async def save_user_stats(self, stats: UserStats) -> None:
        self._stats = stats

    async def get_card_schedule(self, session_id: str, card_index: int) -> CardSchedule | None:
        return self._schedules.get((session_id, card_index))

    async def save_card_schedule(self, schedule: CardSchedule) -> None:
        self._schedules[(schedule.session_id, schedule.card_index)] = schedule

    async def find_due_schedules(self, now: datetime, limit: int = 50) -> list[CardSchedule]:
        due = [s for s in self._schedules.values() if s.next_review_at and s.next_review_at <= now]
        due.sort(key=lambda s: s.next_review_at)
        return due[:limit]

    async def count_due_schedules(self, now: datetime) -> int:
        return sum(1 for s in self._schedules.values() if s.next_review_at and s.next_review_at <= now)


# ─────────────────────────────────────────────────────────────────────────────
# Mock LLM builder
# ─────────────────────────────────────────────────────────────────────────────

def _mock_llm(
    *,
    complete_json: dict | None = None,
    tokens: list[str] | None = None,
    fail: bool = False,
) -> MagicMock:
    llm = MagicMock()

    if fail:
        async def _fail_stream(*a, **kw):
            raise RuntimeError("LLM unavailable")
            yield  # make async generator
        llm.stream = _fail_stream
        llm.complete = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    else:
        _tokens = tokens or ["Hello", " World"]

        async def _gen(*a, **kw):
            for t in _tokens:
                yield t

        llm.stream = _gen
        if complete_json is not None:
            llm.complete = AsyncMock(return_value=json.dumps(complete_json))
        else:
            llm.complete = AsyncMock(return_value="Generated content")

    return llm


# ─────────────────────────────────────────────────────────────────────────────
# Minimal test app (no lifespan — avoids DB/watcher setup)
# ─────────────────────────────────────────────────────────────────────────────

def _make_app() -> FastAPI:
    """Return a bare FastAPI app with only the learn router mounted."""
    app = FastAPI()
    app.include_router(learn_router, prefix="/api")
    return app


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_QUIZ = {
    "questions": [{
        "q": "What is 2+2?",
        "options": ["A. 3", "B. 4", "C. 5", "D. 6"],
        "correct": 1,
        "explanation": "Basic arithmetic.",
    }]
}

SAMPLE_GUIDED = {
    "topic": "Photosynthesis",
    "intro": "Plants are solar-powered chemical factories.",
    "total_steps": 1,
    "steps": [{
        "step": 1,
        "title": "Light Reactions",
        "explanation": "Plants capture sunlight in the chloroplasts.",
        "example": "Leaves turning toward the sun.",
        "analogy": "Like a solar panel charging a battery.",
        "key_insight": "Light energy becomes chemical energy.",
        "check_in": "Where does the light reaction occur?",
        "quiz_check": {
            "question": "What do plants convert light into?",
            "options": ["Heat", "Chemical energy", "Sound"],
            "correct": 1,
            "feedback_correct": "Exactly right!",
            "feedback_wrong": "Not quite.",
        },
    }],
}

SAMPLE_FLASHCARD = {
    "cards": [{"front": "What is ATP?", "back": "Energy currency of the cell", "hint": "Energy"}]
}

SAMPLE_ANIMATED = {
    "topic": "Circular motion",
    "title": "Circular Motion",
    "scenes": [
        {
            "narration": "An object moving in a circle is pulled toward the centre.",
            "duration": 5,
            "elements": [
                {"type": "text", "text": "Circular Motion", "x": 50, "y": 12, "size": "title"},
                {"type": "circle", "x": 50, "y": 55, "r": 20},
                {"type": "arrow", "x1": 70, "y1": 55, "x2": 50, "y2": 55, "enter": "draw"},
            ],
        }
    ],
}


def _mock_settings_svc() -> MagicMock:
    """Return a mock SettingsService whose .get() resolves with minimal LLM config."""
    svc = MagicMock()
    svc.get = AsyncMock(return_value=MagicMock(
        llm=MagicMock(
            provider="openai", model="gpt-4o-mini", api_key="sk-test",
            base_url="", aws_region="us-east-1",
            aws_access_key_id="", aws_secret_access_key="",
        )
    ))
    return svc


async def _make_client(
    *,
    complete_json: dict | None = None,
    tokens: list[str] | None = None,
    fail: bool = False,
    pre_seeded_sessions: list[LearnSession] | None = None,
) -> tuple[AsyncClient, InMemoryLearnRepo]:
    """
    Create an httpx AsyncClient wired to the test FastAPI app.

    Returns (client, repo) so tests can inspect repo state directly.
    """
    repo = InMemoryLearnRepo()
    if pre_seeded_sessions:
        for s in pre_seeded_sessions:
            repo._sessions[s.id] = s

    svc = LearnService(
        learn_repo=repo,
        llm_svc=_mock_llm(complete_json=complete_json, tokens=tokens, fail=fail),
    )
    app = _make_app()
    app.dependency_overrides[get_learn_service]  = lambda: svc
    app.dependency_overrides[get_settings_service] = lambda: _mock_settings_svc()

    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return client, repo


def _parse_sse(body: str) -> list[dict]:
    """Parse raw SSE body text into a list of parsed event dicts."""
    events = []
    import contextlib
    for line in body.splitlines():
        if line.startswith("data: "):
            with contextlib.suppress(json.JSONDecodeError):
                events.append(json.loads(line[6:]))
    return events


def _seed_quiz_session(repo: InMemoryLearnRepo) -> LearnSession:
    s = LearnSession(id=str(uuid.uuid4()), topic="Math", format="quiz",
                     source_type="topic", difficulty="beginner")
    s.mark_ready(SAMPLE_QUIZ)
    repo._sessions[s.id] = s
    return s


def _seed_flashcard_session(repo: InMemoryLearnRepo) -> LearnSession:
    s = LearnSession(id=str(uuid.uuid4()), topic="Bio", format="flashcard",
                     source_type="topic", difficulty="intermediate")
    s.mark_ready(SAMPLE_FLASHCARD)
    repo._sessions[s.id] = s
    return s


# ══════════════════════════════════════════════════════════════════════════════
#  PERSPECTIVE 1 — UI/UX Expert: HTTP contract & response shapes
# ══════════════════════════════════════════════════════════════════════════════

class TestHTTPContract:
    """Verify status codes, content-types, and schema shapes."""

    async def test_get_stats_returns_200(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        assert r.status_code == 200

    async def test_get_stats_schema_has_required_fields(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        body = r.json()
        assert "xp"           in body
        assert "level"        in body
        assert "streak"       in body
        assert "badges"       in body
        assert "last_activity" in body

    async def test_list_sessions_returns_200_and_array(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/sessions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_get_session_not_found_returns_404(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/sessions/nonexistent-id")
        assert r.status_code == 404
        assert "detail" in r.json()

    async def test_delete_session_not_found_returns_204(self):
        """DELETE is idempotent — deleting a non-existent session still returns 204."""
        client, _ = await _make_client()
        async with client:
            r = await client.delete("/api/learn/sessions/ghost-id")
        assert r.status_code == 204

    async def test_stream_returns_event_stream_content_type(self):
        client, _ = await _make_client(tokens=["Hello"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Test", "format": "story", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")

    async def test_stream_no_cache_header_set(self):
        client, _ = await _make_client(tokens=["Hello"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Test", "format": "story", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        assert r.headers.get("cache-control") == "no-cache"

    async def test_stream_invalid_format_returns_422(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Test", "format": "nonsense", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        assert r.status_code == 422
        assert "detail" in r.json()

    async def test_stream_invalid_difficulty_returns_422(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Test", "format": "quiz", "source_type": "topic",
                "difficulty": "ultra-hard", "source_ref": None, "context_text": "",
            })
        assert r.status_code == 422

    async def test_stream_blank_topic_returns_422(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "", "format": "quiz", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        assert r.status_code == 422

    async def test_quiz_answer_missing_session_returns_404(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post("/api/learn/sessions/no-such-id/quiz/answer",
                                  json={"question_index": 0, "answer": "B"})
        assert r.status_code == 404

    async def test_quiz_answer_out_of_range_returns_400(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{session.id}/quiz/answer",
                                  json={"question_index": 99, "answer": "B. 4"})
        assert r.status_code == 400

    async def test_quiz_answer_response_schema(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{session.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "B. 4"})
        assert r.status_code == 200
        body = r.json()
        for field in ["correct", "correct_answer", "explanation", "xp_earned", "session_score"]:
            assert field in body, f"Missing field: {field}"

    async def test_flashcard_review_response_schema(self):
        client, repo = await _make_client()
        session = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(
                f"/api/learn/sessions/{session.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "good"},
            )
        assert r.status_code == 200
        body = r.json()
        for field in ["card_index", "ease_rating", "next_review_at"]:
            assert field in body, f"Missing field: {field}"

    async def test_get_session_response_schema(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.get(f"/api/learn/sessions/{session.id}")
        assert r.status_code == 200
        body = r.json()
        for field in ["id", "topic", "format", "source_type", "difficulty", "status", "content"]:
            assert field in body


# ══════════════════════════════════════════════════════════════════════════════
#  PERSPECTIVE 2 — Business Analyst: functional HTTP flows
# ══════════════════════════════════════════════════════════════════════════════

class TestSSEStreaming:
    """POST /api/learn/sessions/stream — wire format and session persistence."""

    async def test_text_format_emits_token_events(self):
        client, _ = await _make_client(tokens=["Once ", "upon ", "a time"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Fairy tales", "format": "story", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        token_events = [e for e in events if e["type"] == "token"]
        assert len(token_events) >= 1
        assert all("content" in e for e in token_events)

    async def test_stream_ends_with_done_event(self):
        client, _ = await _make_client(tokens=["Hello"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Gravity", "format": "eli5", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        done = done_events[0]
        assert "session_id" in done
        assert "xp_earned"  in done
        assert isinstance(done["new_badges"], list)

    async def test_done_event_session_id_is_valid_uuid(self):
        client, _ = await _make_client(tokens=["text"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "DNA", "format": "speedlearn", "source_type": "topic",
                "difficulty": "expert", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        done = next(e for e in events if e["type"] == "done")
        # Should be a valid UUID
        uuid.UUID(done["session_id"])  # raises ValueError if invalid

    async def test_quiz_format_done_event_has_xp(self):
        client, _ = await _make_client(complete_json=SAMPLE_QUIZ)
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Math", "format": "quiz", "source_type": "topic",
                "difficulty": "intermediate", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        done = next(e for e in events if e["type"] == "done")
        assert done["xp_earned"] > 0

    async def test_guided_format_streams_and_saves(self):
        client, repo = await _make_client(complete_json=SAMPLE_GUIDED)
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Photosynthesis", "format": "guided", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        done = next(e for e in events if e["type"] == "done")
        session = await repo.find_by_id(done["session_id"])
        assert session is not None
        assert session.status == "ready"
        assert session.format == "guided"
        assert session.content is not None
        assert "steps" in session.content

    async def test_animated_format_streams_and_saves(self):
        """
        Regression for v0.12.0 "network error" on Learn → Animated.

        'animated' is accepted by the LearnSessionCreate schema Literal, so the
        request passes pydantic and the 200 SSE response begins — but the format
        was MISSING from domain VALID_FORMATS, so stream_session() raised
        ValueError on first iteration, OUTSIDE its try/except, after the response
        had already started. Starlette then aborted the connection mid-stream and
        the renderer's fetch surfaced it as "network error" (no error event, no
        done event). This test fails (no done event) until 'animated' is added to
        VALID_FORMATS.
        """
        client, repo = await _make_client(complete_json=SAMPLE_ANIMATED)
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Circular motion", "format": "animated", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        assert r.status_code == 200
        events = _parse_sse(r.text)
        done_events = [e for e in events if e["type"] == "done"]
        error_events = [e for e in events if e["type"] == "error"]
        assert not error_events, f"animated emitted an error event: {error_events}"
        assert len(done_events) == 1, "animated stream produced no done event"
        session = await repo.find_by_id(done_events[0]["session_id"])
        assert session is not None
        assert session.status == "ready"
        assert session.format == "animated"
        assert session.content is not None
        assert "scenes" in session.content

    async def test_llm_error_emits_error_event(self):
        client, _ = await _make_client(fail=True)
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Test", "format": "quiz", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        assert "error" in error_events[0]

    async def test_first_session_earns_first_step_badge(self):
        client, _ = await _make_client(tokens=["token"])
        async with client:
            r = await client.post("/api/learn/sessions/stream", json={
                "topic": "First", "format": "eli5", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
        events = _parse_sse(r.text)
        done = next(e for e in events if e["type"] == "done")
        assert "first_step" in done["new_badges"]


class TestSessionCRUD:
    """GET /sessions, GET /sessions/{id}, DELETE /sessions/{id}"""

    async def test_list_sessions_empty_initially(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/sessions")
        assert r.json() == []

    async def test_list_sessions_includes_created_session(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.get("/api/learn/sessions")
        ids = [s["id"] for s in r.json()]
        assert session.id in ids

    async def test_get_session_returns_correct_topic(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.get(f"/api/learn/sessions/{session.id}")
        assert r.json()["topic"] == "Math"

    async def test_get_session_returns_correct_format(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.get(f"/api/learn/sessions/{session.id}")
        assert r.json()["format"] == "quiz"

    async def test_get_session_status_is_ready(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.get(f"/api/learn/sessions/{session.id}")
        assert r.json()["status"] == "ready"

    async def test_delete_session_returns_204(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            r = await client.delete(f"/api/learn/sessions/{session.id}")
        assert r.status_code == 204

    async def test_deleted_session_not_in_list(self):
        client, repo = await _make_client()
        session = _seed_quiz_session(repo)
        async with client:
            await client.delete(f"/api/learn/sessions/{session.id}")
            r = await client.get("/api/learn/sessions")
        ids = [s["id"] for s in r.json()]
        assert session.id not in ids

    async def test_stream_then_get_session_is_consistent(self):
        """Session created via stream is retrievable by ID."""
        client, repo = await _make_client(complete_json=SAMPLE_QUIZ)
        async with client:
            stream_r = await client.post("/api/learn/sessions/stream", json={
                "topic": "Algebra", "format": "quiz", "source_type": "topic",
                "difficulty": "intermediate", "source_ref": None, "context_text": "",
            })
            events = _parse_sse(stream_r.text)
            session_id = next(e for e in events if e["type"] == "done")["session_id"]

            get_r = await client.get(f"/api/learn/sessions/{session_id}")
        assert get_r.status_code == 200
        assert get_r.json()["topic"] == "Algebra"


class TestQuizAnswerEndpoint:
    """POST /api/learn/sessions/{id}/quiz/answer"""

    async def test_correct_answer_correct_field_true(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "B. 4"})
        assert r.json()["correct"] is True

    async def test_wrong_answer_correct_field_false(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "A. 3"})
        assert r.json()["correct"] is False

    async def test_correct_answer_earns_xp(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "B. 4"})
        assert r.json()["xp_earned"] > 0

    async def test_wrong_answer_earns_zero_xp(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "A. 3"})
        assert r.json()["xp_earned"] == 0

    async def test_correct_answer_text_returned(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "A. 3"})
        assert r.json()["correct_answer"] == "B. 4"

    async def test_explanation_returned(self):
        client, repo = await _make_client()
        s = _seed_quiz_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "B. 4"})
        assert "arithmetic" in r.json()["explanation"].lower()

    async def test_non_quiz_session_returns_400(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(f"/api/learn/sessions/{s.id}/quiz/answer",
                                  json={"question_index": 0, "answer": "A"})
        assert r.status_code == 400


class TestFlashcardReviewEndpoint:
    """POST /api/learn/sessions/{id}/flashcard/review"""

    async def test_good_rating_returns_200(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "good"},
            )
        assert r.status_code == 200

    async def test_again_rating_next_review_is_1_day(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "again"},
            )
        body = r.json()
        next_review = datetime.fromisoformat(body["next_review_at"])
        delta_seconds = (next_review - datetime.utcnow()).total_seconds()
        # Should be ~1 day (86400s) ± 120s tolerance
        assert abs(delta_seconds - 86400) < 120

    async def test_easy_rating_graduates_to_4_days(self):
        # SM-2 (Anki-like): a NEW card graded 'easy' graduates at 4 days.
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "easy"},
            )
        body = r.json()
        next_review = datetime.fromisoformat(body["next_review_at"])
        delta_seconds = (next_review - datetime.utcnow()).total_seconds()
        assert abs(delta_seconds - 4 * 86400) < 120

    async def test_good_rating_awards_xp(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        before_xp = repo._stats.xp
        async with client:
            await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "good"},
            )
        assert repo._stats.xp > before_xp

    async def test_invalid_ease_rating_returns_400(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            r = await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "perfect"},
            )
        assert r.status_code == 400

    async def test_missing_session_returns_404(self):
        client, _ = await _make_client()
        async with client:
            r = await client.post(
                "/api/learn/sessions/ghost/flashcard/review",
                params={"card_index": 0, "ease_rating": "good"},
            )
        assert r.status_code == 404


class TestReviewDueLoop:
    """GET /learn/reviews/due + /count — the spaced-repetition return loop."""

    def _seed_due_card(self, repo, session, card_index=0, days_overdue=1):
        """Persist a schedule whose next_review_at is in the past (→ due now)."""
        repo._schedules[(session.id, card_index)] = CardSchedule(
            session_id=session.id, card_index=card_index,
            ease_factor=2.5, interval_days=1, repetitions=1, lapses=0,
            last_rating="good",
            next_review_at=datetime.utcnow() - timedelta(days=days_overdue),
            last_reviewed_at=datetime.utcnow() - timedelta(days=days_overdue + 1),
        )

    async def test_count_zero_when_nothing_scheduled(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/reviews/count")
        assert r.status_code == 200
        assert r.json()["due"] == 0

    async def test_due_returns_seeded_card_with_content(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)   # SAMPLE_FLASHCARD: ATP card
        self._seed_due_card(repo, s)
        async with client:
            r = await client.get("/api/learn/reviews/due")
        assert r.status_code == 200
        body = r.json()
        assert body["count"] == 1
        card = body["cards"][0]
        assert card["session_id"] == s.id
        assert card["card_index"] == 0
        assert card["front"] == "What is ATP?"
        assert card["back"] == "Energy currency of the cell"
        assert card["topic"] == "Bio"

    async def test_count_reflects_due_schedule(self):
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        self._seed_due_card(repo, s)
        async with client:
            r = await client.get("/api/learn/reviews/count")
        assert r.json()["due"] == 1

    async def test_card_not_due_until_its_time(self):
        # A freshly-reviewed card schedules into the FUTURE → not due now.
        client, repo = await _make_client()
        s = _seed_flashcard_session(repo)
        async with client:
            await client.post(
                f"/api/learn/sessions/{s.id}/flashcard/review",
                params={"card_index": 0, "ease_rating": "good"},
            )
            r = await client.get("/api/learn/reviews/count")
        assert r.json()["due"] == 0

    async def test_due_skips_schedule_for_deleted_session(self):
        # A stale schedule whose session no longer exists must self-heal, not 500.
        client, repo = await _make_client()
        repo._schedules[("ghost-session", 0)] = CardSchedule(
            session_id="ghost-session", card_index=0,
            next_review_at=datetime.utcnow() - timedelta(days=1),
            last_reviewed_at=datetime.utcnow() - timedelta(days=2),
            repetitions=1, interval_days=1,
        )
        async with client:
            r = await client.get("/api/learn/reviews/due")
        assert r.status_code == 200
        assert r.json()["count"] == 0


class TestUserStatsEndpoint:
    """GET /api/learn/stats"""

    async def test_fresh_stats_xp_is_zero(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        assert r.json()["xp"] == 0

    async def test_fresh_stats_level_is_one(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        assert r.json()["level"] == 1

    async def test_fresh_stats_streak_is_zero(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        assert r.json()["streak"] == 0

    async def test_fresh_stats_badges_is_empty_list(self):
        client, _ = await _make_client()
        async with client:
            r = await client.get("/api/learn/stats")
        assert r.json()["badges"] == []

    async def test_stats_xp_increases_after_completing_session(self):
        client, repo = await _make_client(tokens=["token"])
        async with client:
            await client.post("/api/learn/sessions/stream", json={
                "topic": "Quasars", "format": "eli5", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
            r = await client.get("/api/learn/stats")
        assert r.json()["xp"] > 0

    async def test_stats_badges_populated_after_first_session(self):
        client, repo = await _make_client(tokens=["token"])
        async with client:
            await client.post("/api/learn/sessions/stream", json={
                "topic": "Physics", "format": "story", "source_type": "topic",
                "difficulty": "beginner", "source_ref": None, "context_text": "",
            })
            r = await client.get("/api/learn/stats")
        assert "first_step" in r.json()["badges"]

    async def test_all_supported_formats_create_sessions(self):
        """Every supported format reaches the done event and creates a session."""
        formats = [
            ("quiz",       SAMPLE_QUIZ),
            ("flashcard",  SAMPLE_FLASHCARD),
            ("guided",     SAMPLE_GUIDED),
            ("animated",   SAMPLE_ANIMATED),
        ]
        for fmt, payload in formats:
            client, repo = await _make_client(complete_json=payload)
            async with client:
                r = await client.post("/api/learn/sessions/stream", json={
                    "topic": f"Test {fmt}", "format": fmt, "source_type": "topic",
                    "difficulty": "beginner", "source_ref": None, "context_text": "",
                })
            events = _parse_sse(r.text)
            done_events = [e for e in events if e["type"] == "done"]
            assert len(done_events) == 1, f"No done event for format={fmt}"
            session = await repo.find_by_id(done_events[0]["session_id"])
            assert session.status == "ready", f"Session not ready for format={fmt}"


# ══════════════════════════════════════════════════════════════════════════════
#  Drift guard — the two sources of truth for "valid format" must agree
# ══════════════════════════════════════════════════════════════════════════════

class TestFormatSourcesOfTruthAgree:
    """
    The API schema (LearnSessionCreate.format Literal) and the domain
    VALID_FORMATS frozenset are two independent allow-lists. If they drift, a
    format accepted by the schema but missing from VALID_FORMATS passes pydantic,
    starts a 200 SSE response, then raises ValueError mid-stream — surfacing in
    the UI as an unexplained "network error" (this is exactly how 'animated'
    broke in v0.12.0). Keeping them in lock-step makes that class of bug
    impossible.
    """

    @staticmethod
    def _schema_formats() -> set[str]:
        return set(get_args(LearnSessionCreate.model_fields["format"].annotation))

    def test_every_schema_format_is_a_valid_domain_format(self):
        missing = self._schema_formats() - set(VALID_FORMATS)
        assert not missing, (
            f"Formats accepted by the API schema but missing from domain "
            f"VALID_FORMATS: {sorted(missing)} — these would 200 then drop the "
            f"connection mid-stream ('network error')."
        )

    def test_no_orphan_domain_formats(self):
        orphan = set(VALID_FORMATS) - self._schema_formats()
        assert not orphan, (
            f"Formats in domain VALID_FORMATS but not accepted by the API schema: "
            f"{sorted(orphan)} — unreachable via the API."
        )
