"""
Knovex Pydantic Schemas

All request/response models used by the API.
Organise by domain: Settings, KB, Files, Chat, Summarizer, Search, Learn.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Shared / primitive models
# ---------------------------------------------------------------------------

class SourceCitation(BaseModel):
    """A single KB source citation attached to a chat message."""
    file: str
    section: str = ""
    page: int | None = None
    file_id: str | None = None   # KB file record ID — needed for /kb navigation
    kb_id: str | None = None     # KB ID — needed for SourceCard cursor:pointer + /kb navigation


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


class LLMProviderConfig(BaseModel):
    """
    Per-provider saved config (multi-provider store). The active provider's
    config is also mirrored into the top-level ``llm`` field for consumers.
    Keys are masked in API responses.
    """
    model: str = ""
    api_key: str = ""
    base_url: str = ""
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    configured: bool = False     # derived: has a usable key / credentials


class SearchSettings(BaseModel):
    """Web search engine configuration (legacy 'primary' engine; kept for compat)."""
    engine: str = "duckduckgo"  # duckduckgo | wikipedia | serper | brave
    api_key: str = ""


class SearchEngineConfig(BaseModel):
    """Per-engine config (multi-engine). Free engines need no key."""
    enabled: bool = False
    api_key: str = ""
    configured: bool = False     # derived: free engine, or a key is present


class SearchEngineUpdate(BaseModel):
    """Enable/disable an engine or set its key. Used by the search grid."""
    enabled: bool | None = None
    api_key: str | None = None


class EmbeddingSettings(BaseModel):
    """
    Embedding / vector-search configuration.

    enabled = False → FTS5-only (default, no model needed)
    enabled = True  → hybrid FTS5 + dense vector search via RRF

    Two providers when enabled:
      provider = "local"  — ONNX all-MiniLM-L6-v2 (~45 MB, downloaded on demand)
      provider = "openai" — OpenAI text-embedding-3-small API (needs api_key)
    """
    enabled: bool = False                       # master switch for dense search
    provider: str = "local"                     # "local" | "openai"
    model: str = "text-embedding-3-small"       # openai model (ignored for local)
    api_key: str = ""                           # openai key (empty = local fallback)


class AppSettingsResponse(BaseModel):
    """Full settings payload returned by GET /api/settings."""
    llm: LLMSettings = Field(default_factory=LLMSettings)
    # Per-provider saved configs (multi-provider). Keyed by provider id.
    llm_providers: dict[str, LLMProviderConfig] = Field(default_factory=dict)
    search: SearchSettings = Field(default_factory=SearchSettings)
    # Per-engine configs (multi-engine web search). Keyed by engine id.
    search_engines: dict[str, SearchEngineConfig] = Field(default_factory=dict)
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    theme: str = "dark"                     # light | medium | dark
    kb_storage_path: str = ""
    backend_port: int = 8765
    display_name: str = ""                  # what the app calls the user; "" → "You"
    onboarded: bool = False                 # has the first-run welcome been completed


class AppSettingsUpdate(BaseModel):
    """Payload for PUT /api/settings."""
    llm: LLMSettings | None = None
    search: SearchSettings | None = None
    embedding: EmbeddingSettings | None = None
    theme: str | None = None
    kb_storage_path: str | None = None
    display_name: str | None = None
    onboarded: bool | None = None


class LLMProviderUpdate(BaseModel):
    """Save one provider's config (key/model/base_url). Used by the provider grid."""
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    aws_region: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None


class ActivateProviderRequest(BaseModel):
    """Make a provider the active one (copies its saved config into ``llm``)."""
    provider: str


class EmbeddingModelStatus(BaseModel):
    """Status of the local ONNX embedding model."""
    ready: bool
    model_name: str = "all-MiniLM-L6-v2"
    size_mb: float = 45.0
    model_dir: str = ""


class TestLLMResponse(BaseModel):
    success: bool
    latency_ms: float | None = None
    model: str = ""
    error: str | None = None


class TestSearchEngineResponse(BaseModel):
    """Result of the Settings → 'Test' button for one search engine."""
    success: bool
    engine: str
    result_count: int = 0
    sample_title: str = ""
    latency_ms: float | None = None
    error: str | None = None


class PackStatusResponse(BaseModel):
    """State of an on-demand pack (OCR / Cinematic) provisioned outside the bundle."""
    state: Literal["not_installed", "installing", "ready", "error", "unavailable"]
    detail: str = ""
    python_path: str | None = None
    log_tail: list[str] = Field(default_factory=list)


# Back-compat alias (OCR API + tests referenced this name).
OcrStatusResponse = PackStatusResponse


class ManimRenderRequest(BaseModel):
    """Render a Cinematic (Manim) animation for a topic."""
    topic: str = Field(..., min_length=1)
    difficulty: Literal["beginner", "intermediate", "expert"] = "intermediate"


class ManimRenderResponse(BaseModel):
    ok: bool
    render_id: str | None = None
    video_url: str | None = None
    error: str | None = None
    attempts: int = 0


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
    page: int | None = Field(default=None, ge=1)   # current reader page → prioritised as context


# ---------------------------------------------------------------------------
# Reader highlights (user-created, persisted)
# ---------------------------------------------------------------------------

# Allowed highlight colors (named — the frontend maps them to theme tints).
HIGHLIGHT_COLORS = ("yellow", "green", "blue", "pink", "purple")


class HighlightCreate(BaseModel):
    """Payload to create a highlight on a page of a file."""
    page: int = Field(default=1, ge=1)
    text: str = Field(..., min_length=1, max_length=4000)
    color: str = Field(default="yellow")
    note: str = Field(default="", max_length=2000)

    @field_validator("color")
    @classmethod
    def _valid_color(cls, v: str) -> str:
        return v if v in HIGHLIGHT_COLORS else "yellow"


class Highlight(BaseModel):
    """A persisted highlight, returned by the API."""
    id: str
    kb_id: str
    file_id: str
    page: int
    text: str
    color: str
    note: str
    created_at: str


class HighlightListResponse(BaseModel):
    highlights: list[Highlight]


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
    kb_ids: list[str] | None = None          # override session kb_id; search across multiple KBs
    attached_context: str | None = None      # extracted text from file(s) attached by the user


class ChatAttachResponse(BaseModel):
    filename: str
    text: str
    char_count: int
    truncated: bool


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
    format: Literal[
        "quiz", "flashcard", "mindmap", "story",
        "timeline", "eli5", "speedlearn", "brainstorm", "guided", "animated",
    ]
    source_type: str                    # topic | kb_file | url | upload
    source_ref: str | None = None       # file_id for kb_file, URL string for url
    difficulty: Literal["beginner", "intermediate", "expert"] = "intermediate"
    language: str = "English"           # generate-in-language; default English = no behavior change
    use_web_search: bool = False
    context_text: str = ""              # pre-fetched source text (KB/upload); backend fetches URL if empty + source_type=='url'


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
# Reader upload schema
# ---------------------------------------------------------------------------

class ReaderUploadResponse(BaseModel):
    """Response from POST /api/reader/upload — file saved to Reader Inbox KB."""
    kb_id: str
    file_id: str
    name: str
    format: str
    status: str   # pending | ingesting | ready | error


# ---------------------------------------------------------------------------
# Error schema
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str
    code: str = "ERROR"
    detail: dict[str, Any] = Field(default_factory=dict)
