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
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.core.domain.learn import LearnSession, UserStats
from backend.core.domain.srs import CardSchedule
from backend.core.learn_service import (
    _SYSTEM_PROMPTS,
    LearnService,
    _escape_inner_quotes,
    _is_coding_topic,
    _parse_llm_json,
    _repair_truncated_json,
)
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
        self._schedules: dict[tuple[str, int], CardSchedule] = {}

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
        await _drain(svc.stream_session(
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
# Truncated JSON repair (_repair_truncated_json + service integration)
# ---------------------------------------------------------------------------

class TestTruncatedJsonRepair:
    """
    Regression tests for the token-limit truncation bug (fixed in v0.9.9).

    Root cause: max_tokens=2048 was too low for quiz/flashcard generation.
    The LLM hit the limit mid-string, producing unterminated JSON.
    _repair_truncated_json() should recover parseable content from a truncated
    response; LearnService.stream_session() should yield a done event (not error).
    """

    # -- Unit tests for _repair_truncated_json directly ----------------------

    def test_repair_closes_open_string(self):
        truncated = '{"questions": [{"q": "What is gravity'
        data = json.loads(_repair_truncated_json(truncated))
        assert isinstance(data, dict)

    def test_repair_closes_open_array_and_object(self):
        truncated = '{"questions": [{"q": "Q?", "options": ["A", "B"'
        data = json.loads(_repair_truncated_json(truncated))
        assert "questions" in data

    def test_repair_exact_bug_report_payload(self):
        """Reproduces the exact truncation from the filed bug report."""
        truncated = (
            '{ "questions": [ { "q": "What is the primary cause of the Coriolis effect '
            'observed on Earth?", "options": [ "A. The tilt of the Earth\'s axis", '
            '"B. The rotation of the'
        )
        data = json.loads(_repair_truncated_json(truncated))
        assert "questions" in data
        assert len(data["questions"]) >= 1

    def test_repair_complete_json_unchanged(self):
        """A well-formed JSON string must survive the repair pass intact."""
        complete = '{"questions": [{"q": "Q?", "options": ["A","B","C","D"], "correct": 0, "explanation": "exp"}]}'
        assert json.loads(_repair_truncated_json(complete)) == json.loads(complete)

    def test_repair_no_closing_brace_returns_original(self):
        text = "no braces here"
        assert _repair_truncated_json(text) == text

    # -- Integration: LearnService recovers from truncated LLM response ------

    @pytest.mark.asyncio
    async def test_quiz_recovers_from_truncated_json(self):
        """
        LearnService should yield a done event (not error) when the LLM
        returns truncated JSON that _repair_truncated_json can fix.
        """
        # A realistic truncation: options array cut off mid-string
        truncated_response = (
            '{"questions": [{"q": "What causes the Coriolis effect?", '
            '"options": ["A. Earth tilt", "B. Earth rotation'
        )
        svc, _ = _make_svc(complete_text=truncated_response)
        events = await _drain(svc.stream_session(
            topic="Coriolis Effect", format="quiz", source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        done_events  = [e for e in events if '"type": "done"'  in e]
        assert len(error_events) == 0, f"Unexpected error: {error_events}"
        assert len(done_events)  == 1

    @pytest.mark.asyncio
    async def test_flashcard_recovers_from_truncated_json(self):
        truncated_response = '{"cards": [{"front": "What is photosynthesis?", "back": "Process by which'
        svc, _ = _make_svc(complete_text=truncated_response)
        events = await _drain(svc.stream_session(
            topic="Photosynthesis", format="flashcard", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        done_events  = [e for e in events if '"type": "done"'  in e]
        assert len(error_events) == 0
        assert len(done_events)  == 1

    @pytest.mark.asyncio
    async def test_completely_unparseable_json_yields_error_event(self):
        """If repair also fails, the service must yield an error event — not crash."""
        svc, _ = _make_svc(complete_text="not json at all {{{{")
        events = await _drain(svc.stream_session(
            topic="Test", format="quiz", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        assert len(error_events) == 1
        data = json.loads(error_events[0][len("data: "):])
        assert "invalid JSON" in data["error"].lower() or "json" in data["error"].lower()


# ---------------------------------------------------------------------------
# Unescaped inner-quote repair (_escape_inner_quotes + _parse_llm_json)
# ---------------------------------------------------------------------------

class TestUnescapedInnerQuoteRepair:
    """
    Regression tests for the "Expecting ',' delimiter" bug.

    Root cause: the LLM emits a double-quote *inside* a string value without
    escaping it (e.g. quoting a term mid-sentence: the "boundary" layer). The
    string terminates early and json.loads fails with "Expecting ',' delimiter".
    _repair_truncated_json only fixes truncation at the END, so it could not
    recover these. _escape_inner_quotes() escapes stray inner quotes; the
    combined _parse_llm_json() chains both repairs.
    """

    # -- _escape_inner_quotes ------------------------------------------------

    def test_escapes_inner_quote_in_value(self):
        bad = '{"a": "the "boundary" layer"}'
        data = json.loads(_escape_inner_quotes(bad))
        assert data["a"] == 'the "boundary" layer'

    def test_valid_json_is_left_intact(self):
        good = '{"questions": [{"q": "Q?", "options": ["A","B"], "correct": 0, "explanation": "exp"}]}'
        # idempotent: escaping must not corrupt already-valid JSON
        assert json.loads(_escape_inner_quotes(good)) == json.loads(good)

    def test_handles_inner_quote_in_devanagari_value(self):
        # Mirrors the Hindi 'animated'/'guided' failure from the bug report.
        bad = '{"intro": "कोरिओलिस "प्रभाव" को समझें", "total_steps": 1}'
        data = json.loads(_escape_inner_quotes(bad))
        assert data["total_steps"] == 1
        assert '"प्रभाव"' in data["intro"]

    def test_handles_multiple_inner_quotes(self):
        bad = '{"x": "say "hi" and "bye" now", "y": 2}'
        data = json.loads(_escape_inner_quotes(bad))
        assert data["y"] == 2
        assert data["x"] == 'say "hi" and "bye" now'

    def test_handles_inner_quoted_term_followed_by_comma(self):
        # The hard case: a quoted term inside a value, immediately followed by a
        # comma that is part of the prose (NOT a field separator). A real field
        # separator is followed by another key/value (a quote); prose is not.
        bad = '{"intro": "देखें "प्रभाव", और जानें", "n": 1}'
        data = json.loads(_escape_inner_quotes(bad))
        assert data["n"] == 1
        assert data["intro"] == 'देखें "प्रभाव", और जानें'

    def test_treats_adjacent_strings_with_missing_comma_as_separate(self):
        # Two strings with only whitespace between = a missing comma, not an
        # inner quote — the closing quote must NOT be escaped (else fields merge).
        bad = '{"a": "first" "b": "second"}'
        # after escaping, the first string still closes cleanly (then a comma
        # repair elsewhere would handle the gap); the value must equal "first".
        fixed = _escape_inner_quotes(bad)
        assert '"a": "first"' in fixed

    # -- _parse_llm_json (combined strategy chain) ---------------------------

    def test_parse_clean_json(self):
        assert _parse_llm_json('{"a": 1}') == {"a": 1}

    def test_parse_recovers_inner_quote(self):
        data = _parse_llm_json('{"explanation": "the "weight" matrix"}')
        assert data["explanation"] == 'the "weight" matrix'

    def test_parse_recovers_truncated(self):
        data = _parse_llm_json('{"questions": [{"q": "What is gravity')
        assert isinstance(data, dict)

    def test_parse_recovers_inner_quote_and_truncation_combo(self):
        # an inner quote earlier in the string AND truncated at the end
        data = _parse_llm_json('{"steps": [{"title": "the "core" idea", "explanation": "it begins')
        assert "steps" in data

    def test_parse_raises_on_hopeless_input(self):
        with pytest.raises(json.JSONDecodeError):
            _parse_llm_json("not json at all {{{{")

    # -- Integration: LearnService recovers from inner-quote JSON ------------

    @pytest.mark.asyncio
    async def test_guided_recovers_from_unescaped_inner_quote(self):
        """guided/animated content with an unescaped inner quote → done, not error."""
        bad = (
            '{"topic":"Portfolio","intro":"Your portfolio is a "gateway" to opportunities.",'
            '"total_steps":1,"steps":[{"step":1,"title":"Define goals",'
            '"explanation":"Decide what the "portal" should show.","example":"A projects page.",'
            '"analogy":null,"key_insight":"Clarity first.","check_in":"What is your goal?",'
            '"quiz_check":null}]}'
        )
        svc, _ = _make_svc(complete_text=bad)
        events = await _drain(svc.stream_session(
            topic="Portfolio", format="guided", source_type="topic",
            difficulty="intermediate", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        done_events  = [e for e in events if '"type": "done"'  in e]
        assert len(error_events) == 0, f"Unexpected error: {error_events}"
        assert len(done_events)  == 1

        # the repaired content must keep the quoted term as literal text
        token_events = [e for e in events if '"type": "token"' in e]
        reassembled = "".join(
            json.loads(e[len("data: "):])["content"] for e in token_events
        )
        content = json.loads(reassembled)
        assert content["intro"] == 'Your portfolio is a "gateway" to opportunities.'


# ---------------------------------------------------------------------------
# Structural JSON repair (missing braces between array elements) via json_repair
# ---------------------------------------------------------------------------

class TestStructuralJsonRepair:
    """
    Regression tests for the "flattened steps array" malformation.

    Root cause: a small local model serialised the `steps` array without
    wrapping each element after the first in braces, producing
    [ {step 1}, "step":2, ... ] — the parser reads "step" as a string element
    then chokes on the following ':' ("Expecting ',' delimiter"). This is a
    STRUCTURAL break that the hand-rolled quote/truncation repairs cannot fix;
    _parse_llm_json now falls back to the wrapped json_repair library.
    """

    FLATTENED = (
        '{"topic":"AI","total_steps":2,"steps":['
        '{"step":1,"title":"What is AI","explanation":"AI mimics human thinking."},'
        '"step":2,"title":"Machine Learning","explanation":"ML learns from data."}]}'
    )

    def test_parse_recovers_flattened_steps_array(self):
        data = _parse_llm_json(self.FLATTENED)
        assert isinstance(data, dict)
        assert data["topic"] == "AI"
        assert isinstance(data["steps"], list)
        assert len(data["steps"]) >= 1

    @pytest.mark.asyncio
    async def test_guided_recovers_from_flattened_steps(self):
        svc, _ = _make_svc(complete_text=self.FLATTENED)
        events = await _drain(svc.stream_session(
            topic="AI", format="guided", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        error_events = [e for e in events if '"type": "error"' in e]
        done_events  = [e for e in events if '"type": "done"'  in e]
        assert len(error_events) == 0, f"Unexpected error: {error_events}"
        assert len(done_events)  == 1


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

class TestAnimatedPromptTopicAware:
    """The animated prompt is SEMANTIC (Mermaid model): the LLM declares the
    diagram type + items + per-step reveal/focus and narrates; the app's layout
    engine computes every coordinate. The prompt must never ask for x/y."""

    def test_prompt_offers_diagram_types_and_code(self):
        p = _SYSTEM_PROMPTS["animated"].lower()
        # diagram-by-structure selection (research: choose the graphic by purpose)
        for kind in ["reaction", "flow", "cycle", "tree", "compare", "timeline", "hub", "code"]:
            assert kind in p, kind
        assert "input" in p and "process" in p and "output" in p   # reaction roles
        assert "highlight" in p                          # line-by-line code walk
        assert "do not default to boxes" in p            # explicit anti-default

    def test_prompt_is_semantic_not_coordinates(self):
        p = _SYSTEM_PROMPTS["animated"].lower()
        # The pedagogy the research demands, enforced by schema:
        assert '"reveal"' in p and '"focus"' in p        # progressive disclosure + signaling
        assert '"items"' in p and '"diagram"' in p
        # The LLM must NOT place coordinates — the layout engine does.
        assert '"x":50' not in p and '"y":12' not in p
        assert "layout engine" in p


class TestCodingTopicDetection:
    @pytest.mark.parametrize("topic", [
        "Python decorators", "JavaScript closures", "recursion", "binary tree traversal",
        "how a for loop works", "SQL joins", "REST API design",
    ])
    def test_detects_coding_topics(self, topic):
        assert _is_coding_topic(topic)

    @pytest.mark.parametrize("topic", [
        "Photosynthesis", "The French Revolution", "How rainbows form", "Supply and demand",
    ])
    def test_ignores_non_coding_topics(self, topic):
        assert not _is_coding_topic(topic)

    def test_animated_coding_topic_demands_code_walkthrough(self):
        svc, _ = _make_svc()
        sys = svc._build_prompt("animated", "Python decorators", "intermediate", "", "English")[0]["content"]
        assert "`code` field" in sys and "walk the code line by line" in sys.lower()

    def test_text_coding_topic_demands_fenced_code(self):
        svc, _ = _make_svc()
        sys = svc._build_prompt("guided", "Recursion in Python", "beginner", "", "English")[0]["content"]
        assert "fenced" in sys.lower() and "code the learner can run" in sys.lower()

    def test_non_coding_topic_adds_no_code_directive(self):
        svc, _ = _make_svc()
        sys = svc._build_prompt("guided", "Photosynthesis", "beginner", "", "English")[0]["content"]
        assert "fenced" not in sys.lower()
        assert "programming topic" not in sys.lower()


class TestBuildPromptSourceFraming:
    """When source material is present (URL/KB/upload), the lesson must teach the
    SUBJECT, not describe the page/website (the '/learn from URL explains the site'
    bug)."""

    def test_context_reframes_to_teach_subject_not_document(self):
        svc, _ = _make_svc()
        messages = svc._build_prompt(
            "guided", "en.wikipedia.org", "intermediate",
            "Photosynthesis converts light to chemical energy in chloroplasts.",
            "English",
        )
        system = messages[0]["content"].lower()
        user = messages[1]["content"]
        assert "do not describe" in system
        assert "infer the actual subject" in system
        assert "source material" in user.lower()
        assert "knowledge base" not in user.lower()   # old mislabel removed

    def test_no_context_adds_no_source_framing(self):
        svc, _ = _make_svc()
        messages = svc._build_prompt("guided", "Photosynthesis", "intermediate", "", "English")
        assert "do not describe" not in messages[0]["content"].lower()


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
        # First-review (graduating) intervals — Anki-like SM-2, persisted now.
        ("again", 1),
        ("hard",  1),
        ("good",  1),
        ("easy",  4),
    ])
    async def test_ease_rating_sets_next_review(self, svc_with_flashcards, ease, expected_days):
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
    async def test_review_persists_schedule_and_compounds(self, svc_with_flashcards):
        """Two 'good' reviews must compound (1d → 6d) and be persisted."""
        await svc_with_flashcards.review_flashcard(
            session_id="fc-001", card_index=0, ease_rating="good"
        )
        second = await svc_with_flashcards.review_flashcard(
            session_id="fc-001", card_index=0, ease_rating="good"
        )
        assert second["interval_days"] == 6
        sched = await svc_with_flashcards._repo.get_card_schedule("fc-001", 0)
        assert sched is not None and sched.repetitions == 2

    @pytest.mark.asyncio
    async def test_out_of_range_card_index_raises(self, svc_with_flashcards):
        with pytest.raises(ValueError):
            await svc_with_flashcards.review_flashcard(
                session_id="fc-001", card_index=99, ease_rating="good"
            )

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
        await _drain(svc.stream_session(
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
        await _drain(svc.stream_session(
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


# ──────────────────────────────────────────────────────────────────────────────
# Continuation suggestions ("where to next?") — the rabbit-hole loop
# ──────────────────────────────────────────────────────────────────────────────

class TestNextTopicSuggestions:
    def _creds(self):
        from backend.core.providers.base import ProviderCredentials
        return ProviderCredentials(api_key="k")

    @pytest.mark.asyncio
    async def test_parses_and_cleans_a_suggestions_array(self):
        svc, _ = _make_svc()
        svc._llm_svc.complete = AsyncMock(return_value=json.dumps([
            {"label": "Centripetal force", "topic": "Centripetal force in circular motion", "kind": "deeper"},
            {"label": "Angular velocity", "topic": "Angular velocity and period", "kind": "next"},
            {"label": "Orbits", "topic": "How orbits work", "kind": "related"},
            {"label": "Banked turns", "topic": "Physics of banked road turns", "kind": "WeIrD"},
        ]))
        items = await svc._suggest_next_topics(
            topic="Circular motion", format="guided", difficulty="beginner",
            provider="openai", model="gpt-4o-mini", credentials=self._creds(),
        )
        assert len(items) == 4
        assert items[0] == {"label": "Centripetal force", "topic": "Centripetal force in circular motion", "kind": "deeper"}
        # Unknown kind is normalised to "related".
        assert items[3]["kind"] == "related"

    @pytest.mark.asyncio
    async def test_accepts_object_wrapped_items(self):
        svc, _ = _make_svc()
        svc._llm_svc.complete = AsyncMock(return_value=json.dumps(
            {"items": [{"label": "A", "topic": "Topic A", "kind": "next"}]}
        ))
        items = await svc._suggest_next_topics(
            topic="X", format="quiz", difficulty="expert",
            provider="openai", model="m", credentials=self._creds(),
        )
        assert items == [{"label": "A", "topic": "Topic A", "kind": "next"}]

    @pytest.mark.asyncio
    async def test_drops_items_missing_label_or_topic(self):
        svc, _ = _make_svc()
        svc._llm_svc.complete = AsyncMock(return_value=json.dumps([
            {"label": "ok", "topic": "Good topic", "kind": "next"},
            {"label": "", "topic": "no label"},
            {"topic": "no label key"},
            "not even a dict",
        ]))
        items = await svc._suggest_next_topics(
            topic="X", format="story", difficulty="beginner",
            provider="o", model="m", credentials=self._creds(),
        )
        assert items == [{"label": "ok", "topic": "Good topic", "kind": "next"}]

    @pytest.mark.asyncio
    async def test_llm_failure_returns_empty_never_raises(self):
        svc, _ = _make_svc()
        svc._llm_svc.complete = AsyncMock(side_effect=RuntimeError("LLM down"))
        items = await svc._suggest_next_topics(
            topic="X", format="guided", difficulty="beginner",
            provider="o", model="m", credentials=self._creds(),
        )
        assert items == []

    @pytest.mark.asyncio
    async def test_unparseable_json_returns_empty(self):
        svc, _ = _make_svc()
        svc._llm_svc.complete = AsyncMock(return_value="here are some ideas: not json at all")
        items = await svc._suggest_next_topics(
            topic="X", format="eli5", difficulty="beginner",
            provider="o", model="m", credentials=self._creds(),
        )
        assert items == []
