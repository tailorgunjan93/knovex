# Knovex Full Build Pipeline — Windows
#
# Produces a Windows NSIS installer at desktop/release/
#
# Usage:
#   .\scripts\build.ps1                 # full build
#   .\scripts\build.ps1 -SkipTests      # skip pytest (faster in CI)
#   .\scripts\build.ps1 -SkipFrontend   # skip Vite build (use existing dist/)
#   .\scripts\build.ps1 -SkipPackaging  # lint + test only, no installer
#
# Requirements:
#   - Python 3.11+ with .venv at project root
#   - Node.js 20+
#   - pyinstaller (pip install pyinstaller)
#   - electron-builder (npm install in desktop/)

param(
    [switch]$SkipTests,
    [switch]$SkipFrontend,
    [switch]$SkipPackaging
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "=== Knovex Build Pipeline (Windows) ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host ""

# ─── Activate venv ────────────────────────────────────────────────────────────
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    Write-Error "Virtual environment not found at $Python. Run: python -m venv .venv && .venv\Scripts\pip install -r backend/requirements.txt"
}
Write-Host "[1/6] Python: $Python" -ForegroundColor Green

# ─── Lint ─────────────────────────────────────────────────────────────────────
Write-Host "[2/6] Linting backend..." -ForegroundColor Green
& $Python -m ruff check backend/ tests/ --output-format=concise
if ($LASTEXITCODE -ne 0) { Write-Error "Ruff lint failed" }

# ─── Tests ────────────────────────────────────────────────────────────────────
if (-not $SkipTests) {
    Write-Host "[3/6] Running tests..." -ForegroundColor Green
    & $Python -m pytest tests/ -v --tb=short
    if ($LASTEXITCODE -ne 0) { Write-Error "Tests failed" }
} else {
    Write-Host "[3/6] Tests skipped (-SkipTests)" -ForegroundColor Yellow
}

# ─── Frontend build ───────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host "[4/6] Building frontend..." -ForegroundColor Green
    Push-Location (Join-Path $Root "frontend")
    npm ci --silent
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed" }
    Pop-Location
} else {
    Write-Host "[4/6] Frontend skipped (-SkipFrontend)" -ForegroundColor Yellow
}

# ─── PyInstaller backend binary ───────────────────────────────────────────────
Write-Host "[5/6] Building backend binary (PyInstaller)..." -ForegroundColor Green
& $Python -m pip install pyinstaller --quiet
Push-Location $Root
& $Python -m PyInstaller backend/knovex-backend.spec `
    --distpath backend/dist `
    --workpath backend/build `
    --noconfirm
if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller build failed" }
Pop-Location

$BackendBin = Join-Path $Root "backend\dist\knovex-backend"
if (-not (Test-Path $BackendBin)) {
    Write-Error "Expected backend binary not found at $BackendBin"
}
Write-Host "   Backend binary: $BackendBin" -ForegroundColor DarkGray

# ─── Electron packaging ───────────────────────────────────────────────────────
if (-not $SkipPackaging) {
    Write-Host "[6/6] Packaging with electron-builder (NSIS)..." -ForegroundColor Green
    Push-Location (Join-Path $Root "desktop")
    npm ci --silent
    npm run build:win
    if ($LASTEXITCODE -ne 0) { Write-Error "electron-builder failed" }
    Pop-Location

    $Installer = Get-ChildItem (Join-Path $Root "desktop\release") -Filter "*.exe" | Select-Object -First 1
    Write-Host ""
    Write-Host "=== Build complete ===" -ForegroundColor Cyan
    if ($Installer) {
        Write-Host "Installer: $($Installer.FullName)" -ForegroundColor Green
    }
} else {
    Write-Host "[6/6] Packaging skipped (-SkipPackaging)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "=== Lint + tests + binaries complete ===" -ForegroundColor Cyan
}
