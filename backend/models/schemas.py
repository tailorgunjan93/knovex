"""
Knovex Pydantic Schemas

All request/response models used by the API.
Organise by domain: Settings, KB, Files, Chat, Summarizer, Search, Learn.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared / primitive models
# ---------------------------------------------------------------------------

class SourceCitation(BaseModel):
    """A single KB source citation attached to a chat message."""
    file: str
    section: str = ""
    page: int | None = None


class WebSource(BaseModel):
    """A single web search result attached to a chat message."""
    title: str
    url: str
    snippet: str = ""


# ---------------------------------------------------------------------------
# Settings schemas
# ---------------------------------------------------------------------------

class LLMSettings(BaseModel):
    """LLM provider configuration (returned with key masked)."""
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str = ""
    base_url: str = ""          # Ollama base URL or custom endpoint
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""


class SearchSettings(BaseModel):
    """Web search engine configuration."""
    engine: str = "duckduckgo"  # duckduckgo | serper | brave
    api_key: str = ""


class AppSettingsResponse(BaseModel):
    """Full settings payload returned by GET /api/settings."""
    llm: LLMSettings = Field(default_factory=LLMSettings)
    search: SearchSettings = Field(default_factory=SearchSettings)
    theme: str = "dark"                     # light | medium | dark
    kb_storage_path: str = ""
    backend_port: int = 8765


class AppSettingsUpdate(BaseModel):
    """Payload for PUT /api/settings."""
    llm: LLMSettings | None = None
    search: SearchSettings | None = None
    theme: str | None = None
    kb_storage_path: str | None = None


class TestLLMResponse(BaseModel):
    success: bool
    latency_ms: float | None = None
    model: str = ""
    error: str | None = None


class OllamaDetectResponse(BaseModel):
    detected: bool
    url: str = ""
    models: list[str] = Field(default_factory=list)


class LLMModelInfo(BaseModel):
    id: str
    name: str
    context_window: int = 0


class LLMModelsResponse(BaseModel):
    provider: str
    models: list[LLMModelInfo]


# ---------------------------------------------------------------------------
# Knowledge Base schemas
# ---------------------------------------------------------------------------

class KBStats(BaseModel):
    file_count: int = 0
    total_size_bytes: int = 0
    total_chunks: int = 0


class KBResponse(BaseModel):
    id: str
    name: str
    color: str = "#7C3AED"
    icon: str = "folder"
    created_at: datetime
    updated_at: datetime
    stats: KBStats = Field(default_factory=KBStats)


class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = "#7C3AED"
    icon: str = "folder"


class KBUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = None
    icon: str | None = None


class KBListResponse(BaseModel):
    kbs: list[KBResponse]


class ReindexResponse(BaseModel):
    task_id: str
    status: str


# ---------------------------------------------------------------------------
# File schemas
# ---------------------------------------------------------------------------

class FileRecordResponse(BaseModel):
    id: str
    kb_id: str
    name: str
    format: str
    size_bytes: int
    status: str                     # pending | ingesting | ready | stale | missing | error
    content_hash: str | None = None
    chunk_count: int = 0
    version: int = 1
    added_at: datetime
    ingested_at: datetime | None = None
    error_message: str | None = None


class FileAddRequest(BaseModel):
    """Add a file to a KB by its absolute path (sent from Electron)."""
    file_path: str


class FileStatusResponse(BaseModel):
    id: str
    status: str
    progress: float = 0.0
    chunks_indexed: int = 0
    error: str | None = None


class FileUpdatePathRequest(BaseModel):
    """Update the stored path for a missing file."""
    new_path: str


class FileListResponse(BaseModel):
    files: list[FileRecordResponse]


# ---------------------------------------------------------------------------
# File content / reader schemas
# ---------------------------------------------------------------------------

class ContentBlock(BaseModel):
    """A single block of rendered content (paragraph, heading, row, etc.)."""
    type: str           # paragraph | heading | table_row | code | page
    content: str | list[str] = ""
    level: int | None = None    # heading level (1-6)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FileContentResponse(BaseModel):
    id: str
    name: str
    format: str
    total_pages: int | None = None
    current_page: int | None = None
    content: dict[str, Any]


class FileAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    use_web_search: bool = False


# ---------------------------------------------------------------------------
# Chat schemas
# ---------------------------------------------------------------------------

class ChatSessionCreate(BaseModel):
    kb_id: str | None = None
    title: str = "New Chat"


class ChatSessionResponse(BaseModel):
    id: str
    kb_id: str | None = None
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ChatSessionListResponse(BaseModel):
    sessions: list[ChatSessionResponse]


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    sources: list[SourceCitation] = Field(default_factory=list)
    web_sources: list[WebSource] = Field(default_factory=list)


class ChatMessagesResponse(BaseModel):
    session_id: str
    messages: list[ChatMessageResponse]


class ChatStreamRequest(BaseModel):
    message: str = Field(..., min_length=1)
    use_web_search: bool = False


# ---------------------------------------------------------------------------
# Summarizer schemas
# ---------------------------------------------------------------------------

class SummarizeFileRequest(BaseModel):
    kb_id: str
    file_id: str
    length: str = "brief"       # brief | detailed


class SummarizeKBRequest(BaseModel):
    kb_id: str
    length: str = "brief"


# ---------------------------------------------------------------------------
# Web search schemas
# ---------------------------------------------------------------------------

class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    num_results: int = Field(default=5, ge=1, le=20)


class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str = ""


class WebSearchResponse(BaseModel):
    engine: str
    query: str
    results: list[WebSearchResult]


# ---------------------------------------------------------------------------
# Learn Mode schemas
# ---------------------------------------------------------------------------

class LearnSessionCreate(BaseModel):
    topic: str = Field(..., min_length=1)
    format: str                         # quiz | flashcard | mindmap | story | timeline | eli5 | speedlearn | brainstorm
    source_type: str                    # pdf | url | topic
    source_ref: str | None = None       # file_id for pdf, URL string for url
    difficulty: str = "intermediate"    # beginner | intermediate | expert
    use_web_search: bool = False


class LearnSessionResponse(BaseModel):
    id: str
    topic: str
    format: str
    source_type: str
    difficulty: str
    status: str
    content: Any | None = None
    created_at: datetime
    completed_at: datetime | None = None


class QuizAnswerRequest(BaseModel):
    question_index: int
    answer: str


class QuizAnswerResponse(BaseModel):
    correct: bool
    correct_answer: str
    explanation: str
    xp_earned: int = 0
    session_score: float = 0.0


class UserStatsResponse(BaseModel):
    xp: int
    level: int
    streak: int
    last_activity: datetime | None = None
    badges: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Tools registry schemas
# ---------------------------------------------------------------------------

class ToolInfo(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ToolsListResponse(BaseModel):
    tools: list[ToolInfo]


# ---------------------------------------------------------------------------
# Error schema
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str
    code: str = "ERROR"
    detail: dict[str, Any] = Field(default_factory=dict)
