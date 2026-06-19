"""
Deterministic router — the fallback path for models that can't run ReAct, and
the surgical fix for the over-grounding screenshot ("hi" → forced KB answer).

No LLM calls here: it's pure, fast, and reliable, which is exactly what small
local models need. Two jobs:

  1. ``decide`` — should this message use the KB / web / a URL fetch, or is it
     just chit-chat that needs none of them?
  2. ``passes_relevance_gate`` — even for a real question, don't ground in a
     retrieved chunk that shares nothing with the query.
"""

from __future__ import annotations

import pytest

from backend.core.agent.router import (
    RouterDecision,
    decide,
    is_greeting_or_trivial,
    passes_relevance_gate,
)


class TestIsGreetingOrTrivial:
    @pytest.mark.parametrize(
        "msg",
        ["hi", "Hello!", "hey there", "good morning", "thanks", "thank you",
         "thanks a lot", "ok", "okay", "what's up", "how are you?", "yo", "👍"],
    )
    def test_trivial_messages(self, msg):
        assert is_greeting_or_trivial(msg) is True

    @pytest.mark.parametrize(
        "msg",
        ["hi, can you summarize my notes?",
         "What does the contract say about termination?",
         "explain photosynthesis",
         "who won the match yesterday"],
    )
    def test_substantive_messages(self, msg):
        assert is_greeting_or_trivial(msg) is False


class TestDecide:
    def test_greeting_uses_no_tools_even_with_kb(self):
        # THE screenshot bug: "hi" with a KB selected must NOT ground.
        d = decide("hi", has_kb=True, web_enabled=True)
        assert d.chitchat is True
        assert d.use_kb is False and d.use_web is False and d.fetch_url is None

    def test_substantive_question_uses_kb_when_available(self):
        d = decide("what are the payment terms?", has_kb=True, web_enabled=False)
        assert d.use_kb is True and d.chitchat is False

    def test_web_flag_passes_through_for_real_questions(self):
        d = decide("latest news on mars", has_kb=False, web_enabled=True)
        assert d.use_web is True and d.use_kb is False

    def test_url_takes_precedence(self):
        d = decide("read this", has_kb=True, web_enabled=True, url="http://x")
        assert d.fetch_url == "http://x"
        assert d.use_kb is False and d.use_web is False

    def test_plain_chat_when_nothing_enabled(self):
        d = decide("explain recursion", has_kb=False, web_enabled=False)
        assert d == RouterDecision(use_kb=False, use_web=False, fetch_url=None, chitchat=False)


class TestRelevanceGate:
    def test_shared_terms_pass(self):
        assert passes_relevance_gate(
            "what are the payment terms",
            "Payment terms: net 30 days from invoice date.",
        ) is True

    def test_no_overlap_fails(self):
        # "hi"-class queries, or a real question whose only retrieved chunk is
        # about something unrelated, must not be grounded.
        assert passes_relevance_gate(
            "tell me about photosynthesis",
            "Hawai'i mandates workplace breastfeeding accommodations.",
        ) is False

    def test_empty_query_or_chunk_fails(self):
        assert passes_relevance_gate("", "anything") is False
        assert passes_relevance_gate("anything", "") is False
