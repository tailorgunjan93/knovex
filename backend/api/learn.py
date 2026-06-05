"""
Learn API Router — Sprint 6

Endpoints:
  POST   /api/learn/sessions/stream              Create session + stream SSE
  GET    /api/learn/sessions                     List sessions
  GET    /api/learn/sessions/{session_id}        Get session
  DELETE /api/learn/sessions/{session_id}        Delete session
  POST   /api/learn/sessions/{session_id}/quiz/answer     Submit quiz answer
  POST   /api/learn/sessions/{session_id}/flashcard/review Rate flashcard
  GET    /api/learn/stats                        Get user stats (XP, level, streak, badges)

DIP: LearnService injected via Depends(); routes never import storage.
SRP: routes only handle HTTP concerns; business logic in LearnService.

SSE event protocol:
    data: {"type": "token",  "content": "..."}
    data: {"type": "done",   "session_id": "...", "xp_earned": N, "new_badges": [...]}
    data: {"type": "error",  "error": "..."}
"""

from __future__ import annotations

import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.core.dependencies import (
    LearnServiceDep,
    SettingsServiceDep,
)
from backend.core.providers.base import ProviderCredentials
from backend.models.schemas import (
    LearnSessionCreate,
    LearnSessionResponse,
    QuizAnswerRequest,
    QuizAnswerResponse,
    UserStatsResponse,
)
from backend.storage.repositories.base import EntityNotFoundError

logger = logging.getLogger("knovex.api.learn")

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _handle_not_found(exc: EntityNotFoundError) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


def _session_to_response(session) -> LearnSessionResponse:
    return LearnSessionResponse(
        id=session.id,
        topic=session.topic,
        format=session.format,
        source_type=session.source_type,
        difficulty=session.difficulty,
        status=session.status,
        content=session.content,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


# ---------------------------------------------------------------------------
# Streaming session creation — main entry point
# ---------------------------------------------------------------------------

@router.post(
    "/learn/sessions/stream",
    summary="Create a learn session and stream content (SSE)",
    response_description="Server-Sent Events stream of typed events",
)
async def stream_learn_session(
    body: LearnSessionCreate,
    learn_svc: LearnServiceDep,
    settings_svc: SettingsServiceDep,
) -> StreamingResponse:
    """
    Create a new learn session and stream generated content via SSE.

    The session is persisted immediately; content streams as it generates.

    SSE event types:
    - ``{"type": "token",  "content": "..."}``          — streamed text token
    - ``{"type": "done",   "session_id": "...",
          "xp_earned": N,  "new_badges": [...]}``        — stream complete
    - ``{"type": "error",  "error": "..."}``             — error mid-stream
    """
    current = await settings_svc.get()
    llm = current.llm
    credentials = ProviderCredentials(
        api_key=llm.api_key,
        base_url=llm.base_url,
        aws_region=llm.aws_region,
        aws_access_key_id=llm.aws_access_key_id,
        aws_secret_access_key=llm.aws_secret_access_key,
    )

    # ── Resolve context text ──────────────────────────────────────────────────
    context_text = body.context_text or ""

    # For URL source: fetch the page content server-side (avoids browser CORS)
    if body.source_type == "url" and body.source_ref and not context_text:
        try:
            async with httpx.AsyncClient(
                timeout=12,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; Knovex/1.0)"},
            ) as client:
                resp = await client.get(body.source_ref)
                resp.raise_for_status()
                # Strip HTML tags for a clean text context
                raw_html = resp.text
                no_script = re.sub(r"<(script|style)[^>]*>.*?</(script|style)>", " ", raw_html, flags=re.S | re.I)
                plain = re.sub(r"<[^>]+>", " ", no_script)
                plain = re.sub(r"&[a-z]+;", " ", plain)
                context_text = re.sub(r"\s{2,}", " ", plain).strip()[:8000]
                logger.info("Fetched URL %s — %d chars", body.source_ref, len(context_text))
        except Exception as exc:
            logger.warning("Failed to fetch URL %s: %s", body.source_ref, exc)
            # Continue without context — LLM will use its training knowledge

    try:
        stream = learn_svc.stream_session(
            topic=body.topic,
            format=body.format,
            source_type=body.source_type,
            difficulty=body.difficulty,
            source_ref=body.source_ref,
            provider=llm.provider,
            model=llm.model,
            credentials=credentials,
            context_text=context_text,
            language=body.language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

@router.get(
    "/learn/sessions",
    response_model=list[LearnSessionResponse],
    summary="List learn sessions",
)
async def list_sessions(
    learn_svc: LearnServiceDep,
) -> list[LearnSessionResponse]:
    """Return the 50 most recent learn sessions."""
    sessions = await learn_svc.list_sessions()
    return [_session_to_response(s) for s in sessions]


@router.get(
    "/learn/sessions/{session_id}",
    response_model=LearnSessionResponse,
    summary="Get a learn session",
)
async def get_session(
    session_id: str,
    learn_svc: LearnServiceDep,
) -> LearnSessionResponse:
    try:
        session = await learn_svc.get_session(session_id)
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    return _session_to_response(session)


@router.delete(
    "/learn/sessions/{session_id}",
    status_code=204,
    summary="Delete a learn session",
)
async def delete_session(
    session_id: str,
    learn_svc: LearnServiceDep,
) -> None:
    await learn_svc.delete_session(session_id)


# ---------------------------------------------------------------------------
# Quiz interaction
# ---------------------------------------------------------------------------

@router.post(
    "/learn/sessions/{session_id}/quiz/answer",
    response_model=QuizAnswerResponse,
    summary="Submit a quiz answer",
)
async def submit_quiz_answer(
    session_id: str,
    body: QuizAnswerRequest,
    learn_svc: LearnServiceDep,
) -> QuizAnswerResponse:
    """
    Check a quiz answer, award XP if correct, return result.

    Returns whether the answer was correct, the correct answer text,
    an explanation, XP earned, and running session score.
    """
    try:
        result = await learn_svc.submit_quiz_answer(
            session_id=session_id,
            question_index=body.question_index,
            answer=body.answer,
        )
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return QuizAnswerResponse(**result)


# ---------------------------------------------------------------------------
# Flashcard review (spaced repetition)
# ---------------------------------------------------------------------------

@router.post(
    "/learn/sessions/{session_id}/flashcard/review",
    summary="Rate a flashcard for spaced repetition",
)
async def review_flashcard(
    session_id: str,
    card_index: int,
    ease_rating: str,
    learn_svc: LearnServiceDep,
) -> dict:
    """
    Rate a flashcard with an ease rating (again/hard/good/easy).

    Calculates next review date based on spaced repetition intervals
    and awards XP for good/easy ratings.
    """
    try:
        return await learn_svc.review_flashcard(
            session_id=session_id,
            card_index=card_index,
            ease_rating=ease_rating,
        )
    except EntityNotFoundError as exc:
        raise _handle_not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# User stats / gamification
# ---------------------------------------------------------------------------

@router.get(
    "/learn/stats",
    response_model=UserStatsResponse,
    summary="Get user gamification stats",
)
async def get_user_stats(
    learn_svc: LearnServiceDep,
) -> UserStatsResponse:
    """Return XP, level, streak, last activity, and earned badges."""
    stats = await learn_svc.get_user_stats()
    return UserStatsResponse(
        xp=stats.xp,
        level=stats.level,
        streak=stats.streak,
        last_activity=stats.last_activity,
        badges=stats.badges,
    )
