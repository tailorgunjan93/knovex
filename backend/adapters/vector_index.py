"""
Vector Index Adapter — FAISS ANN Search

Provides per-KB FAISS indexes for approximate nearest-neighbour (ANN) dense
retrieval.  Replaces the brute-force numpy dot-product loop in ChatService.

Architecture
------------
  IVFFlat index (nlist=16, metric=INNER_PRODUCT):
    - Built once per KB on first query or after ingestion
    - Cached in-process; invalidated when new files are ingested
    - L2-normalised vectors → inner product == cosine similarity

  For KBs with < MIN_TRAIN_SIZE chunks we fall back to a flat (exact) index
  because IVFFlat requires at least nlist training points.

  Thread safety: indexes are built/read inside a thread-pool executor so they
  never block the async event loop.

Usage
-----
  from backend.adapters.vector_index import kb_vector_index

  # After ingestion of a KB — invalidate the cached index
  kb_vector_index.invalidate(kb_id)

  # During retrieval — get top-k chunk IDs
  top_ids = kb_vector_index.search(kb_id, query_vec, k=24, db_path=...)
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

logger = logging.getLogger("knovex.vector_index")

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

_NLIST        = 16     # IVFFlat cells — sqrt(n) rule of thumb for <10k vecs
_NPROBE       = 4      # cells searched at query time (speed/recall trade-off)
_MIN_TRAIN    = 32     # min vectors needed to train IVFFlat; below → flat index
_EMBEDDING_DIM = 384   # all-MiniLM-L6-v2 output size


# ---------------------------------------------------------------------------
# Per-KB index entry
# ---------------------------------------------------------------------------

@dataclass
class _KBIndex:
    index: object           # faiss.Index
    ids: list[str]          # chunk IDs in the same order as the faiss vectors
    version: int = 0        # bump on invalidate


# ---------------------------------------------------------------------------
# KBVectorIndex — process-level singleton
# ---------------------------------------------------------------------------

class KBVectorIndex:
    """
    Process-level cache of per-KB FAISS indexes.

    build(kb_id, db_path) — builds or rebuilds the index for a KB.
    search(kb_id, query_vec, k, db_path) — returns top-k chunk IDs.
    invalidate(kb_id) — drops the cached index so next search rebuilds it.
    """

    def __init__(self) -> None:
        self._lock   = threading.Lock()
        self._cache: dict[str, _KBIndex] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def invalidate(self, kb_id: str) -> None:
        """Drop the cached index for a KB (call after any ingestion)."""
        with self._lock:
            self._cache.pop(kb_id, None)
        logger.debug("Vector index invalidated for KB %s", kb_id)

    def search(
        self,
        kb_id: str,
        query_vec: list[float],
        k: int,
        db_path: str | Path,
    ) -> list[str]:
        """
        Return the chunk IDs of the top-k nearest neighbours.

        Builds the index on first call (or after invalidation).
        Runs synchronously — call from a thread-pool executor.
        """
        entry = self._get_or_build(kb_id, db_path)
        if entry is None or entry.index.ntotal == 0:
            return []

        q = np.array([query_vec], dtype=np.float32)
        # Normalise query vector (L2) — vectors in index are already normalised
        norm = np.linalg.norm(q)
        if norm > 1e-9:
            q /= norm

        actual_k = min(k, entry.index.ntotal)
        distances, indices = entry.index.search(q, actual_k)

        # indices[0] contains row positions in entry.ids (-1 = not found)
        result: list[str] = []
        for idx in indices[0]:
            if idx == -1:
                continue
            result.append(entry.ids[idx])
        return result

    def build(self, kb_id: str, db_path: str | Path) -> None:
        """Explicitly build (or rebuild) the index for a KB."""
        self._build_index(kb_id, db_path)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_or_build(
        self, kb_id: str, db_path: str | Path
    ) -> _KBIndex | None:
        with self._lock:
            if kb_id in self._cache:
                return self._cache[kb_id]
        # Build outside lock so other KBs aren't blocked
        return self._build_index(kb_id, db_path)

    def _build_index(
        self, kb_id: str, db_path: str | Path
    ) -> _KBIndex | None:
        import faiss

        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT c.id, c.embedding
                FROM   chunks c
                WHERE  c.kb_id = ?
                  AND  c.embedding IS NOT NULL
                """,
                (kb_id,),
            ).fetchall()
            conn.close()
        except Exception as exc:
            logger.error("vector_index: DB read failed for KB %s: %s", kb_id, exc)
            return None

        if not rows:
            logger.debug("vector_index: no embeddings for KB %s — skipping build", kb_id)
            entry = _KBIndex(index=faiss.IndexFlatIP(_EMBEDDING_DIM), ids=[])
            with self._lock:
                self._cache[kb_id] = entry
            return entry

        ids: list[str] = []
        vecs: list[np.ndarray] = []
        for row in rows:
            ids.append(row["id"])
            v = np.frombuffer(row["embedding"], dtype=np.float32).copy()
            vecs.append(v)

        mat = np.vstack(vecs).astype(np.float32)
        n   = mat.shape[0]

        # Choose index type based on corpus size
        if n >= _MIN_TRAIN:
            # IVFFlat with inner product (cosine for normalised vectors)
            nlist = max(1, min(_NLIST, n // 4))
            quantiser = faiss.IndexFlatIP(_EMBEDDING_DIM)
            idx = faiss.IndexIVFFlat(quantiser, _EMBEDDING_DIM, nlist,
                                     faiss.METRIC_INNER_PRODUCT)
            idx.train(mat)
            idx.nprobe = _NPROBE
        else:
            # Exact flat index for small corpora
            idx = faiss.IndexFlatIP(_EMBEDDING_DIM)

        idx.add(mat)

        entry = _KBIndex(index=idx, ids=ids)
        with self._lock:
            self._cache[kb_id] = entry

        logger.info(
            "vector_index: built %s index for KB %s (%d vectors)",
            "IVFFlat" if n >= _MIN_TRAIN else "Flat",
            kb_id,
            n,
        )
        return entry


# ---------------------------------------------------------------------------
# Process-level singleton
# ---------------------------------------------------------------------------

kb_vector_index = KBVectorIndex()
