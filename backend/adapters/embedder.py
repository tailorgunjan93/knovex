"""
Embedder Adapters — Sprint 7

Provides a unified IEmbedder interface for generating dense vector embeddings.

Two live implementations:

  OpenAIEmbedder
    Calls the OpenAI Embeddings API (text-embedding-3-small by default).
    Requires an api_key in settings.  Zero local disk footprint.

  ONNXEmbedder
    Runs all-MiniLM-L6-v2 locally via onnxruntime.
    ~45 MB ONNX model downloaded on first use to:
        <user-data-dir>/knovex/models/all-MiniLM-L6-v2/

  NullEmbedder
    Returns an empty list — signals "no embeddings available".
    Used when neither an API key is configured nor the local model is ready.
    The retrieval stack falls back to FTS5-only in this case.

Factory (build_embedder):
    Reads settings at call-time and returns the best available embedder.

DIP: all consumers depend on IEmbedder only.
OCP: add a new provider by subclassing IEmbedder and updating build_embedder.
"""

from __future__ import annotations

import logging
import urllib.request
from abc import ABC, abstractmethod
from collections.abc import Sequence
from pathlib import Path

logger = logging.getLogger("knovex.embedder")

# ---------------------------------------------------------------------------
# Model metadata
# ---------------------------------------------------------------------------

_ONNX_MODEL_NAME = "all-MiniLM-L6-v2"
_ONNX_MODEL_URL  = (
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/"
    "resolve/main/onnx/model.onnx"
)
_TOKENIZER_URL = (
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/"
    "resolve/main/tokenizer.json"
)
_VOCAB_URL = (
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/"
    "resolve/main/vocab.txt"
)

EMBEDDING_DIM = 384   # all-MiniLM-L6-v2 output dimension


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class IEmbedder(ABC):
    """Synchronous embedding interface (async wrapping done at the call-site)."""

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """
        Return one float-vector per input text.
        The vector length is defined by the model (384 for local, 1536 for openai-small).
        Raises RuntimeError on failure.
        """

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """True when the embedder can produce vectors without setup steps."""

    @property
    @abstractmethod
    def provider(self) -> str:
        """Short string: "local" | "openai" | "null"."""


# ---------------------------------------------------------------------------
# NullEmbedder — silent fallback
# ---------------------------------------------------------------------------

class NullEmbedder(IEmbedder):
    """No-op embedder. Used when no embedding source is configured/ready."""

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return []

    @property
    def is_available(self) -> bool:
        return False

    @property
    def provider(self) -> str:
        return "null"


# ---------------------------------------------------------------------------
# OpenAIEmbedder — API-based
# ---------------------------------------------------------------------------

class OpenAIEmbedder(IEmbedder):
    """
    Calls the OpenAI Embeddings REST API synchronously via httpx.

    Uses text-embedding-3-small (1536 dims, cheapest + best quality).
    Falls back to NullEmbedder if the API key is blank.
    """

    _ENDPOINT = "https://api.openai.com/v1/embeddings"
    _MAX_BATCH = 96  # OpenAI supports up to 2048 inputs, 96 is a safe practical limit

    def __init__(self, api_key: str, model: str = "text-embedding-3-small") -> None:
        self._api_key = api_key.strip()
        self._model = model

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    @property
    def provider(self) -> str:
        return "openai"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not self._api_key:
            raise RuntimeError("OpenAI embedding API key not configured")

        import httpx

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        results: list[list[float]] = []

        # Process in batches
        text_list = list(texts)
        for i in range(0, len(text_list), self._MAX_BATCH):
            batch = text_list[i : i + self._MAX_BATCH]
            payload = {"model": self._model, "input": batch}
            resp = httpx.post(
                self._ENDPOINT,
                headers=headers,
                json=payload,
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            # data["data"] is a list sorted by index
            batch_vecs = [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]
            results.extend(batch_vecs)

        return results


# ---------------------------------------------------------------------------
# ONNXEmbedder — local inference
# ---------------------------------------------------------------------------

def _model_dir() -> Path:
    """Return (and create) the local directory for ONNX model files."""
    from backend.core.config import settings as app_config
    d = Path(app_config.data_dir) / "models" / _ONNX_MODEL_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def model_files_ready() -> bool:
    """True when the model.onnx + tokenizer.json + vocab.txt are all present."""
    d = _model_dir()
    return (
        (d / "model.onnx").exists()
        and (d / "tokenizer.json").exists()
        and (d / "vocab.txt").exists()
    )


def download_model(progress_cb=None) -> None:
    """
    Download model.onnx + tokenizer.json + vocab.txt to the model directory.

    progress_cb(downloaded_bytes: int, total_bytes: int) — optional progress hook.
    Raises urllib.error.URLError on network failure.
    """
    d = _model_dir()
    files = [
        (_ONNX_MODEL_URL, d / "model.onnx"),
        (_TOKENIZER_URL,  d / "tokenizer.json"),
        (_VOCAB_URL,      d / "vocab.txt"),
    ]
    for url, dest in files:
        if dest.exists():
            continue
        logger.info("Downloading %s …", dest.name)
        _download_file(url, dest, progress_cb)
        logger.info("Downloaded %s (%d bytes)", dest.name, dest.stat().st_size)


def _download_file(url: str, dest: Path, progress_cb=None) -> None:
    """Stream a single file with optional progress reporting."""
    tmp = dest.with_suffix(".tmp")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "knovex/0.1"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk = 1 << 16  # 64 KB
            with open(tmp, "wb") as fh:
                while True:
                    block = resp.read(chunk)
                    if not block:
                        break
                    fh.write(block)
                    downloaded += len(block)
                    if progress_cb:
                        progress_cb(downloaded, total)
        tmp.rename(dest)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


class ONNXEmbedder(IEmbedder):
    """
    Local embedding using all-MiniLM-L6-v2 via onnxruntime + tokenizers.

    Lazy-loaded: the session is created on first embed() call.
    Thread-safe: onnxruntime sessions are thread-safe after creation.
    """

    def __init__(self) -> None:
        self._session = None
        self._tokenizer = None

    @property
    def is_available(self) -> bool:
        return model_files_ready()

    @property
    def provider(self) -> str:
        return "local"

    def _load(self) -> None:
        """Lazy-load the ONNX session and tokenizer."""
        if self._session is not None:
            return

        if not model_files_ready():
            raise RuntimeError(
                "ONNX model not downloaded yet. "
                "Call download_model() or configure an OpenAI embedding key."
            )

        import onnxruntime as ort
        from tokenizers import Tokenizer

        d = _model_dir()
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self._session = ort.InferenceSession(
            str(d / "model.onnx"),
            sess_options=sess_opts,
            providers=["CPUExecutionProvider"],
        )
        self._tokenizer = Tokenizer.from_file(str(d / "tokenizer.json"))
        self._tokenizer.enable_padding(pad_token="[PAD]", pad_id=0)
        self._tokenizer.enable_truncation(max_length=256)
        logger.info("ONNX embedder loaded from %s", d)

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        import numpy as np

        self._load()

        text_list = [str(t) for t in texts]
        encodings = self._tokenizer.encode_batch(text_list)

        input_ids      = np.array([e.ids          for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
        token_type_ids = np.zeros_like(input_ids)

        outputs = self._session.run(
            None,
            {
                "input_ids":      input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            },
        )
        # outputs[0] = token embeddings [batch, seq, 384]
        # Mean pooling over non-padding tokens
        token_embs = outputs[0]                    # (B, S, 384)
        mask = attention_mask[:, :, np.newaxis]    # (B, S, 1)
        summed = (token_embs * mask).sum(axis=1)   # (B, 384)
        counts = mask.sum(axis=1).clip(min=1e-9)   # (B, 1)
        pooled = summed / counts                   # (B, 384)

        # L2-normalise
        norms = np.linalg.norm(pooled, axis=1, keepdims=True).clip(min=1e-9)
        normed = pooled / norms

        return normed.tolist()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def build_embedder(embedding_api_key: str = "", embedding_provider: str = "local", embedding_model: str = "text-embedding-3-small") -> IEmbedder:
    """
    Return the best embedder given the current settings.

    Priority:
      1. If an OpenAI API key is supplied → OpenAIEmbedder
      2. If the local ONNX model is ready → ONNXEmbedder
      3. Otherwise → NullEmbedder (FTS5-only fallback)
    """
    key = (embedding_api_key or "").strip()
    if key:
        logger.debug("Using OpenAI embedder (model=%s)", embedding_model)
        return OpenAIEmbedder(api_key=key, model=embedding_model)

    if model_files_ready():
        logger.debug("Using local ONNX embedder")
        return ONNXEmbedder()

    logger.debug("No embedder available — using NullEmbedder (FTS5-only mode)")
    return NullEmbedder()
