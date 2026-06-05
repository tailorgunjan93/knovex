"""
Anti-corruption wrapper around the third-party `json_repair` library.

Small LLMs (especially on long, non-English generations) frequently emit
structurally broken JSON: missing braces between array elements, missing
commas, unescaped inner quotes, stray replacement characters, or truncation.
`json_repair` recovers a usable Python object from such output.

This module is the ONLY place allowed to import `json_repair`, so the rest of
the codebase depends on our stable `repair_json_object()` signature rather than
the library's API — the dependency can be swapped or removed without touching
callers (SRP + dependency-inversion).
"""

from __future__ import annotations

import json_repair


def repair_json_object(text: str) -> object:
    """
    Best-effort parse of possibly-malformed JSON text into a Python object.

    Returns whatever structure the repairer recovers (dict / list / str / …).
    Never raises on malformed input — it returns an empty value for hopeless
    input, so callers MUST validate the shape (e.g. ``isinstance(x, dict)``)
    before trusting it.
    """
    return json_repair.loads(text)
