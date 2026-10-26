$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $root '.runtime\backend-state.json'
if (-not (Test-Path -LiteralPath $stateFile)) { Write-Host 'This project has no backend runtime state.'; exit 0 }
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$pidToStop = [int]$state.pid
$stopFile = [string]$state.stop_file
Set-Content -LiteralPath $stopFile -Value 'stop' -Encoding ascii
$deadline = (Get-Date).AddSeconds(12)
do {
    Start-Sleep -Milliseconds 250
    $process = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
} while ($process -and (Get-Date) -lt $deadline)
if ($process) { Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue }
Write-Host 'This project backend has stopped.'
