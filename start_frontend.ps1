$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend'
$stateFile = Join-Path $root '.runtime\backend-state.json'
if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules'))) {
    throw 'Frontend development dependencies are missing. From frontend, run npm ci first.'
}
if (-not (Test-Path -LiteralPath $stateFile)) {
    throw 'Start the dynamic backend first with .\start_backend.ps1.'
}

$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$health = Invoke-RestMethod -Uri "$($state.url)/api/health" -TimeoutSec 3
$expectedRoot = [IO.Path]::GetFullPath($root).TrimEnd([char]'\')
if ([IO.Path]::GetFullPath([string]$health.project_root).TrimEnd([char]'\') -ine $expectedRoot) {
    throw 'The backend runtime state belongs to another project folder.'
}

$env:VITE_API_PROXY_TARGET = [string]$state.url
Push-Location $frontend
try {
    Write-Host "Vite will proxy /api requests to $($state.url), use its default frontend port when available, and try the next port if it is occupied."
    & npm.cmd run dev -- --host 127.0.0.1 --open
    if ($LASTEXITCODE -ne 0) { throw "Vite exited with code $LASTEXITCODE." }
}
finally {
    Remove-Item Env:\VITE_API_PROXY_TARGET -ErrorAction SilentlyContinue
    Pop-Location
}
