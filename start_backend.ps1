$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root 'packaging\run_app.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw "Backend launcher is missing: $launcher" }
& $launcher -DevelopmentMode -Background -NoBrowser
