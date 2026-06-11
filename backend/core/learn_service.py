"""
Learn Service — Sprint 6

Responsibilities:
  - Generate learning content for 8 formats via LLM
  - Stream SSE events for all format generation
  - Submit quiz answers + award XP
  - Rate flashcards (spaced repetition ease)
  - Maintain user stats (XP, level, streak, badges)

Architecture:
  SRP  — only learn-mode coordination; no DB writes except via repository
  DIP  — depends on ILearnRepository, LLMService (abstractions)
  OCP  — new format = new prompt + parser; nothing else changes
  Strategy — each format has its own _prompt_* and _parse_* method

SSE event protocol (same family as Chat / Summariser):
    data: {"type": "token",  "content": "..."}
    data: {"type": "done",   "session_id": "...", "xp_earned": N, "new_badges": [...]}
    data: {"type": "error",  "error": "..."}
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime

from backend.adapters.json_repair_adapter import repair_json_object
from backend.core.domain.learn import (
    VALID_DIFFICULTIES,
    VALID_FORMATS,
    XP_FLASHCARD_DECK,
    XP_QUIZ_CORRECT,
    XP_SESSION_COMPLETE,
    XP_STREAK_BONUS,
    LearnSession,
    UserStats,
)
from backend.core.domain.srs import GRADES, apply_grade, new_schedule
from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.learn_repository import ILearnRepository

logger = logging.getLogger("knovex.learn")

# ── Streaming text formats (free prose) ─────────────────────────────────────
_TEXT_FORMATS = frozenset({"story", "eli5", "speedlearn", "brainstorm"})

# Topics that should SHOW code, not just describe it. Heuristic (best-effort):
# substrings are space-padded where ambiguous ("go", "c#") to avoid false hits.
_CODING_HINTS = (
    "python", "javascript", "typescript", " java", "kotlin", "swift", " rust", "golang",
    " sql", "react", "html", " css", "algorithm", "recursion", " loop", "data structure",
    "regex", "regular expression", "programming", "coding", " code", "compiler", "async",
    "pointer", "linked list", "binary tree", "sorting", "hash map", "hashmap", "closure",
    "promise", "decorator", "syntax", "bitwise", "function ", "api ", "rest api", "oop",
    "object-oriented", "variable", "boolean", "iterator", "lambda", "stack ", "queue ",
)


def _is_coding_topic(topic: str) -> bool:
    """Heuristic: is this topic about programming (→ must show real code)?"""
    t = f" {topic.lower()} "
    return any(h in t for h in _CODING_HINTS)

# ── Badge definitions ────────────────────────────────────────────────────────
_BADGE_FIRST_STEP    = "first_step"
_BADGE_QUIZ_MASTER   = "quiz_master"
_BADGE_PERFECT_QUIZ  = "perfect_quiz"
_BADGE_FLASHCARD_10  = "flashcard_ninja"
_BADGE_MINDMAP_5     = "mind_mapper"
_BADGE_STORY_5       = "storyteller"
_BADGE_SPEED_10      = "speed_learner"
_BADGE_STREAK_7      = "7_day_streak"
_BADGE_LEVEL_5       = "level_5"
_BADGE_EXPLORER      = "explorer"     # try all 8 formats


class LearnService:
    """
    Facade for all learn-mode operations.
    Injected with a learn repository and the shared LLMService.
    """

    def __init__(
        self,
        learn_repo: ILearnRepository,
        llm_svc: LLMService,
    ) -> None:
        self._repo    = learn_repo
        self._llm_svc = llm_svc

    # ==================================================================
    # Session management
    # ==================================================================

    async def list_sessions(self, limit: int = 50) -> list[LearnSession]:
        return await self._repo.find_sessions(limit=limit)

    async def get_session(self, session_id: str) -> LearnSession:
        session = await self._repo.find_by_id(session_id)
        if session is None:
            raise EntityNotFoundError("LearnSession", session_id)
        return session

    async def delete_session(self, session_id: str) -> None:
        await self._repo.delete(session_id)

    async def get_user_stats(self) -> UserStats:
        return await self._repo.get_user_stats()

    # ==================================================================
    # Content generation — SSE stream
    # ==================================================================

    async def stream_session(
        self,
        topic: str,
        format: str,
        source_type: str,
        difficulty: str,
        source_ref: str | None,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        context_text: str = "",
        language: str = "English",
    ) -> AsyncGenerator[str, None]:
        """
        Create a LearnSession, generate content, stream SSE events.

        For text formats (story, eli5, speedlearn, brainstorm):
            streams tokens in real-time via LLMService.stream()
        For JSON formats (quiz, flashcard, mindmap, timeline):
            generates via LLMService.complete(), then streams the JSON string
            as token chunks so the client gets consistent SSE events.

        Raises ValueError for invalid format/difficulty before the first yield.
        """
        if format not in VALID_FORMATS:
            raise ValueError(f"Invalid format '{format}'. Must be one of: {sorted(VALID_FORMATS)}")
        if difficulty not in VALID_DIFFICULTIES:
            raise ValueError(f"Invalid difficulty '{difficulty}'")

        session = LearnSession(
            id=str(uuid.uuid4()),
            topic=topic,
            format=format,
            source_type=source_type,
            source_ref=source_ref,
            difficulty=difficulty,
            status="generating",
        )
        await self._repo.save(session)

        try:
            if format in _TEXT_FORMATS:
                # Stream tokens in real-time AND accumulate for saving — one LLM call.
                accumulated = ""
                messages = self._build_prompt(format, topic, difficulty, context_text, language)
                try:
                    async for token in self._llm_svc.stream(
                        messages=messages,
                        provider=provider,
                        model=model,
                        credentials=credentials,
                        max_tokens=1024,
                        temperature=0.7,
                    ):
                        accumulated += token
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                except Exception as exc:
                    raise RuntimeError(f"LLM streaming failed: {exc}") from exc
                new_content: dict = {"text": accumulated}
            else:
                # JSON format: generate with complete(), stream as tokens
                # Token budget: guided > quiz/flashcard > simpler formats
                _json_token_budget = {"animated": 5000, "guided": 4096, "quiz": 3000, "flashcard": 2500}
                json_max_tokens = _json_token_budget.get(format, 2048)
                messages = self._build_prompt(format, topic, difficulty, context_text, language)
                try:
                    raw = await self._llm_svc.complete(
                        messages=messages,
                        provider=provider,
                        model=model,
                        credentials=credentials,
                        max_tokens=json_max_tokens,
                        temperature=0.7,
                    )
                except Exception as exc:
                    raise RuntimeError(f"LLM generation failed: {exc}") from exc

                # Parse JSON — strip markdown code fences if present
                cleaned = _strip_code_fences(raw)
                try:
                    new_content = json.loads(cleaned)
                except json.JSONDecodeError:
                    # Malformed LLM JSON — most often an unescaped quote inside a
                    # string value ("Expecting ',' delimiter") or truncation by a
                    # token limit. _parse_llm_json chains both repairs.
                    try:
                        new_content = _parse_llm_json(cleaned)
                        logger.warning(
                            "Repaired malformed LLM JSON for format=%s topic=%r (len=%d)",
                            format, topic, len(cleaned),
                        )
                    except json.JSONDecodeError as exc:
                        # Log the FULL raw payload so a genuinely novel malformation
                        # can be diagnosed precisely (the user-facing error truncates).
                        logger.error(
                            "Unrepairable LLM JSON for format=%s topic=%r: %s\n"
                            "FULL RAW (len=%d):\n%s",
                            format, topic, exc, len(raw), raw,
                        )
                        raise ValueError(
                            f"LLM returned invalid JSON: {exc}\n\nRaw response:\n{raw[:200]}"
                        ) from exc

                # Stream the JSON string as token chunks
                json_str = json.dumps(new_content)
                chunk_size = 40
                for i in range(0, len(json_str), chunk_size):
                    chunk = json_str[i: i + chunk_size]
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

        except Exception as exc:
            logger.exception("LearnService stream failed for session %s: %s", session.id, exc)
            session.mark_error(str(exc))
            await self._repo.save(session)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return

        # ── Mark complete + award XP ──────────────────────────────────────
        session.mark_ready(new_content)
        await self._repo.save(session)

        xp_earned, new_badges = await self._award_session_xp(session)
        yield f"data: {json.dumps({'type': 'done', 'session_id': session.id, 'xp_earned': xp_earned, 'new_badges': new_badges})}\n\n"

        # ── Continuation loop: suggest where to go next (the "rabbit hole") ────
        # Emitted AFTER done so the lesson renders immediately and a failure here
        # can never break the lesson. The renderer shows these as clickable chips;
        # clicking generates the next lesson — turning a one-shot create into a
        # session that keeps going.
        suggestions = await self._suggest_next_topics(
            topic=topic, format=format, difficulty=difficulty,
            provider=provider, model=model, credentials=credentials,
        )
        if suggestions:
            yield f"data: {json.dumps({'type': 'suggestions', 'items': suggestions})}\n\n"

    # ==================================================================
    # Continuation suggestions ("where to next?")
    # ==================================================================

    async def _suggest_next_topics(
        self,
        *,
        topic: str,
        format: str,
        difficulty: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> list[dict]:
        """
        Return 3–4 follow-up suggestions to keep the user learning.

        Each item: {"label": short chip text, "topic": topic to generate,
        "kind": "deeper" | "next" | "related"}. Best-effort: any failure returns
        [] (the lesson is already complete, so this must never raise upward).
        """
        prompt = [
            {
                "role": "system",
                "content": (
                    "You suggest the next things a curious learner should explore. "
                    "Return ONLY a JSON array of exactly 4 objects, no prose. Each object: "
                    '{"label": "<=6 word chip text", "topic": "a specific, generatable topic", '
                    '"kind": "deeper" | "next" | "related"}. '
                    "Include at least one 'deeper' (a sub-concept to dive into), one 'next' "
                    "(the natural next step), and one 'related' (an adjacent idea). "
                    "Make them genuinely enticing and specific — not generic."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"The learner just finished a {difficulty}-level '{format}' lesson on: {topic}. "
                    "Suggest where to go next."
                ),
            },
        ]
        try:
            raw = await self._llm_svc.complete(
                messages=prompt, provider=provider, model=model,
                credentials=credentials, max_tokens=400, temperature=0.8,
            )
            data = _parse_llm_json(_strip_code_fences(raw))
        except Exception as exc:  # noqa: BLE001 — suggestions are best-effort
            logger.warning("Next-topic suggestions failed for %r: %s", topic, exc)
            return []

        # Accept either a bare array or {"items"/"suggestions": [...]}.
        items = data if isinstance(data, list) else (
            data.get("items") or data.get("suggestions") or []
        )
        out: list[dict] = []
        for it in items[:4]:
            if not isinstance(it, dict):
                continue
            label = str(it.get("label", "")).strip()
            t = str(it.get("topic", "")).strip()
            kind = str(it.get("kind", "related")).strip().lower()
            if label and t:
                out.append({
                    "label": label[:60],
                    "topic": t[:200],
                    "kind": kind if kind in ("deeper", "next", "related") else "related",
                })
        return out

    # ==================================================================
    # Quiz answer submission
    # ==================================================================

    async def submit_quiz_answer(
        self,
        session_id: str,
        question_index: int,
        answer: str,
    ) -> dict:
        """
        Check a quiz answer, award XP, return result.

        Returns dict matching QuizAnswerResponse schema.
        """
        session = await self.get_session(session_id)
        if session.format != "quiz":
            raise ValueError("Session is not a quiz")
        if session.content is None:
            raise ValueError("Quiz content not yet generated")

        questions = session.content.get("questions", [])
        if question_index >= len(questions):
            raise ValueError(f"Question index {question_index} out of range")

        q = questions[question_index]
        correct_index = int(q.get("correct", 0))
        options: list[str] = q.get("options", [])
        correct_answer = options[correct_index] if options else str(correct_index)
        is_correct = answer.strip().lower() == correct_answer.strip().lower()

        xp_earned = XP_QUIZ_CORRECT if is_correct else 0

        # Award XP
        stats = await self._repo.get_user_stats()
        stats.add_xp(xp_earned)
        stats.record_activity()
        new_badges: list[str] = []
        if is_correct and stats.award_badge(_BADGE_QUIZ_MASTER):
            new_badges.append(_BADGE_QUIZ_MASTER)
        await self._repo.save_user_stats(stats)

        score = sum(
            1 for qi, qq in enumerate(questions)
            if qi == question_index and is_correct
        ) / len(questions)

        return {
            "correct": is_correct,
            "correct_answer": correct_answer,
            "explanation": q.get("explanation", ""),
            "xp_earned": xp_earned,
            "session_score": round(score * 100, 1),
        }

    # ==================================================================
    # Flashcard review
    # ==================================================================

    async def review_flashcard(
        self,
        session_id: str,
        card_index: int,
        ease_rating: str,
    ) -> dict:
        """
        Rate a flashcard (again/hard/good/easy) and PERSIST its spaced-repetition
        schedule (lightweight SM-2). The card then resurfaces in the "review due"
        loop when its next_review_at arrives. Awards XP for good/easy.
        """
        session = await self.get_session(session_id)
        if session.format != "flashcard":
            raise ValueError("Session is not a flashcard deck")
        if ease_rating not in GRADES:
            raise ValueError(
                f"Invalid ease_rating '{ease_rating}'. Must be one of: {', '.join(GRADES)}"
            )

        cards = (session.content or {}).get("cards", [])
        if card_index < 0 or card_index >= len(cards):
            raise ValueError(f"Card index {card_index} out of range")

        now = datetime.utcnow()
        schedule = (
            await self._repo.get_card_schedule(session_id, card_index)
            or new_schedule(session_id, card_index)
        )
        updated = apply_grade(schedule, ease_rating, now)
        await self._repo.save_card_schedule(updated)

        if ease_rating in ("good", "easy"):
            stats = await self._repo.get_user_stats()
            stats.add_xp(2)
            stats.record_activity()
            await self._repo.save_user_stats(stats)

        return {
            "card_index": card_index,
            "ease_rating": ease_rating,
            "next_review_at": updated.next_review_at.isoformat(),
            "interval_days": updated.interval_days,
        }

    # ==================================================================
    # Spaced-repetition "review due" loop
    # ==================================================================

    async def count_due_reviews(self, now: datetime | None = None) -> int:
        """Number of flashcards due for review at or before *now* (badge count)."""
        return await self._repo.count_due_schedules(now or datetime.utcnow())

    async def get_due_reviews(self, limit: int = 20, now: datetime | None = None) -> list[dict]:
        """
        Due flashcards with their content, soonest-due first. Each item carries
        the card text plus its origin so the Review screen can render it and post
        the next rating back to the right (session_id, card_index).

        A schedule whose session or card has since been deleted is skipped — the
        loop self-heals rather than 500-ing on stale rows.
        """
        now = now or datetime.utcnow()
        schedules = await self._repo.find_due_schedules(now, limit)

        session_cache: dict[str, LearnSession | None] = {}
        out: list[dict] = []
        for sch in schedules:
            session = session_cache.get(sch.session_id, ...)
            if session is ...:
                session = await self._repo.find_by_id(sch.session_id)
                session_cache[sch.session_id] = session
            if session is None or not session.content:
                continue
            cards = session.content.get("cards", [])
            if sch.card_index < 0 or sch.card_index >= len(cards):
                continue
            card = cards[sch.card_index]
            out.append({
                "session_id": sch.session_id,
                "card_index": sch.card_index,
                "topic": session.topic,
                "front": card.get("front", ""),
                "back": card.get("back", ""),
                "hint": card.get("hint", ""),
                "due_at": sch.next_review_at.isoformat() if sch.next_review_at else None,
                "interval_days": sch.interval_days,
                "repetitions": sch.repetitions,
            })
        return out

    # ==================================================================
    # XP / gamification helpers
    # ==================================================================

    async def _award_session_xp(self, session: LearnSession) -> tuple[int, list[str]]:
        """Award XP for completing a session. Returns (xp_earned, new_badges)."""
        stats = await self._repo.get_user_stats()
        new_badges: list[str] = []

        # Base completion XP
        xp = XP_SESSION_COMPLETE
        if session.format == "flashcard":
            xp += XP_FLASHCARD_DECK

        # Streak bonus
        stats.record_activity()
        streak_bonus = min(stats.streak, 7) * XP_STREAK_BONUS
        xp += streak_bonus

        stats.add_xp(xp)

        # First session badge
        sessions = await self._repo.find_sessions(limit=2)
        if len(sessions) == 1 and stats.award_badge(_BADGE_FIRST_STEP):
            new_badges.append(_BADGE_FIRST_STEP)

        # Level up badge
        if stats.level >= 5 and stats.award_badge(_BADGE_LEVEL_5):
            new_badges.append(_BADGE_LEVEL_5)

        # Streak badge
        if stats.streak >= 7 and stats.award_badge(_BADGE_STREAK_7):
            new_badges.append(_BADGE_STREAK_7)

        # Explorer badge — tried all 8 formats
        all_sessions = await self._repo.find_sessions(limit=100)
        used_formats = {s.format for s in all_sessions if s.status == "ready"}
        if VALID_FORMATS.issubset(used_formats) and stats.award_badge(_BADGE_EXPLORER):
            new_badges.append(_BADGE_EXPLORER)

        await self._repo.save_user_stats(stats)
        return xp, new_badges

    # ==================================================================
    # Prompt builders (OCP: new format = new method)
    # ==================================================================

    def _build_prompt(
        self,
        format: str,
        topic: str,
        difficulty: str,
        context_text: str,
        language: str = "English",
    ) -> list[dict[str, str]]:
        """Return messages list for the LLM call.

        Multilingual (generate-in-language): when *language* is anything other
        than English we append an instruction to write all human-readable text
        in that language while keeping JSON keys in English — so the downstream
        JSON parser and the renderer keep working unchanged. Default English
        adds nothing, so existing behavior is untouched.
        """
        system = _SYSTEM_PROMPTS[format].format(topic=topic, difficulty=difficulty)
        if language and language.strip().lower() != "english":
            system += (
                f"\n\nIMPORTANT: Write all human-readable text (questions, answers, "
                f"explanations, titles, body copy) in {language}. "
                f"Keep all JSON keys/field names in English exactly as specified — "
                f"translate only the values, never the keys."
            )
        if context_text:
            # Teach the SUBJECT, not the source. Without this, a URL lesson
            # describes the web page/website (and a bare-hostname topic makes the
            # model "explain example.com") instead of the concept the page covers.
            system += (
                "\n\nThe SOURCE MATERIAL below is reference content to teach FROM. "
                "Teach the underlying subject/concept it covers — do NOT describe, "
                "summarise, or review the web page, website, document, its author, "
                "layout, or navigation. If the topic above is vague, a URL, or a "
                "site name, infer the actual subject from the source material and "
                "teach THAT."
            )
        user_parts = [f"Topic: {topic}"]
        # Coding topics must SHOW code, not describe it in the abstract.
        if _is_coding_topic(topic):
            if format == "animated":
                system += (
                    "\n\nThis is a PROGRAMMING topic: you MUST include the ACTUAL runnable snippet "
                    "in the top-level `code` field and add steps with `highlight` (1-based line "
                    "number) that walk the code line by line. Never explain code only in words or "
                    "with empty boxes."
                )
            else:
                system += (
                    "\n\nThis is a PROGRAMMING topic: include REAL, correct code in fenced "
                    "```<language>\\ncode\\n``` blocks and walk through it concretely — the input, "
                    "what each line does, and the output. Don't give theory only; show actual code "
                    "the learner can run."
                )
        user_parts = [f"Topic: {topic}"]
        if context_text:
            user_parts.append(f"\nSource material (teach the subject it covers):\n{context_text[:3000]}")
        return [
            {"role": "system", "content": system},
            {"role": "user",   "content": "\n".join(user_parts)},
        ]


# ---------------------------------------------------------------------------
# System prompts (OCP: extend without changing LearnService code)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPTS: dict[str, str] = {
    "quiz": (
        "You are an expert educator. Generate exactly 5 multiple-choice questions "
        "about '{topic}' for a {difficulty} level learner.\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences, no explanation.\n"
        'Format: {{"questions": [{{"q": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct": 0, "explanation": "..."}}]}}\n'
        "'correct' is the 0-based index of the right answer."
    ),
    "flashcard": (
        "You are an expert educator. Generate exactly 8 flashcards about '{topic}' "
        "for a {difficulty} level learner.\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences.\n"
        'Format: {{"cards": [{{"front": "...", "back": "...", "hint": "..."}}]}}'
    ),
    "mindmap": (
        "You are an expert educator. Create a mind map for '{topic}'.\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences.\n"
        'Format: {{"root": "...", "branches": [{{"label": "...", "children": [{{"label": "...", "children": []}}]}}]}}\n'
        "Maximum 4 main branches, up to 3 children per branch."
    ),
    "timeline": (
        "You are an expert educator. Generate a chronological timeline for '{topic}' "
        "with 6-10 key events.\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences.\n"
        'Format: {{"events": [{{"year": "...", "title": "...", "description": "..."}}]}}'
    ),
    "story": (
        "You are an expert storyteller-educator. Tell the story of '{topic}' in "
        "an engaging, narrative style for a {difficulty} level learner. "
        "Use analogies, real-world examples, and vivid descriptions. "
        "Approximately 350-450 words. Use markdown headings and paragraphs."
    ),
    "eli5": (
        "You are explaining '{topic}' to a curious, smart 8-year-old child. "
        "Use simple everyday words, concrete real-world analogies, and a friendly tone. "
        "Avoid jargon. Use short sentences. Approximately 150-200 words. "
        "Start with an analogy they'd recognise."
    ),
    "speedlearn": (
        "You are a study coach creating a rapid reference for '{topic}' at {difficulty} level. "
        "Generate 10-15 key concepts as a scannable bullet list. "
        "For each point: **Bold key term** — one-sentence explanation. "
        "Start with the most important concept. Use markdown."
    ),
    "brainstorm": (
        "You are a creative thinker exploring '{topic}'. "
        "Generate creative connections, surprising facts, unexpected applications, "
        "powerful analogies, and thought-provoking questions. "
        "Present as a mix of bullet points, short paragraphs, and surprising 'Did you know?' facts. "
        "Aim for 300-400 words. Be creative and thought-provoking. Use markdown."
    ),
    "guided": (
        "You are the best teacher in the world on '{topic}' — combine the clarity of Feynman, "
        "the intuition-first style of 3Blue1Brown, and the warmth of a favourite mentor. "
        "You have taught this concept thousands of times to {difficulty}-level learners and know "
        "exactly where people get confused. Create an interactive, step-by-step guided lesson.\n"
        "TEACHING PRINCIPLES (apply to every step):\n"
        "- Intuition before formalism: build the mental picture first, define terms only as needed.\n"
        "- One idea per step, and each step must build on the previous one (reference it).\n"
        "- Use a CONCRETE, specific, vivid example — never a generic placeholder.\n"
        "- Name the COMMON MISCONCEPTION for this idea and correct it, woven into the explanation.\n"
        "- The analogy must be genuinely illuminating (maps to the concept's structure), not decorative.\n"
        "- key_insight is the 'aha' — the thing they'll remember in a year.\n"
        "- check_in is a Socratic question that makes them think, not recall.\n"
        "- Warm, encouraging, plain language; define any jargon the first time it appears.\n"
        "Generate 5-7 steps. Each step covers ONE idea and follows the principles above.\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences.\n"
        "Format:\n"
        '{{"topic": "...", '
        '"intro": "one engaging hook sentence about why this topic is fascinating or important", '
        '"total_steps": N, '
        '"steps": ['
        '{{"step": 1, '
        '"title": "short step title (max 8 words)", '
        '"explanation": "clear 2-3 paragraph explanation in plain language — define any jargon", '
        '"example": "a concrete, specific real-world example that makes the concept tangible", '
        '"analogy": "a memorable analogy or comparison (or null if not applicable)", '
        '"key_insight": "the single most important takeaway in one sentence", '
        '"check_in": "a reflective self-check question the learner can ask themselves", '
        '"quiz_check": {{'
        '"question": "A short comprehension question to check understanding (max 15 words)?", '
        '"options": ["plausible option A (max 8 words)", "plausible option B (max 8 words)", "plausible option C (max 8 words)"], '
        '"correct": 0, '
        '"feedback_correct": "Exactly right! One reinforcing sentence.", '
        '"feedback_wrong": "Not quite. One clear corrective sentence explaining the right answer."'
        '}}'
        '}}'
        ']}}'
    ),
    "animated": (
        "You are an expert educator scripting an ANIMATED visual lesson on '{topic}' for a "
        "{difficulty} learner, in the spirit of 3Blue1Brown / Khan Academy. You do NOT place "
        "anything on screen — a layout engine draws the diagram. You only declare the STRUCTURE "
        "and narrate. Do not default to boxes; pick what the topic actually IS.\n\n"
        "1) CHOOSE the diagram that matches the topic's structure:\n"
        "   reaction — a TRANSFORMATION where inputs combine/convert into outputs "
        "(X + Y → Z): e.g. photosynthesis, respiration, chemical reactions, "
        "supply→process→product. Set each item's `role` to \"input\", \"process\", or "
        "\"output\". Inputs fan IN to the process, the process fans OUT to outputs — "
        "directions are drawn correctly for you, so DON'T use this as a plain hub.\n"
        "   flow     — a sequence / pipeline / how-it-works (items in order)\n"
        "   cycle    — a repeating loop (items around a ring)\n"
        "   tree     — hierarchy / parts-of / taxonomy (set each child's `parent`)\n"
        "   compare  — A vs B (set each item's `group` to \"left\" or \"right\")\n"
        "   timeline — events over time (items in chronological order)\n"
        "   hub      — one central concept with related (non-directional) satellites\n"
        "   code     — a programming topic (put the REAL runnable snippet in `code`)\n"
        "   Prefer `reaction` over `hub` whenever something is CONVERTED into something "
        "else — `hub` cannot show input-vs-output direction and will mislead the learner.\n\n"
        "2) DECLARE 3-7 items: short labels (1-3 words), unique short ids.\n"
        "   `edges` only when the connection isn't implied by the diagram type.\n\n"
        "3) SCRIPT 5-9 steps that TEACH (this is where the explaining happens):\n"
        "   - `narration`: 1-2 conversational sentences — the actual teaching. Build intuition "
        "first, name the mechanism, give a concrete example, end with a recap step.\n"
        "   - `reveal`: the item ids that APPEAR at this step. Reveal 1 (max 2) new items per "
        "step so the diagram grows one idea at a time and the learner is never overwhelmed.\n"
        "   - `focus`: the id the narration is about — it gets spotlighted while the rest dim. "
        "ALWAYS point the focus at what you're talking about.\n"
        "   - `caption`: optional short on-screen heading for the step.\n"
        "   - For programming topics: include the real code in `code` and add step(s) with "
        "`highlight` (1-based line number) walking the code line by line.\n"
        "   - The final step should reveal nothing new: recap over the finished diagram.\n\n"
        "IMPORTANT: Return ONLY valid JSON — no markdown, no code fences.\n"
        "Format:\n"
        '{{"topic":"...","title":"short lesson title",'
        '"diagram":"reaction|flow|cycle|tree|compare|timeline|hub|code",'
        '"items":[{{"id":"a","label":"Sunlight","role":"input (reaction only: input|process|output)"}},{{"id":"b","label":"Chloroplast","parent":"a (tree only)","group":"left (compare only)"}}],'
        '"edges":[{{"from":"a","to":"b"}}],'
        '"code":{{"lang":"python","code":"def f(x):\\n    return x*2"}},'
        '"steps":[{{"narration":"teaching sentence(s)","reveal":["a"],"focus":"a","caption":"optional heading","highlight":2,"duration":5}}]}}\n'
        "Omit `edges` and `code` when not needed."
    ),
}


def _escape_inner_quotes(text: str) -> str:
    """
    Escape double-quotes that appear *inside* a JSON string value where the model
    forgot to escape them (e.g. quoting a term mid-sentence: the "boundary" layer).

    This is the root cause of "Expecting ',' delimiter" parse failures: the stray
    quote terminates the string early. We distinguish a *genuine* closing quote —
    which in valid JSON is always followed (after optional whitespace) by a
    structural delimiter (``, : } ]``) or end-of-input — from a stray content
    quote, which is followed by anything else and is therefore escaped.

    Valid JSON is returned unchanged (the lookahead never misfires), so this is
    safe to run on every response. Known limitation: a quoted phrase immediately
    followed by a comma inside a value (``"yes", he said``) is ambiguous and may
    still be misread; such cases fall through to the truncation repair / error.
    """
    out: list[str] = []
    in_string = False
    escape_next = False
    n = len(text)
    i = 0

    while i < n:
        ch = text[i]
        if escape_next:
            out.append(ch)
            escape_next = False
            i += 1
            continue
        if ch == "\\":
            out.append(ch)
            escape_next = True
            i += 1
            continue
        if ch == '"':
            if not in_string:
                in_string = True
                out.append(ch)
            else:
                # Closing quote, or stray inner quote? Look ahead past whitespace.
                j = i + 1
                while j < n and text[j] in " \t\r\n":
                    j += 1
                c1 = text[j] if j < n else ""

                if c1 in (":", "}", "]", '"', ""):
                    # A real closing quote is followed by a structural delimiter,
                    # by another string (adjacent ", treated as a missing comma —
                    # don't merge the fields), or by end-of-input.
                    closing = True
                elif c1 == ",":
                    # A comma is ambiguous: a *field separator* is followed by the
                    # next key/value (a quote, a container, or a literal); a comma
                    # that is part of prose is followed by ordinary text.
                    k = j + 1
                    while k < n and text[k] in " \t\r\n":
                        k += 1
                    c2 = text[k] if k < n else ""
                    closing = c2 in ('"', "{", "[", "-", "t", "f", "n", "") or c2.isdigit()
                else:
                    closing = False

                if closing:
                    in_string = False
                    out.append(ch)
                else:
                    out.append('\\"')  # literal content quote → escape it
            i += 1
            continue
        out.append(ch)
        i += 1

    return "".join(out)


def _parse_llm_json(text: str) -> dict:
    """
    Parse possibly-malformed LLM JSON. Cheap, content-preserving repairs run
    first (escape stray inner quotes → close truncation → both); if those still
    fail — typically a STRUCTURAL break the model introduced, e.g. a flattened
    array missing per-element braces — fall back to the wrapped json_repair
    library, which recovers a usable object from badly broken JSON.

    Returns the parsed dict, or raises json.JSONDecodeError if nothing recovers
    a non-empty object (so callers can surface a clean error event).
    """
    candidates = (
        text,
        _escape_inner_quotes(text),
        _repair_truncated_json(text),
        _repair_truncated_json(_escape_inner_quotes(text)),
    )
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    # Robust structural repair via the anti-corruption wrapper. json_repair
    # never raises; it returns an empty value for hopeless input, so validate.
    repaired = repair_json_object(text)
    if isinstance(repaired, dict) and repaired:
        return repaired

    raise json.JSONDecodeError("Could not repair malformed JSON", text, 0)


def _repair_truncated_json(text: str) -> str:
    """
    Best-effort repair for JSON truncated mid-string by a token limit.

    Uses a bracket stack so closers are emitted in the correct reverse order
    of opening. If the text ends inside a string, closes the string first.
    """
    if not text.strip():
        return text

    stack: list[str] = []  # "{" or "[" for each unclosed bracket
    in_string = False
    escape_next = False

    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if in_string:
            if ch == "\\":
                escape_next = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("{")
        elif ch == "[":
            stack.append("[")
        elif ch in ("}", "]") and stack and stack[-1] == ("{" if ch == "}" else "["):
            stack.pop()

    candidate = text

    # Close an open string.
    if in_string:
        candidate += '"'

    # Strip trailing commas/colons left dangling before closers.
    candidate = candidate.rstrip()
    while candidate and candidate[-1] in (",", ":"):
        candidate = candidate[:-1].rstrip()

    # Close brackets in reverse order of opening.
    for bracket in reversed(stack):
        candidate += "}" if bracket == "{" else "]"

    return candidate


def _strip_code_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers from LLM output."""
    text = text.strip()
    # Remove leading ```json or ``` fence
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    # Remove trailing ``` fence
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()
