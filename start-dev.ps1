# GoldLens dev stack launcher (Windows).
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
#
# Opens two PowerShell windows:
#   1. backend  - FastAPI on http://127.0.0.1:8000 (OpenAPI docs at /docs),
#                 quant engine wired via GOLDLENS_QUANT_PACKAGE.
#   2. frontend - Vite dev server on http://localhost:5173 in live mode
#                 (VITE_DATA_MODE=live); API calls go same-origin through the
#                 dev proxy, so the header pill reads "API live".
#
# The backend prewarms its quant dataset at startup (roughly one minute for
# the cold load); signal/backtest endpoints answer instantly afterwards and
# wait patiently during the warm window. Stop: close the two windows.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendCmd = "`$env:PYTHONPATH='..'; `$env:GOLDLENS_QUANT_PACKAGE='quant.service_adapter'; python -m uvicorn app.main:app --port 8000"
$frontendCmd = "`$env:VITE_DATA_MODE='live'; npm run dev"

Start-Process powershell -WorkingDirectory (Join-Path $root 'backend') -ArgumentList '-NoExit', '-Command', $backendCmd
Start-Process powershell -WorkingDirectory (Join-Path $root 'frontend') -ArgumentList '-NoExit', '-Command', $frontendCmd

Write-Host "Launched 2 windows:"
Write-Host "  backend  http://127.0.0.1:8000  (docs: /docs)"
Write-Host "  frontend http://localhost:5173  (live mode)"
