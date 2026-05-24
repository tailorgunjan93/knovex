"""
Summariser Service — Sprint 4

Responsibilities:
  - Summarise a single file using its indexed chunks
  - Summarise an entire KB by aggregating chunks across all files
  - Two length modes: brief (≈150 words) and detailed (≈600 words)

Architecture:
  SRP  — only summarisation; no session management, no user-facing chat
  DIP  — depends on IFileRepository, LLMService (abstractions), SQLiteBackend
  OCP  — new length mode = new system-prompt variant; nothing else changes

SSE protocol (same as Chat):
  data: {"type": "token",  "content": "..."}\\n\\n
  data: {"type": "done",   "file_name": "..."}\\n\\n
  data: {"type": "error",  "error": "..."}\\n\\n
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.file_repository import IFileRepository

logger = logging.getLogger("knovex.summariser")

_MAX_FILE_CHUNKS    = 30
_MAX_KB_CHUNKS      = 60
_MAX_CONTEXT_CHARS  = 12_000

_LENGTH_PROMPTS = {
    "brief": (
        "Write a concise summary of the following document content in approximately "
        "150 words. Focus on the main topic, key points, and conclusions."
    ),
    "detailed": (
        "Write a comprehensive summary of the following document content in "
        "approximately 600 words. Cover the main topic, key sections, important "
        "details, findings, and conclusions. Use bullet points for key points."
    ),
}


class SummariserService:
    """
    Generates streaming LLM summaries for files and entire KBs.
    """

    def __init__(
        self,
        file_repo: IFileRepository,
        backend,        # SQLiteBackend — for chunk queries
        llm_svc: LLMService,
    ) -> None:
        self._file_repo = file_repo
        self._backend   = backend
        self._llm_svc   = llm_svc

    # ==================================================================
    # Summarise a single file
    # ==================================================================

    async def summarise_file(
        self,
        kb_id: str,
        file_id: str,
        length: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> AsyncGenerator[str, None]:
        """
        Stream an LLM summary of a single file's indexed chunks.

        Yields SSE strings. Raises EntityNotFoundError / ValueError before
        the first yield if validation fails (so the route can return 404/400).
        """
        return self._summarise_file_gen(
            kb_id, file_id, length, provider, model, credentials
        )

    async def _summarise_file_gen(
        self,
        kb_id: str,
        file_id: str,
        length: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> AsyncGenerator[str, None]:
        file = await self._file_repo.find_by_id(file_id)
        if file is None or file.kb_id != kb_id:
            raise EntityNotFoundError("FileRecord", file_id)
        if file.status not in ("ready", "stale"):
            raise ValueError(
                f"File '{file.name}' is not yet indexed (status: {file.status})"
            )

        rows = await self._backend.fetchall(
            """
            SELECT content, section FROM chunks
            WHERE  file_id = ?
            ORDER  BY chunk_index
            LIMIT  ?
            """,
            (file_id, _MAX_FILE_CHUNKS),
        )
        context = _build_context(rows)

        system_prompt = _LENGTH_PROMPTS.get(length, _LENGTH_PROMPTS["brief"])
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Document: '{file.name}'\n\n"
                    f"Content:\n\n{context}"
                ),
            },
        ]

        async for event in _stream_llm(
            self._llm_svc, messages, provider, model, credentials, file.name
        ):
            yield event

    # ==================================================================
    # Summarise an entire KB
    # ==================================================================

    async def summarise_kb(
        self,
        kb_id: str,
        length: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> AsyncGenerator[str, None]:
        """Stream an LLM summary of all indexed content in a KB."""
        return self._summarise_kb_gen(kb_id, length, provider, model, credentials)

    async def _summarise_kb_gen(
        self,
        kb_id: str,
        length: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
    ) -> AsyncGenerator[str, None]:
        rows = await self._backend.fetchall(
            """
            SELECT c.content, c.section, f.name AS file_name
            FROM   chunks c
            JOIN   file_records f ON f.id = c.file_id
            WHERE  c.kb_id = ?
            ORDER  BY f.name, c.chunk_index
            LIMIT  ?
            """,
            (kb_id, _MAX_KB_CHUNKS),
        )
        if not rows:
            yield f"data: {json.dumps({'type': 'error', 'error': 'No indexed content found in this knowledge base.'})}\n\n"
            return

        # Group by file for context
        context_parts: list[str] = []
        current_file = ""
        chars = 0
        for row in rows:
            fname = row.get("file_name", "")
            if fname != current_file:
                current_file = fname
                context_parts.append(f"\n## {fname}\n")
            chunk = row["content"]
            if chars + len(chunk) > _MAX_CONTEXT_CHARS:
                break
            context_parts.append(chunk)
            chars += len(chunk)

        context = "\n".join(context_parts)

        system_prompt = _LENGTH_PROMPTS.get(length, _LENGTH_PROMPTS["brief"])
        messages = [
            {"role": "system", "content": system_prompt + " The content comes from multiple files in a knowledge base."},
            {
                "role": "user",
                "content": f"Knowledge Base Content:\n\n{context}",
            },
        ]

        async for event in _stream_llm(
            self._llm_svc, messages, provider, model, credentials, "knowledge base"
        ):
            yield event


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _build_context(rows: list[dict]) -> str:
    parts: list[str] = []
    total = 0
    for row in rows:
        text = row["content"]
        if total + len(text) > _MAX_CONTEXT_CHARS:
            break
        section = row.get("section") or ""
        header = f"[{section}] " if section else ""
        parts.append(f"{header}{text}")
        total += len(text)
        parts.append("---")
    return "\n".join(parts) or "(no content)"


async def _stream_llm(
    llm_svc: LLMService,
    messages: list[dict],
    provider: str,
    model: str,
    credentials: ProviderCredentials,
    subject: str,
) -> AsyncGenerator[str, None]:
    try:
        async for token in llm_svc.stream(
            messages=messages,
            provider=provider,
            model=model,
            credentials=credentials,
            max_tokens=1024,
            temperature=0.3,
        ):
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
    except Exception as exc:
        logger.exception("Summariser stream failed: %s", exc)
        yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
        return

    yield f"data: {json.dumps({'type': 'done', 'subject': subject})}\n\n"
