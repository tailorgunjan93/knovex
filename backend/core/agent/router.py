"""
Deterministic router — the fallback for models that can't drive ReAct, and the
root-cause fix for the over-grounding bug.

The old pipeline retrieved KB context and forced grounding on EVERY message, so
"hi" produced a confabulated answer from an irrelevant chunk. This module makes
two cheap, reliable, LLM-free decisions instead:

  • ``decide``               — does this turn need a tool at all?
  • ``passes_relevance_gate``— is a retrieved chunk actually on-topic?

Both are pure functions so they're fast (no round-trip) and fully testable —
the right trade-off for small local models where an LLM "router" call would
itself be unreliable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Words that, on their own, never constitute a real question: greetings, thanks,
# acknowledgements, and social filler. Used both for exact-phrase matching and
# to strip a message down to its substantive tokens.
_SOCIAL_WORDS: frozenset[str] = frozenset({
    "hi", "hello", "hey", "yo", "hiya", "howdy", "sup", "heya",
    "good", "morning", "afternoon", "evening", "night", "day",
    "thanks", "thank", "thankyou", "thx", "ty", "appreciate", "lot", "much",
    "ok", "okay", "kk", "cool", "nice", "great", "awesome", "perfect",
    "yeah", "yep", "yup", "sure", "fine", "alright", "right",
    "bye", "goodbye", "cya", "later", "please", "pls",
    "how", "are", "you", "whats", "what", "up", "doing", "going",
    "lol", "haha", "hmm", "oh", "wow",
})

# Short, common English stop words — combined with the social set when checking
# whether anything substantive remains.
_STOPWORDS: frozenset[str] = frozenset({
    "the", "and", "for", "but", "not", "all", "can", "out", "now", "new",
    "this", "that", "with", "have", "from", "they", "will", "your", "his",
    "her", "him", "she", "its", "our", "their", "there", "here",
    "a", "an", "is", "it", "to", "of", "in", "on", "at", "by", "be", "do",
    "me", "my", "i", "we", "us",
})

_TOKEN_RE = re.compile(r"[a-z0-9']+")

# Common exact chit-chat phrases that survive token stripping ("how are you").
_GREETING_PHRASES: frozenset[str] = frozenset({
    "how are you", "hows it going", "how is it going", "whats up", "what's up",
    "good morning", "good afternoon", "good evening", "thank you", "thanks a lot",
    "how are you doing", "nice to meet you",
})


@dataclass(frozen=True)
class RouterDecision:
    use_kb: bool
    use_web: bool
    fetch_url: str | None
    chitchat: bool


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower()).strip(" !?.,")


def _substantive_tokens(text: str) -> list[str]:
    """Tokens left after removing social words, stop words, and <=2-char tokens."""
    toks = _TOKEN_RE.findall(text.lower())
    return [
        t for t in toks
        if len(t.replace("'", "")) > 2
        and t not in _SOCIAL_WORDS
        and t not in _STOPWORDS
    ]


def is_greeting_or_trivial(message: str) -> bool:
    """True for greetings, thanks, and other messages with no real question."""
    norm = _normalise(message)
    if not norm:
        return True
    if norm in _GREETING_PHRASES:
        return True
    # Nothing substantive left once social/stop words are removed → trivial.
    return len(_substantive_tokens(message)) == 0


def decide(
    message: str,
    *,
    has_kb: bool,
    web_enabled: bool,
    url: str | None = None,
) -> RouterDecision:
    """Decide which tools (if any) a turn needs — no LLM involved."""
    if url:
        return RouterDecision(use_kb=False, use_web=False, fetch_url=url, chitchat=False)
    if is_greeting_or_trivial(message):
        return RouterDecision(use_kb=False, use_web=False, fetch_url=None, chitchat=True)
    return RouterDecision(
        use_kb=has_kb, use_web=web_enabled, fetch_url=None, chitchat=False
    )


def passes_relevance_gate(query: str, chunk_text: str) -> bool:
    """
    True if a retrieved chunk shares at least one substantive term with the
    query. A zero-overlap chunk is almost certainly off-topic for the FTS5-only
    retrieval the fallback path uses, so we refuse to ground in it rather than
    let the model confabulate around it.
    """
    q_terms = set(_substantive_tokens(query))
    if not q_terms or not (chunk_text and chunk_text.strip()):
        return False
    c_terms = set(_TOKEN_RE.findall(chunk_text.lower()))
    return bool(q_terms & c_terms)
