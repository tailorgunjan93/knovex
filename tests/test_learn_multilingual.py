"""
Learn multilingual tests — redesign Phase 4 (generate-in-language).

Threads a `language` field so lessons are generated in the user's language while
JSON keys stay English (so downstream parsing/rendering is unchanged).

Proves:
  - _build_prompt injects a language instruction when language != English,
  - the instruction names the chosen language and protects JSON keys,
  - default 'English' adds NO instruction (zero behavior change for existing
    users — the whole reason this is safe),
  - stream_session accepts `language` and still streams normally.
"""

from __future__ import annotations

import json

import pytest

from backend.core.learn_service import LearnService
from tests.test_learn import InMemoryLearnRepository, _make_llm_svc, _drain, _creds


def _svc() -> LearnService:
    return LearnService(learn_repo=InMemoryLearnRepository(), llm_svc=_make_llm_svc())


class TestBuildPromptLanguage:
    def test_default_english_adds_no_language_instruction(self):
        svc = _svc()
        msgs = svc._build_prompt("quiz", "Photosynthesis", "beginner", "", "English")
        system = msgs[0]["content"]
        # No spurious "write in" instruction for the default language.
        assert "write all human-readable text in English" not in system.lower()

    def test_non_english_injects_language_instruction(self):
        svc = _svc()
        msgs = svc._build_prompt("quiz", "Photosynthesis", "beginner", "", "Hindi")
        joined = (msgs[0]["content"] + msgs[1]["content"]).lower()
        assert "hindi" in joined
        # must instruct human-readable text in the language…
        assert "human-readable" in joined or "human readable" in joined

    def test_non_english_protects_json_keys(self):
        svc = _svc()
        msgs = svc._build_prompt("quiz", "Topic", "beginner", "", "Spanish")
        joined = (msgs[0]["content"] + msgs[1]["content"]).lower()
        # JSON keys must stay English so the parser/renderer keep working.
        assert "json" in joined and "key" in joined and "english" in joined

    def test_language_defaults_to_english_when_omitted(self):
        """_build_prompt must remain back-compatible when language not passed."""
        svc = _svc()
        msgs = svc._build_prompt("quiz", "Topic", "beginner", "")
        system = msgs[0]["content"]
        assert "write all human-readable text in english" not in system.lower()


class TestStreamSessionLanguage:
    @pytest.mark.asyncio
    async def test_stream_session_accepts_language(self):
        svc = LearnService(
            learn_repo=InMemoryLearnRepository(),
            llm_svc=_make_llm_svc(tokens=["Hola", " mundo"]),
        )
        events = await _drain(svc.stream_session(
            topic="Fotosíntesis", format="story", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
            language="Spanish",
        ))
        # Streams normally + terminates.
        assert any('"type": "token"' in e for e in events)
        assert any("[DONE]" in e or '"done"' in e for e in events)

    @pytest.mark.asyncio
    async def test_stream_session_language_optional(self):
        """Omitting language must still work (defaults to English)."""
        svc = LearnService(
            learn_repo=InMemoryLearnRepository(),
            llm_svc=_make_llm_svc(tokens=["Hi"]),
        )
        events = await _drain(svc.stream_session(
            topic="Topic", format="story", source_type="topic",
            difficulty="beginner", source_ref=None,
            provider="openai", model="gpt-4o-mini", credentials=_creds(),
        ))
        assert len(events) > 0
