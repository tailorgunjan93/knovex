# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Knovex backend.

Build command (run from the project root):
    pyinstaller backend/knovex-backend.spec --distpath backend/dist

Output:
    backend/dist/knovex-backend/knovex-backend          (macOS / Linux)
    backend/dist/knovex-backend/knovex-backend.exe      (Windows)

The entire output folder is then copied into the Electron release bundle:
    desktop/assets/backend/  (referenced by electron-builder extraResources)

Notes:
  - COLLECT mode (not one-file) is used so that native .dll/.so files are
    side-by-side and not extracted to a temp dir on every launch.
  - UPX compression is enabled to shrink the binary (~30-40% smaller).
  - Large ML / data-science packages are explicitly excluded.
"""

from pathlib import Path

# Project root = parent of the spec file's directory
ROOT = Path(SPECPATH).parent  # noqa: F821 — SPECPATH injected by PyInstaller


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [str(ROOT / "backend" / "backend_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[],
    hiddenimports=[
        # ── uvicorn internals ─────────────────────────────────────────────
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.lifespan.on",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets.auto",
        # ── FastAPI / Starlette ───────────────────────────────────────────
        "fastapi",
        "starlette",
        "starlette.routing",
        "starlette.middleware.cors",
        # ── aiosqlite ─────────────────────────────────────────────────────
        "aiosqlite",
        # ── Knovex backend packages ───────────────────────────────────────
        # All 7 providers must be explicit — they self-register via decorators
        "backend.core.providers",
        "backend.core.providers.openai",
        "backend.core.providers.anthropic",
        "backend.core.providers.groq",
        "backend.core.providers.gemini",
        "backend.core.providers.cerebras",
        "backend.core.providers.bedrock",
        "backend.core.providers.ollama",
        # API routers (imported dynamically in main.py)
        "backend.api.health",
        "backend.api.settings",
        "backend.api.kb",
        "backend.api.reader",
        "backend.api.chat",
        "backend.api.summarizer",
        "backend.api.search",
        "backend.api.tools",
        # ── Cryptography ──────────────────────────────────────────────────
        "cryptography",
        "cryptography.fernet",
        "cryptography.hazmat.primitives.kdf.pbkdf2",
        "cryptography.hazmat.backends.openssl",
        # ── litellm (LLM bridge) ──────────────────────────────────────────
        "litellm",
        "litellm.main",
        "litellm.utils",
        # ── pydantic ──────────────────────────────────────────────────────
        "pydantic",
        "pydantic.v1",
        "pydantic_settings",
        # ── platformdirs ──────────────────────────────────────────────────
        "platformdirs",
        # ── file parsing ──────────────────────────────────────────────────
        "fitz",          # PyMuPDF
        "docx",          # python-docx
        "markdown",
        # ── web search ────────────────────────────────────────────────────
        "duckduckgo_search",
        # ── misc ──────────────────────────────────────────────────────────
        "httpx",
        "watchdog",
        "langchain_core",
        # ── Learn Mode routes (Sprint 6) ──────────────────────────────────
        "backend.api.learn",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # ── Dev / test tools ──────────────────────────────────────────────
        "pytest",
        "ruff",
        "mypy",
        "matplotlib",
        "scipy",
        "pandas",
        "PIL",
        "Pillow",
        "tkinter",
        "_tkinter",
        "notebook",
        "jupyter",
        "IPython",
        "docutils",
        "sphinx",
        # ── Heavy ML packages (docnest-ai dense-ANN — not needed at runtime)
        # The backend falls back to FTS5 + section-graph retrieval without torch.
        "torch",
        "torchvision",
        "torchaudio",
        "torch._C",
        "transformers",
        "tokenizers",
        "sentence_transformers",
        "sentence_transformers.models",
        "huggingface_hub",
        "huggingface_hub.hf_api",
        "accelerate",
        "datasets",
        "safetensors",
        "einops",
        "timm",
        "diffusers",
        "faiss",
        "faiss_cpu",
        "sklearn",
        "scikit_learn",
        "xgboost",
        "lightgbm",
        "cv2",
        "tensorflow",
        "keras",
        "jax",
        "flax",
        # ── Other large optional packages ─────────────────────────────────
        "grpc",
        "grpcio",
        "google.protobuf",
        "google.cloud",
        "azure",
        "opentelemetry",
        "ray",
        "dask",
        "numba",
        "llvmlite",
        "sympy",
        "networkx",
    ],
    noarchive=False,
    optimize=1,
)


# ---------------------------------------------------------------------------
# PYZ archive
# ---------------------------------------------------------------------------

pyz = PYZ(a.pure)  # noqa: F821


# ---------------------------------------------------------------------------
# EXE (bootstrap stub)
# ---------------------------------------------------------------------------

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,          # binaries go into COLLECT, not the exe
    name="knovex-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,                   # keep console for log output
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,               # native arch by default
    codesign_identity=None,
    entitlements_file=None,
)


# ---------------------------------------------------------------------------
# COLLECT — produce the final dist/knovex-backend/ folder
# ---------------------------------------------------------------------------

coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="knovex-backend",
)
