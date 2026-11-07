# SnowTwin WNY - one-command local run (Windows PowerShell, from repo root)
#   .\run.ps1          -> setup if needed, build dashboard, serve on http://127.0.0.1:8000
#   .\run.ps1 -Dev     -> API on :8000 plus Vite dev server on :5173 (hot reload)
param([switch]$Dev)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .venv\Scripts\python.exe)) {
    py -3.12 -m venv .venv
}
.\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if (-not (Test-Path frontend\node_modules)) { Push-Location frontend; npm install --no-audit --no-fund; Pop-Location }
if ($Dev) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"
    Write-Host "Dashboard (dev): http://127.0.0.1:5173"
} else {
    Push-Location frontend; npm run build; Pop-Location
    Write-Host "Dashboard: http://127.0.0.1:8000"
}
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
