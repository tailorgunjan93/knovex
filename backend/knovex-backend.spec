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

from PyInstaller.utils.hooks import collect_data_files, collect_submodules  # noqa: E402

# Project root = parent of the spec file's directory
ROOT = Path(SPECPATH).parent  # noqa: F821 — SPECPATH injected by PyInstaller

# ---------------------------------------------------------------------------
# Data files to bundle
# ---------------------------------------------------------------------------

# LiteLLM requires its model pricing/metadata JSON files at runtime.
# Without them every LLM call (chat, learn, summarize, test connection) raises:
#   FileNotFoundError: …/_internal/litellm/model_prices_and_context_window_backup.json
# collect_data_files() picks up ALL json/data files from the litellm package dir.
_datas = collect_data_files("litellm", include_py_files=False)

# tiktoken uses a namespace-package plugin pattern: registry.py calls
#   pkgutil.iter_modules(tiktoken_ext.__path__)
# to discover encoding modules (e.g. tiktoken_ext.openai_public which defines
# cl100k_base, p50k_base, r50k_base, etc.).  Without explicit collection,
# PyInstaller does NOT bundle tiktoken_ext submodules and every token-counting
# call raises:  Unknown encoding cl100k_base. Plugins found: []
_tiktoken_hidden = collect_submodules("tiktoken_ext")


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [str(ROOT / "backend" / "backend_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=_datas,
    hiddenimports=_tiktoken_hidden + [
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
        # ── Knovex backend top-level ─────────────────────────────────────
        # backend.main is NOT imported directly in backend_entry.py at the
        # module level in older builds — list it explicitly as a safety net.
        # (In current builds the explicit `from backend.main import app` in
        # backend_entry.py causes the analyser to trace it automatically, but
        # belt-and-suspenders never hurts.)
        "backend.main",
        "backend.core.config",
        "backend.core.dependencies",
        "backend.storage.database",
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
        # ── tiktoken encoding plugins ─────────────────────────────────────
        # tiktoken discovers encodings (cl100k_base, p50k_base, etc.) by calling
        # pkgutil.iter_modules(tiktoken_ext.__path__).  Both the namespace
        # package and its sole submodule must be explicitly listed so the
        # PyInstaller frozen importer exposes them to pkgutil.
        "tiktoken_ext",
        "tiktoken_ext.openai_public",
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
        # ── Setup / ONNX model download (Sprint 7) ────────────────────────
        # NOTE: onnxruntime, tokenizers, numpy are intentionally NOT listed here.
        # They are imported lazily inside ONNXEmbedder._load() which is only called
        # when the user actually runs an embedding.  Listing them as hiddenimports
        # causes PyInstaller to bundle their native DLLs, which crashes the binary
        # on Windows at boot time due to DLL load-order conflicts.
        # The app falls back to NullEmbedder (FTS5-only) when they are absent.
        "backend.api.setup",
        "backend.adapters.embedder",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[str(ROOT / "backend" / "hooks" / "rthook_tiktoken.py")],
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
        # "tokenizers" intentionally NOT excluded — it is a valid lazy import
        # inside ONNXEmbedder._load().  Excluding it here would conflict with
        # any future attempt to bundle it, and causes PyInstaller analysis errors.
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
