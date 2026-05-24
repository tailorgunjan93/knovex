"""
Chat Service — Sprint 4

Responsibilities:
  - Session CRUD (create, list, get, rename, delete)
  - Streaming QA over a Knowledge Base via SSE
  - Hybrid retrieval: FTS5 keyword search → LLM answer with source citations
  - Optional web search augmentation
  - Persisting complete assistant messages after streaming finishes

Architecture:
  SRP  — only chat coordination; no DB writes except via repository
  DIP  — depends on IChatRepository, IFileRepository, LLMService, SearchService
  OCP  — retrieval strategy (FTS5 → future dense ANN) swappable without API change

SSE event protocol (each yielded string):
    data: {"type": "token",       "content": "..."}\\n\\n
    data: {"type": "sources",     "sources": [...]}\\n\\n
    data: {"type": "web_sources", "sources": [...]}\\n\\n
    data: {"type": "done",        "message_id": "..."}\\n\\n
    data: {"type": "error",       "error":    "..."}\\n\\n
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import AsyncGenerator

from backend.core.domain.chat import ChatMessage, ChatSession
from backend.core.llm_service import LLMService
from backend.core.providers.base import ProviderCredentials
from backend.core.search_service import SearchService
from backend.storage.repositories.base import EntityNotFoundError
from backend.storage.repositories.chat_repository import IChatRepository
from backend.storage.repositories.file_repository import IFileRepository

logger = logging.getLogger("knovex.chat")

# ── Retrieval settings ────────────────────────────────────────────────────────

_MAX_CONTEXT_CHUNKS     = 12      # max KB chunks per answer
_MAX_CONTEXT_CHARS      = 8_000   # max total chars from KB
_MAX_HISTORY_MESSAGES   = 10      # recent messages included in prompt
_MAX_HISTORY_CHARS      = 4_000   # cap on history chars
_MAX_WEB_RESULTS        = 4       # web results included when enabled


class ChatService:
    """
    Facade for all chat operations.

    Streaming uses SSE (server-sent events) to push tokens to the client
    as they arrive from the LLM. After the stream ends the complete
    assistant message is persisted once to SQLite.
    """

    def __init__(
        self,
        chat_repo: IChatRepository,
        file_repo: IFileRepository,
        backend,              # SQLiteBackend — for FTS5 chunk queries
        llm_svc: LLMService,
        search_svc: SearchService,
    ) -> None:
        self._chat_repo  = chat_repo
        self._file_repo  = file_repo
        self._backend    = backend
        self._llm_svc    = llm_svc
        self._search_svc = search_svc

    # ==================================================================
    # Session management
    # ==================================================================

    async def create_session(
        self,
        kb_id: str | None = None,
        title: str = "New Chat",
    ) -> ChatSession:
        session = ChatSession(
            id=str(uuid.uuid4()),
            title=title,
            kb_id=kb_id,
        )
        return await self._chat_repo.save(session)

    async def get_session(self, session_id: str) -> ChatSession:
        session = await self._chat_repo.find_by_id(session_id)
        if session is None:
            raise EntityNotFoundError("ChatSession", session_id)
        return session

    async def list_sessions(self, kb_id: str | None = None) -> list[ChatSession]:
        if kb_id:
            return await self._chat_repo.find_sessions_by_kb(kb_id)
        return await self._chat_repo.find_all()

    async def rename_session(self, session_id: str, title: str) -> ChatSession:
        session = await self.get_session(session_id)
        session.rename(title)
        return await self._chat_repo.save(session)

    async def delete_session(self, session_id: str) -> None:
        await self._chat_repo.delete(session_id)

    async def get_messages(self, session_id: str) -> list[ChatMessage]:
        return await self._chat_repo.find_messages(session_id)

    async def export_session(self, session_id: str) -> str:
        """Export a session as a Markdown document."""
        session = await self.get_session(session_id)
        messages = await self.get_messages(session_id)
        lines = [f"# {session.title}\n"]
        for msg in messages:
            role_label = "**You**" if msg.role == "user" else "**Assistant**"
            lines.append(f"{role_label}\n\n{msg.content}\n")
            if msg.sources:
                lines.append("*Sources: " + ", ".join(
                    s.get("file", "") for s in msg.sources
                ) + "*\n")
        return "\n---\n\n".join(lines)

    # ==================================================================
    # Streaming QA
    # ==================================================================

    async def stream_message(
        self,
        session_id: str,
        user_message: str,
        provider: str,
        model: str,
        credentials: ProviderCredentials,
        use_web_search: bool = False,
        search_engine: str = "duckduckgo",
        search_api_key: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Accept *user_message*, retrieve context, stream an LLM reply.

        Yields SSE-formatted strings.  Persists both the user message and the
        complete assistant message to SQLite after the stream finishes.

        Raises EntityNotFoundError if the session doesn't exist.
        """
        session = await self.get_session(session_id)

        # ── 1. Persist user message ────────────────────────────────────────
        user_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="user",
            content=user_message,
        )
        await self._chat_repo.save_message(user_msg)

        # ── 2. KB retrieval (FTS5) ─────────────────────────────────────────
        kb_sources: list[dict] = []
        kb_context = ""
        if session.kb_id:
            kb_context, kb_sources = await self._retrieve_kb_context(
                kb_id=session.kb_id,
                query=user_message,
            )

        # ── 3. Optional web search ─────────────────────────────────────────
        web_sources: list[dict] = []
        web_context = ""
        if use_web_search:
            web_resp = await self._search_svc.search(
                query=user_message,
                engine=search_engine,
                api_key=search_api_key,
                num_results=_MAX_WEB_RESULTS,
            )
            web_sources = [r.model_dump() for r in web_resp.results]
            if web_sources:
                web_context = "\n\n".join(
                    f"[WEB] {r['title']}\n{r['url']}\n{r['snippet']}"
                    for r in web_sources
                )

        # ── 4. Emit source events before streaming tokens ─────────────────
        if kb_sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': kb_sources})}\n\n"
        if web_sources:
            yield f"data: {json.dumps({'type': 'web_sources', 'sources': web_sources})}\n\n"

        # ── 5. Build prompt ────────────────────────────────────────────────
        history = await self._build_history(session_id)
        messages = self._build_messages(
            session=session,
            history=history,
            user_message=user_message,
            kb_context=kb_context,
            web_context=web_context,
        )

        # ── 6. Stream LLM response ─────────────────────────────────────────
        full_reply = ""
        try:
            async for token in self._llm_svc.stream(
                messages=messages,
                provider=provider,
                model=model,
                credentials=credentials,
                max_tokens=2048,
                temperature=0.4,
            ):
                full_reply += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception as exc:
            logger.exception("Chat stream failed for session %s: %s", session_id, exc)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

        # ── 7. Persist assistant message ───────────────────────────────────
        assistant_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="assistant",
            content=full_reply,
            sources=kb_sources,
            web_sources=web_sources,
        )
        await self._chat_repo.save_message(assistant_msg)

        # Bump session updated_at
        session.touch()
        await self._chat_repo.save(session)

        yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg.id})}\n\n"

    # ==================================================================
    # Private helpers
    # ==================================================================

    async def _retrieve_kb_context(
        self, kb_id: str, query: str
    ) -> tuple[str, list[dict]]:
        """
        FTS5 keyword search over chunks in *kb_id*.

        Returns (context_string, sources_list).
        """
        # Sanitise query for FTS5 (remove special chars that confuse the parser)
        safe_query = " ".join(
            w for w in query.split()
            if len(w) > 2 and w.isalnum() or w.replace("'", "").isalnum()
        ) or query[:50]

        try:
            rows = await self._backend.fetchall(
                """
                SELECT c.content, c.section, c.page, c.file_id,
                       f.name AS file_name
                FROM   chunks_fts cf
                JOIN   chunks     c  ON c.rowid = cf.rowid
                JOIN   file_records f ON f.id = c.file_id
                WHERE  chunks_fts MATCH ?
                  AND  c.kb_id = ?
                ORDER  BY rank
                LIMIT  ?
                """,
                (safe_query, kb_id, _MAX_CONTEXT_CHUNKS),
            )
        except Exception as exc:
            logger.warning("FTS5 search error (falling back to sequential): %s", exc)
            # Fallback: grab most-recent chunks sequentially
            rows = await self._backend.fetchall(
                """
                SELECT c.content, c.section, c.page, c.file_id,
                       f.name AS file_name
                FROM   chunks c
                JOIN   file_records f ON f.id = c.file_id
                WHERE  c.kb_id = ?
                ORDER  BY c.chunk_index
                LIMIT  ?
                """,
                (kb_id, _MAX_CONTEXT_CHUNKS),
            )

        if not rows:
            return "", []

        sources: list[dict] = []
        parts: list[str] = []
        seen_files: set[str] = set()
        total_chars = 0

        for row in rows:
            chunk_text = row["content"]
            if total_chars + len(chunk_text) > _MAX_CONTEXT_CHARS:
                break
            section = row.get("section") or ""
            header = f"[{section}] " if section else ""
            parts.append(f"{header}{chunk_text}")
            total_chars += len(chunk_text)
            parts.append("---")

            file_name = row.get("file_name", "")
            if file_name not in seen_files:
                seen_files.add(file_name)
                sources.append({
                    "file": file_name,
                    "section": section,
                    "page": row.get("page"),
                })

        return "\n".join(parts), sources

    async def _build_history(self, session_id: str) -> list[dict[str, str]]:
        """Return the last N messages as LLM-format dicts, truncated to char limit."""
        messages = await self._chat_repo.find_messages(session_id)
        # Take last _MAX_HISTORY_MESSAGES messages (excluding the user msg just added)
        recent = messages[-((_MAX_HISTORY_MESSAGES * 2) + 1):-1]
        result: list[dict[str, str]] = []
        total = 0
        for msg in reversed(recent):
            if total + len(msg.content) > _MAX_HISTORY_CHARS:
                break
            result.insert(0, {"role": msg.role, "content": msg.content})
            total += len(msg.content)
        return result

    def _build_messages(
        self,
        session: ChatSession,
        history: list[dict[str, str]],
        user_message: str,
        kb_context: str,
        web_context: str,
    ) -> list[dict[str, str]]:
        """Build the full messages list for the LLM call."""
        # System prompt
        kb_note = f" You are answering questions about the knowledge base '{session.kb_id}'." if session.kb_id else ""
        system_content = (
            "You are Knovex, a helpful AI assistant."
            f"{kb_note} "
            "Answer using the provided context when available. "
            "If you use context, cite the source file name. "
            "If context doesn't contain the answer, say so clearly. "
            "Be concise and accurate."
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
        messages.extend(history)

        # User message with context
        user_content_parts = []
        if kb_context:
            user_content_parts.append(f"Knowledge Base Context:\n\n{kb_context}")
        if web_context:
            user_content_parts.append(f"Web Search Results:\n\n{web_context}")
        user_content_parts.append(f"Question: {user_message}")
        messages.append({"role": "user", "content": "\n\n".join(user_content_parts)})
        return messages
