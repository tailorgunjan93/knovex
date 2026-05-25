"""
Learn Service Tests — Sprint 6

Coverage:
  - LearnService.stream_session() — text formats (story/eli5/speedlearn/brainstorm)
  - LearnService.stream_session() — JSON formats (quiz/flashcard/mindmap/timeline)
  - LearnService.stream_session() — invalid format raises ValueError
  - LearnService.stream_session() — LLM error yields SSE error event
  - LearnService.submit_quiz_answer() — correct / incorrect / out-of-range
  - LearnService.review_flashcard() — all ease ratings
  - LearnService.get_session() — not found raises EntityNotFoundError
  - LearnService.list_sessions()
  - LearnService.delete_session()
  - LearnService.get_user_stats()
  - XP / badge awarding through stream_session()
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.core.domain.learn import LearnSession, UserStats
from backend.core.learn_service import LearnService
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.learn_repository import ILearnRepository


# ---------------------------------------------------------------------------
# In-memory repository stub
# ---------------------------------------------------------------------------

class InMemoryLearnRepository(ILearnRepository):
    """Pure-Python stub — no SQLite needed."""

    def __init__(self) -> None:
        super().__init__(backend=None)  # type: ignore[arg-type]
        self._sessions: dict[str, LearnSession] = {}
        self._stats = UserStats()

    async def find_by_id(self, entity_id: str) -> LearnSession | None:
        return self._sessions.get(entity_id)

    async def find_all(self) -> list[LearnSession]:
        return list(self._sessions.values())

    async def find_sessions(self, limit: int = 50) -> list[LearnSession]:
        sessions = sorted(
            self._sessions.values(),
            key=lambda s: s.created_at,
            reverse=True,
        )
        return sessions[:limit]

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


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------

def _make_llm_svc(
    *,
    tokens: list[str] | None = None,
    complete_json: dict | None = None,
    complete_text: str = "",
    fail: bool = False,
) -> MagicMock:
    """
    Build a mock LLMService.

    - tokens: list of tokens to yield from .stream()
    - complete_json: dict to return from .complete() (serialised to JSON string)
    - complete_text: raw string to return from .complete()
    - fail: if True, .complete() and .stream() both raise RuntimeError
    """
    llm_svc = MagicMock()

    if fail:
        async def _failing_stream(*args, **kwargs):
            raise RuntimeError("LLM unavailable")
            yield  # make it an async generator

        async def _failing_complete(*args, **kwargs):
            raise RuntimeError("LLM unavailable")

        llm_svc.stream = _failing_stream
        llm_svc.complete = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    else:
        stream_tokens = tokens or ["Hello", " World"]

        async def _stream_gen(*args, **kwargs):
            for tok in stream_tokens:
                yield tok

        llm_svc.stream = _stream_gen

        if complete_json is not None:
            llm_svc.complete = AsyncMock(return_value=json.dumps(complete_json))
        else:
            llm_svc.complete = AsyncMock(return_value=complete_text or "Generated text content")

    return llm_svc


def _make_svc(
    *,
    tokens: list[str] | None = None,
    complete_json: dict | None = None,
    complete_text: str = "",
    fail: bool = False,
) -> tuple[LearnService, InMemoryLearnRepository]:
    """Create (LearnService, repo) with a mocked LLMService."""
    repo = InMemoryLearnRepository()
    llm_svc = _make_llm_svc(
        tokens=tokens,
        complete_json=complete_json,
        complete_text=complete_text,
        fail=fail,
    )
    svc = LearnService(learn_repo=repo, llm_svc=llm_svc)
    return svc, repo


async def _drain(gen) -> list[str]:
    """Collect all SSE events from an async generator."""
    events: list[str] = []
    async for event in gen:
        events.append(event)
    return events


def _creds():
    from backend.core.providers.base import ProviderCredentials
    return ProviderCredentials(api_key="sk-test")


# ---------------------------------------------------------------------------
# stream_session — text formats
# ---------------------------------------------------------------------------

class TestStreamSessionTextFormats:

    @pytest.mark.asyncio
    @pytest.mark.parametrize("fmt", ["story", "eli5", "speedlearn", "brainstorm"])
    async def test_text_format_yields_token_events(self, fmt: str):
        svc, _ = _make_svc(tokens=["Once ", "upon ", "a time"])
        events = await _drain(svc.stream_session(
            topic="Photosynthesis", format=fmt, source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        token_events = [e for e in events if '"type": "token"' in e]
        assert len(token_events) >= 1

    @pytest.mark.asyncio
    async def test_text_format_ends_with_done_event(self):
        svc, _ = _make_svc(tokens=["Hello", " world"])
        events = await _drain(svc.stream_session(
            topic="Gravity", format="story", source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        assert events, "Expected at least one event"
        last = events[-1]
        data = json.loads(last[len("data: "):])
        assert data["type"] == "done"
        assert "session_id" in data
        assert "xp_earned" in data
        assert isinstance(data["new_badges"], list)

    @pytest.mark.asyncio
    async def test_text_format_session_saved_as_ready(self):
        svc, repo = _make_svc(tokens=["text"], complete_text="text")
        events = await _drain(svc.stream_session(
            topic="DNA", format="eli5", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        # Find done event to get session_id
        done = next(
            json.loads(e[len("data: "):])
            for e in events if '"type": "done"' in e
        )
        session = await repo.find_by_id(done["session_id"])
        assert session is not None
        assert session.status == "ready"
        assert session.content is not None

    @pytest.mark.asyncio
    async def test_text_token_events_have_content_field(self):
        svc, _ = _make_svc(tokens=["Alpha", "Beta", "Gamma"])
        events = await _drain(svc.stream_session(
            topic="Atoms", format="speedlearn", source_type="topic",
            difficulty="expert", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        token_events = [json.loads(e[len("data: "):]) for e in events if '"type": "token"' in e]
        for ev in token_events:
            assert "content" in ev
            assert isinstance(ev["content"], str)


# ---------------------------------------------------------------------------
# stream_session — JSON formats
# ---------------------------------------------------------------------------

class TestStreamSessionJsonFormats:

    SAMPLE_QUIZ = {
        "questions": [
            {
                "q": "What is 2+2?",
                "options": ["A. 3", "B. 4", "C. 5", "D. 6"],
                "correct": 1,
                "explanation": "2 + 2 = 4",
            }
        ]
    }

    SAMPLE_FLASHCARD = {
        "cards": [
            {"front": "What is gravity?", "back": "A force of attraction", "hint": "Newton"},
        ]
    }

    SAMPLE_MINDMAP = {
        "root": "Physics",
        "branches": [
            {"label": "Mechanics", "children": [{"label": "Newton's Laws", "children": []}]},
        ],
    }

    SAMPLE_TIMELINE = {
        "events": [
            {"year": "1687", "title": "Principia Mathematica", "description": "Newton publishes"},
        ]
    }

    @pytest.mark.asyncio
    @pytest.mark.parametrize("fmt,payload", [
        ("quiz",      {"questions": [{"q": "Q", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "exp"}]}),
        ("flashcard", {"cards": [{"front": "F", "back": "B", "hint": "H"}]}),
        ("mindmap",   {"root": "Root", "branches": []}),
        ("timeline",  {"events": [{"year": "2000", "title": "T", "description": "D"}]}),
    ])
    async def test_json_format_streams_token_events(self, fmt: str, payload: dict):
        svc, _ = _make_svc(complete_json=payload)
        events = await _drain(svc.stream_session(
            topic="Test", format=fmt, source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        token_events = [e for e in events if '"type": "token"' in e]
        assert len(token_events) >= 1

    @pytest.mark.asyncio
    async def test_quiz_json_reassembled_from_tokens(self):
        """Concatenating all token content must produce valid JSON."""
        svc, _ = _make_svc(complete_json=self.SAMPLE_QUIZ)
        events = await _drain(svc.stream_session(
            topic="Math", format="quiz", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        token_events = [json.loads(e[len("data: "):]) for e in events if '"type": "token"' in e]
        reassembled = "".join(ev["content"] for ev in token_events)
        parsed = json.loads(reassembled)
        assert "questions" in parsed
        assert len(parsed["questions"]) == 1

    @pytest.mark.asyncio
    async def test_json_format_session_content_saved(self):
        svc, repo = _make_svc(complete_json=self.SAMPLE_FLASHCARD)
        events = await _drain(svc.stream_session(
            topic="Science", format="flashcard", source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        done = next(
            json.loads(e[len("data: "):])
            for e in events if '"type": "done"' in e
        )
        session = await repo.find_by_id(done["session_id"])
        assert session.status == "ready"
        assert "cards" in session.content

    @pytest.mark.asyncio
    async def test_mindmap_json_round_trip(self):
        svc, repo = _make_svc(complete_json=self.SAMPLE_MINDMAP)
        events = await _drain(svc.stream_session(
            topic="Physics", format="mindmap", source_type="topic",
            difficulty="expert", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        done_event = next(
            json.loads(e[len("data: "):])
            for e in events if '"type": "done"' in e
        )
        session = await repo.find_by_id(done_event["session_id"])
        assert session.content["root"] == "Physics"


# ---------------------------------------------------------------------------
# stream_session — validation errors
# ---------------------------------------------------------------------------

class TestStreamSessionValidation:

    @pytest.mark.asyncio
    async def test_invalid_format_raises_value_error(self):
        svc, _ = _make_svc()
        with pytest.raises(ValueError, match="Invalid format"):
            await _drain(svc.stream_session(
                topic="Test", format="invalid_format", source_type="topic",
                difficulty="beginner", source_ref=None,
                provider="openai", model="gpt-4o-mini", credentials=_creds(),
            ))

    @pytest.mark.asyncio
    async def test_invalid_difficulty_raises_value_error(self):
        svc, _ = _make_svc()
        with pytest.raises(ValueError, match="Invalid difficulty"):
            await _drain(svc.stream_session(
                topic="Test", format="quiz", source_type="topic",
                difficulty="ultra-hard", source_ref=None,
                provider="openai", model="gpt-4o-mini", credentials=_creds(),
            ))


# ---------------------------------------------------------------------------
# stream_session — LLM failure
# ---------------------------------------------------------------------------

class TestStreamSessionLLMError:

    @pytest.mark.asyncio
    async def test_llm_error_yields_error_event(self):
        svc, _ = _make_svc(fail=True)
        events = await _drain(svc.stream_session(
            topic="Test", format="quiz", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        assert len(error_events) == 1
        data = json.loads(error_events[0][len("data: "):])
        assert "LLM" in data["error"] or "error" in data["error"].lower()

    @pytest.mark.asyncio
    async def test_llm_error_saves_session_as_error(self):
        svc, repo = _make_svc(fail=True)
        events = await _drain(svc.stream_session(
            topic="Test", format="quiz", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        sessions = await repo.find_all()
        assert len(sessions) == 1
        assert sessions[0].status == "error"

    @pytest.mark.asyncio
    async def test_text_format_llm_error_yields_error_event(self):
        svc, _ = _make_svc(fail=True)
        events = await _drain(svc.stream_session(
            topic="Test", format="story", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        assert len(error_events) == 1


# ---------------------------------------------------------------------------
# submit_quiz_answer
# ---------------------------------------------------------------------------

class TestSubmitQuizAnswer:

    @pytest.fixture
    def quiz_session(self) -> LearnSession:
        session = LearnSession(
            id=str(uuid.uuid4()),
            topic="Math",
            format="quiz",
            source_type="topic",
            difficulty="beginner",
        )
        session.mark_ready({
            "questions": [
                {
                    "q": "What is 2+2?",
                    "options": ["A. 3", "B. 4", "C. 5", "D. 6"],
                    "correct": 1,
                    "explanation": "Basic addition: 2+2=4",
                },
                {
                    "q": "What is 3×3?",
                    "options": ["A. 6", "B. 8", "C. 9", "D. 12"],
                    "correct": 2,
                    "explanation": "3×3=9",
                },
            ]
        })
        return session

    @pytest.fixture
    def svc_with_quiz(self, quiz_session):
        repo = InMemoryLearnRepository()
        repo._sessions[quiz_session.id] = quiz_session
        llm_svc = _make_llm_svc()
        return LearnService(learn_repo=repo, llm_svc=llm_svc), quiz_session

    @pytest.mark.asyncio
    async def test_correct_answer_returns_true(self, svc_with_quiz):
        svc, session = svc_with_quiz
        result = await svc.submit_quiz_answer(
            session_id=session.id,
            question_index=0,
            answer="B. 4",
        )
        assert result["correct"] is True

    @pytest.mark.asyncio
    async def test_wrong_answer_returns_false(self, svc_with_quiz):
        svc, session = svc_with_quiz
        result = await svc.submit_quiz_answer(
            session_id=session.id,
            question_index=0,
            answer="A. 3",
        )
        assert result["correct"] is False

    @pytest.mark.asyncio
    async def test_correct_answer_earns_xp(self, svc_with_quiz):
        svc, session = svc_with_quiz
        result = await svc.submit_quiz_answer(
            session_id=session.id,
            question_index=0,
            answer="B. 4",
        )
        assert result["xp_earned"] > 0

    @pytest.mark.asyncio
    async def test_wrong_answer_earns_no_xp(self, svc_with_quiz):
        svc, session = svc_with_quiz
        result = await svc.submit_quiz_answer(
            session_id=session.id,
            question_index=0,
            answer="D. 6",
        )
        assert result["xp_earned"] == 0

    @pytest.mark.asyncio
    async def test_correct_answer_includes_explanation(self, svc_with_quiz):
        svc, session = svc_with_quiz
        result = await svc.submit_quiz_answer(
            session_id=session.id,
            question_index=0,
            answer="B. 4",
        )
        assert result["explanation"] == "Basic addition: 2+2=4"

    @pytest.mark.asyncio
    async def test_out_of_range_index_raises(self, svc_with_quiz):
        svc, session = svc_with_quiz
        with pytest.raises(ValueError, match="out of range"):
            await svc.submit_quiz_answer(
                session_id=session.id,
                question_index=99,
                answer="B. 4",
            )

    @pytest.mark.asyncio
    async def test_non_quiz_session_raises(self, svc_with_quiz):
        svc, _ = svc_with_quiz
        # Insert a story session
        story_session = LearnSession(
            id="story-123", topic="X", format="story", source_type="topic",
            difficulty="beginner",
        )
        story_session.mark_ready({"text": "Once upon a time"})
        svc._repo._sessions["story-123"] = story_session

        with pytest.raises(ValueError, match="not a quiz"):
            await svc.submit_quiz_answer(
                session_id="story-123",
                question_index=0,
                answer="A",
            )

    @pytest.mark.asyncio
    async def test_missing_session_raises_entity_not_found(self, svc_with_quiz):
        svc, _ = svc_with_quiz
        with pytest.raises(EntityNotFoundError):
            await svc.submit_quiz_answer(
                session_id="nonexistent-id",
                question_index=0,
                answer="A",
            )


# ---------------------------------------------------------------------------
# review_flashcard
# ---------------------------------------------------------------------------

class TestReviewFlashcard:

    @pytest.fixture
    def svc_with_flashcards(self):
        repo = InMemoryLearnRepository()
        session = LearnSession(
            id="fc-001", topic="History", format="flashcard", source_type="topic",
            difficulty="intermediate",
        )
        session.mark_ready({
            "cards": [
                {"front": "When did WW2 end?", "back": "1945", "hint": "Mid 40s"},
            ]
        })
        repo._sessions["fc-001"] = session
        svc = LearnService(learn_repo=repo, llm_svc=_make_llm_svc())
        return svc

    @pytest.mark.asyncio
    @pytest.mark.parametrize("ease,expected_days", [
        ("again", 1),
        ("hard",  2),
        ("good",  4),
        ("easy",  7),
    ])
    async def test_ease_rating_sets_next_review(self, svc_with_flashcards, ease, expected_days):
        from datetime import timedelta
        result = await svc_with_flashcards.review_flashcard(
            session_id="fc-001",
            card_index=0,
            ease_rating=ease,
        )
        assert result["ease_rating"] == ease
        assert result["card_index"] == 0
        # next_review_at should be approximately N days from now
        next_review = datetime.fromisoformat(result["next_review_at"])
        delta = next_review - datetime.utcnow()
        # Allow ±1 minute tolerance
        assert abs(delta.total_seconds() - expected_days * 86400) < 120

    @pytest.mark.asyncio
    async def test_good_rating_awards_xp(self, svc_with_flashcards):
        repo = svc_with_flashcards._repo
        before_xp = repo._stats.xp
        await svc_with_flashcards.review_flashcard(
            session_id="fc-001", card_index=0, ease_rating="good"
        )
        assert repo._stats.xp > before_xp

    @pytest.mark.asyncio
    async def test_again_rating_awards_no_xp(self, svc_with_flashcards):
        repo = svc_with_flashcards._repo
        before_xp = repo._stats.xp
        await svc_with_flashcards.review_flashcard(
            session_id="fc-001", card_index=0, ease_rating="again"
        )
        assert repo._stats.xp == before_xp


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

class TestSessionCRUD:

    @pytest.mark.asyncio
    async def test_list_sessions_empty(self):
        svc, _ = _make_svc()
        sessions = await svc.list_sessions()
        assert sessions == []

    @pytest.mark.asyncio
    async def test_get_session_not_found_raises(self):
        svc, _ = _make_svc()
        with pytest.raises(EntityNotFoundError):
            await svc.get_session("does-not-exist")

    @pytest.mark.asyncio
    async def test_session_created_during_stream(self):
        svc, repo = _make_svc(
            complete_json={"questions": [{"q": "Q", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "E"}]}
        )
        events = await _drain(svc.stream_session(
            topic="Chemistry", format="quiz", source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        sessions = await svc.list_sessions()
        assert len(sessions) == 1
        assert sessions[0].topic == "Chemistry"

    @pytest.mark.asyncio
    async def test_delete_session(self):
        svc, repo = _make_svc(
            complete_json={"root": "R", "branches": []}
        )
        events = await _drain(svc.stream_session(
            topic="Topic", format="mindmap", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        done = next(
            json.loads(e[len("data: "):]) for e in events if '"type": "done"' in e
        )
        session_id = done["session_id"]

        await svc.delete_session(session_id)
        sessions = await svc.list_sessions()
        assert all(s.id != session_id for s in sessions)


# ---------------------------------------------------------------------------
# User stats / gamification
# ---------------------------------------------------------------------------

class TestUserStats:

    @pytest.mark.asyncio
    async def test_get_user_stats_returns_defaults(self):
        svc, _ = _make_svc()
        stats = await svc.get_user_stats()
        assert stats.xp == 0
        assert stats.level == 1
        assert stats.streak == 0
        assert stats.badges == []

    @pytest.mark.asyncio
    async def test_completing_session_earns_xp(self):
        svc, repo = _make_svc(tokens=["Hello"])
        events = await _drain(svc.stream_session(
            topic="Quasars", format="eli5", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        stats = await svc.get_user_stats()
        assert stats.xp > 0

    @pytest.mark.asyncio
    async def test_xp_reported_in_done_event(self):
        svc, _ = _make_svc(tokens=["A", "B", "C"])
        events = await _drain(svc.stream_session(
            topic="Relativity", format="brainstorm", source_type="topic",
            difficulty="expert", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        done = next(
            json.loads(e[len("data: "):]) for e in events if '"type": "done"' in e
        )
        assert done["xp_earned"] > 0

    @pytest.mark.asyncio
    async def test_first_session_earns_first_step_badge(self):
        svc, repo = _make_svc(tokens=["text"])
        events = await _drain(svc.stream_session(
            topic="First Topic", format="story", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        done = next(
            json.loads(e[len("data: "):]) for e in events if '"type": "done"' in e
        )
        assert "first_step" in done["new_badges"]
