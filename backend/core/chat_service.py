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
from collections.abc import AsyncGenerator

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
        embedder=None,        # IEmbedder | None — enables hybrid retrieval when set
    ) -> None:
        self._chat_repo  = chat_repo
        self._file_repo  = file_repo
        self._backend    = backend
        self._llm_svc    = llm_svc
        self._search_svc = search_svc
        self._embedder   = embedder

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
        force_news: bool = False,
        search_engine: str = "duckduckgo",
        search_api_key: str = "",
        search_engines: list[tuple[str, str]] | None = None,
        kb_ids: list[str] | None = None,
        attached_context: str | None = None,
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
        # Use kb_ids from request if provided; otherwise fall back to session.kb_id
        effective_kb_ids = (
            kb_ids if kb_ids
            else ([session.kb_id] if session.kb_id else [])
        )
        if effective_kb_ids:
            kb_context, kb_sources = await self._retrieve_kb_context(
                kb_ids=effective_kb_ids,
                query=user_message,
            )

        # ── 3. Optional web search ─────────────────────────────────────────
        web_sources: list[dict] = []
        web_context = ""
        if use_web_search:
            # /news forces news intent: frame the SEARCH query (not the stored
            # message) so the existing is_news_query routing hits the news
            # endpoint even when the user's words aren't obviously news-y.
            from backend.adapters.web_search import is_news_query
            search_query = user_message
            if force_news and not is_news_query(user_message):
                search_query = f"{user_message} latest news"
            web_resp = (
                await self._search_svc.search_blended(
                    query=search_query,
                    engines=search_engines,
                    num_results=_MAX_WEB_RESULTS,
                )
                if search_engines
                else await self._search_svc.search(
                    query=search_query,
                    engine=search_engine,
                    api_key=search_api_key,
                    num_results=_MAX_WEB_RESULTS,
                )
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
            kb_ids=effective_kb_ids,
            attached_context=attached_context,
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
        self, kb_ids: list[str], query: str
    ) -> tuple[str, list[dict]]:
        """
        Retrieve KB context using FTS5 keyword search.
        When an embedder is available, uses hybrid FTS5 + dense vector search
        fused via Reciprocal Rank Fusion (RRF).

        Returns (context_string, sources_list).
        """
        use_dense = (
            self._embedder is not None
            and getattr(self._embedder, "is_available", False)
        )

        if use_dense:
            rows = await self._retrieve_hybrid(kb_ids, query)
        else:
            rows = await self._retrieve_fts5(kb_ids, query)

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
                    "file":    file_name,
                    "section": section,
                    "page":    row.get("page"),
                    "file_id": row.get("file_id"),
                    "kb_id":   row.get("kb_id"),
                })

        return "\n".join(parts), sources

    async def _retrieve_fts5(
        self, kb_ids: list[str], query: str
    ) -> list[dict]:
        """Pure FTS5 keyword retrieval."""
        # Build an OR query so ANY keyword match scores (AND is too strict for
        # natural-language questions — most words won't appear in the chunk).
        # Filter out short/non-alphanumeric tokens and common stop words.
        stops = {"the","and","for","are","but","not","you","all","can",
                 "her","was","one","our","out","day","get","has","him",
                 "his","how","man","new","now","old","see","two","way",
                 "who","boy","did","its","let","put","say","she","too",
                 "use","what","does","this","that","with","have","from",
                 "they","will","been","were","said","each","which","their",
                 "about","would","there","could","other","than","then","some"}
        tokens = [
            w for w in query.split()
            if (len(w) > 2 and w.isalnum() or w.replace("'", "").isalnum())
            and w.lower() not in stops
        ]
        safe_query = " OR ".join(tokens) if tokens else query[:50]

        placeholders = ",".join("?" * len(kb_ids))
        try:
            return await self._backend.fetchall(
                f"""
                SELECT c.content, c.section, c.page, c.file_id, c.kb_id,
                       f.name AS file_name
                FROM   chunks_fts cf
                JOIN   chunks     c  ON c.rowid = cf.rowid
                JOIN   file_records f ON f.id = c.file_id
                WHERE  chunks_fts MATCH ?
                  AND  c.kb_id IN ({placeholders})
                ORDER  BY rank
                LIMIT  ?
                """,
                (safe_query, *kb_ids, _MAX_CONTEXT_CHUNKS),
            )
        except Exception as exc:
            logger.warning("FTS5 search error (falling back to sequential): %s", exc)
            return await self._backend.fetchall(
                f"""
                SELECT c.content, c.section, c.page, c.file_id, c.kb_id,
                       f.name AS file_name
                FROM   chunks c
                JOIN   file_records f ON f.id = c.file_id
                WHERE  c.kb_id IN ({placeholders})
                ORDER  BY c.chunk_index
                LIMIT  ?
                """,
                (*kb_ids, _MAX_CONTEXT_CHUNKS),
            )

    async def _retrieve_hybrid(
        self, kb_ids: list[str], query: str
    ) -> list[dict]:
        """
        Hybrid retrieval: FTS5 keyword + FAISS ANN dense search, fused via RRF.

        Dense path:
          1. Embed the query in a thread-pool executor (CPU-bound).
          2. For each KB, use the per-KB FAISS index (IVFFlat or Flat) to find
             the top-k nearest neighbours in O(log n) time — no brute-force loop.
          3. Fetch the matching chunk rows from SQLite by ID.

        RRF score = 1/(k + rank_fts) + 1/(k + rank_dense),  k = 60.
        Falls back to FTS5-only if dense search fails.
        """
        import asyncio as _asyncio

        from backend.core.config import settings as app_cfg

        # ── FTS5 results (async) ────────────────────────────────────────────
        fts_rows = await self._retrieve_fts5(kb_ids, query)

        # ── Dense results via FAISS ANN ─────────────────────────────────────
        try:
            # The dense stack (numpy + faiss, via vector_index) is OPTIONAL and is
            # deliberately NOT bundled in the packaged app. Import it INSIDE this
            # try so a missing numpy/faiss degrades to FTS5-only instead of raising
            # ModuleNotFoundError. RCA 2026-06-08: this import previously sat above
            # the try, so in the packaged app it raised mid-stream during a chat
            # with a KB selected → the connection dropped → bare "network error".
            from backend.adapters.vector_index import kb_vector_index

            # 1. Embed the query (blocking CPU work → thread pool)
            query_vec: list[float] = await _asyncio.get_event_loop().run_in_executor(
                None, lambda: self._embedder.embed([query])[0]
            )

            # 2. ANN search per KB — also blocking → thread pool
            dense_chunk_ids: list[str] = []

            def _ann_search() -> list[str]:
                ids: list[str] = []
                for kb_id in kb_ids:
                    kb_hits = kb_vector_index.search(
                        kb_id=kb_id,
                        query_vec=query_vec,
                        k=_MAX_CONTEXT_CHUNKS * 2,
                        db_path=app_cfg.db_path,
                    )
                    ids.extend(kb_hits)
                return ids

            dense_chunk_ids = await _asyncio.get_event_loop().run_in_executor(
                None, _ann_search
            )

            # 3. Fetch full chunk rows for the ANN hits
            dense_rows: list[dict] = []
            if dense_chunk_ids:
                placeholders = ",".join("?" * len(dense_chunk_ids))
                dense_rows = await self._backend.fetchall(
                    f"""
                    SELECT c.id, c.content, c.section, c.page,
                           c.file_id, c.kb_id, f.name AS file_name
                    FROM   chunks c
                    JOIN   file_records f ON f.id = c.file_id
                    WHERE  c.id IN ({placeholders})
                    """,
                    tuple(dense_chunk_ids),
                )
                # Preserve ANN rank order (fetchall returns in arbitrary order)
                id_rank = {cid: i for i, cid in enumerate(dense_chunk_ids)}
                dense_rows.sort(key=lambda r: id_rank.get(r["id"], 999))

        except Exception as exc:
            logger.warning("Dense ANN search failed (using FTS5 only): %s", exc)
            return fts_rows

        # ── RRF fusion ──────────────────────────────────────────────────────
        rrf_k = 60
        scores: dict[str, float] = {}
        row_by_id: dict[str, dict] = {}

        def _rid(row: dict) -> str:
            return row.get("id") or (row.get("file_name", "") + row["content"][:40])

        for rank, row in enumerate(fts_rows):
            rid = _rid(row)
            scores[rid] = scores.get(rid, 0.0) + 1.0 / (rrf_k + rank + 1)
            row_by_id[rid] = row

        for rank, row in enumerate(dense_rows):
            rid = _rid(row)
            scores[rid] = scores.get(rid, 0.0) + 1.0 / (rrf_k + rank + 1)
            row_by_id[rid] = row

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [row_by_id[rid] for rid, _ in ranked[:_MAX_CONTEXT_CHUNKS]]

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
        kb_ids: list[str] | None = None,
        attached_context: str | None = None,
    ) -> list[dict[str, str]]:
        """Build the full messages list for the LLM call."""

        kb_note = (
            f"\nYou are answering questions grounded in {len(kb_ids)} knowledge base(s). "
            "Always prioritise information from the provided context over general knowledge."
            if kb_ids else ""
        )

        # When live web results are attached, the model MUST use them. Without this
        # directive, models (e.g. gpt-oss) fall back to their trained "I don't have
        # real-time access" refusal even though fresh headlines are right there in
        # the prompt. RCA 2026-06-08 (web search). The results are real-time —
        # retrieved seconds ago — so the model has no excuse to claim otherwise.
        web_note = (
            "\n\n━━━ LIVE WEB RESULTS ━━━\n"
            "Real-time web search results are provided below under \"Web Search "
            "Results\". They were retrieved just now and reflect CURRENT information. "
            "Answer the question directly from them: extract the specific facts, "
            "headlines, or figures requested and attribute them to their source "
            "(title / URL). You DO have access to this real-time information — never "
            "reply that you lack real-time access or cannot browse the web. If the "
            "results don't fully cover the question, answer what they do cover and "
            "state precisely what's missing."
            if web_context else ""
        )

        system_content = f"""You are Knovex — an empathetic, intelligent AI assistant. \
You don't just answer questions; you understand the human behind every message and respond \
with genuine care, warmth, and precision.{kb_note}{web_note}

━━━ EMOTIONAL AWARENESS ━━━
Read the emotional tone of every message and adapt your style accordingly:

• 😤 Frustrated / stuck ("why won't this work", "I've tried everything", "nothing works"):
  → Acknowledge the struggle first. Be patient and calm. Break solutions into clear steps.
  → Open with empathy: "That sounds really frustrating — let's fix this together."

• 😕 Confused / lost ("I don't understand", "what does this mean", "I'm lost"):
  → Simplify. Use plain language and relatable analogies. Avoid jargon.
  → Build understanding step-by-step, checking in as you go.

• 😊 Excited / happy ("this is amazing!", "I love this", "great news"):
  → Match their energy! Be enthusiastic and affirming.
  → Celebrate with them, then add value with extra insight or next steps.

• 😰 Overwhelmed / stressed ("too much", "I'm drowning in", "so complicated"):
  → Be calm and reassuring. Prioritise the 1–2 most important things first.
  → Use "Here's what matters most right now:" to ground them.

• 🤔 Curious ("how does", "why does", "tell me about", "I wonder"):
  → Go deep. Be thorough and intellectually engaged. Share interesting angles.
  → Make learning feel like exploration, not a lecture.

• ⚡ Urgent ("quick answer", "ASAP", "short version", "briefly"):
  → Lead with the direct answer. No preamble. Expand only if truly needed.

• 😢 Struggling / self-doubting ("I can't do this", "I keep failing", "this is too hard"):
  → Be warm and encouraging. Remind them of their capability.
  → Reframe challenges as growth: "This is tricky for everyone at first — here's the key insight."

For neutral / conversational messages: be friendly, clear, and genuinely helpful.

━━━ FORMATTING INTELLIGENCE ━━━
Choose the richest format the content deserves — never default to plain prose when structure helps:

📋 USE MARKDOWN TABLES for:
  - Comparisons (A vs B vs C)
  - Structured data with multiple attributes
  - Any "show me X in tabular format" request
  → Always output the table directly as Markdown (| col | col |). NEVER write code to display data.

📝 USE BULLET LISTS ( - item ) for:
  - Features, benefits, options, items without strict order

🔢 USE NUMBERED LISTS for:
  - Step-by-step instructions, ranked items, ordered processes

## USE HEADERS for:
  - Long responses with distinct sections
  - Reports, summaries, or multi-topic answers

> USE BLOCKQUOTES for:
  - Key insights, important warnings, memorable takeaways

`USE INLINE CODE` for: commands, file names, variable names, short snippets
```lang
USE FENCED CODE BLOCKS for: actual code only — always specify the language
```

**USE BOLD** for: key terms, important phrases, section highlights
*USE ITALICS* for: definitions, subtle emphasis, document titles

━━━ CARDINAL RULES ━━━
1. NEVER output Python/JS/any code merely to display or format data — output the data itself as Markdown.
2. If asked for a table: start with | immediately, no "Here is the table:" preamble.
3. If asked for a list: use - or 1. immediately, no "Here are the items:" preamble.
4. When context is available: weave source references naturally — "According to [filename]..."
5. If context does not contain the answer: say so clearly and offer what you do know.
6. End responses with either: a useful follow-up suggestion, an encouraging note, or a next action — never just stop cold.
7. Keep emotional acknowledgements brief (1 sentence) — then move to genuinely helping."""

        messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
        messages.extend(history)

        # User message with all available context injected
        user_content_parts = []
        if attached_context:
            user_content_parts.append(
                f"📎 Attached File Content (analyze this to answer the question):\n\n"
                f"{attached_context}"
            )
        if kb_context:
            user_content_parts.append(f"Knowledge Base Context:\n\n{kb_context}")
        if web_context:
            user_content_parts.append(f"Web Search Results:\n\n{web_context}")
        user_content_parts.append(f"Question: {user_message}")
        messages.append({"role": "user", "content": "\n\n".join(user_content_parts)})
        return messages
