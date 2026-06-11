"""
FakeLLMClient — deterministic offline client used by the real-backend E2E gate.

Guards that, with KNOVEX_FAKE_LLM=1, every Learn format gets VALID canned JSON and
chat/text streams tokens — so the real /learn and /chat paths complete end-to-end
in CI with no API keys. See docs/rca/2026-06-07-network-error.md.
"""

from __future__ import annotations

import json

import pytest

from backend.adapters.llm_client import FakeLLMClient
from backend.core.domain.learn import VALID_FORMATS


def _prompt_for(format_keys: str) -> list[dict[str, str]]:
    """A message list that mentions the JSON keys a given format's prompt uses."""
    return [{"role": "system", "content": format_keys},
            {"role": "user", "content": "Teach me about circular motion."}]


@pytest.mark.parametrize(
    "marker, expected",
    [
        ("Return JSON declaring a diagram with steps[].narration and reveal", "animated"),
        ("Return steps[] each with key_insight", "guided"),
        ("Return questions[] with options and correct", "quiz"),
        ("Return cards[] with front/back", "flashcard"),
        ("Return root and branches[]", "mindmap"),
        ("Return a timeline with events[]", "timeline"),
    ],
)
def test_detect_format(marker, expected):
    assert FakeLLMClient._detect_format(marker) == expected


async def test_complete_returns_valid_animated_json():
    out = await FakeLLMClient().complete(
        _prompt_for("diagram narration reveal"), max_tokens=100, temperature=0.0
    )
    data = json.loads(out)  # must be valid JSON — SEMANTIC format (Mermaid model)
    assert data["diagram"] in ("flow", "cycle", "tree", "compare", "timeline", "hub", "code")
    assert data["items"] and data["items"][0]["id"]
    assert data["steps"] and data["steps"][0]["narration"]
    # progressive disclosure: at least one step reveals something
    assert any(s.get("reveal") for s in data["steps"])


async def test_complete_returns_valid_guided_json():
    out = await FakeLLMClient().complete(
        _prompt_for("steps key_insight"), max_tokens=100, temperature=0.0
    )
    data = json.loads(out)
    assert data["steps"][0]["title"]


async def test_stream_yields_tokens():
    toks = [t async for t in FakeLLMClient().stream(
        [{"role": "user", "content": "hi"}], max_tokens=50, temperature=0.0
    )]
    assert len(toks) >= 1
    assert "".join(toks).strip()


def test_canned_payloads_cover_all_json_formats():
    """Every non-text Learn format must have a canned payload so the E2E gate can
    exercise it. Text formats (story/eli5/speedlearn/brainstorm) stream instead."""
    from backend.adapters.llm_client import _CANNED_BY_FORMAT

    text_formats = {"story", "eli5", "speedlearn", "brainstorm"}
    json_formats = set(VALID_FORMATS) - text_formats
    missing = json_formats - set(_CANNED_BY_FORMAT)
    assert not missing, f"FakeLLMClient missing canned JSON for: {sorted(missing)}"
