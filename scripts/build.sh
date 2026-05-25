#!/usr/bin/env bash
# Knovex Full Build Pipeline — macOS / Linux
#
# Produces:
#   macOS  → desktop/release/*.dmg
#   Linux  → desktop/release/*.AppImage
#
# Usage:
#   ./scripts/build.sh                    # full build
#   ./scripts/build.sh --skip-tests       # skip pytest
#   ./scripts/build.sh --skip-frontend    # skip Vite build
#   ./scripts/build.sh --skip-packaging   # lint + test + binary only
#
# Requirements:
#   - Python 3.11+ with .venv at project root
#   - Node.js 20+
#   - pyinstaller  (pip install pyinstaller)
#   - electron-builder (npm install in desktop/)

set -euo pipefail

SKIP_TESTS=false
SKIP_FRONTEND=false
SKIP_PACKAGING=false

for arg in "$@"; do
  case $arg in
    --skip-tests)     SKIP_TESTS=true ;;
    --skip-frontend)  SKIP_FRONTEND=true ;;
    --skip-packaging) SKIP_PACKAGING=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"

echo ""
echo "=== Knovex Build Pipeline ($(uname -s)) ==="
echo "Root: $ROOT"
echo ""

# ─── Check venv ───────────────────────────────────────────────────────────────
if [[ ! -f "$PYTHON" ]]; then
  echo "ERROR: Virtual environment not found at $PYTHON"
  echo "Run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi
echo "[1/6] Python: $PYTHON"

# ─── Lint ─────────────────────────────────────────────────────────────────────
echo "[2/6] Linting backend..."
"$PYTHON" -m ruff check backend/ tests/ --output-format=concise

# ─── Tests ────────────────────────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == false ]]; then
  echo "[3/6] Running tests..."
  "$PYTHON" -m pytest tests/ -v --tb=short
else
  echo "[3/6] Tests skipped (--skip-tests)"
fi

# ─── Frontend build ───────────────────────────────────────────────────────────
if [[ "$SKIP_FRONTEND" == false ]]; then
  echo "[4/6] Building frontend..."
  (cd "$ROOT/frontend" && npm ci --silent && npm run build)
else
  echo "[4/6] Frontend skipped (--skip-frontend)"
fi

# ─── PyInstaller backend binary ───────────────────────────────────────────────
echo "[5/6] Building backend binary (PyInstaller)..."
"$PYTHON" -m pip install pyinstaller -q
(
  cd "$ROOT"
  "$PYTHON" -m PyInstaller backend/knovex-backend.spec \
    --distpath backend/dist \
    --workpath backend/build \
    --noconfirm
)

BACKEND_BIN="$ROOT/backend/dist/knovex-backend"
if [[ ! -d "$BACKEND_BIN" ]]; then
  echo "ERROR: Expected backend binary not found at $BACKEND_BIN"
  exit 1
fi
echo "   Backend binary: $BACKEND_BIN"

# ─── Electron packaging ───────────────────────────────────────────────────────
if [[ "$SKIP_PACKAGING" == false ]]; then
  echo "[6/6] Packaging with electron-builder..."
  (
    cd "$ROOT/desktop"
    npm ci --silent
    if [[ "$(uname -s)" == "Darwin" ]]; then
      npm run build:mac
    else
      npm run build:linux
    fi
  )

  echo ""
  echo "=== Build complete ==="
  INSTALLER=$(find "$ROOT/desktop/release" -name "*.dmg" -o -name "*.AppImage" 2>/dev/null | head -1)
  [[ -n "$INSTALLER" ]] && echo "Installer: $INSTALLER"
else
  echo "[6/6] Packaging skipped (--skip-packaging)"
  echo ""
  echo "=== Lint + tests + binaries complete ==="
fi
