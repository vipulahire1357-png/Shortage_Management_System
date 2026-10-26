$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'run_app.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw "Project launcher is missing: $launcher" }
& $launcher -DevelopmentMode -Background -NoBrowser
